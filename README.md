# SERVINO für alle Serviceclubs

Bestellseite und Verwaltung für SERVINO, den Wein der sieben Grieskirchner Serviceclubs. Eine Seite und
eine Google-Web-App für alle Clubs; jeder Club hat einen eigenen Bereich, den sein Sekretär führt.
Entstanden aus der Bestellung des Club 41 Grieskirchen-Hausruck (Repository `c41-servino`), die davon
unberührt bleibt.

## Aufbau

- **Bestellseite** (`index.html`, GitHub Pages): persönlicher Link `?k=<Zeichen>`. Beim Öffnen holt die Seite
  Club, Anrede (Du oder Sie), Sorten mit Preisen und die eigene Bestellung von der Web-App. Rechnen, Prüfen,
  Abschicken, eigene Bestellung ansehen und ändern, zusätzliche Bestellung nach der Abholung.
- **Web-App** (`google/Code.gs`, `google/Verwaltung.html`): Google Apps Script im SERVINO-Konto, Daten in der
  Google-Tabelle „SERVINO Clubs“ mit den Blättern Clubs, Mitglieder, Sorten, Bestellungen, Abholung, Versand.
- **Verwaltung** für den Sekretär: Web-App-Adresse mit `?verwaltung=<Kürzel>&s=<Schlüssel>`. Reiter Stand
  (mit Abholung), Mitglieder (Liste aus Excel einfügen, Link kopieren, WhatsApp, Entfernen), Versand
  (Probe, Einladung, Erinnerung über MailApp) und Einstellungen.

Die Rechenregel steht einmal in `preis.js`, die Preise im Blatt „Sorten“. Die Statusregeln (bestellt,
prüfen, keine Bestellung, offen, Abschnitte durch Abholung) entsprechen denen des Club 41.

## Dateien

- `index.html`, `preis.js`, `texte.js` (Du- und Sie-Texte), `einstellung.js` (Adresse der Web-App)
- `bilder/`: Flaschenfoto, freigestellte Flaschen, Vorschaubild (`test/vorschau.py` baut es)
- `google/Code.gs`, `google/Verwaltung.html`, `google/appsscript.json`
- `test/preis.test.js`: Rechenregel. `node test/preis.test.js`
- `test/code.test.js`: Web-App gegen einen Nachbau der Google-Dienste (`test/attrappe.js`): Zugang je Club,
  Geheimzeichen, Mitgliederliste, Annahme und Ablehnung, Stand, Abholung, Versand mit Tageslimit.
  `node test/code.test.js`
- `test/server.js`: Nachbau zum Ausprobieren im Browser, `node test/server.js 8790`. Legt zwei Clubs an und
  gibt Verwaltungs- und Mitgliederlinks aus. `/mails` zeigt die verschickten Mails.

## Einrichtung im SERVINO-Konto

1. Auf script.google.com ein neues Projekt „SERVINO Clubs“ anlegen. `Code.gs` ersetzen, eine HTML-Datei
   `Verwaltung` anlegen und `google/Verwaltung.html` einfügen. In den Projekteinstellungen „appsscript.json im
   Editor anzeigen“ und den Inhalt von `google/appsscript.json` übernehmen.
2. `einrichten` ausführen und die Freigaben bestätigen. Das legt die Tabelle mit Testclub an.
3. Bereitstellen, neue Bereitstellung, Web-App, ausführen als „Ich“, Zugriff „Jeder“. Die Adresse
   in `einstellung.js` als `GOOGLE` eintragen und in den Skripteigenschaften als `WEBAPP`.
4. `verwaltungsLinks` ausführen: Das Protokoll zeigt je Club den Verwaltungslink.

Neuer Club: Zeile im Blatt „Clubs“ mit Kürzel, Name, Anrede (`du` oder `sie`) und Sekretär, dann
`verwaltungsLinks`. Den Rest trägt der Sekretär in der Verwaltung selbst ein.

Spätere Änderungen am Code: im Editor ersetzen, dann „Bereitstellen“, „Bereitstellungen verwalten“,
bestehende Bereitstellung bearbeiten, Version „Neue Version“. Nicht „Neue Bereitstellung“, das legt eine
zweite Adresse an.

## Grenzen

- Ein kostenloses Google-Konto darf laut Google rund 100 Mail-Empfänger je Tag anschreiben, für alle Clubs
  zusammen. Die Verwaltung zeigt das Restkontingent; „Einladung“ schickt beim nächsten Mal nur die übrigen.
- Das Textformat der Blätter ist für die ersten 1 000 Zeilen gesetzt.
- Wer den Verwaltungslink hat, sieht und ändert alles dieses Clubs. Der Link gehört nur dem Sekretär.
