# -*- coding: utf-8 -*-
"""
생성한 고양이 아이콘을 2~4번 키캡 아이콘의 실측값에 맞춰 다듬고 1번 키에 합성한다.

  python scripts/fit_keycap_cat_icon.py assets/menu-keycap-cat-icon-v6-20260727.png

하는 일 네 가지 — 전부 measure 결과를 기준으로 한다.
  ① 선 색을 기준 아이콘 평균색으로 맞춤          (#a0561f 계열)
  ② 칠 색을 기준 아이콘 평균색으로 맞춤          (#fde7d2 계열)
  ③ 칠 안쪽 종이 질감을 기준 폭 안으로 눌러 줌   (생성 이미지는 결이 거칠다)
  ④ 선 굵기를 기준 폭 안으로 팽창                (모자라면 dilation)
그 뒤 원본 클립보드가 있던 자리에 정확히 얹는다(base 중심 310,346 / pressed 304,498).

주의: 한글이 많다. PowerShell 로 다시 쓰면 인코딩이 깨진다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"

# 2~4번 아이콘 실측 기준 (scripts/build_keycap_icon_compare_doc.py 출력)
TARGET_INK_HEX = (0xA0, 0x56, 0x1F)
TARGET_FILL_HEX = (0xFD, 0xE7, 0xD2)
# build_keycap_icon_report.py 가 재는 기준 폭(2~4번 아이콘)
STROKE_BAND = (4.49, 5.77)      # 아이콘 높이 대비 %
GRAIN_BAND = (1.38, 5.65)
GRAIN_TARGET = 3.5              # 기준 폭 한가운데를 겨냥한다

# 1번 키에서 원본 아이콘이 있던 자리.
# 눌림 레이어 2·3·4에도 1번 키가 통째로 그려져 있어서 다섯 장 전부 갈아야 한다
# (안 하면 다른 키를 누른 순간 1번만 옛 클립보드로 돌아간다).
# y 는 원본 클립보드 자리(40%)가 아니라 2~4번 아이콘의 자리(상면 높이의 44.5%)에 맞춘다.
# 원본 클립보드 자체가 다른 키보다 4%p 높이 붙어 있었다.
PLACEMENTS = [
    ("menu-keycaps-base-v4.png", "menu-keycaps-base-v5.png", (240, 430), 480, (311, 358), 128),
    ("menu-keycaps-pressed-1-v1.png", "menu-keycaps-pressed-1-v2.png", (400, 640), 470, (305, 508), 118),
    ("menu-keycaps-pressed-2-v1.png", "menu-keycaps-pressed-2-v2.png", (200, 470), 500, (310, 358), 128),
    ("menu-keycaps-pressed-3-v1.png", "menu-keycaps-pressed-3-v2.png", (200, 470), 500, (311, 358), 128),
    ("menu-keycaps-pressed-4-v1.png", "menu-keycaps-pressed-4-v2.png", (200, 470), 500, (311, 359), 128),
]


def ink_mask(array):
    red, green, blue, alpha = (array[:, :, i].astype(int) for i in range(4))
    return (alpha > 90) & (red < 190) & (green < 155) & (blue < 140)


def stroke_pct(mask, height):
    distance = ndimage.distance_transform_edt(mask)
    if not mask.any():
        return 0.0
    return float(np.percentile(distance[mask], 80) * 2 / height * 100)


def fit_icon(path):
    icon = Image.open(path).convert("RGBA")
    icon = icon.crop(icon.split()[3].getbbox())
    array = np.array(icon).astype(np.int16)
    ink = ink_mask(array)
    body = array[:, :, 3] > 90
    fill = body & ~ndimage.binary_dilation(ink, iterations=2)

    report = {"before_stroke": round(stroke_pct(ink, icon.height), 2)}

    # ① 선 색 이동 — 중앙값 차이만큼 평행이동해서 붓 결은 남긴다
    if ink.any():
        shift = np.array(TARGET_INK_HEX) - np.median(array[:, :, :3][ink], axis=0)
        for channel in range(3):
            array[ink, channel] = np.clip(array[ink, channel] + shift[channel], 0, 255)

    # ② 칠 색 이동
    if fill.any():
        shift = np.array(TARGET_FILL_HEX) - np.median(array[:, :, :3][fill], axis=0)
        for channel in range(3):
            array[fill, channel] = np.clip(array[fill, channel] + shift[channel], 0, 255)

    # ③ 칠 안쪽 결 누르기 — 선은 건드리지 않는다
    grey = np.array(Image.fromarray(array.astype(np.uint8), "RGBA").convert("L")).astype(np.float32)
    grain = float(np.abs(grey - ndimage.gaussian_filter(grey, 1.4))[fill].mean()) if fill.any() else 0.0
    report["before_grain"] = round(grain, 2)
    if grain > GRAIN_TARGET and fill.any():
        smoothed = np.stack(
            [ndimage.median_filter(array[:, :, c].astype(np.float32), size=7) for c in range(3)],
            axis=2,
        )
        strength = min(0.95, (grain - GRAIN_TARGET) / grain + 0.35)
        for channel in range(3):
            array[fill, channel] = (
                array[fill, channel] * (1 - strength) + smoothed[fill, channel] * strength
            )

    # ④ 선 굵기 — 모자라면 키운다
    result = Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), "RGBA")
    ink = ink_mask(np.array(result))
    current = stroke_pct(ink, result.height)
    grew = 0
    while current < STROKE_BAND[0] and grew < 14:
        grown = ndimage.binary_dilation(ink, iterations=2)
        new_pixels = grown & ~ink
        pixels = np.array(result)
        pixels[new_pixels, 0], pixels[new_pixels, 1], pixels[new_pixels, 2] = TARGET_INK_HEX
        pixels[new_pixels, 3] = 255
        result = Image.fromarray(pixels, "RGBA")
        ink = grown
        current = stroke_pct(ink, result.height)
        grew += 2
    report["after_stroke"] = round(current, 2)
    report["dilated_px"] = grew
    report["ink_pct"] = round(ink.mean() * 100, 1)
    grey = np.array(result.convert("L")).astype(np.float32)
    fill = (np.array(result)[:, :, 3] > 90) & ~ndimage.binary_dilation(ink, iterations=2)
    report["after_grain"] = round(
        float(np.abs(grey - ndimage.gaussian_filter(grey, 1.4))[fill].mean()) if fill.any() else 0.0,
        2,
    )
    return result, report


def clean_key1(name, band_y, xlimit):
    """1번 키의 옛 아이콘 성분만 지우고 주변 색으로 메운다."""
    image = Image.open(ART / name).convert("RGBA")
    array = np.array(image)
    mask = ink_mask(array)
    band = np.zeros_like(mask)
    band[band_y[0]:band_y[1]] = mask[band_y[0]:band_y[1]]
    labels, count = ndimage.label(band)
    target = np.zeros_like(mask)
    for index in range(1, count + 1):
        ys, xs = np.nonzero(labels == index)
        if len(ys) < 900 or (xs.max() - xs.min()) > 900 or xs.max() > xlimit:
            continue
        target[ys, xs] = True
    target = ndimage.binary_dilation(ndimage.binary_fill_holes(target), iterations=4)
    nearest = ndimage.distance_transform_edt(target, return_distances=False, return_indices=True)
    out = array.copy()
    out[target] = array[nearest[0][target], nearest[1][target]]
    return Image.fromarray(out, "RGBA")


def place(base, icon, center, height):
    # 1000px 짜리 선화를 128px 로 줄일 때 Lanczos 는 선 옆에 링잉(밝은 테)을 남긴다.
    # 그 테가 종이 결로 잡혀 질감 수치를 밀어 올리므로 면적평균(BOX)으로 줄인다.
    scaled = icon.resize((max(1, int(icon.width * height / icon.height)), height), Image.BOX)
    mask = np.array(scaled)[:, :, 3] > 60
    cy, cx = ndimage.center_of_mass(mask)
    out = base.copy()
    out.alpha_composite(scaled, (int(round(center[0] - cx)), int(round(center[1] - cy))))
    return out


source = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "assets" / "menu-keycap-cat-icon-v6-20260727.png"
icon, report = fit_icon(source)
fitted = source.with_name(source.stem + "-fitted.png")
icon.save(fitted)

def settle_grain(image, center, height, target=5.0):
    """합성된 뒤의 칠 질감을 기준치까지 눌러 준다.

    아이콘 자체는 매끈해도 축소·합성을 거치면 결이 올라간다. 그래서 아이콘이 아니라
    '결과물'을 재서 필요한 만큼만 흐린다. 선은 건드리지 않는다.
    """
    array = np.array(image)
    x0, x1 = center[0] - height, center[0] + height
    y0, y1 = center[1] - height, center[1] + height
    patch = array[y0:y1, x0:x1]
    raw = ink_mask(patch)
    # 상자 테두리에 닿는 성분(키캡 테두리)은 빼고 아이콘 성분만 남긴다.
    labels, count = ndimage.label(raw)
    ink = np.zeros_like(raw)
    ph, pw = raw.shape
    for index in range(1, count + 1):
        ys, xs = np.nonzero(labels == index)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == ph - 1 or xs.max() == pw - 1:
            continue
        if len(ys) < 40:          # 눈·코·수염 같은 작은 성분도 '선'이다(보고서와 같은 규칙)
            continue
        ink[ys, xs] = True
    if not ink.any():
        return image
    silhouette = ndimage.binary_fill_holes(ink)
    interior = silhouette & (ndimage.distance_transform_edt(~ink) >= 4)
    if not interior.any():
        return image
    grey = np.array(Image.fromarray(patch, "RGBA").convert("L")).astype(np.float32)
    grain = float(np.abs(grey - ndimage.gaussian_filter(grey, 1.4))[interior].mean())

    # 너무 매끈하면 종이 결을 더한다 — 손으로 칠한 다른 아이콘은 결이 살아 있다.
    if grain < GRAIN_BAND[0]:
        generator = np.random.default_rng(20260727)
        amplitude = 0.0
        # 합성 결과에서 재면 이 값의 2.5배쯤으로 잡힌다(경험값). 보고서 기준 1.2 를 겨냥한 값이다(0.78 → 보고서 ~1.2).
        while grain < 0.78 and amplitude < 14:
            amplitude += 1.5
            noise = generator.normal(0, amplitude, size=patch.shape[:2])
            noise = ndimage.gaussian_filter(noise, 0.6)
            test = patch.copy()
            for channel in range(3):
                test[interior, channel] = np.clip(
                    patch[interior, channel] + noise[interior], 0, 255
                )
            grey = np.array(Image.fromarray(test, "RGBA").convert("L")).astype(np.float32)
            grain = float(np.abs(grey - ndimage.gaussian_filter(grey, 1.4))[interior].mean())
            patch_out = test
        if amplitude > 0:
            array[y0:y1, x0:x1] = patch_out
        return Image.fromarray(array, "RGBA")

    sigma = 0.0
    while grain > target and sigma < 1.8:
        sigma += 0.3
        blurred = np.stack(
            [ndimage.gaussian_filter(patch[:, :, c].astype(np.float32), sigma) for c in range(3)],
            axis=2,
        )
        test = patch.copy()
        for channel in range(3):
            test[interior, channel] = blurred[interior, channel]
        grey = np.array(Image.fromarray(test, "RGBA").convert("L")).astype(np.float32)
        grain = float(np.abs(grey - ndimage.gaussian_filter(grey, 1.4))[interior].mean())
        patch_out = test
    if sigma > 0:
        array[y0:y1, x0:x1] = patch_out
    return Image.fromarray(array, "RGBA")


for src, dst, band_y, xlimit, center, height in PLACEMENTS:
    composed = place(clean_key1(src, band_y, xlimit), icon, center, height)
    settle_grain(composed, center, height).save(ART / dst)

print(f"source {source.name}")
for key, value in report.items():
    print(f"  {key}: {value}")
print(f"fitted -> {fitted}")
print(f"art -> {ART / 'menu-keycaps-base-v5.png'}, {ART / 'menu-keycaps-pressed-1-v2.png'}")
