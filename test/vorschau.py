"""Baut bilder/vorschau.jpg (1200 x 630), das Bild, das Mail und WhatsApp beim Teilen des Links zeigen.

Für alle Clubs gleich, deshalb ohne Wappen und ohne Datum. Aufruf: python test/vorschau.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WURZEL = Path(__file__).resolve().parent.parent
NAVY, GOLD, GRAU = (31, 56, 100), (192, 151, 91), (107, 118, 131)

bild = Image.new("RGB", (1200, 630), "white")
foto = Image.open(WURZEL / "bilder" / "flaschen.jpg").convert("RGB")
# Foto so groß, dass es 560 x 630 ganz deckt, dann mittig beschnitten.
faktor = max(560 / foto.width, 630 / foto.height)
foto = foto.resize((round(foto.width * faktor), round(foto.height * faktor)))
links, oben = (foto.width - 560) // 2, (foto.height - 630) // 2
bild.paste(foto.crop((links, oben, links + 560, oben + 630)), (0, 0))

zeichnen = ImageDraw.Draw(bild)
zeichnen.rectangle((560, 0, 568, 630), fill=GOLD)
schrift = lambda name, groesse: ImageFont.truetype(f"C:/Windows/Fonts/{name}", groesse)
x = 620
zeichnen.text((x, 150), "SERVINO-BESTELLUNG", font=schrift("segoeuib.ttf", 26), fill=GOLD)
zeichnen.text((x, 195), "SERVINO", font=schrift("georgia.ttf", 88), fill=NAVY)
zeichnen.text((x, 300), "bestellen", font=schrift("georgia.ttf", 64), fill=NAVY)
zeichnen.text((x, 410), "Der Wein der sieben", font=schrift("segoeui.ttf", 32), fill=GRAU)
zeichnen.text((x, 452), "Grieskirchner Serviceclubs", font=schrift("segoeui.ttf", 32), fill=GRAU)
zeichnen.rectangle((x, 520, 1140, 524), fill=NAVY)

ziel = WURZEL / "bilder" / "vorschau.jpg"
bild.save(ziel, quality=85)
print(ziel, ziel.stat().st_size, "Byte")
