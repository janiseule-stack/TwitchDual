# Glass-Transparenz + Akzent-Kontrast-Fix (v1.6.0) — Design

Datum: 2026-07-17 · Status: entworfen, von Janis abgenommen (Chat-Dialog)

## Ziel

1. **Transparenz-Slider:** Der Hintergrund beider Fenster (Video und Chat) wird
   per Slider durchsichtig — Text, Emotes, Badges, Glow und On-Air-Leiste
   bleiben voll kräftig. Getrennte Regler pro Fenster, wie bei den
   Akzentfarben aus v1.5.0.
2. **Bug-Fix:** Bei dunklen Akzentfarben (z. B. Schwarz) sind „Laden" und
   „+ Hinzufügen" unlesbar — fest verdrahteter dunkler Text `#041018` auf
   `var(--accent)`-Grund. Die Textfarbe muss aus der Helligkeit der
   Akzentfarbe abgeleitet werden.

## Entscheidungen (mit Janis abgestimmt)

- Nur der **Hintergrund** wird transparent, nicht der Inhalt.
- **Alle Flächen gleichmäßig** (Titelleiste, Inhaltsbereich, Footer,
  Home-Karten, Popup) — ein Alpha-Wert pro Fenster.
- Bereich **0–100 %** (0 % = komplett glasklar, nur Inhalt schwebt).
  Default 100 % (= heutige Optik, pixelidentisch).
- Video- und Chat-Fenster **getrennt** regelbar; Slider sitzen im
  ⚙-Popup des Chats unter den Farbwählern; der bestehende Reset-Button
  setzt Farben **und** Deckkraft zurück.

## Paket 1: Transparente Fenster

`main.js`: beide Fenster mit `transparent: true` und durchsichtiger
`backgroundColor` (`#00000000`) erstellen. Der sichtbare Grund kommt ab
jetzt ausschließlich aus dem CSS (Body-Hintergrund), das seinen Alpha aus
einer CSS-Variable bezieht.

Bekannte Nebenwirkungen (akzeptiert, im Smoke-Test prüfen):

- Der DWM-Fensterschatten entfällt.
- Maximieren/Snap randloser transparenter Fenster unter Windows testen
  (Ziehen, Größe ändern, ▢-Button, Win+Pfeil).

## Paket 2: Theme-Lib (`renderer/lib/theme.js`)

- **`clampAlpha(input)`**: Prozentwert 0–100 → Zahl; Strings/Müll/fehlend
  → 100 (nie unsichtbar durch kaputte Store-Werte); Grenzen geklemmt,
  Rundung auf ganze Prozent.
- **Flächen als RGB-Triplets:** `accentVars` liefert zusätzlich
  `--panel-rgb` („r, g, b" des getönten Panels) und es gibt eine Konstante
  `--bg-rgb` (11, 11, 17). CSS nutzt
  `rgba(var(--panel-rgb), var(--bg-alpha))` statt festem Hex — ein
  einziger Alpha-Wert (`--bg-alpha`, 0–1) steuert alle Flächen.
- **`accentContrast(hex)`** (Bug-Fix): wählt zwischen dunklem Text
  `#041018` und hellem Text `#f2f6ff` den mit dem **höheren
  WCAG-Kontrastverhältnis** zur Akzentfarbe (relative Luminanz +
  Kontrastformel, keine magische Schwelle). Für die Defaults Cyan und
  Magenta ergibt das wie bisher dunklen Text; für Schwarz/dunkle Farben
  hellen Text. Wird als `--accent-contrast` ausgegeben und
  ersetzt die zwei fest verdrahteten `color: #041018` (video/index.html
  `#load`, video/home.css Add-Button). Zusätzlich bekommen gefüllte
  Akzent-Buttons einen dezenten neutralen Rand
  (`1px solid rgba(255, 255, 255, .14)`), damit ein schwarzer Button vor
  dem fast schwarzen Grund nicht verschwindet.

Alles DOM-frei und unit-getestet (wie normalizeHex/accentVars).

## Paket 3: Prefs + IPC (`themePrefs`)

- Store-Erweiterung: `themePrefs.videoAlpha` und `themePrefs.chatAlpha`
  (ganze Prozent 0–100, Default 100). Alte Stores ohne die Felder fallen
  über `clampAlpha` sauber auf 100 zurück.
- Gleicher Ablauf wie bei den Akzentfarben: Slider-`input` →
  `theme-preview` (live in beide Fenster), Speichern → `theme-save` +
  `theme-changed`-Broadcast. Keine neuen IPC-Kanäle, die bestehenden
  Nachrichten transportieren die zwei neuen Felder mit.

## Paket 4: UI (⚙-Popup im Chat)

Unter den beiden Farbwählern je ein Slider „Deckkraft" (0–100, Schritt 5)
mit Prozent-Anzeige (Monospace, wie msg/min): einer für das Video-, einer
für das Chat-Fenster. Live-Vorschau beim Ziehen, Reset setzt beide auf
100 % zurück.

## Fehlerfälle

- Kaputte/fehlende Alpha-Werte im Store → 100 % (clampAlpha).
- Kaputte Akzentfarbe → Kontrastfarbe des Defaults (accentContrast
  normalisiert intern wie accentVars).
- 0 % + heller Desktop dahinter: bewusst erlaubt (Janis' Entscheidung);
  kein automatisches Lesbarkeits-Netz.

## Tests

- Unit (DOM-frei): clampAlpha (Grenzen, Müll, Default), accentContrast
  (helle Farbe → dunkler Text, dunkle Farbe → heller Text, Schwelle,
  Müll → Default-Verhalten), accentVars liefert `--panel-rgb` passend
  zum bisherigen `--panel`.
- Bestehende Suite bleibt grün (106 Tests, Stand v1.5.0).
- Manueller Smoke-Test: beide Fenster bei 100 % pixelgleich zu v1.5.0;
  Slider live; 0 % lesbar-scharfer Text über Desktop; Ziehen/Resize/
  Maximieren/Snap; Schwarz als Akzent → „Laden"/„+ Hinzufügen" lesbar.

## Release

Version 1.6.0, TODO.md-Eintrag, Release-Ablauf wie in docs/TODO.md
(EXE/Blockmap auf Bindestrich-Namen, `gh release create v1.6.0 …`).
