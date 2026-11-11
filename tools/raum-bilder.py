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
# Leben (Etappe 3): Summe der RGB-Abstaende, ab der ein PixelLab-Pixel als bewegt gilt.
LEBEN_TOLERANZ = 24
# Glasmaske im Streifen: RGB-Abstand zu einer gemessenen Glasfarbe (leben.json), bis zu
# dem ein Pixel als Glas gilt, und kleinste Scheibe (Pixel), die mitgenommen wird.
GLAS_TOLERANZ = 20
GLAS_MINDEST = 50
DURCHSICHTIG = (0, 0, 0, 0)


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


def onair_schilder(ordner):
    # LIVE- und VOD-Schild (PixelLab 64x32) unveraendert uebernehmen.
    for name in ("schild-live.png", "schild-vod.png"):
        quelle(name).save(os.path.join(ordner, name))


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


def gelb_weg(p):
    """Janis: Regen ohne Gelb. Gelbliche Pixel kuehl einfaerben (Regel in leben.json)."""
    r, g, b, a = p
    if r - b > 5 and abs(r - g) < 25:
        l = 0.3 * r + 0.59 * g + 0.11 * b
        if l < 130:
            return (int(l * 0.82), int(l * 0.95), min(255, int(l * 1.2)), a)
    return p


def im_rechteck(x, y, r):
    return r["x"] <= x < r["x"] + r["b"] and r["y"] <= y < r["y"] + r["h"]


def bildstreifen(sp, a, name, glas=None, rechteck=None):
    """Bildstreifen (bilder x ziel.b breit, ziel.h hoch) aus den PixelLab-Bildern
    name % k (k = 1..bilder-1) gegen das Standbild sp. Ein Pixel gilt als bewegt,
    wenn sein RGB-Abstand zum Standbild > LEBEN_TOLERANZ ist (Kompressionsrauschen
    zaehlt nicht); bewegte Pixel kommen unveraendert aus PixelLab.
    Ohne glas (Home): Bild 0 = Standbild-Ausschnitt, unbewegte Pixel in Bild 1..n
    durchsichtig. Mit glas (Streifen, Menge der Glaspixel): unbewegte Pixel sind in
    jedem Bild (auch Bild 0) auf Glas durchsichtig - Regen und Raid darunter bleiben
    sichtbar - und sonst das Standbild, damit Katze und Rahmen darunterliegende
    Ebenen verdecken. rechteck = gelbWeg-Rechteck: dort werden die PixelLab-Pixel
    vor dem Vergleich wie das Standbild eingefaerbt."""
    q, z, n = a["quelle"], a["ziel"], a["bilder"]
    streifen = Image.new("RGBA", (n * z["b"], z["h"]), DURCHSICHTIG)
    st = streifen.load()
    for k in range(n):
        bp = quelle(name % k).load() if k > 0 else None
        for y in range(z["h"]):
            for x in range(z["b"]):
                ax, ay = z["x"] + x, z["y"] + y
                s = sp[ax, ay]
                if bp is not None:
                    p = bp[ax - q["x"], ay - q["y"]]
                    if rechteck is not None and im_rechteck(ax, ay, rechteck):
                        p = gelb_weg(p)
                    if sum(abs(p[i] - s[i]) for i in range(3)) > LEBEN_TOLERANZ:
                        st[k * z["b"] + x, y] = p
                        continue
                if glas is None:
                    if k == 0:
                        st[x, y] = s
                elif (ax, ay) not in glas:
                    st[k * z["b"] + x, y] = s
    return streifen


def glas_maske(still, glas):
    """Glaspixel des Streifen-Fensters als Menge: Flutfuellung (4er-Nachbarschaft) ab der
    Saat ueber die gemessenen Glasfarben, nur innerhalb des Glas-Rechtecks. Sprossen
    teilen das Glas in Scheiben, deshalb wird zusaetzlich jede weitere Scheibe
    (zusammenhaengende Glasflaeche ab GLAS_MINDEST Pixeln) geflutet. Es werden nur
    vorhandene Pixel ausgewaehlt (Ausstanzen), nichts gezeichnet."""
    sp = still.load()
    farben = [tuple(f) for f in glas["glasfarben"]]

    def ist_glas(x, y):
        if not im_rechteck(x, y, glas):
            return False
        p = sp[x, y]
        return min(sum(abs(p[i] - f[i]) for i in range(3)) for f in farben) <= GLAS_TOLERANZ

    def flut(start, schon):
        flaeche = {start}
        stapel = [start]
        while stapel:
            x, y = stapel.pop()
            for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nb not in flaeche and nb not in schon and ist_glas(*nb):
                    flaeche.add(nb)
                    stapel.append(nb)
        return flaeche

    saat = (glas["saat"]["x"], glas["saat"]["y"])
    if not ist_glas(*saat):
        raise SystemExit("streifen.png: Saatpunkt liegt nicht auf Glas")
    maske = flut(saat, set())
    gesehen = set(maske)
    for y in range(glas["y"], glas["y"] + glas["h"]):
        for x in range(glas["x"], glas["x"] + glas["b"]):
            if (x, y) in gesehen or not ist_glas(x, y):
                continue
            scheibe = flut((x, y), gesehen)
            gesehen |= scheibe
            if len(scheibe) >= GLAS_MINDEST:
                maske |= scheibe
    return maske


def leben_bilder(ordner):
    """Etappe 3 (Leben), Orte und Bildzahlen aus leben.json.
    Home: je Animation und Datei leben-home-<datei>.png (Bild 0 = Standbild-Ausschnitt,
    ersetzt PixelLabs Bild 0). gelbWeg: im Rechteck werden gelbliche Pixel im Standbild
    raum-tv-aus.png (wird neu gespeichert) und in den Animationsbildern kuehl eingefaerbt.
    Streifen: Glasmaske streifen-glas-maske.png (344x72, weiss = Glas), je Animation
    leben-streifen-<datei>.png, die Kiste leben-kiste.png und je Raid-Figur der
    Gehzyklus leben-<datei>.png (PixelLab-Bilder unveraendert nebeneinander)."""
    with open(os.path.join(QUELLEN, "leben.json"), encoding="utf-8") as f:
        leben = json.load(f)

    home = leben["home"]
    still_pfad = os.path.join(ordner, home["standbild"])
    still = Image.open(still_pfad).convert("RGBA")
    sp = still.load()
    for a in home["animationen"]:
        r = a.get("gelbWeg")
        if r:
            for y in range(r["y"], r["y"] + r["h"]):
                for x in range(r["x"], r["x"] + r["b"]):
                    sp[x, y] = gelb_weg(sp[x, y])
    still.save(still_pfad)
    for a in home["animationen"]:
        for datei in a["dateien"]:
            bild = bildstreifen(sp, a, "leben-home-" + datei + "-%d.png", rechteck=a.get("gelbWeg"))
            bild.save(os.path.join(ordner, "leben-home-%s.png" % datei))

    st = leben["streifen"]
    still = Image.open(os.path.join(ordner, st["standbild"])).convert("RGBA")
    sp = still.load()
    glas = glas_maske(still, st["glas"])
    maske = Image.new("RGBA", still.size, DURCHSICHTIG)
    mp = maske.load()
    for q in glas:
        mp[q] = (255, 255, 255, 255)
    maske.save(os.path.join(ordner, "streifen-glas-maske.png"))
    for a in st["animationen"]:
        for datei in a["dateien"]:
            bild = bildstreifen(sp, a, "leben-streifen-" + datei + "-%d.png", glas=glas)
            bild.save(os.path.join(ordner, "leben-streifen-%s.png" % datei))
    k = st["kiste"]
    bildstreifen(sp, k, "leben-streifen-" + k["datei"] + "-%d.png", glas=glas).save(
        os.path.join(ordner, "leben-kiste.png"))
    r = st["raid"]
    for datei in r["dateien"]:
        gehen = Image.new("RGBA", (r["bilder"] * r["b"], r["h"]), DURCHSICHTIG)
        for k in range(r["bilder"]):
            b = quelle("leben-streifen-%s-%d.png" % (datei, k))
            if b.size != (r["b"], r["h"]):
                raise SystemExit("leben-streifen-%s-%d.png: Groesse %s" % (datei, k, b.size))
            gehen.paste(b, (k * r["b"], 0))
        gehen.save(os.path.join(ordner, "leben-%s.png" % datei))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Aufruf: raum-bilder.py <ordner>")
    ordner = sys.argv[1]
    ecken = tv_bilder(ordner)
    leben_bilder(ordner)
    hover_und_platte(ordner)
    huelle_bilder(ordner)
    gross = huelle_gross(ordner)
    lampe_klein(ordner)
    platten(ordner)
    zettel_schild(ordner)
    onair_schilder(ordner)
    print(json.dumps({"tvEcken": ecken, "grossFenster": gross}, separators=(",", ":")))


if __name__ == "__main__":
    main()
