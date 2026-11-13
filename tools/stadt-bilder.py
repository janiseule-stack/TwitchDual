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
HAEUSER_BIS = 240
# Fusslinie der Passanten (Gehweg) und Unterkante der Fahrzeuge (Fahrbahn)
GEHWEG_Y = 251
FAHRBAHN_Y = 272
# Gehzyklus: 8 PixelLab-Bilder je Passant, Tempo
FIGUR_BILDER = 8
FIGUR_MS_PRO_BILD = 120
FIGUR_PX_PRO_BILD = 2
PASSANTEN = ("a", "b")
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


def main(quellen, ziel, json_pfad):
    grund = lade(quellen, "grund.png")
    licht = lade(quellen, "haeuser-licht.png")
    blitz = lade(quellen, "himmel-blitz.png")
    w, h = grund.size
    if licht.size != (w, h) or blitz.size != (w, h):
        raise SystemExit("Stadt-Ebenen haben unterschiedliche Masse")

    fenster = fenster_finden(grund, licht)
    for f in fenster:
        if f["y"] < HIMMEL_BIS or f["y"] + f["h"] > HAEUSER_BIS:
            raise SystemExit("Fenster ausserhalb der Haeuser: %r" % f)
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

    masse = {}
    for quelle_name, ziel_name, schluessel in (
        ("auto.png", "stadt-auto.png", "auto"),
        ("bus.png", "stadt-bus.png", "bus"),
        ("bus-tuer.png", "stadt-bus-tuer.png", None),
        ("regen-hinten.png", "stadt-regen-hinten.png", "regen"),
        ("regen-vorn.png", "stadt-regen-vorn.png", None),
    ):
        bild = lade(quellen, quelle_name)
        bild.save(os.path.join(ziel, ziel_name))
        if schluessel:
            masse[schluessel] = {"b": bild.size[0], "h": bild.size[1]}

    daten = {
        "bild": {"b": w, "h": h},
        "ebenen": {
            "himmel": {"y": 0, "h": HIMMEL_BIS},
            "haeuser": {"y": HIMMEL_BIS, "h": HAEUSER_BIS - HIMMEL_BIS},
            "strasse": {"y": HAEUSER_BIS, "h": h - HAEUSER_BIS},
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
        "auto": masse["auto"],
        "bus": masse["bus"],
        "regen": masse["regen"],
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
