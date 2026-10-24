// Nachbau der Web-App für die Prüfung im Browser: liefert die Bestellseite und unter /exec den echten
// google/Code.gs im Nachbau der Google-Dienste. google.script.run der Verwaltung geht an /run.
// Aufruf: node test/server.js [Port]. Legt zwei Clubs mit Mitgliedern an und gibt die Links aus.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { laden } = require("./attrappe.js");

const PORT = Number(process.argv[2]) || 8790;
const WURZEL = path.join(__dirname, "..");
const BASIS = `http://localhost:${PORT}`;
const g = laden({ kontingent: 5 });
const c = g.ctx;
g.props.WEBAPP = `${BASIS}/exec`;
c.einrichten();
g.tabelle().getSheetByName("Clubs").appendRow(["B", "Club B Grieskirchen", "sie", "2026-11-20", "am 28. November im Clublokal",
  "Bitte überweisen Sie den Betrag nach der Abholung.", "", "Maria Huber", "maria@example.org", "", ""]);
c.verwaltungsLinks();
const SA = c.clubFinden("TEST")["Schlüssel"], SB = c.clubFinden("B")["Schlüssel"];
c.vwImport("TEST", SA, "Vorname\tNachname\tE-Mail\tMobil\tAnrede\nHerbert\tStraßl\therbert@example.org\t0664 1234567\tLieber Herbert\n"
  + "Maria\tMaier\tmaria@example.org\t\t\nJosef\tGruber\t\t+43 660 1112223\t", true);
c.vwImport("B", SB, "Anna\tBerger\tanna@example.org\nFranz\tBauer\tfranz@example.org", true);
// Seite des Mitglieds zeigt auf den Nachbau, nicht auf Google.
const SEITE_ALT = "https://hanspeter-meissl.github.io/servino/";

const ARTEN = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png",
                ".jpg": "image/jpeg", ".json": "application/json" };

function shim() {
  return `<script>
  // Nachbau von google.script.run: jede Funktion geht als POST an /run.
  window.google = { script: { run: (function bauen(ok, nein) {
    return new Proxy({}, { get(_, name) {
      if (name === "withSuccessHandler") return f => bauen(f, nein);
      if (name === "withFailureHandler") return f => bauen(ok, f);
      return (...args) => fetch("/run", { method: "POST", body: JSON.stringify({ fn: name, args }) })
        .then(r => r.json()).then(r => r.fehler ? (nein && nein(new Error(r.fehler))) : (ok && ok(r.wert)))
        .catch(e => nein && nein(e));
    } });
  })(null, null) } };
  </script>`;
}

const bremse = () => new Promise(r => setTimeout(r, Number(process.env.VERZOEGERUNG || 600)));

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASIS);
  let body = "";
  req.on("data", d => { body += d; });
  await new Promise(r => req.on("end", r));
  const senden = (status, art, inhalt) => { res.writeHead(status, { "Content-Type": art, "Access-Control-Allow-Origin": "*" }); res.end(inhalt); };
  try {
    if (url.pathname === "/exec") {
      await bremse();
      if (req.method === "POST") {
        if (process.env.ABLEHNEN) return senden(500, "text/plain", "Fehler");
        return senden(200, "application/json", c.doPost({ postData: { contents: body } }).inhalt);
      }
      const r = c.doGet({ parameter: Object.fromEntries(url.searchParams) });
      if (r.art === "json") return senden(200, "application/json", r.inhalt);
      return senden(200, "text/html; charset=utf-8", `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${r.titel}</title>${shim()}</head><body>${r.inhalt}</body></html>`);
    }
    if (url.pathname === "/run") {
      await bremse();
      const { fn, args } = JSON.parse(body);
      if (!/^vw[A-Z]/.test(fn)) return senden(200, "application/json", JSON.stringify({ fehler: "unbekannt" }));
      try {
        const wert = c[fn](...args);
        return senden(200, "application/json", JSON.stringify({ wert: JSON.parse(JSON.stringify(wert).split(SEITE_ALT).join(BASIS + "/")) }));
      } catch (e) {
        return senden(200, "application/json", JSON.stringify({ fehler: String(e.message || e) }));
      }
    }
    if (url.pathname === "/einstellung.js") return senden(200, ARTEN[".js"], `const GOOGLE = "${BASIS}/exec";`);
    if (url.pathname === "/mails") return senden(200, "application/json", JSON.stringify(g.mails, null, 1));
    if (url.pathname === "/blatt") return senden(200, "application/json", JSON.stringify(g.blatt(url.searchParams.get("n"))));
    const datei = path.join(WURZEL, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!datei.startsWith(WURZEL) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) return senden(404, "text/plain", "fehlt");
    return senden(200, ARTEN[path.extname(datei)] || "application/octet-stream", fs.readFileSync(datei));
  } catch (e) {
    return senden(500, "text/plain", String(e.stack || e));
  }
}).listen(PORT, () => {
  console.log(`Nachbau läuft auf ${BASIS}`);
  console.log(`Verwaltung TEST: ${BASIS}/exec?verwaltung=TEST&s=${SA}`);
  console.log(`Verwaltung B:    ${BASIS}/exec?verwaltung=B&s=${SB}`);
  [...c.mitgliederVon("TEST"), ...c.mitgliederVon("B")].forEach(m => console.log(`${m.Club} ${m["Nr."]} ${m.Vorname} ${m.Nachname}: ${BASIS}/?k=${m.Zeichen}`));
});
