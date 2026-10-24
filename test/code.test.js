// Prüft google/Code.gs gegen den Nachbau der Google-Dienste: Einrichtung, Mitgliederliste, Geheimzeichen,
// Trennung der Clubs, Annahme und Ablehnung von Bestellungen, Stand mit Abholung und den Mailversand.
// Aufruf: node test/code.test.js
const { laden } = require("./attrappe.js");

let fehler = 0, geprueft = 0;
function pruefe(bedingung, text) {
  geprueft++;
  if (!bedingung) { fehler++; console.log("FEHLER " + text); }
}
function wirft(arbeit, muster, text) {
  try { arbeit(); pruefe(false, `${text}: kein Fehler`); } catch (e) {
    pruefe(muster.test(String(e.message || e)), `${text}: „${e.message}“ statt ${muster}`);
  }
}

const g = laden({ jetzt: "2026-10-25T10:00:00+01:00" });
const c = g.ctx;
g.props.WEBAPP = "https://script.google.com/macros/s/TEST/exec";
c.einrichten();
const t = n => g.blatt(n);

// ---------------------------------------------------------------- Einrichtung
pruefe(["Clubs", "Mitglieder", "Sorten", "Bestellungen", "Abholung", "Versand"].every(n => g.tabelle().getSheetByName(n)),
       "alle Blätter angelegt");
pruefe(t("Sorten").length === 4, "drei Sorten mit Kopf");
const test = c.clubFinden("TEST");
pruefe(test && /^[0-9a-f]{24}$/.test(test["Schlüssel"]), "Testclub mit Schlüssel");
pruefe(g.logs.some(l => l.includes("?verwaltung=TEST&s=" + test["Schlüssel"])), "Verwaltungslink im Protokoll");

// Zweiter Club von Hand im Blatt, wie es der Betreiber macht; Schlüssel über verwaltungsLinks.
g.tabelle().getSheetByName("Clubs").appendRow(["B", "Club B", "sie", "2026-11-20", "am 28. November im Clublokal", "",
  "", "Maria Huber", "maria@example.org", "", ""]);
c.verwaltungsLinks();
const B = c.clubFinden("B");
pruefe(/^[0-9a-f]{24}$/.test(B["Schlüssel"]) && B["Schlüssel"] !== test["Schlüssel"], "Club B bekommt eigenen Schlüssel");
const SA = test["Schlüssel"], SB = B["Schlüssel"];

// ---------------------------------------------------------------- Zugang
wirft(() => c.vwLaden("TEST", SB), /Zugang falsch/, "Schlüssel von B öffnet TEST nicht");
wirft(() => c.vwLaden("TEST", ""), /Zugang falsch/, "leerer Schlüssel");
wirft(() => c.vwLaden("X", SA), /Zugang falsch/, "unbekannter Club");
wirft(() => c.vwImport("B", SA, "Anna\tMaier", true), /Zugang falsch/, "Import in fremden Club");
wirft(() => c.vwSenden("B", SA, "Einladung", ""), /Zugang falsch/, "Versand für fremden Club");
wirft(() => c.vwAbholen("B", SA, 1, "abgeholt"), /Zugang falsch/, "Abholung im fremden Club");
wirft(() => c.vwEinstellungen("B", SA, { Name: "gekapert" }), /Zugang falsch/, "Einstellungen im fremden Club");
pruefe(g.get({ verwaltung: "TEST", s: SB }).inhalt.includes("nicht gültig"), "Verwaltungsseite mit falschem Schlüssel");
const seite = g.get({ verwaltung: "TEST", s: SA });
pruefe(seite.art === "html" && seite.inhalt.includes(`"s":"${SA}"`) && !seite.inhalt.includes("__ZUGANG__"), "Verwaltungsseite mit Zugang");

// ---------------------------------------------------------------- Mitgliederliste
const liste = "Vorname\tNachname\tE-Mail\tMobil\tAnrede\n"
  + "Herbert\tStraßl\therbert@example.org\t0664 1234567\tLieber Herbert\n"
  + "Maria\tMaier\tmaria.maier@example.org\t+43 660 7654321\t\n"
  + "Josef\tOhnemail\t\t\t\n"
  + "\tLeer\tx@example.org\t\t\n"
  + "Karl\tFalsch\tkeine-adresse\t\t\n";
let r = c.vwImport("TEST", SA, liste, false);
pruefe(r.plan.neu.length === 3 && r.plan.fehler.join() === "Zeile 5: Vorname und Nachname fehlen,Zeile 6: E-Mail „keine-adresse“ ungültig" && !r.uebernommen,
       "Prüfen zeigt 3 neu, 2 Fehler mit Zeilennummer wie im Eingabefeld");
pruefe(t("Mitglieder").length === 1, "Prüfen schreibt nichts");
r = c.vwImport("TEST", SA, liste, true);
let ms = c.mitgliederVon("TEST");
pruefe(ms.length === 3 && ms.map(m => m["Nr."]).join() === "1,2,3", "drei Mitglieder mit Nr. 1 bis 3");
pruefe(ms.every(m => /^[0-9a-f]{12}$/.test(m.Zeichen)) && new Set(ms.map(m => m.Zeichen)).size === 3, "Zeichen eindeutig");
pruefe(ms[1].Mobil === "+43 660 7654321" && t("Mitglieder")[2][5] === "'+43 660 7654321", "Mobilnummer mit + als Text");
const zeichen = Object.fromEntries(ms.map(m => [m.Nachname, m.Zeichen]));
// Erneut einfügen: ohne Kopf, E-Mail korrigiert, neues Mitglied, bekannte behalten Nr. und Zeichen.
r = c.vwImport("TEST", SA, "Herbert;Straßl;herbert@example.org;0664 1234567;Lieber Herbert\nMaria;Maier;maria@neu.example.org;;\nEva;Neu;eva@example.org;;Liebe Eva", true);
ms = c.mitgliederVon("TEST");
pruefe(r.plan.gleich === 1 && r.plan.geaendert.length === 1 && r.plan.neu.length === 1, "zweiter Import: 1 gleich, 1 ergänzt, 1 neu");
pruefe(ms.length === 4 && ms[3]["Nr."] === "4", "neues Mitglied bekommt Nr. 4");
pruefe(ms[1].Zeichen === zeichen.Maier && ms[1]["E-Mail"] === "maria@neu.example.org", "Maier behält Zeichen, E-Mail ergänzt");
pruefe(ms[1].Mobil === "+43 660 7654321", "leeres Feld überschreibt nichts");
c.vwImport("B", SB, "Anna\tBerger\tanna@example.org\nFranz\tBauer\tfranz@example.org", true);
pruefe(c.mitgliederVon("B").map(m => m["Nr."]).join() === "1,2", "Club B zählt eigene Nummern");

// ---------------------------------------------------------------- Bestellseite
const zS = zeichen["Straßl"], zM = zeichen.Maier, zO = zeichen.Ohnemail;
const zAnna = c.mitgliederVon("B")[0].Zeichen;
let d = g.get({ k: zS });
pruefe(d.ok && d.club.name === "Testclub Grieskirchen" && d.club.anrede === "du" && d.mitglied.gruss === "Lieber Herbert",
       "Seite bekommt Club und Gruß");
pruefe(d.sorten.length === 3 && d.sorten[1].einzel === 19 && d.sorten[1].karton === 16, "Seite bekommt Preise");
pruefe(d.bestellung.status === "offen" && d.club.antwortadresse === undefined, "offen, Antwortadresse nicht dabei");
pruefe(g.get({ k: zM }).mitglied.gruss === "Hallo Maria", "Gruß ohne Spalte Anrede bei Du");
pruefe(g.get({ k: zAnna }).mitglied.gruss === "Guten Tag Anna Berger", "Gruß bei Sie");
pruefe(!g.get({ k: "000000000000" }).ok && !g.get({ k: "Nr. 1 Straßl" }).ok && !g.get({ k: "" }).ok, "falsche Zeichen abgelehnt");

const post = (k, mengen, anmerkung) => g.post({ k, mengen, summe: "Text", anmerkung: anmerkung || "" });
pruefe(post("000000000000", { red: 6 }).fehler === "Link ungültig", "Bestellung mit falschem Zeichen");
pruefe(post(zS, { red: -1 }).fehler === "Menge ungültig", "Menge −1");
pruefe(post(zS, { red: 121 }).fehler === "Menge ungültig", "Menge 121");
pruefe(post(zS, { red: 2.5 }).fehler === "Menge ungültig", "Menge 2,5");
pruefe(post(zS, { rose: 6 }).fehler === "Sorte unbekannt", "unbekannte Sorte");
pruefe(t("Bestellungen").length === 1, "nichts Abgelehntes geschrieben");

g.jetzt = "2026-10-25T10:01:00+01:00";
pruefe(post(zS, { servizzante: 2, red: 8 }, "=HYPERLINK(\"x\")").ok, "Straßl bestellt");
pruefe(t("Bestellungen")[1][5].startsWith("'="), "Formel in der Anmerkung als Text");
g.jetzt = "2026-10-25T10:02:00+01:00";
post(zM, { white: 3 });                          // unter der Mindestmenge
post(zO, {});                                    // nichts
post(zAnna, { red: 12 });                        // Club B
d = g.get({ k: zS });
pruefe(d.bestellung.status === "bestellt" && d.bestellung.mengen.join() === "2,8,0" && d.bestellung.flaschen === 10,
       "Straßl sieht seine Bestellung");
pruefe(g.get({ k: zM }).bestellung.status === "prüfen", "3 Flaschen auf prüfen");
pruefe(g.get({ k: zO }).bestellung.status === "keine Bestellung", "0 Flaschen heißt keine Bestellung");

// ---------------------------------------------------------------- Stand und Trennung
let v = c.vwLaden("TEST", SA);
pruefe(v.stand.summen.bestellt === 1 && v.stand.summen.flaschen === 10 && v.stand.summen.offen === 1, "Stand TEST");
pruefe(v.stand.sorten.join() === "2,8,0", "Flaschen je Sorte ohne Club B");
pruefe(!JSON.stringify(v).includes("Berger"), "TEST sieht nichts von Club B");
const vb = c.vwLaden("B", SB);
pruefe(vb.stand.summen.flaschen === 12 && !JSON.stringify(vb).includes("Straßl"), "Club B sieht nur sich");

// ---------------------------------------------------------------- Abholung
wirft(() => c.vwAbholen("TEST", SA, 2, "abgeholt"), /prüfen/, "Abholung auf prüfen abgelehnt");
wirft(() => c.vwAbholen("TEST", SA, 1, "zurückgenommen"), /nicht als abgeholt/, "Rücknahme ohne Abholung");
wirft(() => c.vwAbholen("TEST", SA, 1, "verschenkt"), /Aktion unbekannt/, "unbekannte Aktion");
g.jetzt = "2026-11-12T19:30:00+01:00";
v = c.vwAbholen("TEST", SA, 1, "abgeholt");
pruefe(v.stand.abholung.abgeholt === 1 && v.stand.abholung.flaschen === 10, "Straßl abgeholt");
wirft(() => c.vwAbholen("TEST", SA, 1, "abgeholt"), /bestellt|abgeholt/, "doppelte Abholung");
g.jetzt = "2026-11-13T09:00:00+01:00";
post(zS, { red: 6 });
d = g.get({ k: zS });
pruefe(d.bestellung.nummer === 2 && d.bestellung.abschnitte.length === 2 && d.bestellung.abschnitte[0].abgeholt,
       "Bestellung nach der Abholung ist eine neue");
wirft(() => c.vwAbholen("TEST", SA, 1, "zurückgenommen"), /neu bestellt/, "Rücknahme nach neuer Bestellung");
// Abrechnung: nur die abgeholte erste Bestellung wird abgebucht, die zusätzliche steht ohne Abholung darunter.
let ar = c.vwLaden("TEST", SA).abrechnung;
pruefe(ar.abgeholt.length === 1 && ar.abgeholt[0].betrag === 166 && ar.abgeholt[0].kartons === 1 && ar.summe === 166,
       "Abrechnung: Straßl 2 Servizzante + 8 Red Seven = 166 €, 1 Karton");
pruefe(ar.offen.length === 1 && ar.offen[0].betrag === 96 && ar.offen[0].art === "zusätzliche", "zusätzliche Bestellung noch offen, 96 €");
pruefe(ar.pruefen.join() === "Maria Maier", "Bestellung auf prüfen wird genannt");
pruefe(c.vwLaden("B", SB).abrechnung.summe === 0, "Club B ohne Abholung: nichts abzubuchen");

// Eine Markierung, die nicht über die Verwaltung kam (etwa von Hand im Blatt), trennt keine Bestellung ab.
g.tabelle().getSheetByName("Abholung").appendRow(["2026-11-12 19:40:00", "TEST", "2", "abgeholt"]);
const m2 = c.vwLaden("TEST", SA).stand.mitglieder.find(m => m.nr === 2);
pruefe(m2.status === "prüfen" && !m2.abgeholt && /als abgeholt markiert/.test(m2.abholHinweis),
       "Markierung bei „prüfen“ bleibt ein Hinweis");

// ---------------------------------------------------------------- Einstellungen
wirft(() => c.vwEinstellungen("TEST", SA, { Bestellschluss: "5.11.2026" }), /Datum/, "Datum im falschen Format");
wirft(() => c.vwEinstellungen("TEST", SA, { Antwortadresse: "kein" }), /Antwortadresse/, "Antwortadresse ungültig");
wirft(() => c.vwEinstellungen("TEST", SA, { "Sekretär": "" }), /Namen/, "Name unter der Mail leer");
v = c.vwEinstellungen("TEST", SA, { Antwortadresse: "sekretaer@example.org", "Schlüssel": "gekapert", "Kürzel": "Y" });
pruefe(v.club.antwortadresse === "sekretaer@example.org" && c.clubFinden("TEST")["Schlüssel"] === SA,
       "Antwortadresse gespeichert, Schlüssel und Kürzel nicht änderbar");

// ---------------------------------------------------------------- Versand
let s = c.vwSenden("TEST", SA, "Probe", "");
pruefe(s.ergebnis.gesendet === 1 && g.mails[0].to === "sekretaer@example.org" && g.mails[0].subject.startsWith("Probe:"),
       "Probe an die Antwortadresse");
pruefe(c.vwLaden("TEST", SA).mitglieder.every(m => !m.eingeladen), "Probe zählt nicht als Einladung");
g.kontingentSetzen(2);
s = c.vwSenden("TEST", SA, "Einladung", "Bitte bis zum Meeting bestellen.");
pruefe(s.ergebnis.gesendet === 2 && s.ergebnis.uebrig === 1, "Tageslimit: 2 gesendet, 1 übrig");
const m1 = g.mails[1];
pruefe(m1.to === "herbert@example.org" && m1.replyTo === "sekretaer@example.org" && m1.name === "SERVINO Testclub Grieskirchen",
       "Absender und Antwortadresse");
pruefe(m1.htmlBody.includes(`?k=${zS}`) && m1.htmlBody.includes("Lieber Herbert,") && m1.htmlBody.includes("dein persönlicher Link")
       && m1.htmlBody.includes("Bitte bis zum Meeting bestellen.") && m1.htmlBody.includes("Donnerstag, 5. November 2026"),
       "Einladung mit Link, Gruß, Du, Zusatz und Datum");
pruefe(!m1.htmlBody.includes(zM), "Mail trägt nur den eigenen Link");
g.kontingentSetzen(10);
s = c.vwSenden("TEST", SA, "Einladung", "");
pruefe(s.ergebnis.gesendet === 1 && g.mails[3].to === "eva@example.org", "zweiter Lauf schickt nur den Rest");
pruefe(c.vwSenden("TEST", SA, "Einladung", "").ergebnis.gesendet === 0, "dritter Lauf schickt nichts");
s = c.vwSenden("TEST", SA, "Erinnerung", "");
pruefe(s.ergebnis.gesendet === 1 && g.mails[4].to === "eva@example.org" && g.mails[4].subject.includes("Erinnerung"),
       "Erinnerung nur an die Offene mit E-Mail");
s = c.vwSenden("B", SB, "Einladung", "");
const mb = g.mails.slice(-2);
pruefe(s.ergebnis.gesendet === 2 && mb[0].htmlBody.includes("Ihr persönlicher Link") && mb[0].htmlBody.includes("Guten Tag Anna Berger,")
       && mb[0].htmlBody.includes("Mit freundlichen Grüßen<br>Maria Huber"), "Club B: Sie-Form und eigener Name");
v = c.vwLaden("TEST", SA);
pruefe(v.mitglieder.find(m => m.nr === 1).eingeladen && v.mitglieder.find(m => m.nr === 4).erinnert, "Versand je Mitglied vermerkt");
const mk = v.mitglieder.find(m => m.nr === 1).mail;
pruefe(mk && mk.text.startsWith("Lieber Herbert,") && mk.text.includes(`?k=${zS}`) && mk.text.includes("Liebe Grüße\nHanspeter")
       && mk.betreff === "Testclub Grieskirchen: Dein persönlicher Bestelllink für SERVINO", "Mail-Knopf: Text mit Gruß, Link und Name");
pruefe(v.mitglieder.find(m => m.nr === 3).mail === null, "ohne E-Mail kein Mail-Knopf");
pruefe(c.vwLaden("B", SB).mitglieder[0].mail.text.includes("Mit freundlichen Grüßen\nMaria Huber"), "Mail-Knopf in Sie-Form");

// ---------------------------------------------------------------- Gesamtsicht
const GK = g.props.GESAMT;
pruefe(/^[0-9a-f]{24}$/.test(GK) && g.logs.some(l => l.includes("?gesamt=" + GK)), "Schlüssel der Gesamtsicht vergeben");
pruefe(g.get({ gesamt: "falsch" }).dienst === "SERVINO Clubs" && g.get({ gesamt: SA }).dienst === "SERVINO Clubs",
       "Gesamtsicht nicht mit falschem oder Clubschlüssel");
const gs = c.gesamtStand();
pruefe(gs.clubs.length === 2 && gs.clubs[0].bestellt.join() === "2,14,0" && gs.clubs[1].bestellt.join() === "0,12,0",
       "Gesamt je Club: TEST 2/14/0, Club B 0/12/0");
pruefe(gs.gesamt.bestellt.join() === "2,26,0" && gs.gesamt.abgeholt.join() === "2,8,0" && gs.gesamt.pruefen === 1,
       "Gesamt: 2/26/0 bestellt, 2/8/0 abgeholt, eine zu prüfen");
const gseite = g.get({ gesamt: GK });
pruefe(gseite.art === "html" && gseite.inhalt.includes("Club B") && gseite.inhalt.includes("4 Kartons + 2 Fl.") && gseite.inhalt.includes("<span>2 Fl.</span>")
       && !gseite.inhalt.includes("Straßl") && !gseite.inhalt.includes("€"), "Gesamtseite ohne Namen und Beträge");
const gf = laden({ mailFehler: o => o.to === "maria.maier@example.org" });
gf.props.WEBAPP = "x";
gf.ctx.einrichten();
const sf = gf.ctx.clubFinden("TEST")["Schlüssel"];
gf.ctx.vwImport("TEST", sf, "Maria\tMaier\tmaria.maier@example.org\nEva\tNeu\teva@example.org", true);
s = gf.ctx.vwSenden("TEST", sf, "Einladung", "");
pruefe(s.ergebnis.gesendet === 1 && s.ergebnis.fehler.length === 1, "gescheiterte Mail wird gemeldet");
pruefe(gf.ctx.vwSenden("TEST", sf, "Einladung", "").ergebnis.fehler.length === 1, "gescheiterte Mail kommt beim nächsten Lauf wieder");

// ---------------------------------------------------------------- Entfernen und Ende
v = c.vwAktiv("TEST", SA, 4, false);
const zEva = c.mitgliederVon("TEST")[3].Zeichen;
pruefe(g.get({ k: zEva }).fehler === "Link ungültig", "entferntes Mitglied: Link ungültig");
pruefe(post(zEva, { red: 6 }).fehler === "Link ungültig", "entferntes Mitglied kann nicht bestellen");
pruefe(v.stand.summen.offen === 0, "entferntes Mitglied zählt nicht als offen");
c.vwAktiv("TEST", SA, 2, false);
pruefe(c.vwLaden("TEST", SA).stand.mitglieder.some(m => m.nr === 2), "entferntes Mitglied mit Bestellung bleibt im Stand");
c.vwEinstellungen("TEST", SA, { Ende: "2026-11-30" });
g.jetzt = "2026-12-01T08:00:00+01:00";
pruefe(post(zS, { red: 6 }).fehler === "Bestellung geschlossen", "nach dem Ende nimmt die Web-App nichts an");

console.log(`${geprueft - fehler} von ${geprueft} Prüfungen bestanden`);
process.exit(fehler ? 1 : 0);
