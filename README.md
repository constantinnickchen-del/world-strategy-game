# World Strategy

Ein langfristig angelegtes Grand-Strategy-Spiel für den Browser – reines HTML, CSS und JavaScript (ES-Module), ohne Build-Schritt und ohne Laufzeit-Abhängigkeiten.

Sie übernehmen die Regierung eines realen Landes (194 Staaten, Startjahr 2020) und führen es über Jahrzehnte: Steuern und Haushalt, Forschung, Diplomatie, Handel und Krisen. Alle anderen Länder werden von einer KI gesteuert, die nach denselben Regeln spielt wie Sie.

## Starten

ES-Module funktionieren nicht über `file://`, daher wird ein lokaler Webserver benötigt:

```bash
npm start            # startet http://localhost:8080 (Node ≥ 20, keine Installation nötig)
```

Alternativ funktioniert jeder statische Server (z. B. `python3 -m http.server`).

## Bedienung

| Aktion | Steuerung |
| --- | --- |
| Zeit starten/pausieren | Leertaste oder Chronometer oben |
| Geschwindigkeit | `1` `2` `3`, `+` / `−` |
| Panels | Navigation links oder `Q W E R T Z U I O` |
| Karte | Mausrad/Pinch = Zoom, Ziehen = Verschieben, Klick = Land auswählen, Doppelklick = Zoom |
| Menü (Speichern, Laden, Einstellungen) | `☰` oder `Esc` |

Fast jeder Wert hat einen Tooltip, der erklärt, *warum* er so ist (z. B. Zusammensetzung von Zustimmung, Stabilität und Haushalt).

## Was bereits funktioniert

- **Interaktive Weltkarte** (Canvas): Zoom, Verschieben, Länderauswahl, 9 Kartenmodi (politisch, Beziehungen, Verträge, Wohlstand, Wachstum, Stabilität, Infrastruktur, Militär, Rohstoffe)
- **Zeitsystem**: Tage, Monate, Jahre; Pause und drei Geschwindigkeiten
- **Wirtschaft**: BIP, Wachstum, Inflation, Arbeitslosigkeit, Steuern, fünf Haushaltsposten, Schulden, Zinsen, Staatsbankrott
- **Rohstoffmarkt & Handel**: sechs Rohstoffe mit Weltmarktpreisen, bilaterale Handelsströme, Embargos, Engpässe
- **Politik**: Zustimmung, Stabilität, Regierungsformen, Wahlen und Regierungswechsel
- **Diplomatie**: Beziehungen, Handelsabkommen, Nichtangriffspakte, Bündnisse, Embargos (inkl. Annahmeprognose)
- **Forschung**: 28 Technologien in 7 Kategorien mit Technologiediffusion
- **Ereignisse**: 19 datengetriebene Länder- und Weltereignisse mit Entscheidungen
- **Länder-KI**: Haushalt, Forschung und Diplomatie für alle 193 Nicht-Spieler-Länder
- **Speichern/Laden**: Spielstände in IndexedDB (gzip-komprimiert, mit Prüfsumme und Schema-Migration), Autosave, Export/Import als Datei

## Entwicklung

```bash
npm test             # Unit-Tests der Spielsysteme (Node-Test-Runner, keine Abhängigkeiten)
npm run test:e2e     # Browser-Smoke-Test (benötigt Playwright: npm i -D playwright)
npm run lint         # ESLint (benötigt eine ESLint-Installation)
npm run simulate -- 30 DEU   # 30 Jahre headless simulieren: Balancing- und Performance-Bericht
npm run build:world  # Weltdaten aus Natural Earth neu erzeugen
```

Die Architektur ist in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) beschrieben.

## Datenquellen

- Ländergrenzen, Bevölkerung und BIP (Basisjahr 2019): [Natural Earth](https://www.naturalearthdata.com/) 1:50m Admin 0 – gemeinfrei
- Weitere Startwerte (Steuerquoten, Schulden, Militärausgaben, Rohstoffanteile, Bündnisse) sind gerundete Näherungen für das Spielbalancing und keine amtlichen Statistiken.
