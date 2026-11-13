#!/usr/bin/env python3
"""Erzeugt die Bilder der Chat-Stadt (Regennacht) und tools/raum-quellen/stadt.json.

Aufruf:  python -I tools/stadt-bilder.py tools/raum-quellen/stadt renderer/themes/cozy tools/raum-quellen/stadt.json

Quellen sind die von Janis gewaehlten PixelLab-Bilder (Plan 2026-11-13-chat-stadt,
"Janis' Wahl"). Es wird nichts selbst gezeichnet: nur kopieren, aneinanderreihen,
Unterschiede ausstanzen.
"""
import json
import os
import sys

from PIL import Image

# Ebenen-Grenzen im 344x277-Bild (gemessen 13.11.2026): Blitz reicht bis y 73,
# Daecher beginnen bei ~123, Fenster liegen in y 145..232, Gehweg ab y 244.
HIMMEL_BIS = 125
# Fusslinie der Passanten (Gehweg) und Unterkante der Fahrzeuge (Fahrbahn)
GEHWEG_Y = 251
FAHRBAHN_Y = 272
# Autos 1,4x (Janis 13.11.2026), vier Farben, zufaellig gemischt
AUTOS = ("a", "b", "c", "d")
# Bus: Mitte der Vordertuer (gemessen an bus.png 176x56: Tuer x 129..147)
BUS_TUER_X = 138
# Regen hinten: PixelLab-Effekt (vfx_workbench "TwitchDual Stadt-Regen 3 Ebenen"), Game-Pack in
# regen-vfx/. Lage des Effekt-Ankers im Stadtbild: Teil rain_ripples (Effekt 54,255) = Stadt 50,272.
REGEN_VERSATZ = (-4, 17)
# Himmel: eigener Effekt „TwitchDual Stadt-Regen Himmel schraeg“ (schraege Striche aus der
# PixelLab-Vorlage slant_rain, gleiche Richtung wie die im Stadtbild eingemalten), Paket in
# regen-vfx-himmel/ (gleiche Leinwand und gleicher Anker wie regen-vfx/).
REGEN_EBENEN = (
    ("himmel", "regen-vfx-himmel", ("whole",)),
    ("strasse", "regen-vfx", ("part-strasse", "part-rain_ripples")),
)
# Gehzyklus: 8 PixelLab-Bilder je Passant, Tempo
FIGUR_BILDER = 8
FIGUR_MS_PRO_BILD = 120
FIGUR_PX_PRO_BILD = 2
# a/b: erste Wahl; c..g (13.11.): gelbe/olive Kapuze, roter Schirm mit Tuete, blauer Schirm, Hut
PASSANTEN = ("a", "b", "c", "d", "e", "f", "g")
# Blitz-Strahl (vfx_workbench „TwitchDual Stadt-Blitz“, blitz-vfx/): Oberkante im Bild, endet in der Skyline
STRAHL_Y = 50
# Kleinste Fensterflaeche (Bildpixel je Seite)
FENSTER_MINDEST = 2


def lade(quellen, name):
    return Image.open(os.path.join(quellen, name)).convert("RGBA")


def fenster_finden(dunkel, hell):
    """Zusammenhaengende Flaechen, in denen sich dunkle und helle Variante unterscheiden."""
    w, h = dunkel.size
    dp, hp = dunkel.load(), hell.load()
    anders = {(x, y) for y in range(h) for x in range(w) if dp[x, y] != hp[x, y]}
    gesehen = set()
    fenster = []
    for start in sorted(anders, key=lambda p: (p[1], p[0])):
        if start in gesehen:
            continue
        stapel = [start]
        gesehen.add(start)
        punkte = []
        while stapel:
            x, y = stapel.pop()
            punkte.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in anders and n not in gesehen:
                    gesehen.add(n)
                    stapel.append(n)
        xs = [p[0] for p in punkte]
        ys = [p[1] for p in punkte]
        x0, y0 = min(xs), min(ys)
        b, hh = max(xs) - x0 + 1, max(ys) - y0 + 1
        if b >= FENSTER_MINDEST and hh >= FENSTER_MINDEST:
            fenster.append({"x": x0, "y": y0, "b": b, "h": hh})
    fenster.sort(key=lambda f: (f["y"], f["x"]))
    return fenster


def nur_unterschied(grund, variante):
    """Variante, aber durchsichtig ueberall dort, wo sie dem Grundbild gleicht."""
    w, h = grund.size
    gp, vp = grund.load(), variante.load()
    aus = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ap = aus.load()
    for y in range(h):
        for x in range(w):
            if gp[x, y] != vp[x, y]:
                ap[x, y] = vp[x, y]
    return aus


def streifen(quellen, kennung):
    bilder = [lade(quellen, "passant-%s-%d.png" % (kennung, i)) for i in range(1, FIGUR_BILDER + 1)]
    b, h = bilder[0].size
    aus = Image.new("RGBA", (b * len(bilder), h), (0, 0, 0, 0))
    for i, bild in enumerate(bilder):
        if bild.size != (b, h):
            raise SystemExit("passant-%s-%d.png hat andere Masse" % (kennung, i + 1))
        aus.paste(bild, (i * b, 0))
    return aus, b, h


def regen_streifen(quellen, groesse, ziel):
    """Setzt die Teile der PixelLab-Effekte je Ebene an ihre Stelle im Stadtbild und
    reiht die Bilder zu einem Streifen (bilder x Stadtbreite). Nur einsetzen, nichts zeichnen."""
    w, h = groesse
    dateien = []
    n = ms = None
    for ebene, ordner, praefixe in REGEN_EBENEN:
        vfx_ordner = os.path.join(quellen, ordner)
        with open(os.path.join(vfx_ordner, "manifest.json"), encoding="utf-8") as f:
            m = json.load(f)
        if n is not None and (m["frames"], m["frame_ms"]) != (n, ms):
            raise SystemExit("Regen-Effekte haben unterschiedliche Bildzahl/Takt")
        n, ms = m["frames"], m["frame_ms"]
        ax, ay = m["anchor"]["x"], m["anchor"]["y"]
        streifen_bild = Image.new("RGBA", (w * n, h), (0, 0, 0, 0))
        clips = [c for c in m["clips"] if c["name"].startswith(praefixe)]
        if not clips:
            raise SystemExit("regen-vfx: keine Teile fuer " + ebene)
        for c in clips:
            sh = c["sheets"][0]
            bogen = Image.open(os.path.join(vfx_ordner, sh["file"])).convert("RGBA")
            fw, fh = c["frame"]["w"], c["frame"]["h"]
            px = ax + c["offset"]["x"] + REGEN_VERSATZ[0]
            py = ay + c["offset"]["y"] + REGEN_VERSATZ[1]
            for i in range(n):
                col, row = i % sh["columns"], i // sh["columns"]
                bild = bogen.crop((col * fw, row * fh, col * fw + fw, row * fh + fh))
                lage = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                lage.paste(bild, (px, py))
                teil = streifen_bild.crop((i * w, 0, i * w + w, h))
                teil.alpha_composite(lage)
                streifen_bild.paste(teil, (i * w, 0))
        name = "stadt-regen-%s.png" % ebene
        streifen_bild.save(os.path.join(ziel, name))
        dateien.append(name)
    return dateien, n, ms


def strahl_streifen(quellen, ziel):
    """Blitz-Effekt (Blatt + Bildliste) als waagrechter Bildstreifen. Nur umordnen."""
    ordner = os.path.join(quellen, "blitz-vfx")
    with open(os.path.join(ordner, "blitz.json"), encoding="utf-8") as f:
        m = json.load(f)
    blatt = Image.open(os.path.join(ordner, "blitz.png")).convert("RGBA")
    rahmen = [b["frame"] for b in m["frames"]]
    w, h = rahmen[0]["w"], rahmen[0]["h"]
    aus = Image.new("RGBA", (w * len(rahmen), h), (0, 0, 0, 0))
    for i, r in enumerate(rahmen):
        aus.paste(blatt.crop((r["x"], r["y"], r["x"] + w, r["y"] + h)), (i * w, 0))
    aus.save(os.path.join(ziel, "stadt-blitz-strahl.png"))
    return {"b": w, "h": h, "bilder": len(rahmen), "msProBild": m["frames"][0]["duration"], "y": STRAHL_Y}


def main(quellen, ziel, json_pfad):
    grund = lade(quellen, "grund.png")
    licht = lade(quellen, "haeuser-licht.png")
    blitz = lade(quellen, "himmel-blitz.png")
    w, h = grund.size
    if licht.size != (w, h) or blitz.size != (w, h):
        raise SystemExit("Stadt-Ebenen haben unterschiedliche Masse")

    fenster = fenster_finden(grund, licht)
    for f in fenster:
        if f["y"] < HIMMEL_BIS:
            raise SystemExit("Fenster im Himmel: %r" % f)
    blitz_ebene = nur_unterschied(grund, blitz)
    box = blitz_ebene.getbbox()
    if not box or box[3] > HIMMEL_BIS:
        raise SystemExit("Blitz reicht unter den Himmel: %r" % (box,))

    # Helle Haeuser: nur die erkannten Fenster aus der hellen Variante ausstanzen,
    # einzelne Splitter-Pixel (kleiner als FENSTER_MINDEST) bleiben dunkel.
    hell = grund.copy()
    for f in fenster:
        box_f = (f["x"], f["y"], f["x"] + f["b"], f["y"] + f["h"])
        hell.paste(licht.crop(box_f), box_f[:2])

    grund.save(os.path.join(ziel, "stadt.png"))
    hell.save(os.path.join(ziel, "stadt-haeuser-licht.png"))
    blitz_ebene.save(os.path.join(ziel, "stadt-himmel-blitz.png"))

    varianten = []
    fb = fh = 0
    for k in PASSANTEN:
        bild, fb, fh = streifen(quellen, k)
        name = "stadt-passant-%s.png" % k
        bild.save(os.path.join(ziel, name))
        varianten.append(name)

    auto_varianten = []
    auto_masse = None
    rad_y = 0
    for k in AUTOS:
        bild = lade(quellen, "auto-%s.png" % k)
        if auto_masse and bild.size != auto_masse:
            raise SystemExit("auto-%s.png hat andere Masse" % k)
        auto_masse = bild.size
        rad_y = max(rad_y, bild.getbbox()[3] - 1)
        name = "stadt-auto-%s.png" % k
        bild.save(os.path.join(ziel, name))
        auto_varianten.append(name)
    bus = lade(quellen, "bus.png")
    bus_tuer = lade(quellen, "bus-tuer.png")
    if bus_tuer.size != bus.size:
        raise SystemExit("bus-tuer.png hat andere Masse als bus.png")
    bus.save(os.path.join(ziel, "stadt-bus.png"))
    bus_tuer.save(os.path.join(ziel, "stadt-bus-tuer.png"))

    regen_dateien, regen_bilder, regen_ms = regen_streifen(quellen, (w, h), ziel)

    # Strassenband: von der Oberkante der hoechsten Figur (Passant/Auto) bis unten
    strasse_y = min(GEHWEG_Y - fh, FAHRBAHN_Y - auto_masse[1])

    daten = {
        "bild": {"b": w, "h": h},
        "ebenen": {
            "himmel": {"y": 0, "h": HIMMEL_BIS},
            "haeuser": {"y": HIMMEL_BIS, "h": strasse_y - HIMMEL_BIS},
            "strasse": {"y": strasse_y, "h": h - strasse_y},
        },
        "fenster": fenster,
        "figur": {
            "b": fb,
            "h": fh,
            "bilder": FIGUR_BILDER,
            "msProBild": FIGUR_MS_PRO_BILD,
            "pxProBild": FIGUR_PX_PRO_BILD,
            "varianten": varianten,
        },
        "auto": {"b": auto_masse[0], "h": auto_masse[1], "radY": rad_y, "varianten": auto_varianten},
        "bus": {"b": bus.size[0], "h": bus.size[1], "tuerX": BUS_TUER_X},
        "regen": {"bilder": regen_bilder, "msProBild": regen_ms, "dateien": regen_dateien},
        "strahl": strahl_streifen(quellen, ziel),
        # Lage der leuchtenden Wolke (Blitz-Ebene): der Strahl kommt aus ihr
        "blitzWolke": {"x": box[0], "y": box[1], "b": box[2] - box[0], "h": box[3] - box[1]},
        "gehwegY": GEHWEG_Y,
        "fahrbahnY": FAHRBAHN_Y,
    }
    with open(json_pfad, "w", encoding="utf-8", newline="\n") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(json.dumps({"fenster": len(fenster), "blitz": box}))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
