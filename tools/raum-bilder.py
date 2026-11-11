#!/usr/bin/env python3
"""Erzeugt die abgeleiteten Bilder fuer den Raum (Etappe 2).

Aufruf:  python tools/raum-bilder.py renderer/themes/cozy

Liest raum.png, platte.png sowie die von Janis gewaehlten Quellen (PixelLab,
Zettel/Schild) in tools/raum-quellen/, schreibt RGBA-PNGs und gibt
die vier Eckpunkte der Bildschirmflaeche als eine JSON-Zeile aus (oben links,
oben rechts, unten rechts, unten links), in Pixelkanten.
Es wird nichts selbst gezeichnet: nur zuschneiden, skalieren, ausstanzen, einsetzen.
"""
import json
import os
import shutil
import sys

from PIL import Image

QUELLEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raum-quellen")
# Lage des PixelLab-Ausschnitts tv-aus.png in raum.png
TV_AUSSCHNITT = (156, 8)
# Profilbild-Fenster der Huelle (Variante A: Profilbild fuellt das Cover)
HUELLE_FENSTER = (2, 2, 36, 36)
# Ursprung der Hover-Ausschnitte im Raum (Klickflaeche - 4); Task 2 uebertraegt sie in Raum.HOVER
HOVER = {
    "regal": (96, 10),
    "lampe": (161, 2),
    "fernseher": (194, 34),
    "plattenspieler": (258, 82),
    "bild": (278, 32),
}
# Ursprung der 64x64-Bilder der drehenden Platte im Raum
PLATTE_URSPRUNG = (256, 80)
# Grosse Huelle: cremefarbene Innenflaeche der Vorderseite = Profilbild-Fenster
# (Lage wird per Farbe ermittelt, gemessen 11.11.2026: x 32, y 32, 65x65).
HUELLE_GROSS_FENSTERFARBE = (241, 237, 225, 255)
# Rueckseite: Platzhalter-Zeilen innerhalb des gepunkteten Rahmens (Rahmen x 18-109,
# y 23-107, Eckmarken bis y 29 und ab y 100 bleiben) -> Platz fuer die VOD-Liste.
HUELLE_GROSS_LISTE = (19, 30, 90, 70)


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


def deck_box(bild, farbe):
    """Bounding-Box (x, y, b, h) aller Pixel genau dieser Farbe; die Box muss voll davon sein."""
    p = bild.load()
    w, h = bild.size
    pkt = [(x, y) for y in range(h) for x in range(w) if p[x, y] == farbe]
    if not pkt:
        raise SystemExit("huelle-gross-vorn.png: Fensterfarbe nicht gefunden")
    xs = [q[0] for q in pkt]
    ys = [q[1] for q in pkt]
    box = (min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)
    if box[2] * box[3] != len(pkt):
        raise SystemExit("huelle-gross-vorn.png: Fenster ist kein volles Rechteck")
    return box


def huelle_gross(ordner):
    """Grosse Huelle (Janis' Wahl, PixelLab 128x128): Vorderseite mit ausgestanztem
    Fenster fuers Profilbild, Rueckseite mit ausgestanzter Platzhalter-Liste.
    Gibt das Fenster der Vorderseite als (x, y, b, h) zurueck."""
    vorn = quelle("huelle-gross-vorn.png")
    fenster = deck_box(vorn, HUELLE_GROSS_FENSTERFARBE)
    vp = vorn.load()
    fx, fy, fb, fh = fenster
    for y in range(fy, fy + fh):
        for x in range(fx, fx + fb):
            vp[x, y] = (0, 0, 0, 0)
    vorn.save(os.path.join(ordner, "huelle-gross-vorn.png"))

    rueck = quelle("huelle-gross-rueck.png")
    rp = rueck.load()
    lx, ly, lb, lh = HUELLE_GROSS_LISTE
    for y in range(ly, ly + lh):
        for x in range(lx, lx + lb):
            rp[x, y] = (0, 0, 0, 0)
    rueck.save(os.path.join(ordner, "huelle-gross-rueck.png"))
    return fenster


def lampe_klein(ordner):
    # Aus dem 16x16-Rohbild nur die zusammenhaengende deckende Flaeche (4er-Nachbarschaft)
    # behalten, die den hellsten Pixel (groesstes R+G) enthaelt; auf ihre Bounding-Box zuschneiden.
    roh = quelle("lampe-klein-roh.png")
    w, h = roh.size
    p = roh.load()
    deckend = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] > 0]
    start = max(deckend, key=lambda q: p[q][0] + p[q][1])
    flaeche = {start}
    stapel = [start]
    while stapel:
        x, y = stapel.pop()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n not in flaeche and 0 <= n[0] < w and 0 <= n[1] < h and p[n][3] > 0:
                flaeche.add(n)
                stapel.append(n)
    aus = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ap = aus.load()
    for q in flaeche:
        ap[q] = p[q]
    xs = [q[0] for q in flaeche]
    ys = [q[1] for q in flaeche]
    aus.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)).save(os.path.join(ordner, "lampe-klein.png"))


def platten(ordner):
    quelle = Image.open(os.path.join(ordner, "platte.png")).convert("RGBA")
    quelle.resize((12, 12), Image.NEAREST).save(os.path.join(ordner, "platte-klein.png"))
    quelle.resize((36, 36), Image.NEAREST).save(os.path.join(ordner, "platte-vorn.png"))


def zettel_schild(ordner):
    q = quelle("zettel-schild.png")
    zettel = q.crop((27, 13, 156, 109))  # 129x96
    # Pinnnadel (Original x 80..106, y 13..37) mit Papier derselben Zeilen ueberdecken.
    zp = zettel.load()
    for y in range(13, 38):
        for x in range(80, 107):
            zp[x - 27, y - 13] = zp[x - 27 - 34, y - 13]
    zettel.save(os.path.join(ordner, "zettel.png"))
    schild = q.crop((26, 120, 157, 161))  # 131x41
    schild.save(os.path.join(ordner, "schild.png"))


def hover_und_platte(ordner):
    raum = Image.open(os.path.join(ordner, "raum.png")).convert("RGBA")
    rp = raum.load()
    # Ausschnitte unveraendert; beim Fernseher werden die Bildschirm-Pixel (gruen in raum.png)
    # durchsichtig, damit beim Aufleuchten das Stream-Bild sichtbar bleibt.
    for name, (ox, oy) in HOVER.items():
        bild = quelle("hover-%s.png" % name)
        if name == "fernseher":
            bp = bild.load()
            for y in range(bild.size[1]):
                for x in range(bild.size[0]):
                    if ist_gruen(rp[ox + x, oy + y]):
                        bp[x, y] = (0, 0, 0, 0)
        bild.save(os.path.join(ordner, "hover-%s.png" % name))

    # Drehende Platte: 8 Bilder (64x64, Ursprung PLATTE_URSPRUNG) auf die deckende Flaeche
    # des Plattenspieler-Ausschnitts begrenzt, nebeneinander.
    hov = quelle("hover-plattenspieler.png")
    hp = hov.load()
    hw, hh = hov.size
    dx = HOVER["plattenspieler"][0] - PLATTE_URSPRUNG[0]
    dy = HOVER["plattenspieler"][1] - PLATTE_URSPRUNG[1]
    streifen = Image.new("RGBA", (hw * 8, hh), (0, 0, 0, 0))
    sp = streifen.load()
    for i in range(8):
        b = quelle("platte-dreht-%d.png" % (i + 1))
        bp = b.load()
        for y in range(hh):
            for x in range(hw):
                if hp[x, y][3] > 0:
                    sp[i * hw + x, y] = bp[x + dx, y + dy]
    streifen.save(os.path.join(ordner, "platte-dreht.png"))

    os.makedirs(os.path.join(ordner, "schrift"), exist_ok=True)
    shutil.copyfile(os.path.join(QUELLEN, "schrift-klar.ttf"), os.path.join(ordner, "schrift", "RaumKlar.ttf"))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Aufruf: raum-bilder.py <ordner>")
    ordner = sys.argv[1]
    ecken = tv_bilder(ordner)
    hover_und_platte(ordner)
    huelle_bilder(ordner)
    gross = huelle_gross(ordner)
    lampe_klein(ordner)
    platten(ordner)
    zettel_schild(ordner)
    print(json.dumps({"tvEcken": ecken, "grossFenster": gross}, separators=(",", ":")))


if __name__ == "__main__":
    main()
