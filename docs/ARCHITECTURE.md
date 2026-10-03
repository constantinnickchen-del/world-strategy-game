# Architektur

Ziel: Eine Simulation, die über viele Spieljahrzehnte stabil läuft und auf der sehr viele weitere Systeme aufgebaut werden können. Die wichtigsten Leitlinien:

1. **Strikte Trennung von Simulation und Darstellung.** `src/core`, `src/state`, `src/systems`, `src/commands`, `src/ai` und `src/save` greifen nie auf das DOM zu. Sie laufen unverändert in Node (Tests, Headless-Balancing) und können später in einen Web Worker verschoben werden.
2. **Ein serialisierbarer Spielzustand.** Alles Dynamische liegt in einem einzigen JSON-fähigen Objekt (`state`). Statische Inhalte (Technologien, Ereignisse, Rohstoffe, Geometrie) werden nur per ID referenziert und nie gespeichert.
3. **Determinismus.** Der Zufallsgenerator (sfc32) liegt im Zustand (`state.rng`). Gleiches Saatgut + gleiche Befehle = identischer Spielverlauf; ein geladener Spielstand läuft exakt wie das Original weiter (per Test abgesichert). `Math.random()` ist in der Simulation tabu.
4. **Daten statt Sonderfälle.** Ereignisse, Technologien, Regierungsformen, Kartenmodi, Szenarien und Effekte sind Daten. Neue Inhalte erfordern in der Regel keine Änderung an Systemcode.
5. **Spieler und KI nutzen dieselben Befehle.** Zustandsänderungen durch Entscheidungen laufen ausschließlich über `executeCommand` – mit Validierung. Die UI zeigt deaktivierte Buttons samt Begründung, statt Aktionen anzubieten, die die Regeln verbieten.

## Verzeichnisstruktur

```
index.html                 Einstieg (lädt src/main.js als ES-Modul)
css/                       base (Tokens), layout (Raster), components
src/
  main.js                  Verdrahtung: Storage → SaveManager → GameSession → UIManager
  version.js
  core/
    calendar.js            Gregorianischer Kalender auf Basis ganzzahliger Tagesnummern
    random.js              Deterministischer, speicherbarer PRNG
    EventBus.js            Pub/Sub zwischen Simulation und UI
    GameClock.js           Echtzeit → Spieltage (Pause + 3 Geschwindigkeiten, Frame-Cap)
    Simulation.js          Tagesschritt, ruft daily/monthly/yearly-Hooks aller Systeme auf
    GameSession.js         Laufendes Spiel: State + Simulation + Uhr + Befehle
    settings.js            Benutzereinstellungen (nicht Teil des Spielstands)
  state/
    createGameState.js     Erzeugt den Zustand aus Szenario + Daten (SCHEMA_VERSION)
    prime.js               Füllt abgeleitete Werte, startet Märkte im Gleichgewicht
    selectors.js           Lesende Hilfsfunktionen (BIP/Kopf, Schuldenquote, Ranglisten …)
    worldIndex.js          Statischer Weltindex + abgeleitete Caches (Nachbarschaften)
    history.js             Kompakte Zeitreihen für Diagramme
  data/                    Inhalte: Rohstoffe, Regierungen, Länderprofile, Technologien,
                           Ereignisse, Diplomatie-Startlage, Szenarien
    generated/             Von tools/build-world.mjs erzeugt (Regionen, Geometrie, Nachbarn)
  systems/                 Simulationssysteme (siehe Pipeline unten)
  commands/commands.js     Befehle mit Validierung (Spieler und KI)
  ai/countryAI.js          Länder-KI aus unabhängigen „Beratern“
  save/                    Storage-Adapter, SaveManager, Migrationen
  map/                     Geometrie/Projektion, Kamera, Canvas-Renderer, Kartenmodi
  ui/                      UIManager, Komponenten, Panels, Modals, Widgets, Tooltips
  util/                    Mathe- und Formatierungshilfen
tests/                     Node-Unit-Tests, e2e/smoke.mjs (Playwright)
tools/                     build-world, simulate (Balancing), serve (Dev-Server)
```

## Der Spielzustand

```js
state = {
  meta:      { schemaVersion, scenarioId, seed, gameId, dataYear },
  time:      { day, startDay },              // ganzzahlige Tagesnummer
  rng:       { a, b, c, d },                 // PRNG-Zustand
  playerId:  'DEU',
  countryOrder: [...],                       // stabile Iterationsreihenfolge (Determinismus)
  countries: { DEU: { politics, economy, budget, resources, trade, technology,
                      military, modifiers, history, yearly, ai, regionIds, ... } },
  regions:   { DEU: { owner, population, infrastructure }, GRL: { owner: 'DNK', ... } },
  market:    { oil: { price, basePrice, supply, demand, history }, ... },
  diplomacy: { relations: { 'DEU|FRA': { base, opinion, treaties, embargoes, ... } } },
  events:    { pending, cooldowns, log },
  news:      [...],
  world:     { ownershipVersion, seq },
  stats:     { worldGdpHistory, techDiffusion },
}
```

- **Länder besitzen Regionen.** Bevölkerung und Infrastruktur liegen in Regionen; die Karte färbt Regionen nach Besitzer. Gebietswechsel (Krieg, Abspaltung, Kauf) sind damit nur eine Änderung von `region.owner` + `markOwnershipChanged(state)`. Aktuell entspricht eine Region einem Natural-Earth-Gebiet (Länder + abhängige Gebiete wie Grönland, Puerto Rico, Hongkong); feinere Provinzen können ergänzt werden, ohne Systeme umzubauen.
- **Diplomatische Beziehungen sind dünn besetzt.** Nur berührte Paare werden gespeichert (`'AAA|BBB'`), alle anderen nutzen einen berechneten Standardwert.
- **Geld** ist in Mrd. US-$ zu konstanten Preisen von 2019 (real). Inflation wirkt über die reale Entwertung von Schulden/Kasse und über Politik.

## Simulations-Pipeline

Jeder Tag: `daily`-Hooks (KI und Länderereignisse, verteilt über den Monat nach `country.ai.day`). Am Monatsersten zusätzlich in dieser Reihenfolge:

```
market → trade → economy → population → politics → technology
       → infrastructure → military → diplomacy → statistics → events(Welt) → ai
```

Ein neues System ist ein Objekt `{ id, daily?, monthly?, yearly? }` und wird in `src/systems/index.js` eingereiht.

### Wirkungsketten (bereits umgesetzt)

```
Förderkürzung/Ereignis ─► Weltmarktpreis ─► Rohstoffkostenindex ─► Inflation ─► Zustimmung
                                   │                                    │
                                   └─► Rohstoffrenten (Exporteure) ─────┴─► Staatshaushalt
Embargo/Abkommen ─► Handelsströme ─► Engpässe ─► Wachstum ─► BIP ─► Steuerbasis ─► Einnahmen
Stabilität & Infrastruktur ─► Steuereffizienz, Potenzialwachstum, Förderleistung
Schuldenquote ─► Risikoaufschlag ─► Zinsen ─► Defizit ─► (ggf.) Staatsbankrott
Steuer-/Sozialpolitik ─► Zustimmung (relativ zum Gewohnten) ─► Stabilität ─► Wahlen
```

### Modifikatoren

Technologien, Ereignisse und künftig Gesetze, Gebäude oder Eigenschaften wirken über `getMod(country, stat)`. Zeitlich begrenzte Modifikatoren liegen in `country.modifiers`; Technologieeffekte werden aus `technology.researched` abgeleitet (kleinere Spielstände, Balancing-Änderungen wirken auch auf alte Saves). Die Liste der Stats steht in `src/systems/modifiers.js`.

### Effekte

Ereignisoptionen beschreiben Folgen deklarativ (`{ type: 'treasury', gdpShare: -0.005 }`, `{ type: 'modifier', stat, value, months }`, …). `effects.js` wendet sie an **und** erzeugt die Beschreibung für die UI. Platzhalter (`resource: 'auto'`) werden beim Auslösen aufgelöst, damit der Spieler exakt sieht, was passiert.

## Befehle

`src/commands/commands.js` – jeder Befehl hat `validate()` und `execute()`:
`setTaxRate`, `setBudget`, `setResearch`, `repayDebt`, `improveRelations`, `proposeTreaty`, `cancelTreaty`, `setEmbargo`, `resolveEvent`.
Neue Spielmechaniken (Gesetze erlassen, Einheiten bauen, Krieg erklären) werden als weitere Befehle ergänzt und stehen damit sofort Spieler **und** KI zur Verfügung.

## KI

`countryAI.js` besteht aus unabhängigen Beratern (`fiscalAdvisor`, `budgetAdvisor`, `researchAdvisor`, `diplomacyAdvisor`), gesteuert von einer dauerhaften Persönlichkeit (Wirtschaft, Militarismus, Diplomatie, Forschung). Jedes Land denkt einmal im Monat an seinem eigenen Tag. Neue Verhaltensweisen = neuer Berater in `ADVISORS`.

## Speichern

- `storage.js`: IndexedDB (bevorzugt) → localStorage → Arbeitsspeicher.
- `SaveManager`: Slots + Index, gzip über `CompressionStream`, FNV-Prüfsumme, Validierung, Export/Import als JSON-Datei.
- `migrations.js`: Bei Änderungen am Zustandsformat `SCHEMA_VERSION` erhöhen und eine Migrationsfunktion N → N+1 ergänzen. Alte Spielstände werden beim Laden schrittweise aktualisiert.

## UI

- `UIManager` hält nur UI-Zustand (Auswahl, offenes Panel, Kartenmodus) und rendert über Dirty-Flags höchstens einmal pro Animation-Frame.
- Interaktion läuft deklarativ über Data-Attribute und Event-Delegation (`data-action`, `data-cmd`, `data-slider`, `data-tip`). Panels sind dadurch reine Template-Funktionen `{ id, title, render(ui), charts?(ui) }`.
- Die Statusleiste wird einmal aufgebaut und danach nur gepatcht (läuft täglich).
- Karte: Geometrie wird einmal projiziert (Miller) und als `Path2D` gecacht; pro Frame ändert sich nur die Transformation. Rendern erfolgt nur bei Bedarf.

## Performance (Stand dieser Version)

- Neues Spiel: ~80 ms. Simulierter Monat (194 Länder, alle Systeme): ~15–20 ms. Bei höchster Geschwindigkeit (30 Tage/s) also ~2 % CPU-Zeit für die Monatsberechnung.
- Heißeste Schleife: Handel (Typed Arrays, Gewichtsmatrix). Bei deutlich mehr Akteuren/Provinzen: Monatsarbeit über Tage verteilen oder in einen Web Worker verlagern (Simulation ist DOM-frei).
- Spielstand: ~1–2 MB JSON, gzip-komprimiert ~5–10× kleiner.
