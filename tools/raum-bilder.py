#!/usr/bin/env python3
"""Erzeugt die abgeleiteten Bilder fuer den Raum (Etappe 2).

Aufruf:  python tools/raum-bilder.py renderer/themes/cozy

Liest raum.png, platte.png und die Entwuerfe in entwuerfe/, schreibt RGBA-PNGs
und gibt die vier Eckpunkte der Bildschirmflaeche als eine JSON-Zeile aus
(oben links, oben rechts, unten rechts, unten links), in Pixelkanten.
"""
import json
import os
import sys

from PIL import Image

AUS = (0x1A, 0x14, 0x10, 255)
GLANZ = (0x4A, 0x3C, 0x30, 255)
KONTUR = (1, 1, 2, 255)
KARTON = (237, 224, 184, 255)
KARTON_SCHATTEN = (205, 188, 142, 255)


def ist_gruen(p):
    return p[1] > 200 and p[0] < 90


def tv_bilder(ordner):
    raum = Image.open(os.path.join(ordner, "raum.png")).convert("RGBA")
    w, h = raum.size
    px = raum.load()
    gruen = {(x, y) for y in range(h) for x in range(w) if ist_gruen(px[x, y])}
    if not gruen:
        raise SystemExit("raum.png: keine gruenen Pixel gefunden")

    xs = [x for x, _ in gruen]
    ys = [y for _, y in gruen]
    breite = max(xs) - min(xs) + 1
    hoehe = max(ys) - min(ys) + 1

    aus = raum.copy()
    ap = aus.load()
    maske = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mp = maske.load()
    for (x, y) in gruen:
        ap[x, y] = AUS
        mp[x, y] = (255, 255, 255, 255)
    # Glanzlinie oben links: obere und linke Kante, jeweils nur das erste Stueck.
    for (x, y) in gruen:
        if (x, y - 1) not in gruen and x < min(xs) + breite * 0.45:
            ap[x, y] = GLANZ
        if (x - 1, y) not in gruen and y < min(ys) + hoehe * 0.45:
            ap[x, y] = GLANZ
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
    n = 40
    for name, fenster in (("huelle.png", True), ("huelle-rueck.png", False)):
        b = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        p = b.load()
        for y in range(n):
            for x in range(n):
                rand = x in (0, n - 1) or y in (0, n - 1)
                ecke = x in (0, n - 1) and y in (0, n - 1)
                if ecke:
                    continue
                if rand:
                    p[x, y] = KONTUR
                else:
                    # Karton, unten und rechts eine Stufe dunkler
                    p[x, y] = KARTON_SCHATTEN if (x == n - 2 or y == n - 2) else KARTON
        if fenster:
            # innere Kontur um das Fenster (4..35), Fenster 5..34 durchsichtig
            for i in range(4, 36):
                for (x, y) in ((i, 4), (i, 35), (4, i), (35, i)):
                    p[x, y] = KONTUR
            for y in range(5, 35):
                for x in range(5, 35):
                    p[x, y] = (0, 0, 0, 0)
        b.save(os.path.join(ordner, name))


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
