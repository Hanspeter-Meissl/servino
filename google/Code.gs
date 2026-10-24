/**
 * SERVINO für alle Serviceclubs: Bestellannahme und Verwaltung
 *
 * Google Apps Script als Web-App im SERVINO-Konto. Eine Google-Tabelle „SERVINO Clubs“ führt alle Clubs,
 * ihre Mitglieder, die Sorten mit Preisen, die Bestellungen, die Abholungen und den Mailversand.
 *
 * Zugänge:
 * - Mitglied: Bestellseite https://hanspeter-meissl.github.io/servino/?k=<Zeichen>. Die Seite holt mit
 *   „?k=<Zeichen>“ Club, Sorten, Anrede und die eigene Bestellung und schickt die Bestellung per POST.
 *   Das Zeichen ist je Mitglied zufällig und nicht erratbar.
 * - Sekretär: Web-App-Adresse mit „?verwaltung=<Kürzel>&s=<Schlüssel>“. Jeder Club hat einen eigenen
 *   Schlüssel; jede Funktion der Verwaltung prüft Kürzel und Schlüssel, bevor sie liest oder schreibt.
 *
 * Einrichtung (einmal):
 * 1. Code.gs, Verwaltung.html und preis.js (als Skriptdatei „preis“) in ein neues Apps-Script-Projekt
 *    „SERVINO Clubs“ einfügen, appsscript.json übernehmen. preis.js ist dieselbe Datei wie auf der
 *    Bestellseite, damit die Rechenregel nur einmal steht.
 * 2. Funktion „einrichten“ ausführen und den Zugriff erlauben. Das Protokoll zeigt die Tabelle und den
 *    Verwaltungslink des Testclubs.
 * 3. Bereitstellen als Web-App: Ausführen als „Ich“, Zugriff „Jeder“. Die Adresse kommt in einstellung.js
 *    der Bestellseite und als Eigenschaft WEBAPP in die Skripteigenschaften.
 *
 * Neuer Club: Zeile im Blatt „Clubs“ mit Kürzel und Name anlegen, dann „verwaltungsLinks“ ausführen.
 * Das vergibt den Schlüssel und zeigt den Link für den Sekretär.
 *
 * Quelle: Repository Hanspeter-Meissl/servino, Ordner google/. Änderungen dort eintragen, im Editor
 * ersetzen und als neue Version der bestehenden Bereitstellung veröffentlichen.
 */

const SEITE = 'https://hanspeter-meissl.github.io/servino/';
const BLATT = { clubs: 'Clubs', mitglieder: 'Mitglieder', sorten: 'Sorten', bestellungen: 'Bestellungen',
                abholung: 'Abholung', versand: 'Versand' };
const KOPF = {
  Clubs: ['Kürzel', 'Name', 'Anrede', 'Bestellschluss', 'Abholung', 'Bezahlung', 'Ende', 'Sekretär',
          'Antwortadresse', 'Wappen', 'Schlüssel'],
  Mitglieder: ['Club', 'Nr.', 'Vorname', 'Nachname', 'E-Mail', 'Mobil', 'Anrede', 'Zeichen', 'Aktiv'],
  Sorten: ['Schlüssel', 'Name', 'Art', 'Einzelpreis', 'Kartonpreis je Flasche', 'Bild'],
  Bestellungen: ['Zeitpunkt', 'Club', 'Nr.', 'Mengen', 'Bestellung', 'Anmerkung'],
  Abholung: ['Zeitpunkt', 'Club', 'Nr.', 'Aktion'],
  Versand: ['Zeitpunkt', 'Club', 'Nr.', 'Art', 'Empfänger', 'Ergebnis'],
};
// Was der Sekretär in der Verwaltung ändern darf. Kürzel und Schlüssel bleiben beim Betreiber.
const EINSTELLBAR = ['Name', 'Anrede', 'Bestellschluss', 'Abholung', 'Bezahlung', 'Ende', 'Sekretär',
                     'Antwortadresse', 'Wappen'];
const AKTIONEN = ['abgeholt', 'zurückgenommen'];
const MINDESTMENGE = 6;
const HOECHSTMENGE = 120;
const SORTEN_START = [
  ['servizzante', 'Servizzante', 'Frizzante', '16', '13', 'servizzante.png'],
  ['red', 'Servino Red Seven', 'Rotwein', '19', '16', 'red.png'],
  ['white', 'Servino White Seven', 'Weißwein', '16', '13', 'white.png'],
];

// ------------------------------------------------------------------ Einrichtung

function einrichten() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('TABELLE');
  if (!id) {
    const neu = SpreadsheetApp.create('SERVINO Clubs');
    const erstes = neu.getSheets()[0];
    Object.keys(KOPF).forEach((name, i) => {
      const b = i === 0 ? erstes : neu.insertSheet(name);
      if (i === 0) b.setName(name);
      // Alles als Text, damit Google weder Zeitpunkte noch Telefonnummern umdeutet.
      b.getRange(1, 1, b.getMaxRows(), KOPF[name].length).setNumberFormat('@');
      b.appendRow(KOPF[name]);
      b.setFrozenRows(1);
    });
    SORTEN_START.forEach(z => neu.getSheetByName(BLATT.sorten).appendRow(z));
    neu.getSheetByName(BLATT.clubs).appendRow(['TEST', 'Testclub Grieskirchen', 'du', '2026-11-05',
      'beim Meeting am 12. November', 'Den Betrag bucht der Kassier ab.', '', 'Hanspeter', '', '', '']);
    id = neu.getId();
    props.setProperty('TABELLE', id);
    _tabelle = null;
  }
  Logger.log('Tabelle: https://docs.google.com/spreadsheets/d/' + id);
  verwaltungsLinks();
}

// Vergibt fehlende Schlüssel und zeigt je Club den Link für den Sekretär. Braucht die Eigenschaft WEBAPP.
function verwaltungsLinks() {
  const webapp = eigenschaft('WEBAPP') || '<Web-App-Adresse, Eigenschaft WEBAPP fehlt>';
  sperren(() => {
    lesen(BLATT.clubs).forEach(c => {
      if (!c['Schlüssel']) {
        c['Schlüssel'] = zufall(24);
        zeileSchreiben(BLATT.clubs, c);
      }
      Logger.log(`${c['Kürzel']} ${c.Name}: ${webapp}?verwaltung=${encodeURIComponent(c['Kürzel'])}&s=${c['Schlüssel']}`);
    });
  });
  // Gesamtsicht über alle Clubs mit eigenem Schlüssel, getrennt von den Schlüsseln der Clubs.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GESAMT')) props.setProperty('GESAMT', zufall(24));
  Logger.log(`Gesamtsicht: ${webapp}?gesamt=${props.getProperty('GESAMT')}`);
}

// ------------------------------------------------------------------ Tabelle

let _tabelle = null;

function eigenschaft(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function tabelle() {
  return _tabelle || (_tabelle = SpreadsheetApp.openById(eigenschaft('TABELLE')));
}

// Zeilen eines Blatts als Objekte nach der Kopfzeile, alle Werte als Text. _zeile ist die Zeilennummer.
function lesen(name) {
  const werte = tabelle().getSheetByName(name).getDataRange().getDisplayValues();
  const kopf = werte[0].map(k => String(k).trim());
  const zeilen = [];
  werte.slice(1).forEach((z, i) => {
    if (!z.some(w => String(w).trim() !== '')) return;
    const o = { _zeile: i + 2 };
    kopf.forEach((k, j) => { o[k] = String(z[j] === undefined || z[j] === null ? '' : z[j]).trim(); });
    zeilen.push(o);
  });
  return zeilen;
}

function anhaengen(name, werte) {
  tabelle().getSheetByName(name).appendRow(werte.map(w => text(w, 600)));
}

function zeileSchreiben(name, o) {
  const kopf = KOPF[name];
  tabelle().getSheetByName(name).getRange(o._zeile, 1, 1, kopf.length)
    .setValues([kopf.map(k => text(o[k], 600))]);
}

// Text, den Google Tabellen als Formel oder Zahl lesen würde, als reinen Text ablegen.
function text(wert, laenge) {
  const t = String(wert === null || wert === undefined ? '' : wert).slice(0, laenge);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function sperren(arbeit) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(15000);
  try {
    return arbeit();
  } finally {
    sperre.releaseLock();
  }
}

function zufall(laenge) {
  let t = '';
  while (t.length < laenge) t += Utilities.getUuid().replace(/-/g, '');
  return t.slice(0, laenge);
}

function jetzt(format) {
  return Utilities.formatDate(new Date(), 'Europe/Vienna', format || 'yyyy-MM-dd HH:mm:ss');
}

function antwort(daten) {
  return ContentService.createTextOutput(JSON.stringify(daten)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ Stammdaten

function sorten() {
  return lesen(BLATT.sorten).map(s => ({ schluessel: s['Schlüssel'], name: s.Name, art: s.Art,
    einzel: Number(s.Einzelpreis.replace(',', '.')), karton: Number(s['Kartonpreis je Flasche'].replace(',', '.')),
    bild: s.Bild }));
}

function clubFinden(kuerzel) {
  return lesen(BLATT.clubs).find(c => c['Kürzel'] === String(kuerzel || '').trim());
}

// Für jede Funktion der Verwaltung: ohne passenden Schlüssel kein Zugriff auf diesen Club.
function clubPruefen(kuerzel, schluessel) {
  const c = clubFinden(kuerzel);
  if (!c || !c['Schlüssel'] || !schluessel || c['Schlüssel'] !== String(schluessel)) throw new Error('Zugang falsch');
  return c;
}

function aktiv(m) {
  return m.Aktiv.toLowerCase() !== 'nein';
}

function mitgliederVon(kuerzel) {
  return lesen(BLATT.mitglieder).filter(m => m.Club === kuerzel);
}

function mitgliedZuZeichen(zeichen) {
  const z = String(zeichen || '').trim().toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(z)) return null;
  return lesen(BLATT.mitglieder).find(m => m.Zeichen === z && aktiv(m)) || null;
}

function link(m) {
  return `${SEITE}?k=${m.Zeichen}`;
}

function clubDaten(c) {
  return { kuerzel: c['Kürzel'], name: c.Name, anrede: c.Anrede === 'sie' ? 'sie' : 'du',
           schluss: c.Bestellschluss, abholung: c.Abholung, bezahlung: c.Bezahlung, ende: c.Ende,
           sekretaer: c['Sekretär'], antwortadresse: c.Antwortadresse, wappen: c.Wappen };
}

// Grußzeile ohne Komma: aus der Spalte Anrede, sonst je nach Du oder Sie aus dem Namen.
function gruss(m, form) {
  if (m.Anrede) return m.Anrede;
  return form === 'sie' ? `Guten Tag ${m.Vorname} ${m.Nachname}`.trim() : `Hallo ${m.Vorname}`.trim();
}

// ------------------------------------------------------------------ Bestellseite

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.k !== undefined) return antwort(mitgliedDaten(p.k));
    if (p.verwaltung !== undefined) return verwaltungsseite(p.verwaltung, p.s);
    if (p.gesamt && p.gesamt === eigenschaft('GESAMT')) return gesamtseite();
  } catch (fehler) {
    return antwort({ ok: false, fehler: String(fehler.message || fehler) });
  }
  return antwort({ ok: true, dienst: 'SERVINO Clubs' });
}

// Alles, was die Bestellseite braucht, in einer Antwort: Club, Sorten, Anrede und die eigene Bestellung.
function mitgliedDaten(zeichen) {
  const m = mitgliedZuZeichen(zeichen);
  if (!m) return { ok: false, fehler: 'Link ungültig' };
  const c = clubFinden(m.Club);
  if (!c) return { ok: false, fehler: 'Link ungültig' };
  const club = clubDaten(c);
  const so = sorten();
  const stand = clubStand(c['Kürzel'], so);
  const s = stand.mitglieder.find(x => x.nr === Number(m['Nr.']));
  const teil = a => ({ nummer: a.nummer || 0, status: a.status, mengen: a.mengen, flaschen: a.flaschen,
                       zeit: a.zeit || '', anmerkung: a.anmerkung || '', abgeholt: a.abgeholt || '' });
  delete club.antwortadresse;
  return { ok: true, club: club, sorten: so, mindestmenge: MINDESTMENGE,
           mitglied: { vorname: m.Vorname, name: `${m.Vorname} ${m.Nachname}`.trim(), gruss: gruss(m, club.anrede) },
           bestellung: Object.assign(teil(s), { abschnitte: s.abschnitte.map(teil) }) };
}

// Bestellung der Seite: { k, mengen: { <Sorte>: Zahl }, summe, anmerkung }.
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const m = mitgliedZuZeichen(d.k);
    if (!m) return antwort({ ok: false, fehler: 'Link ungültig' });
    const c = clubFinden(m.Club);
    if (!c) return antwort({ ok: false, fehler: 'Link ungültig' });
    if (c.Ende && jetzt('yyyy-MM-dd') > c.Ende) return antwort({ ok: false, fehler: 'Bestellung geschlossen' });
    const so = sorten();
    const mengen = (d && typeof d.mengen === 'object' && d.mengen) || {};
    if (Object.keys(mengen).some(k => !so.some(s => s.schluessel === k))) {
      return antwort({ ok: false, fehler: 'Sorte unbekannt' });
    }
    const gelesen = {};
    for (const s of so) {
      const n = mengen[s.schluessel] === undefined ? 0 : Number(mengen[s.schluessel]);
      if (!Number.isInteger(n) || n < 0 || n > HOECHSTMENGE) return antwort({ ok: false, fehler: 'Menge ungültig' });
      gelesen[s.schluessel] = n;
    }
    sperren(() => anhaengen(BLATT.bestellungen, [jetzt(), m.Club, m['Nr.'], JSON.stringify(gelesen),
                                                 String(d.summe || ''), String(d.anmerkung || '').slice(0, 500)]));
    return antwort({ ok: true });
  } catch (fehler) {
    return antwort({ ok: false, fehler: String(fehler.message || fehler) });
  }
}

// ------------------------------------------------------------------ Stand

// Stand eines Clubs aus den Blättern. Mitglieder, die entfernt sind, bleiben dabei, wenn sie bestellt haben.
function clubStand(kuerzel, so) {
  so = so || sorten();
  const alle = mitgliederVon(kuerzel);
  const best = lesen(BLATT.bestellungen).filter(b => b.Club === kuerzel);
  const ab = lesen(BLATT.abholung).filter(a => a.Club === kuerzel);
  const mit = alle.filter(m => aktiv(m) || best.some(b => b['Nr.'] === m['Nr.']))
    .map(m => ({ nr: Number(m['Nr.']), name: `${m.Vorname} ${m.Nachname}`.trim(), aktiv: aktiv(m) }));
  return standRechnen(mit, best, abholungLesen(ab), so);
}

// Abholungen je Mitglied als Liste von Zeitpunkten: „abgeholt“ legt einen dazu, „zurückgenommen“ nimmt
// den letzten wieder weg. Die Zeilen kommen unter der Sperre in zeitlicher Reihenfolge dazu.
function abholungLesen(zeilen) {
  const je = {};
  zeilen.forEach(z => {
    const nr = Number(z['Nr.']);
    if (!nr || AKTIONEN.indexOf(z.Aktion) < 0) return;
    const liste = je[nr] || (je[nr] = []);
    if (z.Aktion === 'abgeholt') liste.push(zeitText(z.Zeitpunkt));
    else liste.pop();
  });
  return je;
}

// „yyyy-MM-dd HH:mm:ss“ als „dd.MM. HH:mm“.
function zeitAnzeige(t) {
  const m = String(t).match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/);
  return m ? `${m[2]}.${m[1]}. ${m[3]}` : String(t);
}

// Zeitpunkt als „yyyy-MM-dd HH:mm:ss“. Google zeigt Zeitpunkte trotz Textformat teils mit einstelliger Stunde.
function zeitText(w) {
  const t = String(w === null || w === undefined ? '' : w).trim();
  const zwei = n => ('0' + n).slice(-2);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${zwei(m[4])}:${m[5]}:${m[6] || '00'}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[3]}-${zwei(m[2])}-${zwei(m[1])} ${zwei(m[4])}:${m[5]}:${m[6] || '00'}`;
  return '';
}

// Regeln wie in der Bestellung des Club 41: Je Mitglied teilen die Abholungen die Antworten in Abschnitte.
// Was bis zu einer Abholung eingegangen ist, ist abgeschlossen, danach beginnt eine neue Bestellung. Eine
// Abholung zählt nur, wenn der Abschnitt davor auf „bestellt“ steht; sonst bleibt sie ein Hinweis.
// Die Felder des Mitglieds sind die des letzten Abschnitts.
function standRechnen(mitglieder, bestellZeilen, abholung, so) {
  const gelesen = [];
  const unzugeordnet = [];
  const nummern = mitglieder.map(m => m.nr);
  bestellZeilen.forEach(z => {
    const nr = Number(z['Nr.']);
    const zeit = zeitText(z.Zeitpunkt);
    if (nummern.indexOf(nr) < 0) {
      unzugeordnet.push({ nr: z['Nr.'], zeit: zeit });
      return;
    }
    const hinweise = [];
    let roh = null;
    try { roh = JSON.parse(z.Mengen); } catch (e) { roh = null; }
    if (!roh || typeof roh !== 'object') hinweise.push('Mengen nicht lesbar');
    const mengen = so.map(s => {
      const n = roh && roh[s.schluessel] !== undefined ? Number(roh[s.schluessel]) : 0;
      if (!Number.isInteger(n) || n < 0) {
        hinweise.push(`Menge ${s.name} ungültig`);
        return 0;
      }
      return n;
    });
    gelesen.push({ nr: nr, zeit: zeit, mengen: mengen, hinweise: hinweise, anmerkung: z.Anmerkung || '' });
  });
  gelesen.sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0));

  const leer = so.map(() => 0);
  const ergebnis = mitglieder.slice().sort((a, b) => a.nr - b.nr).map(m => {
    let rest = gelesen.filter(a => a.nr === m.nr);
    const abschnitte = [];
    const markiert = [];
    (abholung[m.nr] || []).slice().sort().forEach(t => {
      const davor = rest.filter(a => a.zeit <= t);
      const ab = davor.length ? abschnittRechnen(davor, abschnitte.length + 1) : null;
      if (ab && ab.status === 'bestellt') {
        ab.abgeholt = t;
        abschnitte.push(ab);
        rest = rest.filter(a => a.zeit > t);
      } else {
        markiert.push(`am ${zeitAnzeige(t)} als abgeholt markiert`);
      }
    });
    if (rest.length) abschnitte.push(abschnittRechnen(rest, abschnitte.length + 1));
    const kopf = { nr: m.nr, name: m.name, aktiv: m.aktiv !== false, abholHinweis: markiert.join('; '), abschnitte: abschnitte };
    if (!abschnitte.length) {
      return Object.assign({ status: 'offen', mengen: leer, flaschen: 0, hinweise: [], abgeholt: '', anmerkung: '',
                             zeit: '', nummer: 0 }, kopf);
    }
    return Object.assign({}, abschnitte[abschnitte.length - 1], kopf);
  });
  const bestellungen = [];
  ergebnis.forEach(m => m.abschnitte.forEach(a => bestellungen.push(Object.assign({ nr: m.nr, name: m.name }, a))));
  const best = bestellungen.filter(b => b.status === 'bestellt');
  const abg = best.filter(b => b.abgeholt);
  const flaschen = liste => liste.reduce((s, b) => s + b.flaschen, 0);
  const zahl = st => ergebnis.filter(m => m.status === st && (m.aktiv || st !== 'offen')).length;
  return { mitglieder: ergebnis, bestellungen: bestellungen, unzugeordnet: unzugeordnet,
           sorten: so.map((x, i) => best.reduce((s, b) => s + b.mengen[i], 0)),
           summen: { bestellt: best.length, flaschen: flaschen(best), 'keine Bestellung': zahl('keine Bestellung'),
                     'prüfen': bestellungen.filter(b => b.status === 'prüfen').length, offen: zahl('offen') },
           abholung: { abgeholt: abg.length, von: best.length, flaschen: flaschen(abg),
                       offen: flaschen(best) - flaschen(abg) } };
}

// Ein Abschnitt: die letzte Antwort gilt, 1 bis 5 Flaschen oder eine nicht lesbare Menge kommen auf prüfen,
// 0 Flaschen heißt keine Bestellung.
function abschnittRechnen(alle, nummer) {
  const letzte = alle[alle.length - 1];
  const flaschen = letzte.mengen.reduce((x, y) => x + y, 0);
  const hinweise = letzte.hinweise.slice();
  if (alle.length > 1) hinweise.push(`${alle.length} Antworten, die letzte gilt`);
  if (!letzte.zeit) hinweise.push('Zeitpunkt nicht lesbar');
  const zuWenig = flaschen > 0 && flaschen < MINDESTMENGE;
  if (zuWenig) hinweise.push(`unter der Mindestbestellung von ${MINDESTMENGE} Flaschen`);
  const status = letzte.hinweise.length || zuWenig ? 'prüfen' : flaschen ? 'bestellt' : 'keine Bestellung';
  return { nummer: nummer, status: status, mengen: letzte.mengen, flaschen: flaschen, hinweise: hinweise,
           anmerkung: letzte.anmerkung, zeit: letzte.zeit, abgeholt: '' };
}

// ------------------------------------------------------------------ Verwaltung

function verwaltungsseite(kuerzel, schluessel) {
  let c;
  try {
    c = clubPruefen(kuerzel, schluessel);
  } catch (e) {
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:16px">Dieser Verwaltungslink ist nicht gültig.</p>')
      .setTitle('SERVINO Verwaltung');
  }
  // Kürzel und Schlüssel gehen mit jedem Aufruf an den Server zurück; JSON ohne „<“, damit es im Skript bleibt.
  const zugang = JSON.stringify({ club: c['Kürzel'], s: c['Schlüssel'] }).replace(/</g, '\\u003c');
  const html = HtmlService.createHtmlOutputFromFile('Verwaltung').getContent().replace('__ZUGANG__', zugang);
  return HtmlService.createHtmlOutput(html).setTitle(`SERVINO ${c.Name}`)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Für den Kassier: jede Bestellung auf „bestellt“ mit Betrag nach preis.js (im Projekt als Datei „preis“).
// Abzubuchen sind nur die abgeholten, wie beim Club 41; die übrigen stehen ohne Betrag darunter.
function abrechnung(stand, so) {
  const zeilen = stand.bestellungen.filter(b => b.status === 'bestellt').map(b => {
    const r = bestellung(so, b.mengen, MINDESTMENGE);
    return { nr: b.nr, name: b.name, mengen: b.mengen, flaschen: r.flaschen,
             kartons: r.zeilen.reduce((s, z) => s + z.kartons, 0), betrag: r.summe,
             art: b.nummer > 1 ? 'zusätzliche' : 'erste', abgeholt: b.abgeholt || '' };
  });
  const ab = zeilen.filter(z => z.abgeholt);
  return { abgeholt: ab, offen: zeilen.filter(z => !z.abgeholt), summe: ab.reduce((s, z) => s + z.betrag, 0),
           pruefen: stand.bestellungen.filter(b => b.status === 'prüfen').map(b => b.name) };
}

// Alles für die Verwaltung eines Clubs: Einstellungen, Mitglieder mit Link und Status, Stand, Versand.
function vwLaden(kuerzel, schluessel) {
  const c = clubPruefen(kuerzel, schluessel);
  const so = sorten();
  const stand = clubStand(c['Kürzel'], so);
  const versand = lesen(BLATT.versand).filter(v => v.Club === c['Kürzel']);
  const zuletzt = (nr, art) => versand.filter(v => v['Nr.'] === nr && v.Art === art && v.Ergebnis === 'gesendet')
    .map(v => v.Zeitpunkt).sort().pop() || '';
  const je = {};
  stand.mitglieder.forEach(m => { je[m.nr] = m; });
  const mitglieder = mitgliederVon(c['Kürzel']).map(m => ({
    nr: Number(m['Nr.']), vorname: m.Vorname, nachname: m.Nachname, email: m['E-Mail'], mobil: m.Mobil,
    anrede: m.Anrede, aktiv: aktiv(m), link: link(m), gruss: gruss(m, c.Anrede === 'sie' ? 'sie' : 'du'),
    status: je[m['Nr.']] ? je[m['Nr.']].status : 'offen',
    eingeladen: zuletzt(m['Nr.'], 'Einladung'), erinnert: zuletzt(m['Nr.'], 'Erinnerung'),
    mail: m['E-Mail'] && aktiv(m) ? mailKlartext(c, m) : null }))
    .sort((a, b) => a.nr - b.nr);
  return { club: clubDaten(c), sorten: so, mindestmenge: MINDESTMENGE, stand: stand, mitglieder: mitglieder,
           abrechnung: abrechnung(stand, so),
           versand: versand.slice(-20).reverse().map(v => ({ zeit: v.Zeitpunkt, nr: v['Nr.'], art: v.Art,
                                                             an: v['Empfänger'], ergebnis: v.Ergebnis })),
           kontingent: MailApp.getRemainingDailyQuota(), jetzt: jetzt('dd.MM.yyyy HH:mm') };
}

function vwEinstellungen(kuerzel, schluessel, werte) {
  clubPruefen(kuerzel, schluessel);
  sperren(() => {
    const c = clubFinden(kuerzel);
    EINSTELLBAR.forEach(k => { if (werte && werte[k] !== undefined) c[k] = String(werte[k]).trim().slice(0, 300); });
    if (!c.Name) throw new Error('Der Clubname darf nicht leer sein');
    // Die Seite nennt den Namen bei Fragen und Rückfragen, ohne ihn stünden halbe Sätze da.
    if (!c['Sekretär']) throw new Error('Bitte den Namen unter der Mail eintragen');
    c.Anrede = c.Anrede === 'sie' ? 'sie' : 'du';
    ['Bestellschluss', 'Ende'].forEach(k => {
      if (c[k] && !/^\d{4}-\d{2}-\d{2}$/.test(c[k])) throw new Error(`${k}: Datum bitte als JJJJ-MM-TT`);
    });
    if (c.Antwortadresse && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.Antwortadresse)) throw new Error('Antwortadresse ungültig');
    zeileSchreiben(BLATT.clubs, c);
  });
  return vwLaden(kuerzel, schluessel);
}

// Mitgliederliste aus Excel eingefügt: je Zeile Vorname, Nachname, E-Mail, Mobil, Anrede, getrennt durch
// Tabulator oder Strichpunkt. Mit Kopfzeile gilt deren Reihenfolge. Bekannte Mitglieder (gleiche E-Mail oder
// gleicher Name) werden ergänzt und behalten Nummer und Link, neue bekommen die nächste Nummer.
// Mit uebernehmen = false wird nur gezeigt, was geschähe.
function vwImport(kuerzel, schluessel, eingabe, uebernehmen) {
  const c = clubPruefen(kuerzel, schluessel);
  const plan = sperren(() => {
    const vorhanden = mitgliederVon(c['Kürzel']);
    // Zeilennummer wie im Eingabefeld, damit der Sekretär die übersprungene Zeile findet.
    const zeilen = String(eingabe || '').split(/\r?\n/)
      .map((z, i) => Object.assign(z.split(/\t|;/).map(w => w.trim()), { nr: i + 1 }))
      .filter(z => z.some(w => w));
    const felder = ['Vorname', 'Nachname', 'E-Mail', 'Mobil', 'Anrede'];
    let spalten = felder.map((f, i) => i);
    if (zeilen.length && zeilen[0].some(w => /vorname|nachname/i.test(w))) {
      const kopf = zeilen.shift().map(w => w.toLowerCase());
      const suche = { 'Vorname': /vorname/, 'Nachname': /nachname|familienname/, 'E-Mail': /mail/,
                      'Mobil': /mobil|handy|telefon/, 'Anrede': /anrede|gru/ };
      spalten = felder.map(f => kopf.findIndex(k => suche[f].test(k)));
    }
    const ergebnis = { neu: [], geaendert: [], gleich: 0, fehler: [] };
    let naechste = vorhanden.reduce((n, m) => Math.max(n, Number(m['Nr.']) || 0), 0) + 1;
    const vergeben = lesen(BLATT.mitglieder).map(m => m.Zeichen);
    const schreiben = [];
    zeilen.forEach(z => {
      const w = {};
      felder.forEach((f, j) => { w[f] = spalten[j] >= 0 ? (z[spalten[j]] || '').slice(0, 120) : ''; });
      if (!w.Vorname || !w.Nachname) {
        ergebnis.fehler.push(`Zeile ${z.nr}: Vorname und Nachname fehlen`);
        return;
      }
      if (w['E-Mail'] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w['E-Mail'])) {
        ergebnis.fehler.push(`Zeile ${z.nr}: E-Mail „${w['E-Mail']}“ ungültig`);
        return;
      }
      const name = x => `${x.Vorname} ${x.Nachname}`.toLowerCase();
      const alt = vorhanden.find(m => (w['E-Mail'] && m['E-Mail'].toLowerCase() === w['E-Mail'].toLowerCase()))
        || vorhanden.find(m => name(m) === name(w));
      if (alt) {
        const vorher = JSON.stringify([alt.Vorname, alt.Nachname, alt['E-Mail'], alt.Mobil, alt.Anrede, alt.Aktiv]);
        felder.forEach(f => { if (w[f]) alt[f] = w[f]; });
        alt.Aktiv = 'ja';
        if (JSON.stringify([alt.Vorname, alt.Nachname, alt['E-Mail'], alt.Mobil, alt.Anrede, alt.Aktiv]) === vorher) {
          ergebnis.gleich++;
        } else {
          ergebnis.geaendert.push(`${alt.Vorname} ${alt.Nachname}`);
          schreiben.push(alt);
        }
        return;
      }
      let zeichen;
      do { zeichen = zufall(12); } while (vergeben.indexOf(zeichen) >= 0);
      vergeben.push(zeichen);
      const neu = Object.assign({ Club: c['Kürzel'], 'Nr.': String(naechste++), Zeichen: zeichen, Aktiv: 'ja' }, w);
      vorhanden.push(neu);
      ergebnis.neu.push(`${neu.Vorname} ${neu.Nachname}`);
      schreiben.push(neu);
    });
    if (uebernehmen) {
      schreiben.forEach(m => {
        if (m._zeile) zeileSchreiben(BLATT.mitglieder, m);
        else anhaengen(BLATT.mitglieder, KOPF.Mitglieder.map(k => m[k] || ''));
      });
    }
    return ergebnis;
  });
  return { plan: plan, uebernommen: !!uebernehmen, daten: uebernehmen ? vwLaden(kuerzel, schluessel) : null };
}

// Entfernen setzt Aktiv auf „nein“: der Link gilt nicht mehr, frühere Bestellungen bleiben im Stand.
function vwAktiv(kuerzel, schluessel, nr, wert) {
  const c = clubPruefen(kuerzel, schluessel);
  sperren(() => {
    const m = mitgliederVon(c['Kürzel']).find(x => Number(x['Nr.']) === Number(nr));
    if (!m) throw new Error('Mitglied unbekannt');
    m.Aktiv = wert ? 'ja' : 'nein';
    zeileSchreiben(BLATT.mitglieder, m);
  });
  return vwLaden(kuerzel, schluessel);
}

// Abgeholt werden kann nur die geltende Bestellung auf „bestellt“, zurückgenommen nur die letzte Abholung,
// solange danach nichts Neues bestellt ist.
function vwAbholen(kuerzel, schluessel, nr, aktion) {
  const c = clubPruefen(kuerzel, schluessel);
  nr = Number(nr);
  if (AKTIONEN.indexOf(aktion) < 0) throw new Error('Aktion unbekannt');
  sperren(() => {
    const m = clubStand(c['Kürzel']).mitglieder.find(x => x.nr === nr);
    if (!m) throw new Error('Mitglied unbekannt');
    if (aktion === 'abgeholt') {
      if (m.status !== 'bestellt') throw new Error(`${m.name} steht auf „${m.status}“`);
      if (m.abgeholt) throw new Error(`${m.name} ist schon als abgeholt markiert`);
    } else if (!m.abgeholt) {
      throw new Error(m.abschnitte.some(a => a.abgeholt)
        ? `${m.name} hat nach der Abholung neu bestellt` : `${m.name} ist nicht als abgeholt markiert`);
    }
    anhaengen(BLATT.abholung, [jetzt(), c['Kürzel'], String(nr), aktion]);
  });
  return vwLaden(kuerzel, schluessel);
}

// ------------------------------------------------------------------ Gesamtsicht

// Je Club und zusammen: Bestellungen und Flaschen je Sorte, bestellt und abgeholt. Ohne Namen und Beträge,
// sie dient der Sammelbestellung beim Weingut.
function gesamtStand() {
  const so = sorten();
  const summe = liste => so.map((s, i) => liste.reduce((n, b) => n + b.mengen[i], 0));
  const clubs = lesen(BLATT.clubs).map(c => {
    const st = clubStand(c['Kürzel'], so);
    const best = st.bestellungen.filter(b => b.status === 'bestellt');
    return { name: c.Name, mitglieder: st.mitglieder.filter(m => m.aktiv).length, bestellungen: best.length,
             offen: st.summen.offen, pruefen: st.summen['prüfen'], bestellt: summe(best),
             abgeholt: summe(best.filter(b => b.abgeholt)) };
  });
  const gesamt = { name: 'Alle Clubs', mitglieder: 0, bestellungen: 0, offen: 0, pruefen: 0,
                   bestellt: so.map(() => 0), abgeholt: so.map(() => 0) };
  clubs.forEach(c => {
    ['mitglieder', 'bestellungen', 'offen', 'pruefen'].forEach(k => { gesamt[k] += c[k]; });
    so.forEach((s, i) => { gesamt.bestellt[i] += c.bestellt[i]; gesamt.abgeholt[i] += c.abgeholt[i]; });
  });
  return { sorten: so, clubs: clubs, gesamt: gesamt, jetzt: jetzt('dd.MM.yyyy HH:mm') };
}

function gesamtseite() {
  const d = gesamtStand();
  const kartons = n => [Math.floor(n / 6) ? `${Math.floor(n / 6)} Karton${n >= 12 ? 's' : ''}` : '',
                        n % 6 ? `${n % 6} Fl.` : ''].filter(Boolean).join(' + ') || '0';
  const zeile = (c, fett) => `<tr${fett ? ' class="g"' : ''}><td>${esc(c.name)}<small>${c.bestellungen} Bestellung${c.bestellungen === 1 ? '' : 'en'} · ${c.offen} ohne Antwort${c.pruefen ? ` · ${c.pruefen} zu prüfen` : ''}</small></td>`
    + d.sorten.map((s, i) => `<td>${c.bestellt[i]}<small>${c.abgeholt[i]} abgeholt</small></td>`).join('')
    + `<td>${c.bestellt.reduce((a, b) => a + b, 0)}</td></tr>`;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
body{margin:0;background:#F4F6F9;color:#1D2733;font:15px/1.4 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
header{background:#1F3864;color:#fff;padding:16px}header p{margin:0;color:#C0975B;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
header h1{margin:2px 0 0;font-size:21px}main{max-width:900px;margin:0 auto;padding:12px 16px 40px}
.rahmen{overflow-x:auto;background:#fff;border:1px solid #DCE1E8;border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:520px}th,td{padding:8px 10px;border-bottom:1px solid #DCE1E8;text-align:right;vertical-align:top}
th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#6B7683;font-weight:600}
td small{display:block;color:#6B7683;font-size:12px}tr.g td{font-weight:700;color:#1F3864;border-top:3px solid #1F3864;border-bottom:0}
h2{font-size:15px;color:#1F3864;margin:22px 0 6px;border-bottom:2px solid #C0975B;padding-bottom:3px}
ul{list-style:none;margin:0;padding:0;background:#fff;border:1px solid #DCE1E8;border-radius:10px}li{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;border-bottom:1px solid #DCE1E8}li:last-child{border-bottom:0}
li b{color:#1F3864}li span{color:#6B7683;white-space:nowrap;text-align:right}.fuss{color:#6B7683;font-size:12px;margin-top:16px}
</style></head><body><header><p>SERVINO Gesamtsicht</p><h1>Alle Serviceclubs</h1></header><main>
<p class="fuss" style="margin-top:0">Stand ${esc(d.jetzt)}. Flaschen aus Bestellungen auf „bestellt“, ohne zu prüfende.</p>
<div class="rahmen"><table><tr><th>Club</th>${d.sorten.map(s => `<th>${esc(s.name)}</th>`).join('')}<th>Flaschen</th></tr>
${d.clubs.map(c => zeile(c)).join('')}${zeile(d.gesamt, true)}</table></div>
<h2>Sammelbestellung beim Weingut</h2>
<ul>${d.sorten.map((s, i) => `<li><div><b>${esc(s.name)}</b>: ${d.gesamt.bestellt[i]} Flaschen</div><span>${kartons(d.gesamt.bestellt[i])}</span></li>`).join('')}</ul>
<h2>Noch auszugeben</h2>
<ul>${d.sorten.map((s, i) => `<li><b>${esc(s.name)}</b><span>${d.gesamt.bestellt[i] - d.gesamt.abgeholt[i]} Flaschen</span></li>`).join('')}</ul>
<p class="fuss">Namen und Beträge stehen nur in der Verwaltung des jeweiligen Clubs.</p></main></body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('SERVINO Gesamtsicht')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ------------------------------------------------------------------ Mails

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober',
                'November', 'Dezember'];

// „2026-11-05“ als „Donnerstag, 5. November 2026“.
function datumLang(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const tag = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WOCHENTAGE[tag]}, ${Number(m[3])}. ${MONATE[Number(m[2]) - 1]} ${m[1]}`;
}

function esc(t) {
  return String(t === null || t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function euro(n) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

// Mail an ein Mitglied: Einladung mit dem persönlichen Link oder Erinnerung an die Offenen.
// Texte der Mail in Du- oder Sie-Form, gemeinsam für die Mail aus der Web-App und den Mail-Knopf je Mitglied.
function mailTexte(c, art) {
  return c.Anrede === 'sie' ? {
    betreff: art === 'Erinnerung' ? `${c.Name}: Erinnerung an SERVINO` : `${c.Name}: Ihr persönlicher Bestelllink für SERVINO`,
    einleitung: art === 'Erinnerung'
      ? 'vor einigen Tagen haben Sie Ihren persönlichen Link für SERVINO bekommen. Von Ihnen ist bisher noch keine Bestellung eingegangen.'
      : 'hier ist Ihr persönlicher Link für SERVINO, den Wein der sieben Grieskirchner Serviceclubs. Der Erlös geht an karitative Zwecke.',
    schluss: d => `Bis ${d} können Sie bestellen.`,
    nichts: 'Wenn Sie diesmal nichts bestellen möchten, tippen Sie auf der Seite auf „Ich bestelle diesmal nichts“. Dann bekommen Sie keine Erinnerung. Über denselben Link sehen Sie jederzeit, was Sie bestellt haben, und können es bis zur Abholung ändern.',
    ersatz: 'Falls der Knopf nicht reagiert, kopieren Sie diesen Link in Ihren Browser:',
    gruss: 'Mit freundlichen Grüßen',
  } : {
    betreff: art === 'Erinnerung' ? `${c.Name}: Erinnerung an SERVINO` : `${c.Name}: Dein persönlicher Bestelllink für SERVINO`,
    einleitung: art === 'Erinnerung'
      ? 'vor einigen Tagen hast du deinen persönlichen Link für SERVINO bekommen. Von dir ist bisher noch keine Bestellung eingegangen.'
      : 'hier ist dein persönlicher Link für SERVINO, den Wein der sieben Grieskirchner Serviceclubs. Der Erlös geht an karitative Zwecke.',
    schluss: d => `Bis ${d} kannst du bestellen.`,
    nichts: 'Wenn du diesmal nichts bestellen möchtest, tippe auf der Seite auf „Ich bestelle diesmal nichts“. Dann bekommst du keine Erinnerung. Über denselben Link siehst du jederzeit, was du bestellt hast, und kannst es bis zur Abholung ändern.',
    ersatz: 'Falls der Knopf nicht reagiert, kopiere diesen Link in deinen Browser:',
    gruss: 'Liebe Grüße',
  };
}

// Schlichte Fassung der Einladung für den Mail-Knopf in der Verwaltung: geht aus dem Postfach des Sekretärs,
// deshalb ohne Tageslimit, aber ohne Preistabelle und gestalteten Knopf.
function mailKlartext(c, m) {
  const t = mailTexte(c, 'Einladung');
  const datum = datumLang(c.Bestellschluss);
  const teile = [gruss(m, c.Anrede === 'sie' ? 'sie' : 'du') + ',', t.einleitung, link(m)];
  const termine = [datum ? t.schluss(datum) : '', c.Abholung ? `Abholung: ${c.Abholung}.` : '', c.Bezahlung || '']
    .filter(Boolean).join(' ');
  if (termine) teile.push(termine);
  teile.push(t.nichts, t.gruss + (c['Sekretär'] ? '\n' + c['Sekretär'] : ''));
  return { betreff: t.betreff, text: teile.join('\n\n') };
}

function mailBauen(c, m, art, zusatz, so) {
  const sie = c.Anrede === 'sie';
  const t = mailTexte(c, art);
  const ziel = link(m);
  const datum = datumLang(c.Bestellschluss);
  const absatz = s => `<p style="margin:0 0 12px">${s}</p>`;
  const preise = so.map(s => `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #DCE1E8"><b style="color:#1F3864">${esc(s.name)}</b><br><span style="color:#6B7683;font-size:13px">${esc(s.art)}</span></td>`
    + `<td style="padding:6px 12px;border-bottom:1px solid #DCE1E8;text-align:right">${euro(s.einzel)}</td>`
    + `<td style="padding:6px 0 6px 12px;border-bottom:1px solid #DCE1E8;text-align:right">${euro(s.karton * 6)}</td></tr>`).join('');
  const html = `<div style="font:15px/1.5 Segoe UI,Arial,sans-serif;color:#1D2733;max-width:600px">
<div style="border-bottom:3px solid #1F3864;padding-bottom:8px;margin-bottom:16px;color:#1F3864;font-weight:700">${esc(c.Name)} · SERVINO-Bestellung${art === 'Erinnerung' ? ' · Erinnerung' : ''}</div>
${absatz(esc(gruss(m, sie ? 'sie' : 'du')) + ',')}
${absatz(esc(t.einleitung))}
${zusatz ? absatz(esc(zusatz).replace(/\n/g, '<br>')) : ''}
<table style="border-collapse:collapse;margin:4px 0 12px;font-size:14px"><tr><th style="text-align:left;padding:0 12px 4px 0;color:#6B7683;font-weight:400">Sorte</th><th style="text-align:right;padding:0 12px 4px;color:#6B7683;font-weight:400">Flasche</th><th style="text-align:right;padding:0 0 4px 12px;color:#6B7683;font-weight:400">Karton mit 6</th></tr>${preise}</table>
${absatz(`Für jeden vollen Karton mit 6 Flaschen derselben Sorte gilt der Kartonpreis. Gemischte Flaschen kosten den Einzelpreis. Die Mindestbestellung sind ${MINDESTMENGE} Flaschen.`)}
<p style="margin:18px 0"><a href="${esc(ziel)}" style="display:inline-block;background:#1F3864;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:6px">Jetzt bestellen</a></p>
${datum ? absatz(esc(t.schluss(datum))) : ''}
${c.Abholung ? absatz('Abholung: ' + esc(c.Abholung) + '.') : ''}
${c.Bezahlung ? absatz(esc(c.Bezahlung)) : ''}
${absatz(esc(t.nichts))}
${absatz(`<span style="color:#6B7683;font-size:13px">${esc(t.ersatz)}<br><a href="${esc(ziel)}" style="color:#1F3864">${esc(ziel)}</a></span>`)}
${absatz(esc(t.gruss) + (c['Sekretär'] ? '<br>' + esc(c['Sekretär']) : ''))}
</div>`;
  return { betreff: t.betreff, html: html };
}

// Versand aus der Web-App. art: „Einladung“ an alle aktiven Mitglieder mit E-Mail, die noch keine bekommen
// haben; „Erinnerung“ an alle Offenen mit E-Mail; „Probe“ schickt die Einladung des ersten Mitglieds an die
// Antwortadresse des Clubs. Das Tageskontingent von Google begrenzt die Zahl; der Rest geht beim nächsten Mal.
function vwSenden(kuerzel, schluessel, art, zusatz) {
  const c = clubPruefen(kuerzel, schluessel);
  if (['Einladung', 'Erinnerung', 'Probe'].indexOf(art) < 0) throw new Error('Art unbekannt');
  zusatz = String(zusatz || '').trim().slice(0, 1500);
  const so = sorten();
  const alle = mitgliederVon(c['Kürzel']).filter(aktiv).sort((a, b) => Number(a['Nr.']) - Number(b['Nr.']));
  let empfaenger;
  if (art === 'Probe') {
    if (!c.Antwortadresse) throw new Error('Für die Probe bitte zuerst die Antwortadresse in den Einstellungen eintragen');
    if (!alle.length) throw new Error('Noch keine Mitglieder eingetragen');
    empfaenger = [Object.assign({}, alle[0], { 'E-Mail': c.Antwortadresse })];
  } else if (art === 'Einladung') {
    const versand = lesen(BLATT.versand).filter(v => v.Club === c['Kürzel'] && v.Art === 'Einladung' && v.Ergebnis === 'gesendet');
    empfaenger = alle.filter(m => m['E-Mail'] && !versand.some(v => v['Nr.'] === m['Nr.']));
  } else {
    const stand = clubStand(c['Kürzel'], so);
    const offen = stand.mitglieder.filter(x => x.status === 'offen').map(x => x.nr);
    empfaenger = alle.filter(m => m['E-Mail'] && offen.indexOf(Number(m['Nr.'])) >= 0);
  }
  const kontingent = MailApp.getRemainingDailyQuota();
  const jetztDran = empfaenger.slice(0, Math.max(0, kontingent));
  const ergebnis = { gesendet: 0, fehler: [], uebrig: empfaenger.length - jetztDran.length };
  jetztDran.forEach(m => {
    const mail = mailBauen(c, m, art === 'Probe' ? 'Einladung' : art, zusatz, so);
    let stand = 'gesendet';
    try {
      const optionen = { to: m['E-Mail'], subject: (art === 'Probe' ? 'Probe: ' : '') + mail.betreff,
                         htmlBody: mail.html, name: `SERVINO ${c.Name}` };
      if (c.Antwortadresse) optionen.replyTo = c.Antwortadresse;
      MailApp.sendEmail(optionen);
      ergebnis.gesendet++;
    } catch (e) {
      stand = 'Fehler: ' + String(e.message || e).slice(0, 200);
      ergebnis.fehler.push(`${m.Vorname} ${m.Nachname}: ${e.message || e}`);
    }
    sperren(() => anhaengen(BLATT.versand, [jetzt(), c['Kürzel'], art === 'Probe' ? '' : m['Nr.'], art, m['E-Mail'], stand]));
  });
  return { ergebnis: ergebnis, daten: vwLaden(kuerzel, schluessel) };
}
