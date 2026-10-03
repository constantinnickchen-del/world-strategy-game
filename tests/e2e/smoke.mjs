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

  console.log('Tutorial');
  await page.waitForSelector('.tut-bubble');
  assert(true, 'tutorial starts automatically in the first game');
  const steps = await page.locator('.tut-progress i').count();
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(280);
    await shot(`tut-${String(i + 1).padStart(2, '0')}`);
    const inView = await page.locator('.tut-bubble').evaluate((b) => {
      const r = b.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
    });
    if (!inView) throw new Error(`tutorial bubble outside viewport at step ${i + 1}`);
    await page.click('[data-tut-action="next"]');
  }
  await page.waitForSelector('#tutorial-root', { state: 'hidden' });
  assert(await page.evaluate(() => window.worldStrategy.ui.settings.tutorialDone === true), `tutorial (${steps} steps) completes and is remembered`);
  assert(await page.evaluate(() => window.worldStrategy.session.clock.speed === 0), 'game stays paused during the tutorial');
  await page.waitForTimeout(400);
  await shot('02-game');

  console.log('Panels');
  await page.waitForSelector('#drawer[data-panel="overview"]:not([hidden])');
  assert(true, 'overview panel opens at game start');
  await page.click('[data-action="closePanel"]');
  await page.waitForSelector('#drawer[hidden]', { state: 'attached' });
  for (const id of ['overview', 'economy', 'politics', 'diplomacy', 'trade', 'research', 'military', 'wars', 'world', 'news']) {
    await page.click(`.nav-btn[data-panel="${id}"]`);
    await page.waitForSelector(`#drawer[data-panel="${id}"]:not([hidden])`);
    if (id === 'economy' || id === 'research') await shot(`03-${id}`);
  }
  assert(true, 'all ten panels open');

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
  for (const mode of ['war', 'relations', 'treaties', 'gdppc', 'growth', 'stability', 'infrastructure', 'military', 'resources', 'political']) {
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

  console.log('Military & war');
  while (await page.locator('.event-option').count()) await page.locator('.event-option').first().click();
  await page.click('.nav-btn[data-panel="military"]');
  for (const tab of ['quick', 'army', 'air', 'navy', 'production', 'procurement', 'facilities', 'stock', 'overview']) {
    await page.click(`#drawer .tab-btn[data-tab="${tab}"]`);
    await page.waitForSelector(`#drawer .tab-btn.is-active[data-tab="${tab}"]`);
    if (tab === 'overview' || tab === 'army' || tab === 'quick') await shot(`08-military-${tab}`);
  }
  assert(true, 'all military tabs render');
  await page.click('#drawer .tab-btn[data-tab="quick"]');
  const fighters0 = await page.evaluate(() => window.worldStrategy.session.player.military.production.length + window.worldStrategy.session.player.military.contracts.length);
  await page.locator('#drawer .order-card', { hasText: 'Kampfjets' }).locator('[data-cmd]').click();
  assert((await page.evaluate(() => window.worldStrategy.session.player.military.production.length + window.worldStrategy.session.player.military.contracts.length)) === fighters0 + 1, 'one click orders fighter jets');
  await page.click('#drawer .tab-btn[data-tab="production"]');
  await page.selectOption('#drawer select[name="product"]', 'equipment:ammunition');
  await page.fill('#drawer input[name="quantity"]', '5000');
  await page.click('#drawer form[data-cmd-form] button[type="submit"]');
  assert(await page.evaluate(() => window.worldStrategy.session.player.military.production.some((l) => l.item === 'ammunition' && l.quantity === 5000)), 'production order placed through the form');
  // region panel: raise a formation in Bavaria
  const units0 = await page.evaluate(() => window.worldStrategy.session.player.military.units.length);
  await page.evaluate(() => window.worldStrategy.ui.actions.focusRegion({ region: 'DE-BY' }));
  await page.waitForSelector('#infopanel [data-tut="region"]');
  await page.selectOption('#infopanel form[data-cmd-form*="raiseUnit"] select[name="unitType"]', 'infantry');
  await page.click('#infopanel form[data-cmd-form*="raiseUnit"] button[type="submit"]');
  assert((await page.evaluate(() => window.worldStrategy.session.player.military.units.length)) === units0 + 1, 'a formation is raised from the region panel');
  // move mode: select a formation, click a destination region
  const moved = await page.evaluate(() => {
    const { ui, session } = window.worldStrategy;
    const u = session.player.military.units.find((x) => x.status === 'active' && x.region !== 'DE-BE');
    ui.startMove([u.id]);
    ui.selectRegion('DE-BE');
    return { target: u.target, mode: ui.moveMode };
  });
  assert(moved.target === 'DE-BE' && moved.mode === null, 'move order via map click');
  // declaring war through the dialog stops the clock immediately
  await page.evaluate(() => window.worldStrategy.session.setSpeed(2));
  await page.evaluate(() => window.worldStrategy.ui.declareWar.open('VEN'));
  await page.waitForSelector('.war-modal [data-declare]');
  await shot('09-declare-war');
  await page.click('.war-modal [data-declare]');
  await page.waitForSelector('#drawer[data-panel="wars"]:not([hidden])');
  const declared = await page.evaluate(() => ({ speed: window.worldStrategy.session.clock.speed, kind: window.worldStrategy.session.lastInterrupt?.kind, wars: window.worldStrategy.session.state.wars.length }));
  assert(declared.speed === 0 && declared.kind === 'playerDeclared' && declared.wars >= 1, 'player war declaration pauses and opens the war room');
  await page.waitForSelector('#drawer .war-situation .war-verdict');
  assert(true, 'war room shows the outlook (verdict, duration, force comparison)');
  await page.click('.mode-btn[data-mode="war"]');
  await shot('10-war-room');
  // an AI war at maximum speed pauses on the day of the outbreak
  const pause = await page.evaluate(async () => {
    const { session } = window.worldStrategy;
    const { executeCommand } = await import('/src/commands/commands.js');
    const warDay = session.state.time.day + 25;
    let declaredDay = null;
    session.bus.on('day', () => {
      if (declaredDay !== null || session.state.time.day < warDay) return;
      declaredDay = session.state.time.day;
      executeCommand(session.state, { type: 'declareWar', countryId: 'PAK', targetId: 'IND', goals: [{ type: 'region', regionId: 'IN-JK' }] }, session.sim.context(session.state));
    });
    session.settings.pauseOnEvents = false; // only crises may stop the clock in this check
    session.setSpeed(4);
    const t0 = performance.now();
    while (session.clock.speed !== 0 && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 30));
    session.settings.pauseOnEvents = true;
    return { declaredDay, day: session.state.time.day, speed: session.clock.speed, kind: session.lastInterrupt?.kind };
  });
  assert(pause.speed === 0 && pause.declaredDay === pause.day && pause.kind === 'warDeclared', `AI war at maximum speed pauses on the same day (${JSON.stringify(pause)})`);
  await page.waitForSelector('.event-modal.is-crisis');
  await shot('11-crisis');
  await page.locator('.event-modal .event-option:not([disabled])').first().click();
  while (await page.locator('.event-option').count()) await page.locator('.event-option:not([disabled])').first().click();

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
