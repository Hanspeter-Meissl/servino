// Nachbau der Google-Dienste, die google/Code.gs nutzt, mit einer Tabelle im Speicher.
// laden() führt Code.gs in einem eigenen Kontext aus und gibt den Kontext, die Tabelle und die
// verschickten Mails zurück. Getrennt von den Prüfungen, damit test/server.js denselben Nachbau nutzt.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const GOOGLE = path.join(__dirname, "..", "google");

// Zeitpunkt in Wien im Format von Utilities.formatDate; uhr() kann für Prüfungen ersetzt werden.
function format(datum, muster) {
  const teile = {};
  new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(datum).forEach(p => { teile[p.type] = p.value; });
  return muster.replace("yyyy", teile.year).replace("MM", teile.month).replace("dd", teile.day)
    .replace("HH", teile.hour).replace("mm", teile.minute).replace("ss", teile.second);
}

function blattBauen(name) {
  const zeilen = [];
  const anzeige = w => {
    const t = String(w === null || w === undefined ? "" : w);
    return t.startsWith("'") ? t.slice(1) : t;
  };
  const breite = () => zeilen.reduce((n, z) => Math.max(n, z.length), 0);
  const blatt = {
    name, zeilen,
    getName: () => name,
    setName: n => { blatt.name = n; },
    getMaxRows: () => 1000,
    setFrozenRows: () => {},
    appendRow: werte => { zeilen.push(werte.map(w => (typeof w === "number" ? String(w) : w))); },
    getDataRange: () => ({
      getDisplayValues: () => zeilen.map(z => Array.from({ length: breite() }, (_, i) => anzeige(z[i]))),
      getValues: () => zeilen.map(z => Array.from({ length: breite() }, (_, i) => anzeige(z[i]))),
    }),
    getRange: (zeile, spalte, anzahl, breiteN) => ({
      setNumberFormat: () => {},
      setValues: werte => {
        werte.forEach((w, i) => {
          while (zeilen.length < zeile + i) zeilen.push([]);
          w.forEach((x, j) => { zeilen[zeile - 1 + i][spalte - 1 + j] = x; });
        });
      },
    }),
    clear: () => { zeilen.length = 0; },
  };
  return blatt;
}

function tabelleBauen() {
  const blaetter = [blattBauen("Tabelle1")];
  const t = {
    blaetter,
    getId: () => "TABELLE-ID",
    getSheets: () => blaetter,
    getSheetByName: n => blaetter.find(b => b.name === n) || null,
    insertSheet: n => { const b = blattBauen(n); blaetter.push(b); return b; },
  };
  return t;
}

function laden(optionen = {}) {
  const props = {};
  const mails = [];
  let kontingent = optionen.kontingent === undefined ? 100 : optionen.kontingent;
  let tabelle = null;
  const zustand = { jetzt: optionen.jetzt || null, mails, logs: [] };
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    SpreadsheetApp: {
      create: () => (tabelle = tabelleBauen()),
      openById: () => tabelle,
    },
    Utilities: {
      formatDate: (d, tz, muster) => format(zustand.jetzt ? new Date(zustand.jetzt) : d, muster),
      getUuid: () => crypto.randomUUID(),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Logger: { log: t => zustand.logs.push(String(t)) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: t => ({ art: "json", inhalt: t, setMimeType() { return this; } }),
    },
    HtmlService: {
      createHtmlOutput: html => ({ art: "html", inhalt: html, titel: "",
        setTitle(t) { this.titel = t; return this; }, addMetaTag() { return this; }, getContent() { return this.inhalt; } }),
      createHtmlOutputFromFile: datei => ({ getContent: () => fs.readFileSync(path.join(GOOGLE, datei + ".html"), "utf8") }),
    },
    MailApp: {
      getRemainingDailyQuota: () => kontingent,
      sendEmail: o => {
        if (kontingent <= 0) throw new Error("Service invoked too many times for one day: email.");
        if (optionen.mailFehler && optionen.mailFehler(o)) throw new Error("Ungültige Adresse");
        kontingent--;
        mails.push(o);
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(GOOGLE, "Code.gs"), "utf8"), ctx, { filename: "Code.gs" });
  zustand.ctx = ctx;
  zustand.props = props;
  zustand.tabelle = () => tabelle;
  zustand.blatt = n => tabelle.getSheetByName(n).zeilen;
  zustand.kontingentSetzen = n => { kontingent = n; };
  // Aufrufe wie über die Web-App: Ergebnis als Objekt.
  zustand.get = parameter => {
    const r = ctx.doGet({ parameter });
    return r.art === "json" ? JSON.parse(r.inhalt) : r;
  };
  zustand.post = daten => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(daten) } }).inhalt);
  return zustand;
}

module.exports = { laden };
