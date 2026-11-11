#!/usr/bin/env python3
"""Erzeugt die abgeleiteten Bilder fuer den Raum (Etappe 2).

Aufruf:  python tools/raum-bilder.py renderer/themes/cozy

Liest raum.png, platte.png und die Entwuerfe in entwuerfe/ sowie die von Janis
gewaehlten PixelLab-Quellen in tools/raum-quellen/, schreibt RGBA-PNGs und gibt
die vier Eckpunkte der Bildschirmflaeche als eine JSON-Zeile aus (oben links,
oben rechts, unten rechts, unten links), in Pixelkanten.
Es wird nichts selbst gezeichnet: nur zuschneiden, skalieren, ausstanzen, einsetzen.
"""
import json
import os
import sys

from PIL import Image

QUELLEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raum-quellen")
# Lage des PixelLab-Ausschnitts tv-aus.png in raum.png
TV_AUSSCHNITT = (156, 8)
# Profilbild-Fenster der Huelle (Variante A: Profilbild fuellt das Cover)
HUELLE_FENSTER = (2, 2, 36, 36)


def quelle(name):
    return Image.open(os.path.join(QUELLEN, name)).convert("RGBA")


def ist_gruen(p):
    return p[1] > 200 and p[0] < 90


def tv_bilder(ordner):
    raum = Image.open(os.path.join(ordner, "raum.png")).convert("RGBA")
    w, h = raum.size
    px = raum.load()
    gruen = {(x, y) for y in range(h) for x in range(w) if ist_gruen(px[x, y])}
    if not gruen:
        raise SystemExit("raum.png: keine gruenen Pixel gefunden")

    # Ausgeschalteter Fernseher: nur die gruenen Pixel durch den PixelLab-Ausschnitt ersetzen.
    tv = quelle("tv-aus.png")
    tp = tv.load()
    ox, oy = TV_AUSSCHNITT
    aus = raum.copy()
    ap = aus.load()
    maske = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mp = maske.load()
    for (x, y) in gruen:
        ap[x, y] = tp[x - ox, y - oy]
        mp[x, y] = (255, 255, 255, 255)
    aus.save(os.path.join(ordner, "raum-tv-aus.png"))
    maske.save(os.path.join(ordner, "raum-tv-maske.png"))

    # Eckpunkte als Pixelkanten
    ol = min(gruen, key=lambda p: (p[0] + p[1], p[1]))
    ur = max(gruen, key=lambda p: (p[0] + p[1], p[1]))
    orr = max(gruen, key=lambda p: (p[0] - p[1], -p[1]))
    ul = min(gruen, key=lambda p: (p[0] - p[1], p[1]))
    return [
        {"x": ol[0], "y": ol[1]},
        {"x": orr[0] + 1, "y": orr[1]},
        {"x": ur[0] + 1, "y": ur[1] + 1},
        {"x": ul[0], "y": ul[1] + 1},
    ]


def huelle_bilder(ordner):
    # Vorderseite: aeussere Kante der PixelLab-Huelle, Fenster ausgestanzt.
    huelle = quelle("huelle-kante.png")
    p = huelle.load()
    fx, fy, fb, fh = HUELLE_FENSTER
    for y in range(fy, fy + fh):
        for x in range(fx, fx + fb):
            p[x, y] = (0, 0, 0, 0)
    huelle.save(os.path.join(ordner, "huelle.png"))
    # Rueckseite unveraendert aus PixelLab.
    quelle("huelle-rueck.png").save(os.path.join(ordner, "huelle-rueck.png"))


def platten(ordner):
    quelle = Image.open(os.path.join(ordner, "platte.png")).convert("RGBA")
    quelle.resize((12, 12), Image.NEAREST).save(os.path.join(ordner, "platte-klein.png"))
    quelle.resize((36, 36), Image.NEAREST).save(os.path.join(ordner, "platte-vorn.png"))


def zettel_schild(ordner):
    q = Image.open(os.path.join(ordner, "entwuerfe", "zettel-schild.png")).convert("RGBA")
    zettel = q.crop((27, 13, 156, 109))  # 129x96
    # Pinnnadel (Original x 80..106, y 13..37) mit Papier derselben Zeilen ueberdecken.
    zp = zettel.load()
    for y in range(13, 38):
        for x in range(80, 107):
            zp[x - 27, y - 13] = zp[x - 27 - 34, y - 13]
    zettel.save(os.path.join(ordner, "zettel.png"))
    schild = q.crop((26, 120, 157, 161))  # 131x41
    schild.save(os.path.join(ordner, "schild.png"))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Aufruf: raum-bilder.py <ordner>")
    ordner = sys.argv[1]
    ecken = tv_bilder(ordner)
    huelle_bilder(ordner)
    platten(ordner)
    zettel_schild(ordner)
    print(json.dumps({"tvEcken": ecken}, separators=(",", ":")))


if __name__ == "__main__":
    main()
