// Rechenregel der SERVINO-Bestellung für alle Clubs.
// Die Sorten mit ihren Preisen kommen von der Web-App aus dem Blatt „Sorten“, damit eine
// Preisänderung an einer Stelle genügt. Kartonpreis nur für volle 6 Flaschen derselben Sorte,
// Restflaschen zum Einzelpreis.

const KARTON = 6;

function zeile(sorte, menge) {
  const kartons = Math.floor(menge / KARTON);
  const rest = menge % KARTON;
  return { kartons, rest, betrag: kartons * KARTON * sorte.karton + rest * sorte.einzel };
}

// sorten: [{ einzel, karton }], mengen in derselben Reihenfolge.
function bestellung(sorten, mengen, mindestmenge) {
  const zeilen = sorten.map((s, i) => zeile(s, mengen[i] || 0));
  const flaschen = mengen.reduce((a, n) => a + (n || 0), 0);
  const summe = zeilen.reduce((a, z) => a + z.betrag, 0);
  return { zeilen, flaschen, summe, fehlen: flaschen > 0 && flaschen < mindestmenge ? mindestmenge - flaschen : 0 };
}

if (typeof module !== "undefined") module.exports = { KARTON, zeile, bestellung };
