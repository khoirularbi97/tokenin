"""Membuat semua ikon dan splash Tokenin dari satu desain (titik keypad berbentuk T).

Pemakaian (dari folder root proyek):  python3 tools/make-icons.py
Butuh Pillow:  pip install pillow
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (7, 11, 20, 255)          # #070B14
ON = (61, 224, 255, 255)       # #3DE0FF
OFF = (31, 43, 71, 255)        # #1F2B47
T_SHAPE = [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
SS = 4                         # supersampling supaya tepi bulat halus


def draw_mark(draw, cx, cy, height, on=ON, off=OFF):
    """Grid 3 x 4 titik, tinggi total = height, berpusat di (cx, cy)."""
    r = height / 9.5
    step = r * 2.5
    x0 = cx - step
    y0 = cy - 1.5 * step
    for i, active in enumerate(T_SHAPE):
        col, row = i % 3, i // 3
        x, y = x0 + col * step, y0 + row * step
        fill = on if active else off
        if fill is None:
            continue
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def render(size, mark_ratio, bg=BG, radius_ratio=0.0, on=ON, off=OFF):
    big = size * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        if radius_ratio:
            d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=bg)
        else:
            d.rectangle([0, 0, big, big], fill=bg)
    draw_mark(d, big / 2, big / 2, big * mark_ratio, on, off)
    return img.resize((size, size), Image.LANCZOS)


def render_rect(w, h, mark_height, bg=BG):
    sw, sh = w * 2, h * 2
    img = Image.new('RGBA', (sw, sh), bg)
    draw_mark(ImageDraw.Draw(img), sw / 2, sh / 2, mark_height * 2)
    return img.resize((w, h), Image.LANCZOS)


def save(img, rel):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print('ditulis', rel)


def main():
    # ---- Web / PWA ----
    save(render(192, 0.62, radius_ratio=0.2), 'frontend/public/icons/icon-192.png')
    save(render(512, 0.62, radius_ratio=0.2), 'frontend/public/icons/icon-512.png')
    save(render(512, 0.5), 'frontend/public/icons/maskable-512.png')          # zona aman 80%
    save(render(180, 0.6).convert('RGB'), 'frontend/public/icons/apple-touch-icon.png')

    # ---- Desktop (Electron) ----
    save(render(1024, 0.6, radius_ratio=0.22), 'desktop/build/icon.png')     # sumber ikon installer
    save(render(512, 0.6, radius_ratio=0.22), 'desktop/assets/icon.png')     # ikon jendela Linux
    save(render(32, 0.8, bg=None), 'desktop/assets/tray.png')                # tray Windows/Linux
    black = (0, 0, 0, 255)
    dim = (0, 0, 0, 90)
    save(render(16, 0.9, bg=None, on=black, off=dim), 'desktop/assets/trayTemplate.png')     # tray macOS
    save(render(32, 0.9, bg=None, on=black, off=dim), 'desktop/assets/trayTemplate@2x.png')

    # ---- Android ----
    res = Path('frontend/android/app/src/main/res')
    if (ROOT / res).exists():
        legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
        for dpi, px in legacy.items():
            save(render(px, 0.6, radius_ratio=0.2), res / f'mipmap-{dpi}/ic_launcher.png')
            round_img = render(px, 0.55)
            mask = Image.new('L', (px * SS, px * SS), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, px * SS - 1, px * SS - 1], fill=255)
            round_img.putalpha(mask.resize((px, px), Image.LANCZOS))
            save(round_img, res / f'mipmap-{dpi}/ic_launcher_round.png')
            # Ikon adaptif: 108dp, logo di zona aman 66dp tengah
            fg = px * 108 // 48
            save(render(fg, 0.42, bg=None), res / f'mipmap-{dpi}/ic_launcher_foreground.png')
        splash = {
            'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280),
            'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920),
        }
        for dpi, (w, h) in splash.items():
            save(render_rect(w, h, min(w, h) * 0.22).convert('RGB'), res / f'drawable-port-{dpi}/splash.png')
            save(render_rect(h, w, min(w, h) * 0.22).convert('RGB'), res / f'drawable-land-{dpi}/splash.png')
        save(render_rect(480, 320, 320 * 0.22).convert('RGB'), res / 'drawable/splash.png')

    # ---- iOS ----
    ios = Path('frontend/ios/App/App/Assets.xcassets')
    if (ROOT / ios).exists():
        save(render(1024, 0.6).convert('RGB'), ios / 'AppIcon.appiconset/AppIcon-512@2x.png')  # iOS menolak alpha
        splash = render_rect(2732, 2732, 2732 * 0.12).convert('RGB')
        for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
            save(splash, ios / f'Splash.imageset/{name}')


if __name__ == '__main__':
    main()
