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
    GameClock.js           Echtzeit → Spieltage (Pause + 4 Geschwindigkeiten, Frame-Cap)
    Simulation.js          Tagesschritt, ruft daily/monthly/yearly-Hooks aller Systeme auf
    GameSession.js         Laufendes Spiel: State + Simulation + Uhr + Befehle + Krisenpause
    settings.js            Benutzereinstellungen inkl. Pause-Gründe (nicht Teil des Spielstands)
  state/
    createGameState.js     Erzeugt den Zustand aus Szenario + Daten (SCHEMA_VERSION)
    prime.js               Füllt abgeleitete Werte, startet Märkte im Gleichgewicht
    selectors.js           Lesende Hilfsfunktionen (BIP/Kopf, Schuldenquote, Ranglisten …)
    worldIndex.js          Statischer Weltindex + abgeleitete Caches (Nachbarschaften)
    territory.js           Eigentum/Kontrolle von Regionen, BIP/Rohstoffe aus Regionen, Hauptstadt
    militarySetup.js       Startstreitkräfte, Lager und Anlagen (aus Profilen bzw. Budget abgeleitet)
    history.js             Kompakte Zeitreihen für Diagramme
  data/                    Inhalte: Rohstoffe, Regierungen, Länderprofile, Technologien,
                           Ereignisse, Diplomatie-Startlage inkl. Gebietsansprüche, Szenarien
    military/              Ausrüstung, Heeresverbände, Flugzeuge, Schiffe, Anlagen,
                           Rüstungslieferanten, Streitkräfteprofile der großen Militärmächte
    generated/             Von tools/build-world.mjs erzeugt (Regionen, Topologie, Nachbarn)
  systems/                 Simulationssysteme (siehe Pipeline unten)
    military/              Budget, Personal/Mobilmachung, Wartung, Produktion, Beschaffung,
                           Bau, Logistik, Kampfkraft
    war/                   Kriege & Frieden, Bewegung, Gefechte/Belagerungen, Frontführung
  commands/commands.js     Befehle mit Validierung (Spieler und KI)
  commands/militaryCommands.js  Militär-, Kriegs- und Gebietsbefehle
  ai/countryAI.js          Länder-KI aus unabhängigen „Beratern“
  ai/militaryAI.js         Aufrüstung, Produktion, Beschaffung, Bauprojekte der KI
  ai/warAI.js              Kriegsplanung (Interessen gegen Risiken), Friedensschluss
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
  regions:   { 'DE-BY': { owner, controller, population, infrastructure, econ, resources,
                          buildings, siege, occupiedSince, devastation, unrest, cores, claims } },
  market:    { oil: { price, basePrice, supply, demand, history }, ... },
  diplomacy: { relations: { 'DEU|FRA': { base, opinion, treaties, embargoes, ... } } },
  events:    { pending, cooldowns, log },
  wars:      [{ id, name, attackers, defenders, goals, score, battles, casualties,
                airSuperiority, navalSuperiority, blockade, status, outcome, ... }],
  truces:    { 'RUS|UKR': untilDay },
  procurement: { suppliers: { atlantic: { backlog } } },
  news:      [...],
  world:     { ownershipVersion, controlVersion, seq },
  stats:     { worldGdpHistory, techDiffusion },
}
```

- **Länder besitzen Regionen.** 906 Regionen (aus Natural-Earth-Provinzen zusammengefasst) tragen Bevölkerung, Wirtschaftsleistung (`econ`), Rohstoffkapazitäten, Infrastruktur und militärische Anlagen. BIP, Bevölkerung und Rohstoffförderung eines Landes werden aus seinen Regionen abgeleitet (`refreshTerritory`).
- **Eigentum und Kontrolle sind getrennt.** `owner` ändert sich nur durch Friedensverträge (`transferRegion`), `controller` durch Eroberung/Befreiung (`setController`). Besetzte Regionen liefern dem Eigentümer 30 %, dem Besatzer 12 % ihrer Leistung (Rohstoffe 50 %). Status: Friedenskontrolle → umkämpft (Belagerung) → besetzt → dauerhaft (Vertrag). Fällt die Hauptstadt, zieht die Regierung um (Stabilitätsverlust).
- **Militär** (`country.military`): Verbände `units[]`, Flugzeuge `aircraft{muster: {count, readiness, age}}`, Flotten `fleets[]`, Lager `stock{}`, Produktionswarteschlange, Verträge, Bauprojekte, Mobilmachung, Reserve, Kriegsmüdigkeit, Ausgaben des letzten Monats. Alle Stärkewerte werden aus diesen Objekten berechnet – es gibt keine zufälligen oder dekorativen Militärwerte.
- **Diplomatische Beziehungen sind dünn besetzt.** Nur berührte Paare werden gespeichert (`'AAA|BBB'`), alle anderen nutzen einen berechneten Standardwert.
- **Geld** ist in Mrd. US-$ zu konstanten Preisen von 2019 (real). Inflation wirkt über die reale Entwertung von Schulden/Kasse und über Politik.

## Simulations-Pipeline

Jeder Tag: `daily`-Hooks (KI und Länderereignisse, verteilt über den Monat nach `country.ai.day`). Am Monatsersten zusätzlich in dieser Reihenfolge:

```
territory → market → trade → economy → population → politics → technology
          → infrastructure → military → diplomacy → statistics → war → events(Welt) → ai
```

Täglich laufen zusätzlich das Kriegssystem (Bewegung → Frontführung → Gefechte, Luft- und Seekrieg je Krieg → Nachschub & Kriegsmüdigkeit → Kapitulationen) und die KI (verteilt über den Monat).

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

### Militär und Krieg

```
Staatsoberhaupt ─► Verteidigungsbudget (Obergrenze) ─► Unterhalt ─► Verträge ─► Bau ─► Produktion ─► Nachschub
Fabriken + Rohstoffe (Metalle, Seltene Erden, Öl) ─► Ausrüstung/Flugzeuge/Schiffe ─► Lager ─► Ausrüstung der Verbände
Bevölkerung ─► Wehrfähige ─► Reserve/Rekruten ─► Verbände   (Mobilmachung: mehr Soldaten, weniger Arbeitskräfte)
Lager + Infrastruktur + Versorgungsnetz ─► Versorgung der Verbände ─► Kampfkraft
Kampfkraft + Gelände + Luftherrschaft ─► Gefechte/Belagerungen ─► Kontrolle von Regionen ─► BIP, Rohstoffe, Kriegspunkte
Kriegspunkte + Kriegsmüdigkeit ─► Frieden (Abtretungen, Reparationen) ─► Grenzen ─► Diplomatie ─► neue Konflikte
```

- **Kriegsausbruch:** Jeder Krieg – Spieler, KI gegen Spieler, KI gegen KI, Bündnisfall – entsteht über `declareWar()` und läuft durch `onWarDeclared()` (`systems/war/wars.js`): Nachrichten, Weltmeinung, Krisenereignis für den Spieler und ein `interrupt`-Ereignis auf dem EventBus. Weitere Unterbrechungen: Kriegseintritt gegen den Spieler, Kriegsdrohung (`warTension`), Frieden mit Spielerbeteiligung, Staatsbankrott, Machtwechsel.
- **Sofortige Pause:** `GameSession` sammelt `interrupt`-Ereignisse während eines simulierten Tages und hält die Uhr am Ende genau dieses Tages an (auch bei 90 Tagen/s), merkt sich Grund, Tag und vorherige Geschwindigkeit (`lastInterrupt`) und meldet `interrupted` an die UI (Toast, Kriegsübersicht, Krisen-Popup). Ist ein Pause-Grund abgewählt, entscheidet der Beraterstab das zugehörige Ereignis (`advisorChoice`).
- **Kriegs-KI** (`ai/warAI.js`): bewertet Nachbarn nach Interessen (Ansprüche, Rohstoffregionen, Feindschaft, Gelegenheit, Ehrgeiz) und Risiken (Kräfteverhältnis inkl. Verbündeter, Abschreckung, Demokratie, Stabilität, Handelsabhängigkeit, Kriegsmüdigkeit). Ab einer Schwelle wird ein Kriegsplan mit Vorlaufzeit erstellt (Ansprüche werden vorbereitet, der Spieler wird bei eigener Betroffenheit gewarnt). Nach einem Krieg verhindert ein Gedächtnis (5–10 Jahre) Endlosschleifen.
- **Frontführung** (`systems/war/frontAI.js`) führt KI-Verbände und – solange der Spieler sie nicht abschaltet – die nicht manuell befohlenen Verbände des Spielers.

### Modifikatoren

Technologien, Ereignisse und künftig Gesetze, Gebäude oder Eigenschaften wirken über `getMod(country, stat)`. Zeitlich begrenzte Modifikatoren liegen in `country.modifiers`; Technologieeffekte werden aus `technology.researched` abgeleitet (kleinere Spielstände, Balancing-Änderungen wirken auch auf alte Saves). Die Liste der Stats steht in `src/systems/modifiers.js`.

### Effekte

Ereignisoptionen beschreiben Folgen deklarativ (`{ type: 'treasury', gdpShare: -0.005 }`, `{ type: 'modifier', stat, value, months }`, …). `effects.js` wendet sie an **und** erzeugt die Beschreibung für die UI. Platzhalter (`resource: 'auto'`) werden beim Auslösen aufgelöst, damit der Spieler exakt sieht, was passiert.

## Befehle

`src/commands/commands.js` – jeder Befehl hat `validate()` und `execute()`:
`setTaxRate`, `setBudget`, `setResearch`, `repayDebt`, `improveRelations`, `proposeTreaty`, `cancelTreaty`, `setEmbargo`, `resolveEvent` sowie in `militaryCommands.js`:
`setMobilization`, `raiseUnit`, `disbandUnit`, `moveUnit`, `setUnitAutomatic`, `setAutoFront`, `queueProduction`, `cancelProduction`, `prioritizeProduction`, `signContract`, `cancelContract`, `buildFacility`, `setResearchFocus`, `fabricateClaim`, `declareWar`, `joinWar`, `proposePeace`.
Neue Spielmechaniken werden als weitere Befehle ergänzt und stehen damit sofort Spieler **und** KI zur Verfügung.

## KI

`countryAI.js` besteht aus unabhängigen Beratern (`fiscalAdvisor`, `budgetAdvisor`, `researchAdvisor`, `diplomacyAdvisor`, `militaryAdvisor`, `warAdvisor`), gesteuert von einer dauerhaften Persönlichkeit (Wirtschaft, Militarismus, Diplomatie, Forschung). Jedes Land denkt einmal im Monat an seinem eigenen Tag. Die KI nutzt ausschließlich dieselben Befehle wie der Spieler (Aufstellen, Produzieren, Beschaffen, Bauen, Krieg erklären, Frieden anbieten). Neue Verhaltensweisen = neuer Berater in `ADVISORS`.

## Speichern

- `storage.js`: IndexedDB (bevorzugt) → localStorage → Arbeitsspeicher.
- `SaveManager`: Slots + Index, gzip über `CompressionStream`, FNV-Prüfsumme, Validierung, Export/Import als JSON-Datei.
- `migrations.js`: Bei Änderungen am Zustandsformat `SCHEMA_VERSION` erhöhen und eine Migrationsfunktion N → N+1 ergänzen. Alte Spielstände werden beim Laden schrittweise aktualisiert. Schema 1 → 2 (Regionen, Militär, Kriege) baut den Zustand des gleichen Szenarios neu auf und übernimmt die Entwicklung der Länder (BIP und Bevölkerung bleiben erhalten); abgesichert mit einem echten Schema-1-Spielstand in `tests/fixtures`.

## UI

- `UIManager` hält nur UI-Zustand (Auswahl, offenes Panel, Kartenmodus) und rendert über Dirty-Flags höchstens einmal pro Animation-Frame.
- Interaktion läuft deklarativ über Data-Attribute und Event-Delegation (`data-action`, `data-cmd`, `data-slider`, `data-tip`). Panels sind dadurch reine Template-Funktionen `{ id, title, render(ui), charts?(ui) }`.
- Die Statusleiste wird einmal aufgebaut und danach nur gepatcht (läuft täglich).
- Karte: Regionen und gemeinsame Grenzbögen werden einmal projiziert (Miller) und als `Path2D` gecacht; pro Frame ändert sich nur die Transformation. Jeder Grenzbogen kennt die Regionen auf beiden Seiten und wird bei Eigentums-/Kontroll-/Kriegsänderungen neu klassifiziert (Staatsgrenze, Regionsgrenze, Front). Besetzung = Schraffur in der Farbe des Besatzers, Belagerung = gestrichelte Kontur, Truppenmarker mit Nebel des Krieges (feindliche Verbände nur an der Front sichtbar).
- Verlegungsmodus: Verbände auswählen → Klick auf Zielregion (Tooltip zeigt Marschdauer, Angriff, Landung oder warum es nicht geht).
- Militär-Panel mit Reitern (Übersicht/HEER/LUFTWAFFE/MARINE/INDUSTRIE/LOGISTIK-Dashboard, Heer, Luftwaffe, Marine, Produktion, Beschaffung, Anlagen, Lager); Kriegsübersicht mit Friedensverhandlung; Dialog zur Kriegserklärung; Formulare laufen über `data-cmd-form` (fester Befehlsteil + Formularfelder).

## Performance (Stand dieser Version)

- Neues Spiel: ~0,1 s (Regionen, Streitkräfte, Märkte). Ein simuliertes Jahr (194 Länder, ~2.500 Verbände, alle Systeme, laufende Kriege): ~1 s. Bei „Maximal“ (90 Tage/s) also ~25 % CPU-Zeit.
- Heißeste Teile: Länder-KI (inkl. Kriegs- und Militärplanung), Handel (Typed Arrays), Militär-Monat, Kriegstag. Bei Bedarf: Arbeit weiter über Tage verteilen oder in einen Web Worker verlagern (Simulation ist DOM-frei).
- Spielstand: ~3 MB JSON, gzip-komprimiert ~6–8× kleiner.
