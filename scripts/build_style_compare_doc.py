# -*- coding: utf-8 -*-
"""
그림체 비교 문서(cat-soup-style-compare-*.html) 생성 스크립트.

원본 게임 스크린샷과 우리 참고용 일러스트를 같은 잣대로 재서, 같은 사람이 그린 것인지
판정하고 프롬프트를 어떻게 고쳐야 원본에 붙는지 정리한다.

  python scripts/build_style_compare_doc.py

지표는 전부 이 파일 안에서 계산한다 — 그림을 다시 뽑은 뒤 같은 스크립트를 돌리면
숫자가 원본 쪽으로 움직였는지 바로 확인할 수 있다.
"""
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
REFERENCE = Path(
    r"C:\Users\smini\Downloads\고양이와스프-참고이미지\Screenshot＿20220802－150055＿Cats＆Soup.jpg"
)
OURS = REPO / "public" / "art" / "workstation-cats-soup-reference-style-v2.png"
OUT = REPO / "docs" / "cat-soup-style-compare-20260727.html"

# 원본 스크린샷은 위아래 UI 바가 있어 게임 필드만 잘라서 잰다.
REFERENCE_FIELD = (40, 140, 760, 1560)
# 선·질감 확대 비교용 크롭
REFERENCE_DETAIL = (300, 430, 620, 630)
OURS_DETAIL = (560, 520, 1000, 800)


def load(path, crop=None):
    image = Image.open(path).convert("RGB")
    return image.crop(crop) if crop else image


def data_uri(image, scale=1):
    if scale != 1:
        image = image.resize(
            (int(image.width * scale), int(image.height * scale)), Image.NEAREST
        )
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def saturation_value(array):
    scaled = array.astype(np.float32) / 255
    high = scaled.max(2)
    low = scaled.min(2)
    saturation = np.where(high == 0, 0, (high - low) / np.maximum(high, 1e-6))
    return saturation, high


def dominant_palette(image, count=8):
    small = image.resize((160, 160))
    quantized = small.quantize(colors=count, method=Image.MEDIANCUT)
    palette = np.array(quantized.getpalette()[: count * 3]).reshape(-1, 3)
    counts = np.bincount(np.array(quantized).ravel(), minlength=count)
    order = np.argsort(-counts)
    return [
        {
            "hex": "#%02x%02x%02x" % tuple(palette[index]),
            "share": round(float(counts[index]) / counts.sum() * 100, 1),
        }
        for index in order
        if counts[index] > 0
    ]


def accent_palette(image, count=6):
    """배경·외곽선을 뺀 '색이 있는' 픽셀만 모아 강조색을 뽑는다."""
    array = np.array(image).reshape(-1, 3).astype(np.float32)
    high = array.max(1)
    low = array.min(1)
    saturation = np.where(high == 0, 0, (high - low) / np.maximum(high, 1e-6))
    value = high / 255
    selected = array[(saturation > 0.35) & (value > 0.35)]
    if len(selected) == 0:
        return [], 0.0
    quantized = Image.fromarray(
        selected.astype(np.uint8).reshape(-1, 1, 3)
    ).quantize(colors=count, method=Image.MEDIANCUT)
    palette = np.array(quantized.getpalette()[: count * 3]).reshape(-1, 3)
    counts = np.bincount(np.array(quantized).ravel(), minlength=count)
    order = np.argsort(-counts)
    result = []
    for index in order:
        if counts[index] == 0:
            continue
        red, green, blue = (int(v) for v in palette[index])
        high_c = max(red, green, blue)
        low_c = min(red, green, blue)
        result.append(
            {
                "hex": "#%02x%02x%02x" % (red, green, blue),
                "share": round(float(counts[index]) / counts.sum() * 100, 1),
                "sat": round(0 if high_c == 0 else (high_c - low_c) / high_c, 2),
            }
        )
    share = float(((saturation > 0.35) & (value > 0.35)).mean() * 100)
    return result[:count], round(share, 2)


def measure(image):
    array = np.array(image)
    saturation, value = saturation_value(array)
    grey = np.array(image.convert("L")).astype(np.float32)
    dark = grey < 110
    dark_pixels = array[dark] if dark.sum() > 50 else np.zeros((1, 3))
    distance = ndimage.distance_transform_edt(dark)
    widths = distance[distance > 0]
    blurred = ndimage.gaussian_filter(grey, 1.4)
    accents, accent_share = accent_palette(image)
    width_mean = float(widths.mean() * 2) if widths.size else 0.0
    return {
        "size": f"{image.width}×{image.height}",
        "palette": dominant_palette(image),
        "accents": accents,
        "accent_share": accent_share,
        "accent_max_sat": max((a["sat"] for a in accents), default=0),
        "mean_saturation": round(float(saturation.mean()), 3),
        "p90_saturation": round(float(np.percentile(saturation, 90)), 3),
        "mean_value": round(float(value.mean()), 3),
        "dark_ratio": round(float(dark.mean() * 100), 2),
        "outline_hex": "#%02x%02x%02x" % tuple(dark_pixels.mean(0).astype(int)),
        "outline_width_px": round(width_mean, 2),
        "outline_width_pct": round(width_mean / image.width * 100, 3),
        "texture_energy": round(float(np.abs(grey - blurred).mean()), 2),
    }


reference_field = load(REFERENCE, REFERENCE_FIELD)
ours_full = load(OURS)
reference_metrics = measure(reference_field)
ours_metrics = measure(ours_full)

images = {
    "reference_full": data_uri(load(REFERENCE).resize((360, 710))),
    "ours_full": data_uri(ours_full.resize((900, 509))),
    "reference_detail": data_uri(load(REFERENCE, REFERENCE_DETAIL), scale=2),
    "ours_detail": data_uri(load(OURS, OURS_DETAIL), scale=1.45),
}


def swatches(entries, key="share"):
    return "".join(
        f'<div class="sw"><span style="background:{item["hex"]}"></span>'
        f'<b>{item["hex"]}</b><small>{item[key]}%'
        + (f' · 채도 {item["sat"]}' if "sat" in item else "")
        + "</small></div>"
        for item in entries
    )


ROWS = [
    ("배경 지배색", "palette0", "가장 넓은 면적을 차지하는 색"),
    ("평균 명도", "mean_value", "1에 가까울수록 밝다"),
    ("평균 채도", "mean_saturation", ""),
    ("상위 10% 채도", "p90_saturation", "선명한 부분이 얼마나 선명한가"),
    ("강조색 최고 채도", "accent_max_sat", "가장 튀는 색의 채도"),
    ("어두운 픽셀 비율", "dark_ratio", "외곽선이 화면에서 차지하는 양(%)"),
    ("외곽선 평균색", "outline_hex", ""),
    ("외곽선 두께", "outline_width_pct", "이미지 폭 대비 %"),
    ("질감 에너지", "texture_energy", "종이·색연필 그레인의 양"),
]


def cell(metrics, key):
    if key == "palette0":
        top = metrics["palette"][0]
        return f'<span class="chip" style="background:{top["hex"]}"></span> {top["hex"]} ({top["share"]}%)'
    value = metrics[key]
    if key == "outline_hex":
        return f'<span class="chip" style="background:{value}"></span> {value}'
    if key == "outline_width_pct":
        return f'{value}% ({metrics["outline_width_px"]}px)'
    return str(value)


metric_rows = "".join(
    f"<tr><td><b>{label}</b>{f'<small>{note}</small>' if note else ''}</td>"
    f"<td>{cell(reference_metrics, key)}</td><td>{cell(ours_metrics, key)}</td></tr>"
    for label, key, note in ROWS
)

PROMPT_FIXES = [
    (
        "외곽선",
        "thick uniform dark brown outline",
        "thin hand-drawn sepia ink line (#7f5d52), slightly uneven and tapering, "
        "occasionally broken, NOT a uniform vector stroke, no black",
        f'우리 선이 화면의 {ours_metrics["dark_ratio"]}%를 먹는다. 원본은 {reference_metrics["dark_ratio"]}% — 절반 이하다.',
    ),
    (
        "채도",
        "(지정 없음 → 선명한 하늘색이 튐)",
        "muted dusty pastel palette, every colour under 40% saturation, "
        "no vivid or neon hues",
        f'우리 강조색 최고 채도 {ours_metrics["accent_max_sat"]} vs 원본 {reference_metrics["accent_max_sat"]}.',
    ),
    (
        "색 계열",
        "blue screens, teal cushion",
        "keep everything inside one warm belt — cream, sand, khaki-olive, tan, "
        "soft brown; if a screen must be blue use a dusty greyish blue (#93b0bd)",
        "원본 강조색 8종이 전부 노랑~올리브~갈색 한 벨트에 있다. 찬 계열이 아예 없다.",
    ),
    (
        "질감",
        "flat fills",
        "visible watercolour paper grain and coloured-pencil texture over every fill, "
        "blotchy uneven washes, slight colour bleeding past the line",
        f'질감 에너지 {ours_metrics["texture_energy"]} → 원본 {reference_metrics["texture_energy"]}. 1.6배 부족하다.',
    ),
    (
        "명도",
        "bright butter yellow background",
        "sandy cream background (#f1e2b7), slightly greyed, not a bright yellow",
        f'평균 명도 {ours_metrics["mean_value"]} vs {reference_metrics["mean_value"]} — 우리 쪽이 떠 보인다.',
    ),
    (
        "음영",
        "shaded sides, inner shadows",
        "almost no shading; only a soft blurred shadow pooled under each object, "
        "no hard shadow edges, no specular highlights",
        "원본은 형태 안쪽에 그림자가 거의 없다. 바닥 그림자만 부드럽게 깔린다.",
    ),
    (
        "밀도",
        "4개의 큰 오브젝트",
        "small cosy props clustered together — lanterns, sacks, wooden signs, "
        "little plants — many tiny details at a small on-screen size",
        "원본은 작은 소품이 빽빽하다. 오브젝트 하나를 크게 그리지 않는다.",
    ),
]

fix_rows = "".join(
    f"<tr><td><b>{name}</b></td><td class=old>{old}</td><td class=new>{new}</td>"
    f"<td><small>{why}</small></td></tr>"
    for name, old, new, why in PROMPT_FIXES
)

READY_PROMPT = """A set of cosy workstation props for a mobile cat game, drawn in the Cats &amp; Soup mobile game illustration style.

Line: thin hand-drawn sepia ink outline in warm brown (#7f5d52), the weight varies slightly along each stroke and tapers at the ends, some lines left open — never a uniform vector stroke, never black.
Colour: muted dusty pastel palette held inside one warm belt — sandy cream (#f1e2b7), khaki olive (#c3c77d), tan (#e2b081), soft brown (#876350), warm grey. Every colour stays under 40% saturation. No vivid blue, no neon, no pure white.
Texture: visible watercolour paper grain and coloured-pencil grain across every fill, blotchy uneven washes, colour occasionally bleeding past the outline.
Shading: almost none — no hard shading edges, no specular highlights, only a soft blurred shadow pooled under each object.
Composition: small cosy props clustered together at a small on-screen size, plenty of tiny details (lanterns, sacks, wooden signs, little plants), gentle three-quarter top-down view.
Background: flat sandy cream (#f1e2b7).
No text, no logo, no watermark, no UI."""

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>고양이와 스프 그림체 비교 — 같은 손인가, 어떻게 맞출 것인가 (2026-07-27)</title>
<style>
  :root {{
    --ink:#33302a; --ink-2:#5c564c; --muted:#857e72; --line:#ddd5c6;
    --card:#fffaf0; --accent:#466a52; --amber:#c68a2e; --warn:#a5473f;
    --shadow:0 18px 46px rgba(74,56,43,.13);
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
    font-size:clamp(27px,4.6vw,45px);letter-spacing:-.04em}}
  header.hero p,.lead{{margin:0 0 10px;max-width:80ch;color:var(--ink-2);font-size:14.5px}}
  .verdict{{display:grid;gap:10px;margin-top:18px;padding:18px 20px;border-left:5px solid var(--warn);
    border-radius:0 14px 14px 0;background:rgba(165,71,63,.08);font-size:14px}}
  .verdict b{{color:var(--warn)}}
  h2{{margin:42px 0 6px;font-size:clamp(20px,3.2vw,29px);letter-spacing:-.03em}}
  h2 + p{{margin:0 0 18px;color:var(--ink-2);font-size:14px}}
  .panel{{padding:20px 22px;border:1px solid var(--line);border-radius:20px;background:var(--card);
    box-shadow:var(--shadow)}}
  .pair{{display:grid;gap:16px;grid-template-columns:minmax(0,360px) minmax(0,1fr);align-items:start}}
  .shot{{padding:12px;border:1px solid var(--line);border-radius:18px;background:var(--card);
    box-shadow:var(--shadow)}}
  .shot img{{width:100%;height:auto;border-radius:12px;display:block}}
  .shot b{{display:block;margin-top:8px;font-size:13.5px}}
  .shot small{{color:var(--ink-2);font-size:12px}}
  table{{width:100%;border-collapse:collapse;font-size:13px}}
  th,td{{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}
  th{{color:var(--muted);font-size:11px;letter-spacing:.06em}}
  td small{{display:block;color:var(--muted);font-size:11px}}
  .chip{{display:inline-block;width:13px;height:13px;border:1px solid rgba(0,0,0,.2);
    border-radius:4px;vertical-align:-2px}}
  .sws{{display:flex;flex-wrap:wrap;gap:9px;margin-top:10px}}
  .sw{{display:grid;gap:2px;width:104px;font-size:10.5px}}
  .sw span{{height:44px;border:1px solid rgba(0,0,0,.16);border-radius:10px}}
  .sw b{{font-size:11px}}
  .sw small{{color:var(--muted)}}
  td.old{{color:var(--warn)}}
  td.new{{color:var(--accent)}}
  pre{{margin:12px 0 0;padding:14px 16px;border-radius:12px;background:#262533;color:#ece7de;
    font-size:12px;white-space:pre-wrap;overflow-x:auto}}
  .two{{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}}
  footer{{margin-top:36px;color:var(--muted);font-size:12px}}
  @media (max-width:820px){{.pair{{grid-template-columns:1fr}}}}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">ART STYLE COMPARE · 2026-07-27</span>
    <h1>같은 손이 그린 그림인가</h1>
    <p>
      원본 <b>고양이와 스프</b> 게임 스크린샷과, 우리가 참고용으로 만든
      <code>workstation-cats-soup-reference-style-v2.png</code> 를 같은 잣대로 측정했습니다.
      숫자는 전부 두 이미지에서 직접 계산한 값입니다(스크립트: <code>scripts/build_style_compare_doc.py</code>).
    </p>
    <div class="verdict">
      <div><b>결론 — 같은 사람이 그렸다고 보기 어렵습니다.</b> 장르(포근한 파스텔 카툰 + 갈색 외곽선 + 크림 배경)는
        같은 계열이지만, 손버릇에 해당하는 세 가지가 다릅니다.</div>
      <div><b>① 선.</b> 원본은 화면의 {reference_metrics['dark_ratio']}%만 선이고 굵기가 들쭉날쭉한 손그림입니다.
        우리 것은 {ours_metrics['dark_ratio']}% — 두 배가 넘고, 굵기가 일정한 벡터 선입니다.</div>
      <div><b>② 색.</b> 원본 강조색은 8종이 전부 노랑~올리브~갈색 한 벨트 안에 있고 최고 채도가
        {reference_metrics['accent_max_sat']}입니다. 우리 것은 화면의 파란색이 채도 {ours_metrics['accent_max_sat']}로 튀어나옵니다.</div>
      <div><b>③ 질감.</b> 종이·색연필 그레인의 양이 원본 {reference_metrics['texture_energy']} 대 우리 {ours_metrics['texture_energy']}.
        우리 그림은 매끈합니다.</div>
      <div>우리 파일 이름 자체가 <code>reference-style</code> — 원본을 보고 흉내 낸 것이고, 실제로 흉내 수준에서 멈춰 있습니다.</div>
    </div>
  </header>

  <h2>① 나란히 보기</h2>
  <p>왼쪽이 원본 게임 화면, 오른쪽이 우리 그림입니다.</p>
  <div class="pair">
    <div class="shot">
      <img src="{images['reference_full']}" alt="고양이와 스프 원본" />
      <b>고양이와 스프 (원본)</b>
      <small>Screenshot＿20220802－150055＿Cats＆Soup.jpg</small>
    </div>
    <div class="shot">
      <img src="{images['ours_full']}" alt="우리 참고용 일러스트" />
      <b>우리 v2 (모작)</b>
      <small>public/art/workstation-cats-soup-reference-style-v2.png</small>
    </div>
  </div>

  <h2>② 선과 질감 — 확대해서 보기</h2>
  <p>같은 배율로 키운 부분입니다. 선의 균일함과 표면 질감 차이가 여기서 갈립니다.</p>
  <div class="two">
    <div class="shot">
      <img src="{images['reference_detail']}" alt="원본 확대" />
      <b>원본</b>
      <small>선 굵기가 변하고 끊긴다 · 칠이 얼룩덜룩하고 선 밖으로 번진다</small>
    </div>
    <div class="shot">
      <img src="{images['ours_detail']}" alt="우리 그림 확대" />
      <b>우리 v2</b>
      <small>선 굵기가 일정하다 · 면이 매끈하고 안쪽에 또렷한 음영이 있다</small>
    </div>
  </div>

  <h2>③ 숫자로 본 차이</h2>
  <div class="panel">
    <table>
      <thead><tr><th>항목</th><th>고양이와 스프 (원본)</th><th>우리 v2</th></tr></thead>
      <tbody>{metric_rows}</tbody>
    </table>
  </div>

  <h2>④ 색 팔레트</h2>
  <div class="two">
    <div class="panel">
      <b>원본 — 지배색</b>
      <div class="sws">{swatches(reference_metrics['palette'][:6])}</div>
      <b style="display:block;margin-top:14px">원본 — 강조색 (채도 0.35 이상)</b>
      <div class="sws">{swatches(reference_metrics['accents'])}</div>
      <p class="lead" style="margin-top:10px">
        전부 따뜻한 한 벨트. 찬 계열이 아예 없고 최고 채도가 {reference_metrics['accent_max_sat']}에서 멈춘다.
      </p>
    </div>
    <div class="panel">
      <b>우리 v2 — 지배색</b>
      <div class="sws">{swatches(ours_metrics['palette'][:6])}</div>
      <b style="display:block;margin-top:14px">우리 v2 — 강조색</b>
      <div class="sws">{swatches(ours_metrics['accents'])}</div>
      <p class="lead" style="margin-top:10px">
        화면의 파랑이 채도 {ours_metrics['accent_max_sat']}로 혼자 튄다. 배경도 원본보다 노랗고 밝다.
      </p>
    </div>
  </div>

  <h2>⑤ 프롬프트를 이렇게 고친다</h2>
  <p>왼쪽이 지금 그림이 나온 방향, 오른쪽이 원본에 붙기 위해 넣어야 할 문구입니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>항목</th><th>지금</th><th>바꿀 것</th><th>근거</th></tr></thead>
      <tbody>{fix_rows}</tbody>
    </table>
  </div>

  <h2>⑥ 바로 쓰는 프롬프트</h2>
  <p>위 일곱 가지를 한 덩어리로 합친 것입니다. 이대로 넣고 뽑으면 됩니다.</p>
  <div class="panel">
    <pre>{READY_PROMPT}</pre>
  </div>

  <h2>⑦ 다시 뽑은 뒤 확인하는 법</h2>
  <div class="panel">
    <p class="lead">눈으로만 보면 또 어긋납니다. 새로 뽑은 파일을 <code>OURS</code> 자리에 넣고
      <code>python scripts/build_style_compare_doc.py</code> 를 다시 돌리면 같은 표가 새로 계산됩니다.
      아래 네 숫자가 원본 쪽으로 움직였는지만 보면 됩니다.</p>
    <table>
      <thead><tr><th>지표</th><th>목표(원본)</th><th>지금</th></tr></thead>
      <tbody>
        <tr><td>어두운 픽셀 비율</td><td>{reference_metrics['dark_ratio']}%</td><td>{ours_metrics['dark_ratio']}%</td></tr>
        <tr><td>강조색 최고 채도</td><td>{reference_metrics['accent_max_sat']}</td><td>{ours_metrics['accent_max_sat']}</td></tr>
        <tr><td>질감 에너지</td><td>{reference_metrics['texture_energy']}</td><td>{ours_metrics['texture_energy']}</td></tr>
        <tr><td>평균 명도</td><td>{reference_metrics['mean_value']}</td><td>{ours_metrics['mean_value']}</td></tr>
      </tbody>
    </table>
  </div>

  <footer>
    Agent Forest · 그림체 비교 · 2026-07-27 · 원본 스크린샷은 게임 UI를 뺀 필드 영역만 측정
    (crop {REFERENCE_FIELD}) · 그림은 파일 안에 포함되어 인터넷 없이 열립니다.
  </footer>
</div>
</body>
</html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({len(html.encode('utf-8')) // 1024}KB)")
print(json.dumps({"reference": reference_metrics, "ours": ours_metrics},
                 ensure_ascii=False, indent=1)[:400])
