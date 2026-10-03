#!/usr/bin/env node
/**
 * Browser smoke test: starts the dev server, drives the real UI with
 * Playwright and fails on any JavaScript error.
 *
 *   npm run test:e2e            (needs Playwright: `npm i -D playwright` or a global install)
 *   SCREENSHOTS=dir npm run test:e2e   also writes screenshots
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8137;
const SHOTS = process.env.SCREENSHOTS;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      const globalRoot = execSync('npm root -g').toString().trim();
      return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
    } catch {
      console.error('Playwright ist nicht installiert. Installieren mit: npm i -D playwright');
      process.exit(2);
    }
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const { chromium } = await loadPlaywright();
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], { stdio: 'pipe' });
await new Promise((resolve) => server.stdout.once('data', resolve));

const errors = [];
const launchOpts = fs.existsSync('/opt/pw-browsers/chromium') && !process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(launchOpts);
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  console.log('Start screen');
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.start-country');
  assert((await page.locator('.start-country').count()) > 150, 'country list shows the whole world');
  await page.waitForTimeout(300);
  await shot('01-start');

  // search + select via list
  await page.fill('[data-input="startSearch"]', 'Deutsch');
  assert((await page.locator('.start-country').count()) === 1, 'search filters the list');
  await page.click('.start-country');
  await page.waitForSelector('[data-action="startGame"]');

  // selecting on the map works as well (click roughly on Brazil)
  const box = await page.locator('#map').boundingBox();
  const brazil = await page.evaluate(() => {
    const ui = window.worldStrategy.ui;
    const [sx, sy] = ui.map.camera.worldToScreen(-52, 12); // ~10°S in Miller y
    return [sx, sy];
  });
  await page.mouse.click(box.x + brazil[0], box.y + brazil[1]);
  await page.waitForTimeout(200);
  const picked = await page.evaluate(() => window.worldStrategy.ui.selected);
  assert(picked === 'BRA', `map click selects a country (${picked})`);

  await page.fill('[data-input="startSearch"]', 'Deutsch');
  await page.click('.start-country');
  await page.click('[data-action="startGame"]');
  await page.waitForSelector('body:not(.is-setup)');
  assert((await page.locator('.player-name').textContent()) === 'Deutschland', 'game starts as Germany');
  await page.waitForTimeout(400);
  await shot('02-game');

  console.log('Panels');
  await page.waitForSelector('#drawer[data-panel="overview"]:not([hidden])');
  assert(true, 'overview panel opens at game start');
  await page.click('[data-action="closePanel"]');
  await page.waitForSelector('#drawer[hidden]', { state: 'attached' });
  for (const id of ['overview', 'economy', 'politics', 'diplomacy', 'trade', 'research', 'military', 'world', 'news']) {
    await page.click(`.nav-btn[data-panel="${id}"]`);
    await page.waitForSelector(`#drawer[data-panel="${id}"]:not([hidden])`);
    if (id === 'economy' || id === 'research') await shot(`03-${id}`);
  }
  assert(true, 'all nine panels open');

  console.log('Commands');
  await page.click('.nav-btn[data-panel="research"]');
  const firstTech = page.locator('#drawer .tech.is-available [data-cmd]').first();
  await firstTech.click();
  assert(await page.evaluate(() => !!window.worldStrategy.session.player.technology.current), 'research can be started');

  await page.click('.nav-btn[data-panel="economy"]');
  const taxBefore = await page.evaluate(() => window.worldStrategy.session.player.economy.taxRate);
  await page.locator('#drawer input[data-slider*="setTaxRate"]').evaluate((el) => {
    el.value = String(Number(el.value) + 2);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const taxAfter = await page.evaluate(() => window.worldStrategy.session.player.economy.taxRate);
  assert(Math.abs(taxAfter - taxBefore - 0.02) < 1e-6, 'tax slider changes the tax rate');

  // diplomacy via info panel
  await page.evaluate(() => window.worldStrategy.ui.select('BRA'));
  await page.waitForSelector('#infopanel:not([hidden]) .info-head');
  const before = await page.evaluate(() => window.worldStrategy.session.state.diplomacy.relations['BRA|DEU']?.opinion ?? null);
  await page.click('#infopanel [data-cmd*="improveRelations"]');
  const after = await page.evaluate(() => window.worldStrategy.session.state.diplomacy.relations['BRA|DEU'].opinion);
  assert(after > (before ?? -999), 'improve relations raises opinion');
  await shot('04-info');

  console.log('Map modes');
  for (const mode of ['relations', 'treaties', 'gdppc', 'growth', 'stability', 'infrastructure', 'military', 'resources', 'political']) {
    await page.click(`.mode-btn[data-mode="${mode}"]`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => window.worldStrategy.ui.map.camera.zoom > 4), 'mouse wheel zooms');

  console.log('Time');
  await page.evaluate(() => window.worldStrategy.ui.select(null));
  const day0 = await page.evaluate(() => window.worldStrategy.session.state.time.day);
  await page.keyboard.press('3');
  await page.waitForTimeout(1500);
  // resolve events if any blocked the clock
  for (let i = 0; i < 5; i++) {
    const opt = page.locator('.event-option').first();
    if (await opt.count()) {
      await shot('05-event');
      await opt.click();
      await page.waitForTimeout(50);
      assert(await page.evaluate(() => window.worldStrategy.session.state.events.pending.length > 0 || window.worldStrategy.session.clock.speed === 3), 'game resumes after the event decision');
    }
    await page.waitForTimeout(800);
  }
  while (await page.locator('.event-option').count()) await page.locator('.event-option').first().click();
  await page.keyboard.press('2');
  assert(await page.evaluate(() => window.worldStrategy.session.clock.speed === 2), 'number keys set the speed');
  await page.keyboard.press(' ');
  const day1 = await page.evaluate(() => window.worldStrategy.session.state.time.day);
  assert(day1 - day0 >= 20, `time advances at very fast speed (${day1 - day0} days)`);
  const speed = await page.evaluate(() => window.worldStrategy.session.clock.speed);
  assert(speed === 0, 'space pauses');

  console.log('Save / load');
  await page.click('.menu-btn');
  await page.click('[data-action="menuTab"][data-tab="saves"]');
  await page.fill('.save-form input[name="name"]', 'E2E Test');
  await page.click('.save-form button[type="submit"]');
  await page.waitForSelector('.save-item');
  assert((await page.locator('.save-item').count()) >= 1, 'game saved to a slot');
  await shot('06-menu');
  const savedDay = await page.evaluate(() => window.worldStrategy.session.state.time.day);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.worldStrategy.session.step(40));
  await page.waitForTimeout(100);
  while (await page.locator('.event-option').count()) await page.locator('.event-option').first().click();
  await page.click('.menu-btn');
  await page.click('[data-action="menuTab"][data-tab="saves"]');
  await page.locator('.save-item', { hasText: 'E2E Test' }).locator('[data-action="loadGame"]').click();
  await page.click('[data-confirm-yes]');
  await page.waitForFunction((d) => window.worldStrategy.session.state.time.day === d, savedDay);
  assert(true, 'loading restores the saved date');

  console.log('Reload persistence');
  await page.reload();
  await page.waitForSelector('.start-actions [data-action="loadGame"]');
  assert(true, '"Fortsetzen" offered after reload');

  console.log('Mobile layout');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('.start-actions [data-action="loadGame"]');
  await page.waitForSelector('body:not(.is-setup)');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, 'no horizontal overflow on phones');
  await shot('07-mobile');

  assert(errors.length === 0, `no JavaScript errors${errors.length ? `:\n${errors.join('\n')}` : ''}`);
  console.log('\nE2E smoke test passed.');
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
process.exit(exitCode);
