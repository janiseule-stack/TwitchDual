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
def lade_regal_json():
    with open(os.path.join(QUELLEN, "regal.json"), encoding="utf-8") as f:
        return json.load(f)


REGAL = lade_regal_json()
HOVER = {
    "regal": (REGAL["hover"]["x"], REGAL["hover"]["y"]),
    "lampe": (161, 2),
    "fernseher": (194, 34),
    "plattenspieler": (258, 82),
    "bild": (278, 32),
}
# Ursprung der 64x64-Bilder der drehenden Platte im Raum
PLATTE_URSPRUNG = (256, 80)
# Drehende Platte: nur Zeilen oberhalb davon (Platte, Tonarm) wechseln, darunter der Schalter
TELLER_BIS = 32
# Grosse Huelle: cremefarbene Innenflaeche der Vorderseite = Profilbild-Fenster
# (Lage wird per Farbe ermittelt, gemessen 11.11.2026: x 32, y 32, 65x65).
HUELLE_GROSS_FENSTERFARBE = (241, 237, 225, 255)
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
    Fenster fuers Profilbild (die Rueckseite der Karte ist karte-rueck.png).
    Gibt das Fenster der Vorderseite als (x, y, b, h) zurueck."""
    vorn = quelle("huelle-gross-vorn.png")
    fenster = deck_box(vorn, HUELLE_GROSS_FENSTERFARBE)
    vp = vorn.load()
    fx, fy, fb, fh = fenster
    for y in range(fy, fy + fh):
        for x in range(fx, fx + fb):
            vp[x, y] = (0, 0, 0, 0)
    vorn.save(os.path.join(ordner, "huelle-gross-vorn.png"))
    return fenster


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


# Schild in der Leiste (Janis 11.11.2026): PixelLab hat in den 64x39-Ausschnitt der
# Leiste gemalt. Gitter-Flaeche (x 7-43, y 6-30) und Leuchtkasten (x 9-40, y 10-28).
LEISTE_GITTER = (7, 6, 44, 31)
LEISTE_KASTEN = (9, 10, 41, 29)


def onair_schilder(ordner):
    """Leiste ohne Lautsprecher-Gitter (PixelLab-Metall eingesetzt) und die Leuchtkaesten
    LIVE, VOD, aus sowie die 8 Bilder der Pfeil-Animation, unveraendert ausgeschnitten."""
    leiste = quelle("leiste-video-links-roh.png")
    leiste.paste(quelle("leiste-glatt.png").crop(LEISTE_GITTER), LEISTE_GITTER[:2])
    leiste.save(os.path.join(ordner, "leiste-video-links.png"))
    for art in ("live", "vod", "aus"):
        quelle("leiste-schild-%s.png" % art).crop(LEISTE_KASTEN).save(
            os.path.join(ordner, "schild-%s.png" % art))
    b = LEISTE_KASTEN[2] - LEISTE_KASTEN[0]
    h = LEISTE_KASTEN[3] - LEISTE_KASTEN[1]
    pfeil = Image.new("RGBA", (8 * b, h), DURCHSICHTIG)
    for n in range(8):
        pfeil.paste(quelle("leiste-schild-pfeil-%d.png" % n).crop(LEISTE_KASTEN), (n * b, 0))
    pfeil.save(os.path.join(ordner, "schild-pfeil.png"))


# Video-Leiste als Fernseher-Gehaeuse (Janis 14.11.2026, PixelLab Variante 1, 128x32):
# Ende links (Gitter) x 2-27, Kachel x 60-75, Ende rechts x 108-126, jeweils y 1-31.
LEISTE_TV_Y = (1, 32)
LEISTE_TV = {"links": (2, 28), "mitte": (60, 76), "rechts": (108, 127)}


def leiste_tv(ordner):
    """Drei unveraenderte Ausschnitte aus leiste-tv-roh.png (nur zuschneiden)."""
    roh = quelle("leiste-tv-roh.png")
    y0, y1 = LEISTE_TV_Y
    for teil, (x0, x1) in LEISTE_TV.items():
        roh.crop((x0, y0, x1, y1)).save(os.path.join(ordner, "leiste-tv-%s.png" % teil))


# Zaehl-Kasten "Ads blocked" (Janis 14.11.2026, PixelLab Variante 1, 48x20, Inhalt ab
# x 9, y 1, 30x18). Zahlenfenster im Inhalt x 12-24; links bis 2 px ins Fenster,
# Kachel aus der Fenstermitte (x 18), rechts ab 2 px vor Fensterende.
ADS_KASTEN = (9, 1, 39, 19)
ADS_FENSTER_X = (12, 25)


def ads_kasten(ordner):
    """Drei unveraenderte Teile, damit der Kasten mit der Zahl waechst, und die
    runde Lampe samt dunklem Rand als eigene Ebene (nur sie blinkt beim Blocken).
    Lampe = Kreis um die gruenen Pixel, 1,2 px groesser; nur ausgeschnitten."""
    k = quelle("ads-kasten-roh.png").crop(ADS_KASTEN)
    w, h = k.size
    x0, x1 = ADS_FENSTER_X
    mx = (x0 + x1) // 2
    links = k.crop((0, 0, x0 + 2, h))
    links.save(os.path.join(ordner, "ads-kasten-links.png"))
    k.crop((mx, 0, mx + 1, h)).save(os.path.join(ordner, "ads-kasten-mitte.png"))
    k.crop((x1 - 2, 0, w, h)).save(os.path.join(ordner, "ads-kasten-rechts.png"))
    p = links.load()
    lw, lh = links.size
    gruen = [(x, y) for y in range(lh) for x in range(lw)
             if p[x, y][3] > 0 and p[x, y][1] > p[x, y][0] + 25 and p[x, y][1] > p[x, y][2] + 25]
    if not gruen:
        raise SystemExit("ads-kasten-roh.png: keine gruene Lampe gefunden")
    cx = sum(x for x, _ in gruen) / len(gruen)
    cy = sum(y for _, y in gruen) / len(gruen)
    r = max(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 for x, y in gruen) + 1.2
    lampe = Image.new("RGBA", links.size, DURCHSICHTIG)
    lp = lampe.load()
    for y in range(lh):
        for x in range(lw):
            if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 <= r and p[x, y][3] > 0:
                lp[x, y] = p[x, y]
    lampe.save(os.path.join(ordner, "ads-lampe.png"))


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
    # Nur die Platte dreht: ab TELLER_BIS (Schalter vorne) bleibt jedes Bild wie Bild 1,
    # sonst blinkt der Schalter in der Schleife (Janis 11.11.2026).
    streifen = Image.new("RGBA", (hw * 8, hh), (0, 0, 0, 0))
    sp = streifen.load()
    erstes = quelle("platte-dreht-1.png").load()
    for i in range(8):
        b = quelle("platte-dreht-%d.png" % (i + 1))
        bp = b.load()
        for y in range(hh):
            q = bp if y < TELLER_BIS else erstes
            for x in range(hw):
                if hp[x, y][3] > 0:
                    sp[i * hw + x, y] = q[x + dx, y + dy]
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


def wand_bild(ordner):
    """Holzwand hinter dem Raum (Janis 11.11.2026: Variante C). PixelLab hat links und
    rechts je eine 256x192-Haelfte der 504x192-Leinwand (Raum bei x=80) ergaenzt.
    Zusammensetzen (links bis x 251, rechts ab 252) und ausstanzen: alles, was dem
    Raum-Bild gleicht, wird durchsichtig; uebrig bleibt nur der neue Aussenbereich."""
    links = quelle("raum-wand-links.png")
    rechts = quelle("raum-wand-rechts.png")
    raum = Image.open(os.path.join(ordner, "raum-tv-aus.png")).convert("RGBA")
    rp = raum.load()
    w, h = 504, 192
    wand = Image.new("RGBA", (w, h), DURCHSICHTIG)
    wand.paste(rechts, (w - 256, 0))
    wand.paste(links.crop((0, 0, 252, h)), (0, 0))
    wp = wand.load()
    for y in range(h):
        for x in range(80, 80 + 344):
            p = wp[x, y]
            r = rp[x - 80, y]
            if p[:3] == r[:3] or sum(r[:3]) >= 60:
                wp[x, y] = DURCHSICHTIG
            else:
                wp[x, y] = (p[0], p[1], p[2], 255)
    for y in range(h):
        for x in list(range(0, 80)) + list(range(80 + 344, w)):
            p = wp[x, y]
            wp[x, y] = (p[0], p[1], p[2], 255)
    wand.save(os.path.join(ordner, "raum-wand.png"))


def einfaerben(bild, farbe):
    """Rueckenfarbe (regal.json): L = round(0.299r+0.587g+0.114b), Kanal = round(L*farbe/255),
    Alpha bleibt. Gerundet wird halb nach oben (wie Math.round im Test)."""
    aus = bild.copy()
    ap = aus.load()
    for y in range(aus.size[1]):
        for x in range(aus.size[0]):
            r, g, b, a = ap[x, y]
            if a == 0:
                continue
            l = int(0.299 * r + 0.587 * g + 0.114 * b + 0.5)
            ap[x, y] = tuple(int(l * farbe[k] / 255 + 0.5) for k in range(3)) + (a,)
    return aus


def regal_bilder(ordner):
    """Regal neu (Janis' Wahl 11.11./12.11.2026, tools/raum-quellen/regal.json).
    regal.png = regal-basis.png mit der PixelLab-Mitte regal-neu.png bei (80, 0).
    regal-wand.png = Holzwand wie wand_bild (rechts bei x 248, links bis x 251), innen
    (x 80..423) ganz durchsichtig, weil das Regal darueber liegt. Ruecken je Art aus
    ruecken.png eingefaerbt, Karte und Rueckseite unveraendert kopiert."""
    j = REGAL
    regal = quelle("regal-basis.png")
    regal.paste(quelle("regal-neu.png"), (80, 0))
    regal.save(os.path.join(ordner, "regal.png"))

    w, h = 504, 192
    wand = Image.new("RGBA", (w, h), DURCHSICHTIG)
    wand.paste(quelle("regal-wand-rechts.png"), (w - 256, 0))
    wand.paste(quelle("regal-wand-links.png").crop((0, 0, 252, h)), (0, 0))
    wp = wand.load()
    for y in range(h):
        for x in range(w):
            if 80 <= x < 80 + 344:
                wp[x, y] = DURCHSICHTIG
            else:
                p = wp[x, y]
                wp[x, y] = (p[0], p[1], p[2], 255)
    wand.save(os.path.join(ordner, "regal-wand.png"))

    for streifen in ("regal-oben.png", "regal-unten.png"):
        shutil.copyfile(os.path.join(QUELLEN, streifen), os.path.join(ordner, streifen))

    r = j["ruecken"]
    b = r["bild"]
    roh = quelle("ruecken.png").crop((b["x"], b["y"], b["x"] + b["b"], b["y"] + b["h"]))
    if roh.size != (r["b"], r["h"]):
        raise SystemExit("ruecken.png: Ausschnitt %s statt %dx%d" % (roh.size, r["b"], r["h"]))
    for art, farbe in j["rueckenFarben"].items():
        einfaerben(roh, farbe).save(os.path.join(ordner, "ruecken-%s.png" % art))

    shutil.copyfile(os.path.join(QUELLEN, j["karte"]["datei"]), os.path.join(ordner, "karte.png"))
    shutil.copyfile(os.path.join(QUELLEN, j["rueckseite"]["datei"]), os.path.join(ordner, "karte-rueck.png"))
    hv = j["hover"]
    if quelle("hover-regal.png").size != (hv["b"], hv["h"]):
        raise SystemExit("hover-regal.png: Groesse passt nicht zu regal.json.hover")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Aufruf: raum-bilder.py <ordner>")
    ordner = sys.argv[1]
    ecken = tv_bilder(ordner)
    leben_bilder(ordner)
    wand_bild(ordner)
    regal_bilder(ordner)
    hover_und_platte(ordner)
    huelle_bilder(ordner)
    gross = huelle_gross(ordner)
    platten(ordner)
    zettel_schild(ordner)
    onair_schilder(ordner)
    leiste_tv(ordner)
    ads_kasten(ordner)
    print(json.dumps({"tvEcken": ecken, "grossFenster": gross}, separators=(",", ":")))


if __name__ == "__main__":
    main()
