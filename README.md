# World Strategy

Ein langfristig angelegtes Grand-Strategy-Spiel für den Browser – reines HTML, CSS und JavaScript (ES-Module), ohne Build-Schritt und ohne Laufzeit-Abhängigkeiten.

Sie übernehmen als Staatsoberhaupt die Regierung eines realen Landes (194 Staaten, 906 Regionen, Startjahr 2020) und führen es über Jahrzehnte: Steuern und Haushalt, Forschung, Diplomatie, Handel, Streitkräfte, Rüstungsindustrie, Kriege und Krisen. Alle anderen Länder werden von einer KI gesteuert, die nach denselben Regeln und mit denselben Befehlen spielt wie Sie. Das Spiel hat kein Ende.

## Starten

ES-Module funktionieren nicht über `file://`, daher wird ein lokaler Webserver benötigt:

```bash
npm start            # startet http://localhost:8301 (Node ≥ 20, keine Installation nötig)
```

Alternativ funktioniert jeder statische Server (z. B. `python3 -m http.server`).

## Bedienung

| Aktion | Steuerung |
| --- | --- |
| Zeit starten/pausieren | Leertaste oder Chronometer oben |
| Geschwindigkeit | `1` `2` `3` `4` (4 = Maximal, 90 Tage/s), `+` / `−` |
| Panels | Navigation links oder `Q W E R T Z U K I O` (`U` Militär, `K` Kriege) |
| Karte | Mausrad/Pinch = Zoom, Ziehen = Verschieben, Klick = Region + Land auswählen, Doppelklick = Zoom |
| Aufrüsten (einfach) | Militär → „Aufrüsten“: Infanterie, Panzer, Artillerie, Flugabwehr, Kampfjets, Bomber, Drohnen, Kriegsschiffe, U-Boote mit einem Klick bestellen – Ausbildung, Produktion oder Kauf im Ausland erledigt das Spiel |
| Krieg führen (einfach) | Kriegsübersicht ⚔: Lagebild (wer gewinnt, geschätzte Dauer, Soldaten/Panzer/Flugzeuge/Schiffe im Vergleich) und Strategie des Generalstabs: Angreifen, Ausgewogen, Verteidigen |
| Truppen verlegen / angreifen | „Verlegen“ (Militär → Heer oder Regionspanel), dann Zielregion anklicken; feindliche Nachbarregion = Angriff. `Esc` bricht ab |
| Krieg erklären | Land oder Region anklicken → „Krieg erklären…“ (Kriegsziele, Kräfteverhältnis, Folgen) |
| Menü (Speichern, Laden, Einstellungen, Einführung) | `☰` oder `Esc` |

Beim ersten Spiel führt eine kurze Einführung durch die Oberfläche (später erneut über ☰ → Spiel). Fast jeder Wert hat einen Tooltip, der erklärt, *warum* er so ist (z. B. Zusammensetzung von Zustimmung, Stabilität und Haushalt).

## Was bereits funktioniert

- **Interaktive Weltkarte** (Canvas): 906 Regionen mit Eigentümer und Kontrolle, Grenzen verschieben sich mit Eroberungen, Frontlinien, Besatzungsschraffur, Belagerungen, Truppenmarker und Marschpfeile, 10 Kartenmodi (u. a. „Krieg & Kontrolle“)
- **Zeitsystem**: Tage, Monate, Jahre; Pause und vier Geschwindigkeiten
- **Automatische Kriegspause**: Jeder Kriegsausbruch (Spieler, KI gegen Spieler, KI gegen KI, Bündnisfall) läuft durch `onWarDeclared()` und stoppt die Simulation am selben Tag – auch bei Maximalgeschwindigkeit. Einstellbar für Kriegsausbruch, Angriff auf das eigene Land, Bündnisfall, diplomatische Krise, Staatsbankrott und Revolution (abgewählt: der Beraterstab entscheidet)
- **Krisen-Popups** mit Lageanalyse und Optionen (neutral bleiben, verurteilen, Sanktionen, mobilisieren, eingreifen, Bündnis …); nicht mögliche Optionen sind mit Begründung gesperrt
- **Streitkräfte**: 8 Heeresverbandstypen (Infanterie bis Logistik) mit Personal, Ausrüstung, Einsatzbereitschaft, Organisation, Versorgung, Moral, Erfahrung; Reserve und Mobilmachung (kostet Arbeitskräfte); Luftwaffe mit 30 Mustern und Entwicklungslinie (Jäger Mk I → Mk II → Advanced Fighter); Marine mit 9 Schiffsklassen und Flotten
- **Rüstungsindustrie & Logistik**: Fahrzeug-, Munitions-, Flugzeugfabriken und Werften, Produktionswarteschlangen mit Prioritäten, internationaler Rüstungsmarkt (11 Hersteller und Großhändler, Preise, Lieferzeiten, Verträge, Lieferstopps durch Embargos/Kriege), Lager, Wartung und Alterung, Nachschub über Infrastruktur und Versorgungsnetz (eingekesselte Verbände verhungern), Stützpunkte mit Kapazitäten
- **Krieg**: Kriegsziele, Angriffe und Belagerungen, Besetzung und Befreiung, Luft- und Seeherrschaft, Seeblockaden, Landungen, Kriegspunkte, Kriegsmüdigkeit, Friedensverhandlungen mit Annahmeprognose, Gebietsabtretungen, Reparationen, Waffenstillstände, Kapitulation; mehrere Kriege gleichzeitig; Kriegsübersicht mit Fronten und Verlauf
- **Strategische Fähigkeiten** (Abschreckung) nur als abstrakte staatliche Fähigkeit in den Risikoabwägungen und Reaktionen
- **Wirtschaft**: BIP, Wachstum, Inflation, Arbeitslosigkeit, Steuern, fünf Haushaltsposten, Schulden, Zinsen, Staatsbankrott
- **Rohstoffmarkt & Handel**: sechs Rohstoffe mit Weltmarktpreisen, bilaterale Handelsströme, Embargos, Engpässe
- **Politik**: Zustimmung, Stabilität, Regierungsformen, Wahlen und Regierungswechsel
- **Diplomatie**: Beziehungen, Handelsabkommen, Nichtangriffspakte, Bündnisse, Embargos (inkl. Annahmeprognose)
- **Forschung**: 34 Technologien in 7 Kategorien mit Technologiediffusion und Schwerpunkt zivil ↔ militärisch
- **Ereignisse**: 25 datengetriebene Länder-, Welt- und Krisenereignisse mit Entscheidungen
- **Länder-KI**: Haushalt, Forschung, Diplomatie, Aufrüstung, Beschaffung (Wettrüsten), Kriegsplanung nach Interessen (Ansprüche, Rohstoffe, Sicherheit, Feindschaft, Gelegenheit) gegen Risiken (Kräfteverhältnis, Bündnisse, Abschreckung, Handel, Stabilität), Frontführung und Friedensschluss – für alle 193 Nicht-Spieler-Länder
- **Speichern/Laden**: Spielstände in IndexedDB (gzip-komprimiert, mit Prüfsumme und Schema-Migration – alte Spielstände werden übernommen), Autosave, Export/Import als Datei

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

- Ländergrenzen, Bevölkerung und BIP (Basisjahr 2019): [Natural Earth](https://www.naturalearthdata.com/) 1:50m Admin 0, Admin 1 (Provinzen, zu Regionen zusammengefasst) und Populated Places – gemeinfrei
- Weitere Startwerte (Steuerquoten, Schulden, Militärausgaben, Streitkräftestärken, Rohstoffanteile, Bündnisse, Gebietsansprüche) sind gerundete Näherungen für das Spielbalancing und keine amtlichen Statistiken. Waffensysteme und Hersteller sind fiktive, generische Modelle mit abstrakten Spielwerten.
