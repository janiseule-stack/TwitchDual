"""App-Icon aus dem PixelLab-Bild (Janis' Wahl 13.11.2026: Fernseher 08).

Aufruf: python -I tools/icon-bauen.py <quelle.png> <icon.ico> <app-icon.png>
Nur skalieren, nicht zeichnen: ab 64 px ganzzahlig per NEAREST (Pixel bleiben scharf),
darunter LANCZOS (Taskleiste 16-48 px). Die .ico enthaelt jede Groesse als eigenes Bild.
"""
import sys
from PIL import Image

GROESSEN = [16, 24, 32, 48, 64, 128, 256]


def stufe(quelle, s):
    if s >= quelle.width and s % quelle.width == 0:
        return quelle.resize((s, s), Image.NEAREST)
    return quelle.resize((s, s), Image.LANCZOS)


def main(quelle_pfad, ico_pfad, png_pfad):
    quelle = Image.open(quelle_pfad).convert('RGBA')
    if quelle.size != (64, 64):
        raise SystemExit('Quelle muss 64x64 sein, ist %sx%s' % quelle.size)
    bilder = [stufe(quelle, s) for s in GROESSEN]
    groesstes = bilder[-1]
    groesstes.save(ico_pfad, format='ICO', sizes=[(s, s) for s in GROESSEN], append_images=bilder[:-1])
    groesstes.save(png_pfad)
    print(ico_pfad, png_pfad)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
