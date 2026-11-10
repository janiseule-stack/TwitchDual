"""Baut die Pixel-Knoepfe der Leisten (Cozy-Raum) als fertige 32x32-Bilder.

Aufruf: python tools/knopf-bilder.py renderer/themes/cozy [VORSCHAU.png]

Jeder Knopf traegt sein Zeichen schon im Bild, damit es pixelgenau mittig auf
der Flaeche sitzt (Schriftzeichen sassen je nach Zeichen schief und waren
schlecht zu erkennen, Janis 10.11.2026). Farben stammen aus dem gewaehlten
Knopf (Entwurf knopf-27): brauner Rahmen, warme Flaeche, dunkles Zeichen.
"""
import sys
from PIL import Image

RAND = (18, 5, 5, 255)          # Aussenlinie, = --accent-contrast
RAHMEN = (122, 74, 44, 255)
RAHMEN_HELL = (150, 94, 56, 255)
FLAECHE = (190, 112, 54, 255)
FLAECHE_HELL = (214, 136, 70, 255)
SCHATTEN = (132, 72, 38, 255)
ZEICHEN = (18, 5, 5, 255)

# Zeichen auf einem 12x11-Raster ('#' = gesetzt).
ZEICHEN_BILDER = {
    'min': [
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '.##########.',
        '.##########.',
        '............',
        '............',
    ],
    'max': [
        '.##########.',
        '.##########.',
        '.##......##.',
        '.##......##.',
        '.##......##.',
        '.##......##.',
        '.##......##.',
        '.##......##.',
        '.##########.',
        '.##########.',
        '............',
    ],
    'zu': [
        '.##......##.',
        '.###....###.',
        '..###..###..',
        '...######...',
        '....####....',
        '....####....',
        '...######...',
        '..###..###..',
        '.###....###.',
        '.##......##.',
        '............',
    ],
    'zahnrad': [
        '....####....',
        '.##.####.##.',
        '.##########.',
        '..###..###..',
        '####....####',
        '####....####',
        '..###..###..',
        '.##########.',
        '.##.####.##.',
        '....####....',
        '............',
    ],
    'home': [
        '.##########.',
        '.##########.',
        '............',
        '............',
        '.##########.',
        '.##########.',
        '............',
        '............',
        '.##########.',
        '.##########.',
        '............',
    ],
    'teilen': [
        '############',
        '############',
        '##.....##.##',
        '##.....##.##',
        '##.....##.##',
        '##.....##.##',
        '##.....##.##',
        '##.....##.##',
        '############',
        '############',
        '............',
    ],
    'vollbild': [
        '####....####',
        '####....####',
        '##........##',
        '##........##',
        '............',
        '............',
        '##........##',
        '##........##',
        '####....####',
        '####....####',
        '............',
    ],
}


def grundknopf():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    # Aussenlinie 3..28 mit abgeschnittenen Ecken
    for i in range(4, 28):
        px[i, 3] = px[i, 28] = px[3, i] = px[28, i] = RAND
    # Rahmen 4..27
    for y in range(4, 28):
        for x in range(4, 28):
            px[x, y] = RAHMEN
    for x in range(4, 28):
        px[x, 4] = RAHMEN_HELL
    # Innenlinie 6..25
    for i in range(6, 26):
        px[i, 6] = px[i, 25] = px[6, i] = px[25, i] = RAND
    # Flaeche 7..24 x 7..21, darunter drei Zeilen Schatten (Knopf steht vor)
    for y in range(7, 25):
        for x in range(7, 25):
            px[x, y] = FLAECHE if y <= 21 else SCHATTEN
    for x in range(7, 25):
        px[x, 7] = FLAECHE_HELL
    return im


def mit_zeichen(name):
    im = grundknopf()
    px = im.load()
    bild = ZEICHEN_BILDER[name]
    # Flaeche 18x15 ab (7,7): 12x11 mittig -> Versatz (3, 2); die letzte
    # Rasterzeile ist leer, das Zeichen sitzt damit optisch mittig.
    for zy, zeile in enumerate(bild):
        for zx, c in enumerate(zeile):
            if c == '#':
                px[7 + 3 + zx, 7 + 3 + zy] = ZEICHEN
    return im


def main():
    ordner = sys.argv[1]
    grundknopf().save(f'{ordner}/knopf.png')
    fertig = []
    for name in ZEICHEN_BILDER:
        im = mit_zeichen(name)
        im.save(f'{ordner}/knopf-{name}.png')
        fertig.append(im)
    if len(sys.argv) > 2:
        f = 8
        bogen = Image.new('RGBA', (len(fertig) * (32 * f + 8) + 8, 32 * f + 16 + 48), (46, 22, 18, 255))
        for i, im in enumerate(fertig):
            gross = im.resize((32 * f, 32 * f), Image.NEAREST)
            bogen.paste(gross, (8 + i * (32 * f + 8), 8), gross)
            bogen.paste(im, (8 + i * (32 * f + 8), 32 * f + 16), im)
        bogen.save(sys.argv[2])


if __name__ == '__main__':
    main()
