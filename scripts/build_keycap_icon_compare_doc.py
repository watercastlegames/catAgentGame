# -*- coding: utf-8 -*-
"""
하단 키캡 아이콘 비교 문서(keycap-icon-compare-*.html) 생성.

원본 1번 키(클립보드)와 새로 넣은 고양이, 그리고 손대지 않은 2~4번 키 아이콘을
같은 잣대로 재서 "비슷한가 / 똑같은가"를 숫자로 판정한다.

  python scripts/build_keycap_icon_compare_doc.py

주의: 한글이 많다. PowerShell 의 Get-Content/Set-Content 로 다시 쓰면 인코딩이 깨진다.
"""
import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
OLD = ART / "menu-keycaps-base-v4.png"
NEW = ART / "menu-keycaps-base-v5.png"
OUT = REPO / "docs" / "keycap-icon-compare-20260727.html"

# 각 아이콘을 넉넉히 감싸는 상자 (1538×1023 아트 기준)
BOXES = {
    "clipboard": (228, 262, 392, 430),
    "cat": (228, 262, 392, 430),
    "chain": (541, 275, 718, 434),
    "gauge": (838, 272, 1023, 437),
    "clock": (1152, 277, 1327, 443),
}
# 각 아이콘이 원래 놓여 있던 자리(원본 아트의 아이콘 성분 중심). 이 x 가 곧 키의 시각적 중앙이다.
FACE_CENTER = {"clipboard": 310, "cat": 310, "chain": 629, "gauge": 930, "clock": 1239}


def crop(image, box):
    return image.crop(box)


def data_uri(image, scale=1):
    if scale != 1:
        image = image.resize(
            (int(image.width * scale), int(image.height * scale)), Image.LANCZOS
        )
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def icon_mask(patch):
    """상자 테두리에 닿지 않는 큰 성분만 = 아이콘 선. 키캡 테두리는 빠진다."""
    array = np.array(patch)
    red, green, blue, alpha = (array[:, :, i].astype(int) for i in range(4))
    ink = (alpha > 90) & (red < 185) & (green < 150) & (blue < 135)
    labels, count = ndimage.label(ink)
    keep = np.zeros_like(ink)
    height, width = ink.shape
    for index in range(1, count + 1):
        ys, xs = np.nonzero(labels == index)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == height - 1 or xs.max() == width - 1:
            continue
        if len(ys) < 120:
            continue
        keep[ys, xs] = True
    return keep, array


def measure(image, name):
    box = BOXES[name]
    patch = crop(image, box)
    ink, array = icon_mask(patch)
    if not ink.any():
        return None
    ys, xs = np.nonzero(ink)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    silhouette = ndimage.binary_fill_holes(ink)
    interior = silhouette & ~ndimage.binary_dilation(ink, iterations=3)
    distance = ndimage.distance_transform_edt(ink)
    stroke = float(np.percentile(distance[ink], 80) * 2)
    height = max(y1 - y0, 1)

    ink_rgb = array[:, :, :3][ink]
    fill_rgb = array[:, :, :3][interior] if interior.any() else ink_rgb
    grey = np.array(patch.convert("L")).astype(np.float32)
    blurred = ndimage.gaussian_filter(grey, 1.4)
    grain = float(np.abs(grey - blurred)[interior].mean()) if interior.any() else 0.0

    # 윤곽 부드러움 — 선 경계에서 색이 얼마나 완만하게 바뀌는가(안티에일리어싱 폭)
    edge = ndimage.binary_dilation(ink, iterations=2) & ~ndimage.binary_erosion(ink, iterations=1)
    gradient = np.hypot(*np.gradient(grey))
    softness = float(gradient[edge].mean()) if edge.any() else 0.0

    center_x = box[0] + (x0 + x1) / 2
    return {
        "name": name,
        "image": data_uri(patch, 1),
        "zoom": data_uri(patch, 2.2),
        "size": f"{x1 - x0}×{y1 - y0}",
        "stroke_px": round(stroke, 1),
        "stroke_pct": round(stroke / height * 100, 2),
        "ink_pct": round(ink.sum() / max((x1 - x0) * (y1 - y0), 1) * 100, 1),
        "ink_hex": "#%02x%02x%02x" % tuple(np.median(ink_rgb, axis=0).astype(int)),
        "fill_hex": "#%02x%02x%02x" % tuple(np.median(fill_rgb, axis=0).astype(int)),
        "grain": round(grain, 2),
        "softness": round(softness, 1),
        "center_x": round(center_x, 1),
        "offset": round(center_x - FACE_CENTER[name], 1),
    }


old_art = Image.open(OLD).convert("RGBA")
new_art = Image.open(NEW).convert("RGBA")

clipboard = measure(old_art, "clipboard")
cat = measure(new_art, "cat")
chain = measure(old_art, "chain")
gauge = measure(old_art, "gauge")
clock = measure(old_art, "clock")
reference = [chain, gauge, clock]

def band(values):
    return min(values), max(values)

stroke_band = band([item["stroke_pct"] for item in reference])
ink_band = band([item["ink_pct"] for item in reference])
grain_band = band([item["grain"] for item in reference])
soft_band = band([item["softness"] for item in reference])


def verdict(value, low, high):
    if low <= value <= high:
        return ("ok", "기준 안")
    gap = (value - high) if value > high else (low - value)
    return ("off", f"{'초과' if value > high else '미달'} {gap:.2f}")


CHECKS = [
    ("선 굵기 (아이콘 높이 대비)", "stroke_pct", stroke_band, "%"),
    ("잉크 비율 (상자 대비)", "ink_pct", ink_band, "%"),
    ("칠 안쪽 종이 질감", "grain", grain_band, ""),
    ("윤곽 부드러움", "softness", soft_band, ""),
]

check_rows = ""
mismatch = 0
for label, key, (low, high), unit in CHECKS:
    state, note = verdict(cat[key], low, high)
    if state == "off":
        mismatch += 1
    check_rows += (
        f'<tr class="{state}"><td><b>{label}</b></td>'
        f'<td>{low}~{high}{unit}</td><td>{cat[key]}{unit}</td>'
        f'<td>{"✔ " if state == "ok" else "✕ "}{note}</td></tr>'
    )

placement_state, placement_note = (
    ("ok", "정중앙") if abs(cat["offset"]) <= 6 else ("off", f"{cat['offset']:+.1f}px 치우침")
)

ALL = [clipboard, cat, chain, gauge, clock]
LABELS = {
    "clipboard": "1번 · 원본 클립보드",
    "cat": "1번 · 새 고양이",
    "chain": "2번 · 사슬",
    "gauge": "3번 · 계기판",
    "clock": "4번 · 시계",
}

cards = "".join(
    f"""
      <figure class="card{' is-new' if item['name'] == 'cat' else ''}">
        <div class="shot"><img src="{item['zoom']}" alt="{LABELS[item['name']]}" /></div>
        <figcaption>
          <b>{LABELS[item['name']]}</b>
          <span>{item['size']} · 선 {item['stroke_pct']}% · 잉크 {item['ink_pct']}%</span>
          <span><i style="background:{item['ink_hex']}"></i>{item['ink_hex']}
                <i style="background:{item['fill_hex']}"></i>{item['fill_hex']}</span>
        </figcaption>
      </figure>"""
    for item in ALL
)

table_rows = "".join(
    f"""<tr{' class="is-new"' if item['name'] == 'cat' else ''}>
      <td><b>{LABELS[item['name']]}</b></td>
      <td>{item['size']}</td>
      <td>{item['stroke_px']}px ({item['stroke_pct']}%)</td>
      <td>{item['ink_pct']}%</td>
      <td><i class="chip" style="background:{item['ink_hex']}"></i>{item['ink_hex']}</td>
      <td><i class="chip" style="background:{item['fill_hex']}"></i>{item['fill_hex']}</td>
      <td>{item['grain']}</td>
      <td>{item['softness']}</td>
      <td>{item['center_x']} ({item['offset']:+.1f})</td>
    </tr>"""
    for item in ALL
)

pair = f"""
  <div class="pair">
    <figure class="card">
      <div class="shot"><img src="{clipboard['zoom']}" alt="원본" /></div>
      <figcaption><b>바꾸기 전</b><span>클립보드 · 중심 {clipboard['center_x']} ({clipboard['offset']:+.1f}px)</span></figcaption>
    </figure>
    <figure class="card is-new">
      <div class="shot"><img src="{cat['zoom']}" alt="현재" /></div>
      <figcaption><b>바꾼 뒤</b><span>고양이 · 중심 {cat['center_x']} ({cat['offset']:+.1f}px)</span></figcaption>
    </figure>
  </div>"""

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>키캡 아이콘 1:1 비교 — 고양이 키는 나머지와 같은 그림체인가 (2026-07-27)</title>
<style>
  :root {{
    --ink:#33302a; --ink-2:#5c564c; --muted:#857e72; --line:#ddd5c6;
    --card:#fffaf0; --ok:#3d6349; --off:#a5473f; --shadow:0 18px 46px rgba(74,56,43,.13);
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;padding:0 0 72px;color:var(--ink);
    background:radial-gradient(circle at 12% 0%,rgba(226,214,170,.5),transparent 32rem),
      linear-gradient(180deg,#f5efe2 0%,#ece5d5 100%);
    font-family:"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
    line-height:1.62;word-break:keep-all;-webkit-font-smoothing:antialiased}}
  code{{font-family:"JetBrains Mono","D2Coding",ui-monospace,Consolas,monospace;font-size:.92em}}
  .wrap{{width:min(100% - 32px,1180px);margin:0 auto}}
  header.hero{{margin-top:34px;padding:clamp(24px,4vw,44px);border:1px solid rgba(255,255,255,.6);
    border-radius:26px;background:rgba(255,250,240,.92);box-shadow:var(--shadow)}}
  .kicker{{color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.16em}}
  h1{{margin:8px 0 12px;font-family:Georgia,"Times New Roman",serif;
    font-size:clamp(26px,4.4vw,44px);letter-spacing:-.04em}}
  header.hero p,.lead{{margin:0 0 10px;max-width:80ch;color:var(--ink-2);font-size:14.5px}}
  .verdict{{display:grid;gap:10px;margin-top:18px;padding:18px 20px;border-left:5px solid var(--off);
    border-radius:0 14px 14px 0;background:rgba(165,71,63,.08);font-size:14px}}
  .verdict.pass{{border-color:var(--ok);background:rgba(70,106,82,.09)}}
  .verdict b{{color:var(--off)}} .verdict.pass b{{color:var(--ok)}}
  h2{{margin:42px 0 6px;font-size:clamp(20px,3.2vw,29px);letter-spacing:-.03em}}
  h2 + p{{margin:0 0 18px;color:var(--ink-2);font-size:14px}}
  .grid{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}}
  .pair{{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
  .card{{margin:0;padding:12px;border:1px solid var(--line);border-radius:18px;background:var(--card);
    box-shadow:var(--shadow)}}
  .card.is-new{{border-color:#8fae94}}
  .shot{{display:grid;place-items:center;border-radius:12px;
    background:linear-gradient(180deg,#fdf7ea,#f0e6d3);overflow:hidden}}
  .shot img{{max-width:100%;height:auto;display:block}}
  .card figcaption{{display:grid;gap:2px;margin-top:8px}}
  .card figcaption b{{font-size:13.5px}}
  .card figcaption span{{color:var(--ink-2);font-size:11.5px}}
  .card figcaption i{{display:inline-block;width:11px;height:11px;margin:0 4px 0 0;
    border:1px solid rgba(0,0,0,.2);border-radius:3px;vertical-align:-1px}}
  .panel{{padding:20px 22px;border:1px solid var(--line);border-radius:20px;background:var(--card);
    box-shadow:var(--shadow);overflow-x:auto}}
  table{{width:100%;border-collapse:collapse;font-size:12.5px}}
  th,td{{padding:8px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}}
  th{{color:var(--muted);font-size:10.5px;letter-spacing:.06em}}
  tr.is-new td{{background:rgba(70,106,82,.08)}}
  tr.ok td:last-child{{color:var(--ok);font-weight:800}}
  tr.off td:last-child{{color:var(--off);font-weight:800}}
  .chip{{display:inline-block;width:12px;height:12px;margin-right:5px;border:1px solid rgba(0,0,0,.2);
    border-radius:3px;vertical-align:-2px}}
  footer{{margin-top:36px;color:var(--muted);font-size:12px}}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">KEYCAP ICON COMPARE · 2026-07-27</span>
    <h1>고양이 키는 나머지 세 키와 같은 그림체인가</h1>
    <p>
      1번 키의 <b>원본 클립보드</b>와 <b>새로 넣은 고양이</b>, 그리고 손대지 않은 2~4번 아이콘을
      같은 방식으로 잘라내 같은 잣대로 쟀습니다. 눈이 아니라 숫자로 판정합니다.
    </p>
    <div class="verdict{' pass' if mismatch == 0 else ''}">
      <div><b>{'같은 그림체 범위 안에 들어왔습니다.' if mismatch == 0 else f'{mismatch}개 항목이 기준 밖입니다.'}</b>
        2~4번 아이콘이 만드는 기준 폭과 비교한 결과입니다.</div>
      <div>선 굵기 <b>{cat['stroke_pct']}%</b> (기준 {stroke_band[0]}~{stroke_band[1]}%) ·
        잉크 비율 <b>{cat['ink_pct']}%</b> (기준 {ink_band[0]}~{ink_band[1]}%) ·
        질감 <b>{cat['grain']}</b> (기준 {grain_band[0]}~{grain_band[1]}) ·
        윤곽 <b>{cat['softness']}</b> (기준 {soft_band[0]}~{soft_band[1]})</div>
      <div>위치 — 키 상면 중심 {FACE_CENTER['cat']} 기준 <b>{cat['offset']:+.1f}px</b> ({placement_note}).
        참고로 <b>원본 클립보드는 {clipboard['offset']:+.1f}px</b> 로 원래부터 오른쪽에 있었습니다.</div>
      <div><b>100% 일치는 아닙니다.</b> 손으로 그린 그림이라 같은 화가가 그려도 아이콘마다
        선 굵기가 {stroke_band[0]}~{stroke_band[1]}%로 흔들립니다. 그 폭 안에 들어오면 "같은 그림체",
        벗어나면 "다른 그림체"로 판정합니다.</div>
    </div>
  </header>

  <h2>① 1번 키 — 바꾸기 전 / 뒤</h2>
  <p>같은 배율(2.2배)로 잘라 붙였습니다.</p>
  {pair}

  <h2>② 네 아이콘을 같은 배율로</h2>
  <p>초록 테두리가 이번에 넣은 고양이입니다.</p>
  <div class="grid">{cards}</div>

  <h2>③ 판정표</h2>
  <p>기준은 2~4번 아이콘 세 개가 만드는 최소~최대 폭입니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>항목</th><th>기준 폭 (2~4번)</th><th>고양이</th><th>판정</th></tr></thead>
      <tbody>{check_rows}
        <tr class="{placement_state}"><td><b>키 중앙 정렬</b></td><td>±6px</td>
          <td>{cat['offset']:+.1f}px</td><td>{'✔ ' if placement_state == 'ok' else '✕ '}{placement_note}</td></tr>
      </tbody>
    </table>
  </div>

  <h2>④ 전체 실측값</h2>
  <div class="panel">
    <table>
      <thead><tr>
        <th>아이콘</th><th>크기</th><th>선 굵기</th><th>잉크</th><th>선 색</th>
        <th>칠 색</th><th>질감</th><th>윤곽</th><th>중심 x (키중심 대비)</th>
      </tr></thead>
      <tbody>{table_rows}</tbody>
    </table>
  </div>

  <h2>⑤ 이 숫자들이 뭘 뜻하나</h2>
  <div class="panel">
    <table>
      <thead><tr><th>항목</th><th>재는 방법</th><th>크면</th></tr></thead>
      <tbody>
        <tr><td><b>선 굵기</b></td><td>선 픽셀의 거리변환 상위 20% 값 ×2, 아이콘 높이로 나눔</td><td>선이 두껍고 무거워 보인다</td></tr>
        <tr><td><b>잉크 비율</b></td><td>선 픽셀 수 ÷ 아이콘 상자 넓이</td><td>덩어리져 보이고 선화 느낌이 사라진다</td></tr>
        <tr><td><b>질감</b></td><td>칠 안쪽에서 원본과 가우시안 블러의 차이 평균</td><td>종이 결이 살아 있다(0에 가까우면 매끈한 디지털 면)</td></tr>
        <tr><td><b>윤곽</b></td><td>선 경계에서의 밝기 기울기 평균</td><td>선이 또렷하다(작으면 번진 수채 느낌)</td></tr>
        <tr><td><b>중심 x</b></td><td>선 픽셀 bbox 중심 − 키 상면 실측 중심</td><td>+면 오른쪽, −면 왼쪽으로 치우침</td></tr>
      </tbody>
    </table>
  </div>

  <footer>
    Agent Forest · 키캡 아이콘 비교 · 2026-07-27 ·
    원본 <code>menu-keycaps-base-v4.png</code> / 현재 <code>menu-keycaps-base-v5.png</code> ·
    생성 <code>scripts/build_keycap_icon_compare_doc.py</code> · 그림은 파일 안에 포함
  </footer>
</div>
</body>
</html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({len(html.encode('utf-8')) // 1024}KB)")
for item in ALL:
    print(
        f"  {item['name']:9s} 선 {item['stroke_pct']:5.2f}%  잉크 {item['ink_pct']:5.1f}%  "
        f"질감 {item['grain']:5.2f}  윤곽 {item['softness']:5.1f}  중심 {item['offset']:+6.1f}px"
    )
