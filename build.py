#!/usr/bin/env python3
"""
Bouwt de losse bronbestanden samen tot EEN zelfstandig HTML-bestand.

    python3 build.py

Resultaat: dist/axiom9.html  (werkt offline, kan gemaild/gedeeld worden)

Waarom een build-stap?
  Het logo is ~800 KB base64. Zolang dat in hetzelfde bestand zit als de code,
  moet dat hele blok meeverhuizen bij elke wijziging. Nu staat het apart in
  src/assets/logo.b64 en wordt het alleen bij het bouwen ingevoegd.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

# Volgorde is belangrijk: 00 eerst (data), daarna regels, dan UI.
JS_ORDER = [
    "00-data.js",
    "05-card-art.js",
    "10-rules.js",
    "20-connectivity.js",
    "30-random.js",
    "40-board.js",
    "50-interaction.js",
    "60-palette.js",
    "70-generator.js",
    "80-controls.js",
    "90-editor.js",
    "95-simulate.js",
    "96-walk.js",
    "97-solo.js",
    "98-cards.js",
]


def read(path: pathlib.Path) -> str:
    if not path.exists():
        sys.exit(f"FOUT: ontbrekend bestand {path}")
    return path.read_text(encoding="utf-8")


def build() -> pathlib.Path:
    template = read(SRC / "index.html")
    css = read(SRC / "styles.css")
    logo = read(SRC / "assets" / "logo.b64").strip()

    # --- tegeldata controleren en injecteren ---
    tiles_raw = read(SRC / "data" / "tiles.json")
    try:
        tiles = json.loads(tiles_raw)
    except json.JSONDecodeError as e:
        sys.exit(f"FOUT: tiles.json is geen geldige JSON -> {e}")

    missing = [str(k) for k in range(1, 21) if str(k) not in tiles.get("tiles", {})]
    if missing:
        sys.exit(f"FOUT: tegels ontbreken in tiles.json: {', '.join(missing)}")

    js_parts = []
    for name in JS_ORDER:
        chunk = read(SRC / "js" / name)
        js_parts.append(f"// ===== {name} =====\n{chunk}")
    js = "\n\n".join(js_parts)
    js = js.replace("{{TILES}}", json.dumps(tiles, separators=(",", ":")))

    if "{{TILES}}" in js:
        sys.exit("FOUT: {{TILES}} placeholder niet vervangen")

    html = template.replace("{{CSS}}", css)
    html = html.replace("{{JS}}", js)
    html = html.replace("{{LOGO}}", f"data:image/png;base64,{logo}")

    for leftover in re.findall(r"\{\{[A-Z]+\}\}", html):
        sys.exit(f"FOUT: placeholder {leftover} niet vervangen")

    DIST.mkdir(exist_ok=True)
    out = DIST / "axiom9.html"
    out.write_text(html, encoding="utf-8")
    return out


if __name__ == "__main__":
    out = build()
    kb = out.stat().st_size / 1024
    code_kb = sum(
        (SRC / "js" / n).stat().st_size for n in JS_ORDER
    ) / 1024 + (SRC / "styles.css").stat().st_size / 1024
    print(f"Gebouwd: {out}  ({kb:.0f} KB, waarvan {code_kb:.0f} KB code)")
