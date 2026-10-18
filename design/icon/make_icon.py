# -*- coding: utf-8 -*-
"""
GithubTrending 小程序头像生成器 v3
- 4 倍超采样后降采样，消除折线锯齿
- 三个方案：A 箭头折线 / B 递增柱+星 / C 星+上升折线
- 每方案输出 1024 主图 + 144 上传图，并生成多尺寸/遮罩/剪影预览
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))

BASE = 1024          # 逻辑坐标基准
K = 4                # 超采样倍率
S = BASE * K         # 实际画布


def L(v):            # 逻辑坐标 → 画布坐标
    return v * K


BG_TOP = (17, 23, 32)
BG_BOT = (7, 10, 14)
GREEN = (63, 185, 80)
TEAL = (52, 190, 168)
BLUE = (79, 156, 249)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# ------------------------------------------------------------------ 画布
def vertical_gradient(size, top, bottom):
    img = Image.new('RGB', (size, size), top)
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(top, bottom, (y / (size - 1)) ** 0.9))
    return img


def radial_layer(size, center, radius, color, strength=1.0, steps=90):
    layer = Image.new('RGB', (size, size), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = (1 - i / steps) ** 2.2
        d.ellipse(
            [center[0] - r, center[1] - r, center[0] + r, center[1] + r],
            fill=tuple(int(color[k] * a * strength * 0.5) for k in range(3)),
        )
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.06))


def screen(base, add_img):
    b = np.asarray(base).astype(np.int16)
    a = np.asarray(add_img).astype(np.int16)
    return Image.fromarray(np.clip(b + a, 0, 255).astype('uint8'))


def base_canvas(glow_color=(50, 120, 190), glow_at=(0.66, 0.30), glow_r=600, strength=1.0):
    img = vertical_gradient(S, BG_TOP, BG_BOT)
    r = radial_layer(S, (L(glow_at[0] * BASE), L(glow_at[1] * BASE)), L(glow_r), glow_color, strength)
    return screen(img, r)


# ------------------------------------------------------------------ 绘图基元
def polyline_grad(d, pts, width, c0, c1):
    """按段渐变的折线，关节补圆，保证圆头圆角"""
    pts = [(L(p[0]), L(p[1])) for p in pts]
    w = int(L(width))
    n_seg = len(pts) - 1
    for i in range(n_seg):
        p, q = pts[i], pts[i + 1]
        sub = max(8, int(math.hypot(q[0] - p[0], q[1] - p[1]) / L(6)))
        for s in range(sub):
            a = (p[0] + (q[0] - p[0]) * s / sub, p[1] + (q[1] - p[1]) * s / sub)
            b = (p[0] + (q[0] - p[0]) * (s + 1) / sub, p[1] + (q[1] - p[1]) * (s + 1) / sub)
            t = (i + (s + 0.5) / sub) / n_seg
            d.line([a, b], fill=lerp(c0, c1, t), width=w)
    r = w / 2.0
    for i, p in enumerate(pts):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=lerp(c0, c1, i / n_seg))


def chevron_head(d, tip, ang, length, width, color, half_deg=28):
    """两笔粗线构成的箭头，与线宽一致，接缝自然"""
    tip = (L(tip[0]), L(tip[1]))
    w = int(L(width))
    half = math.radians(half_deg)
    for sign in (-1, 1):
        a = ang + math.pi + sign * half
        end = (tip[0] + L(length) * math.cos(a), tip[1] + L(length) * math.sin(a))
        d.line([tip, end], fill=color, width=w)
        r = w / 2.0
        d.ellipse([end[0] - r, end[1] - r, end[0] + r, end[1] + r], fill=color)
    r = w / 2.0
    d.ellipse([tip[0] - r, tip[1] - r, tip[0] + r, tip[1] + r], fill=color)


def star_pts(cx, cy, outer, inner, n=5, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = outer if i % 2 == 0 else inner
        a = rot + i * math.pi / n
        pts.append((L(cx + r * math.cos(a)), L(cy + r * math.sin(a))))
    return pts


def soft_glow_polyline(pts, width, c0, c1, blur=22, strength=0.5):
    layer = Image.new('RGB', (S, S), (0, 0, 0))
    polyline_grad(ImageDraw.Draw(layer), pts, width * 1.6, c0, c1)
    layer = layer.filter(ImageFilter.GaussianBlur(L(blur)))
    return Image.fromarray((np.asarray(layer).astype(np.float32) * strength).astype('uint8'))


# ------------------------------------------------------------------ A 箭头折线
def variant_a():
    img = base_canvas(glow_color=(45, 115, 185), glow_at=(0.68, 0.28))
    pts = [(168, 786), (352, 676), (472, 716), (666, 434)]
    tip = (826, 224)
    ang = math.atan2(tip[1] - pts[-1][1], tip[0] - pts[-1][0])

    img = screen(img, soft_glow_polyline(pts + [tip], 106, GREEN, BLUE, blur=24, strength=0.45))

    d = ImageDraw.Draw(img)
    polyline_grad(d, pts, 106, GREEN, BLUE)
    # 从最后一点到箭尖那一段也用渐变收尾
    d.line(
        [(L(pts[-1][0]), L(pts[-1][1])), (L(tip[0]), L(tip[1]))],
        fill=lerp(GREEN, BLUE, 0.92),
        width=int(L(106)),
    )
    chevron_head(d, tip, ang, 214, 106, lerp(GREEN, BLUE, 1.0), half_deg=27)
    return img.resize((BASE, BASE), Image.LANCZOS)


# ------------------------------------------------------------------ B 递增柱 + 星
def variant_b():
    img = base_canvas(glow_color=(52, 150, 150), glow_at=(0.5, 0.44), glow_r=560, strength=0.8)

    bars = [
        (196, 560, 140, GREEN),
        (392, 412, 140, TEAL),
        (588, 256, 140, BLUE),
    ]
    bottom = 822

    glow = Image.new('RGB', (S, S), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for x, top, w, col in bars:
        gd.rounded_rectangle([L(x), L(top), L(x + w), L(bottom)], radius=int(L(w / 2)), fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(L(24)))
    img = screen(img, Image.fromarray((np.asarray(glow).astype(np.float32) * 0.42).astype('uint8')))

    d = ImageDraw.Draw(img)
    for x, top, w, col in bars:
        d.rounded_rectangle([L(x), L(top), L(x + w), L(bottom)], radius=int(L(w / 2)), fill=col)

    # 星：浮在最高柱上方，留一点缝隙，小尺寸下不会与柱子糊成一团
    d.polygon(star_pts(658, 150, 122, 51), fill=WHITE)
    return img.resize((BASE, BASE), Image.LANCZOS)


# ------------------------------------------------------------------ C 星 + 上升折线
def variant_c():
    img = base_canvas(glow_color=(60, 130, 175), glow_at=(0.62, 0.34))
    pts = [(150, 858), (330, 776), (466, 806), (640, 690), (868, 596)]

    img = screen(img, soft_glow_polyline(pts, 84, GREEN, BLUE, blur=22, strength=0.42))
    d = ImageDraw.Draw(img)
    polyline_grad(d, pts, 84, GREEN, BLUE)

    # 星在上方，与折线分离，小尺寸剪影清晰
    d.polygon(star_pts(512, 372, 262, 110), fill=WHITE)
    return img.resize((BASE, BASE), Image.LANCZOS)


# ------------------------------------------------------------------ 导出 / 预览
def export(img, name):
    img.save(os.path.join(OUT, name + '.png'))
    img.resize((144, 144), Image.LANCZOS).save(os.path.join(OUT, name + '-144.png'))


def rounded(img, radius_logical):
    m = Image.new('L', img.size, 0)
    r = int(radius_logical * img.size[0] / BASE)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=r, fill=255)
    o = img.convert('RGBA')
    o.putalpha(m)
    return o


def circle_crop(img):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    o = img.convert('RGBA')
    o.putalpha(m)
    return o


def silhouette(img, size=72):
    g = np.asarray(img.convert('L').resize((size, size), Image.LANCZOS)).astype(np.float32)
    g = np.clip((g - 34) * 2.3, 0, 255).astype('uint8')
    return Image.fromarray(g).convert('RGB')


def make_sheet(items):
    pad, cw = 36, 320
    W = pad * 2 + cw * len(items)
    sheet = Image.new('RGB', (W, 800), (11, 14, 20))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 24)
    fs = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 17)

    for i, (label, img) in enumerate(items):
        x = pad + i * cw
        big = rounded(img, 232).resize((200, 200), Image.LANCZOS)
        sheet.paste(big, (x + 46, 44), big)
        d.text((x + 46, 256), label, font=f, fill=(235, 240, 247))

        xs = x + 40
        for size in (96, 72, 48, 32):
            sm = rounded(img, 232).resize((size, size), Image.LANCZOS)
            sheet.paste(sm, (xs, 300 + (96 - size)), sm)
            xs += size + 14

        c = circle_crop(img).resize((92, 92), Image.LANCZOS)
        sheet.paste(c, (x + 40, 412), c)

        sheet.paste(silhouette(img, 72).resize((92, 92), Image.NEAREST), (x + 156, 412))
        d.text((x + 40, 520), '96 / 72 / 48 / 32  ·  圆形  ·  剪影', font=fs, fill=(118, 130, 146))

    # 浅色底对照：微信小程序列表 / 搜索结果是白底，深色图标会不会糊成一块黑
    strip_y = 566
    d.rounded_rectangle([pad, strip_y, W - pad, strip_y + 190], radius=18, fill=(255, 255, 255))
    d.text((pad + 24, strip_y + 18), '浅色底实际观感（微信列表语境）', font=fs, fill=(70, 78, 90))
    xs = pad + 24
    for label, img in items:
        for size in (76, 60, 44):
            sm = rounded(img, 232).resize((size, size), Image.LANCZOS)
            sheet.paste(sm, (xs, strip_y + 62 + (76 - size) // 2), sm)
            xs += size + 12
        xs += 26
    return sheet


if __name__ == '__main__':
    items = [
        ('A · 箭头折线', variant_a()),
        ('B · 递增柱 + 星', variant_b()),
        ('C · 星 + 上升折线', variant_c()),
    ]
    names = ['icon-a-arrow', 'icon-b-bars', 'icon-c-star']
    for (label, img), name in zip(items, names):
        export(img, name)
        print('saved', name)
    make_sheet(items).save(os.path.join(OUT, 'icon-sheet-v3.png'))
    print('saved icon-sheet-v3.png')
    for f in ('icon-a2-arrow.png', 'icon-b2-bars.png', 'icon-c2-type.png', 'icon-sheet-v2.png',
              'icon-a2-arrow-144.png', 'icon-b2-bars-144.png', 'icon-c2-type-144.png'):
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            os.remove(p)
    print('旧版产物已清理')
