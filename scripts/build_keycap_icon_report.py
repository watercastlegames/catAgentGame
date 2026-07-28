# -*- coding: utf-8 -*-
"""
키캡 아이콘 전면 분석 문서(keycap-icon-report-*.html) 생성.

재는 것:
  ① 다섯 레이어(기본 + 눌림 1~4)에서 1번 키가 일관되게 고양이인가
  ② 가로 위치 — 키 상면 중심 대비
  ③ 세로 위치 — 키 상면 높이 대비 비율   ← "살짝 위로 올라가 보인다"의 정체
  ④ 형태 — 선 굵기 / 잉크량 / 속이 빈 정도 / 가로세로비
  ⑤ 색 — 선·칠 색 차이(ΔE)
  ⑥ 재질 — 종이 결, 윤곽 또렷함
그리고 남은 차이를 어떻게 좁힐지 개선안까지 붙인다.

  python scripts/build_keycap_icon_report.py

주의: 한글이 많다. PowerShell 로 다시 쓰면 인코딩이 깨진다.
"""
import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
OUT = REPO / "docs" / "keycap-icon-report-20260727.html"

OLD_BASE = ART / "menu-keycaps-base-v4.png"
NEW_BASE = ART / "menu-keycaps-base-v5.png"
LAYERS = [
    ("기본 (아무 키도 안 눌림)", "menu-keycaps-base-v5.png", (200, 470)),
    ("1번 눌림", "menu-keycaps-pressed-1-v2.png", (380, 660)),
    ("2번 눌림", "menu-keycaps-pressed-2-v2.png", (200, 470)),
    ("3번 눌림", "menu-keycaps-pressed-3-v2.png", (200, 470)),
    ("4번 눌림", "menu-keycaps-pressed-4-v2.png", (200, 470)),
]
KEY_XLIM = {"key1": (240, 430), "key2": (560, 700), "key3": (860, 1010), "key4": (1170, 1320)}


def to_uri(image, scale=1):
    if scale != 1:
        image = image.resize(
            (int(image.width * scale), int(image.height * scale)), Image.LANCZOS
        )
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def ink_of(array):
    red, green, blue, alpha = (array[:, :, i].astype(int) for i in range(4))
    return (alpha > 90) & (red < 190) & (green < 155) & (blue < 140)


def icon_component(array, xlim, y_range):
    ink = ink_of(array)
    band = np.zeros_like(ink)
    band[y_range[0]:y_range[1]] = ink[y_range[0]:y_range[1]]
    labels, count = ndimage.label(band)
    # 한 아이콘이 여러 성분으로 쪼개져 있다(고양이는 윤곽 + 눈·코·수염).
    # 큰 성분 하나만 쓰면 나머지 선이 '칠'로 세어져 질감 수치가 부풀려진다 — 전부 합친다.
    union = np.zeros_like(ink)
    total = 0
    for index in range(1, count + 1):
        ys, xs = np.nonzero(labels == index)
        if (xs.max() - xs.min()) > 900:
            continue
        if not (xlim[0] <= (xs.min() + xs.max()) // 2 <= xlim[1]):
            continue
        if len(ys) < 40:
            continue
        union[ys, xs] = True
        total += len(ys)
    if total < 900:
        return None
    ys, xs = np.nonzero(union)
    return ((xs.min(), ys.min(), xs.max(), ys.max()), total, union)


def face_bounds(array, x_center, y_range):
    values = array.astype(float)
    high, low = values[:, :, :3].max(2), values[:, :, :3].min(2)
    saturation = np.where(high == 0, 0, (high - low) / np.maximum(high, 1e-6))
    face = (values[:, :, 3] > 200) & (saturation > 0.17) & (high > 120)
    column = face[y_range[0]:y_range[1], x_center - 6:x_center + 6].any(1)
    ys = np.nonzero(column)[0]
    if not len(ys):
        return None, None
    return ys.min() + y_range[0], ys.max() + y_range[0]


def face_span(array, y_center, x_range):
    values = array.astype(float)
    high, low = values[:, :, :3].max(2), values[:, :, :3].min(2)
    saturation = np.where(high == 0, 0, (high - low) / np.maximum(high, 1e-6))
    face = (values[:, :, 3] > 200) & (saturation > 0.17) & (high > 120)
    row = face[y_center - 5:y_center + 5, :].any(0)
    xs = np.nonzero(row)[0]
    if not len(xs):
        return None, None
    # 아이콘이 올라앉은 키의 색면 구간만 고른다(옆 키까지 묶으면 중심이 엉킨다).
    segments = np.split(xs, np.nonzero(np.diff(xs) > 12)[0] + 1)
    target = (x_range[0] + x_range[1]) // 2
    for segment in segments:
        if segment[0] - 40 <= target <= segment[-1] + 40:
            return int(segment[0]), int(segment[-1])
    return int(xs.min()), int(xs.max())


def rgb_to_lab(rgb):
    srgb = np.array(rgb, dtype=float) / 255
    linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    matrix = np.array([[0.4124, 0.3576, 0.1805],
                       [0.2126, 0.7152, 0.0722],
                       [0.0193, 0.1192, 0.9505]])
    xyz = matrix @ linear / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def delta_e(a, b):
    return float(np.linalg.norm(rgb_to_lab(a) - rgb_to_lab(b)))


def profile(array, xlim, y_range, name):
    found = icon_component(array, xlim, y_range)
    if not found:
        return None
    (x0, y0, x1, y1), _, mask = found
    ink = mask
    silhouette = ndimage.binary_fill_holes(ink)
    # 칠 질감은 '선에서 4px 이상 떨어진 깨끗한 안쪽'에서만 잰다.
    # 선 옆 경계를 포함하면 아이콘 구조(속이 뚫렸는지)에 따라 값이 널뛴다.
    interior = silhouette & (ndimage.distance_transform_edt(~ink) >= 4)
    distance = ndimage.distance_transform_edt(ink)
    height = max(y1 - y0, 1)
    center_x, center_y = (x0 + x1) // 2, (y0 + y1) // 2

    face_top, face_bottom = face_bounds(array, center_x, y_range)

    grey = np.array(Image.fromarray(array, "RGBA").convert("L")).astype(np.float32)
    blurred = ndimage.gaussian_filter(grey, 1.4)
    edge = ndimage.binary_dilation(ink, iterations=2) & ~ndimage.binary_erosion(ink, iterations=1)
    gradient = np.hypot(*np.gradient(grey))

    ink_rgb = np.median(array[:, :, :3][ink], axis=0).astype(int)
    fill_rgb = (np.median(array[:, :, :3][interior], axis=0).astype(int)
                if interior.any() else ink_rgb)

    return {
        "name": name,
        "crop": to_uri(Image.fromarray(array, "RGBA").crop((x0 - 26, y0 - 26, x1 + 26, y1 + 26)), 2.2),
        "size": f"{x1 - x0}×{y1 - y0}",
        "aspect": round((x1 - x0) / max(y1 - y0, 1), 2),
        "stroke_pct": round(float(np.percentile(distance[ink], 80) * 2 / height * 100), 2),
        "ink_pct": round(ink.sum() / max((x1 - x0) * (y1 - y0), 1) * 100, 1),
        "solid_pct": round(interior.sum() / max(silhouette.sum(), 1) * 100, 1),
        "grain": round(float(np.abs(grey - blurred)[interior].mean()) if interior.any() else 0.0, 2),
        "softness": round(float(gradient[edge].mean()) if edge.any() else 0.0, 1),
        "ink_hex": "#%02x%02x%02x" % tuple(ink_rgb),
        "fill_hex": "#%02x%02x%02x" % tuple(fill_rgb),
        "ink_rgb": tuple(int(v) for v in ink_rgb),
        "fill_rgb": tuple(int(v) for v in fill_rgb),
        "center_x": center_x,
        "center_y": center_y,
        "x_ref": None,   # 아래에서 원본 아이콘 중심을 넣는다
        "y_pct": (round((center_y - face_top) / (face_bottom - face_top) * 100, 1)
                  if face_top is not None else None),
    }


old_array = np.array(Image.open(OLD_BASE).convert("RGBA"))
new_array = np.array(Image.open(NEW_BASE).convert("RGBA"))

clipboard = profile(old_array, KEY_XLIM["key1"], (200, 470), "1번 · 원본 클립보드")
cat = profile(new_array, KEY_XLIM["key1"], (200, 470), "1번 · 새 고양이")
chain = profile(old_array, KEY_XLIM["key2"], (200, 470), "2번 · 사슬")
gauge = profile(old_array, KEY_XLIM["key3"], (200, 470), "3번 · 계기판")
clock = profile(old_array, KEY_XLIM["key4"], (200, 470), "4번 · 시계")
# 가로 위치는 "원본 아트에서 그 아이콘이 있던 x" 를 기준으로 픽셀 차이를 본다.
# (키 상면 폭은 아이콘이 가려서 행마다 끊겨 신뢰할 수 없다)
ORIGIN_X = {"1번 · 원본 클립보드": clipboard["center_x"], "1번 · 새 고양이": clipboard["center_x"],
            "2번 · 사슬": chain["center_x"], "3번 · 계기판": gauge["center_x"],
            "4번 · 시계": clock["center_x"]}
for item in (clipboard, cat, chain, gauge, clock):
    item["x_off"] = item["center_x"] - ORIGIN_X[item["name"]]

reference = [chain, gauge, clock]
everything = [clipboard, cat, chain, gauge, clock]

# 다섯 레이어에서 1번 키가 고양이인지 확인 (예전엔 눌림 2~4에 클립보드가 남아 있었다)
layer_rows = ""
layer_shots = ""
for label, filename, y_range in LAYERS:
    array = np.array(Image.open(ART / filename).convert("RGBA"))
    found = icon_component(array, KEY_XLIM["key1"], y_range)
    if not found:
        layer_rows += f"<tr class='off'><td><b>{label}</b></td><td>{filename}</td><td colspan='2'>아이콘 못 찾음</td></tr>"
        continue
    (x0, y0, x1, y1), size, _ = found
    ratio = round((x1 - x0) / max(y1 - y0, 1), 2)
    kind = "고양이" if 0.95 <= ratio <= 1.20 else "클립보드(옛 아이콘)"
    state = "ok" if kind == "고양이" else "off"
    layer_rows += (
        f"<tr class='{state}'><td><b>{label}</b></td><td><code>{filename}</code></td>"
        f"<td>{x1-x0}×{y1-y0} (비 {ratio})</td><td>{'✔ ' if state=='ok' else '✕ '}{kind}</td></tr>"
    )
    crop = Image.fromarray(array, "RGBA").crop((x0 - 40, y0 - 40, x1 + 40, y1 + 40))
    layer_shots += (
        f'<figure class="card"><div class="shot"><img src="{to_uri(crop, 1.5)}" alt="{label}" /></div>'
        f'<figcaption><b>{label}</b><span>{filename}</span></figcaption></figure>'
    )


def band(key):
    values = [item[key] for item in reference]
    return min(values), max(values)


def judge(value, low, high, tolerance=0.0):
    if low - tolerance <= value <= high + tolerance:
        return "ok", "기준 안"
    gap = value - high if value > high else low - value
    return "off", f"{'초과' if value > high else '미달'} {gap:.2f}"


CHECKS = [
    ("세로 위치 (상면 높이 대비)", "y_pct", "%", "위로 붙으면 값이 작다"),
    ("가로 위치 (원본 아이콘 대비)", "x_off", "px", "0이면 원본과 같은 자리"),
    ("선 굵기 (아이콘 높이 대비)", "stroke_pct", "%", "선의 무게"),
    ("잉크량 (상자 대비)", "ink_pct", "%", "그림에 실린 선의 총량"),
    ("면 채움 (실루엣 대비)", "solid_pct", "%", "속이 꽉 찼는지, 뚫려 있는지"),
    ("가로세로비", "aspect", "", "1이면 정사각"),
    ("종이 결", "grain", "", "칠 안쪽 질감"),
    ("윤곽 또렷함", "softness", "", "선 경계의 대비"),
]

check_rows = ""
issues = []
for label, key, unit, note in CHECKS:
    low, high = band(key)
    value = cat[key]
    state, verdict = judge(value, low, high)
    if state == "off":
        issues.append((label, value, low, high, unit))
    check_rows += (
        f"<tr class='{state}'><td><b>{label}</b><small>{note}</small></td>"
        f"<td>{low}~{high}{unit}</td><td>{clipboard[key]}{unit}</td><td><b>{value}{unit}</b></td>"
        f"<td>{'✔ ' if state=='ok' else '✕ '}{verdict}</td></tr>"
    )

ink_gaps = [(item["name"], round(delta_e(cat["ink_rgb"], item["ink_rgb"]), 1)) for item in reference]
fill_gaps = [(item["name"], round(delta_e(cat["fill_rgb"], item["fill_rgb"]), 1)) for item in reference]
color_rows = "".join(
    f"<tr><td><b>{name}</b></td><td>ΔE {ink}</td><td>ΔE {fill}</td>"
    f"<td>{'✔ 눈으로 구분 어려움' if max(ink, fill) < 5 else '✕ 다른 색으로 보임'}</td></tr>"
    for (name, ink), (_, fill) in zip(ink_gaps, fill_gaps)
)

cards = "".join(
    f"""<figure class="card{' is-new' if item is cat else ''}">
      <div class="shot"><img src="{item['crop']}" alt="{item['name']}" /></div>
      <figcaption><b>{item['name']}</b>
        <span>{item['size']} · 선 {item['stroke_pct']}% · 잉크 {item['ink_pct']}%</span>
        <span>세로 {item['y_pct']}% · 가로 {item['x_off']:+}px</span>
        <span><i style="background:{item['ink_hex']}"></i>{item['ink_hex']}
              <i style="background:{item['fill_hex']}"></i>{item['fill_hex']}</span>
      </figcaption></figure>"""
    for item in everything
)

table_rows = "".join(
    f"""<tr{' class="is-new"' if item is cat else ''}>
      <td><b>{item['name']}</b></td><td>{item['size']}</td><td>{item['aspect']}</td>
      <td>{item['stroke_pct']}%</td><td>{item['ink_pct']}%</td><td>{item['solid_pct']}%</td>
      <td>{item['grain']}</td><td>{item['softness']}</td>
      <td>{item['x_off']:+}px</td><td>{item['y_pct']}%</td>
    </tr>"""
    for item in everything
)

if issues:
    plan_items = ""
    for label, value, low, high, unit in issues:
        if "면 채움" in label:
            how = ("고양이는 얼굴이 통으로 칠해져 있고, 사슬·시계는 가운데가 뚫려 있다. "
                   "귀 안쪽·볼에 여백을 더 파거나 얼굴선을 열어 두면 내려간다. "
                   "다만 40px에서 뭉갤 위험이 커서 <b>권하지 않는다</b>.")
        elif "잉크" in label:
            how = "무늬(줄무늬 두 줄 등)를 더 넣으면 올라간다. 작은 크기에서 뭉치지 않는 선에서만."
        elif "종이 결" in label:
            how = ("생성 이미지의 결이 원본보다 곱다. <code>fit_keycap_cat_icon.py</code> 의 "
                   "질감 단계에서 노이즈를 <b>더하는</b> 쪽으로 바꾸면 맞출 수 있다.")
        elif "가로세로비" in label:
            how = "고양이 얼굴은 원래 가로로 넓다. 세로를 늘리면 얼굴이 길어져 되레 어색해진다."
        else:
            how = "배치 좌표(<code>PLACEMENTS</code>)를 조정하면 바로 맞출 수 있다."
        plan_items += (
            f"<li><b>{label}</b> — 현재 {value}{unit}, 기준 {low}~{high}{unit}. {how}</li>"
        )
else:
    plan_items = "<li>모든 항목이 기준 폭 안에 있다. 더 손댈 곳이 없다.</li>"

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>키캡 아이콘 전면 분석 — 위치·형태·색·재질 (2026-07-27)</title>
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
  .wrap{{width:min(100% - 32px,1200px);margin:0 auto}}
  header.hero{{margin-top:34px;padding:clamp(24px,4vw,44px);border:1px solid rgba(255,255,255,.6);
    border-radius:26px;background:rgba(255,250,240,.92);box-shadow:var(--shadow)}}
  .kicker{{color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.16em}}
  h1{{margin:8px 0 12px;font-family:Georgia,"Times New Roman",serif;
    font-size:clamp(26px,4.4vw,44px);letter-spacing:-.04em}}
  header.hero p,.lead{{margin:0 0 10px;max-width:82ch;color:var(--ink-2);font-size:14.5px}}
  .summary{{display:grid;gap:9px;margin-top:16px;padding:16px 18px;border-left:5px solid var(--ok);
    border-radius:0 14px 14px 0;background:rgba(70,106,82,.09);font-size:14px}}
  .summary.warn{{border-color:var(--off);background:rgba(165,71,63,.08)}}
  h2{{margin:42px 0 6px;font-size:clamp(20px,3.2vw,29px);letter-spacing:-.03em}}
  h2 + p{{margin:0 0 18px;color:var(--ink-2);font-size:14px}}
  .grid{{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(215px,1fr))}}
  .card{{margin:0;padding:11px;border:1px solid var(--line);border-radius:18px;background:var(--card);
    box-shadow:var(--shadow)}}
  .card.is-new{{border-color:#8fae94}}
  .shot{{display:grid;place-items:center;border-radius:12px;overflow:hidden;
    background:linear-gradient(180deg,#fdf7ea,#f0e6d3)}}
  .shot img{{max-width:100%;height:auto;display:block}}
  .card figcaption{{display:grid;gap:2px;margin-top:7px}}
  .card figcaption b{{font-size:13px}}
  .card figcaption span{{color:var(--ink-2);font-size:11px}}
  .card figcaption i{{display:inline-block;width:10px;height:10px;margin:0 4px 0 0;
    border:1px solid rgba(0,0,0,.2);border-radius:3px;vertical-align:-1px}}
  .panel{{padding:20px 22px;border:1px solid var(--line);border-radius:20px;background:var(--card);
    box-shadow:var(--shadow);overflow-x:auto}}
  table{{width:100%;border-collapse:collapse;font-size:12.5px}}
  th,td{{padding:8px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}
  th{{color:var(--muted);font-size:10.5px;letter-spacing:.06em;white-space:nowrap}}
  td small{{display:block;color:var(--muted);font-size:10.5px}}
  tr.is-new td{{background:rgba(70,106,82,.08)}}
  tr.ok td:last-child{{color:var(--ok);font-weight:800}}
  tr.off td:last-child{{color:var(--off);font-weight:800}}
  ol.plan{{margin:0;padding-left:20px;color:var(--ink-2);font-size:13.5px}}
  ol.plan li{{margin-bottom:8px}}
  footer{{margin-top:36px;color:var(--muted);font-size:12px}}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">KEYCAP ICON REPORT · 2026-07-27</span>
    <h1>1번 키 고양이 아이콘 — 어디까지 맞췄고 무엇이 남았나</h1>
    <p>
      다섯 장의 키캡 아트(기본 + 눌림 1~4)에서 1번 키를 잘라내, 손대지 않은 2~4번 아이콘과
      같은 잣대로 쟀습니다. 위치·형태·색·재질을 나눠서 봅니다.
    </p>
    <div class="summary{'' if not issues else ' warn'}">
      <div><b>세로 위치</b> — 지적하신 대로였습니다. 고양이가 상면 높이의
        <b>{cat['y_pct']}%</b> 지점, 2~4번은 <b>{band('y_pct')[0]}~{band('y_pct')[1]}%</b>.
        원본 클립보드부터 {clipboard['y_pct']}% 로 다른 키보다 높이 붙어 있었습니다. 이번에 내렸습니다.</div>
      <div><b>다른 키를 누르면 옛 클립보드가 보이던 문제</b> — 눌림 2·3·4 레이어에도 1번 키가
        통째로 그려져 있는데 거기까진 갈지 않았던 탓입니다. 다섯 장 전부 교체했습니다(아래 ① 표).</div>
      <div><b>남은 차이 {len(issues)}건</b> — {', '.join(item[0] for item in issues) if issues else '없음'}.
        각각을 어떻게 좁힐 수 있는지는 ⑥에 적었습니다.</div>
    </div>
  </header>

  <h2>① 다섯 레이어 일관성</h2>
  <p>1번 키가 어느 레이어에서도 고양이여야 합니다. 가로세로비로 클립보드(가로로 넓음)와 구별합니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>레이어</th><th>파일</th><th>1번 키 아이콘 크기</th><th>판정</th></tr></thead>
      <tbody>{layer_rows}</tbody>
    </table>
  </div>
  <div class="grid" style="margin-top:14px">{layer_shots}</div>

  <h2>② 다섯 아이콘 나란히</h2>
  <p>초록 테두리가 이번에 넣은 고양이입니다. 배율은 모두 2.2배로 같습니다.</p>
  <div class="grid">{cards}</div>

  <h2>③ 판정표</h2>
  <p>기준은 2~4번 아이콘 세 개가 만드는 최소~최대 폭입니다. 가운데 열은 참고용으로 원본 클립보드 값입니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>항목</th><th>기준 (2~4번)</th><th>원본 클립보드</th><th>고양이</th><th>판정</th></tr></thead>
      <tbody>{check_rows}</tbody>
    </table>
  </div>

  <h2>④ 색 차이</h2>
  <p>ΔE 는 사람 눈이 느끼는 색 거리입니다. 대략 2 이하면 거의 구분 못 하고, 5를 넘으면 다른 색으로 보입니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>비교 대상</th><th>선 색 차이</th><th>칠 색 차이</th><th>판정</th></tr></thead>
      <tbody>{color_rows}</tbody>
    </table>
  </div>

  <h2>⑤ 전체 실측값</h2>
  <div class="panel">
    <table>
      <thead><tr>
        <th>아이콘</th><th>크기</th><th>가로세로비</th><th>선 굵기</th><th>잉크</th>
        <th>면 채움</th><th>종이 결</th><th>윤곽</th><th>가로 위치</th><th>세로 위치</th>
      </tr></thead>
      <tbody>{table_rows}</tbody>
    </table>
  </div>

  <h2>⑥ 개선 방향</h2>
  <p>남은 차이를 좁히는 방법과, 좁히지 않는 편이 나은 이유를 함께 적었습니다.</p>
  <div class="panel">
    <ol class="plan">{plan_items}</ol>
    <p class="lead" style="margin-top:14px">
      공통 주의 — 이 아이콘은 화면에서 <b>약 40px</b>로 보입니다. 지금보다 선을 더 넣거나 면을 더 파면
      그 크기에서 뭉쳐서, 숫자는 가까워져도 눈에는 더 나빠집니다. 판단 기준은 항상
      <code>keycap-real-size</code> 크기의 그림입니다.
    </p>
  </div>

  <h2>⑦ 이 숫자들을 다시 뽑으려면</h2>
  <div class="panel">
    <p class="lead">
      아이콘을 새로 생성했다면 <code>python scripts/fit_keycap_cat_icon.py &lt;새 아이콘.png&gt;</code> 로
      색·선 굵기·질감·위치를 자동 정렬하고, <code>python scripts/build_keycap_icon_report.py</code> 로
      이 문서를 다시 만들면 됩니다. 배치 좌표는 <code>fit_keycap_cat_icon.py</code> 의
      <code>PLACEMENTS</code> 한 곳에만 있습니다.
    </p>
  </div>

  <footer>
    Agent Forest · 키캡 아이콘 전면 분석 · 2026-07-27 ·
    원본 <code>menu-keycaps-base-v4.png</code> · 현재 <code>menu-keycaps-base-v5.png</code> 외 눌림 4장 ·
    그림은 파일 안에 포함되어 인터넷 없이 열립니다.
  </footer>
</div>
</body>
</html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({len(html.encode('utf-8')) // 1024}KB)")
for item in everything:
    print(
        f"  {item['name']:16s} 세로 {item['y_pct']:5.1f}%  가로 {item['x_off']:+4d}px  "
        f"선 {item['stroke_pct']:5.2f}%  잉크 {item['ink_pct']:5.1f}%  채움 {item['solid_pct']:5.1f}%  "
        f"결 {item['grain']:4.2f}"
    )
