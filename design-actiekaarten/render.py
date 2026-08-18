from playwright.sync_api import sync_playwright
from PIL import Image
import json, pathlib, io

MAP = json.loads(pathlib.Path('render/map.json').read_text())
out = pathlib.Path('/home/user/axiom-9/src/assets/cards')
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    # 2x renderen en daarna netjes verkleinen naar 520 breed = scherper dan direct klein renderen
    pg = b.new_page(viewport={"width":630,"height":880}, device_scale_factor=2)
    for fn, kid in MAP.items():
        pg.goto(f"file:///home/user/axiom-9/design-actiekaarten/render/{kid}.html")
        pg.wait_for_timeout(700)
        raw = pg.locator("div").first.screenshot()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = img.resize((520, 726), Image.LANCZOS)
        img.save(out / f"{kid}.webp", "WEBP", quality=80, method=6)
        print(f"{kid}.webp  {img.width}x{img.height}  {(out / (kid+'.webp')).stat().st_size/1024:.1f} KB")
    b.close()
