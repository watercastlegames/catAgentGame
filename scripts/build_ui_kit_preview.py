# -*- coding: utf-8 -*-
"""
UI 키트 미리보기 문서(ui-kit-preview-*.html) 생성.

public/art/ui/ 에 확보된 시트를 전부 투명 격자 위에 얹어 보여주고,
매니페스트(assets/ui-kit-manifest.json)와 대조해 확보/미확보를 표시한다.
팝업 프레임은 border-image 로 실제 9-slice 늘림까지 시연한다.

  python scripts/build_ui_kit_preview.py

주의: 한글이 많다. PowerShell 로 다시 쓰면 인코딩이 깨진다.
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
UI = REPO / "public" / "art" / "ui"
MANIFEST = REPO / "assets" / "ui-kit-manifest.json"
OUT = REPO / "docs" / "ui-kit-preview-20260727.html"

# 시트 파일 → 그 안에 든 항목 id 들
SHEETS = {
    "popup-frame-v1.png": (["popup-frame"], "팝업 본체", "9-slice 로 늘려 쓰는 빈 프레임"),
    "popup-title-ribbon-v1.png": (["popup-title-ribbon"], "제목 리본", "가로로 늘려 쓰는 배너"),
    "tabs-v1.png": (["tab-active", "tab-inactive"], "탭", "왼쪽 선택 / 오른쪽 미선택"),
    "buttons-v1.png": (
        ["button-primary", "button-primary-pressed", "button-disabled", "button-secondary", "button-danger"],
        "버튼 5종",
        "위→아래: 주요 · 눌림 · 비활성 · 보조 · 거절",
    ),
    "cards-v1.png": (
        ["list-card", "list-card-selected", "thumbnail-frame", "divider-dotted"],
        "카드 · 프레임",
        "리스트 카드 / 선택 상태 / 썸네일 프레임 / 점선 구분선",
    ),
    "icons-v1.png": (
        ["icon-lock", "icon-check", "icon-close", "icon-plus", "icon-refresh",
         "icon-acorn", "icon-token", "icon-paw", "icon-bell", "icon-warning"],
        "아이콘 10종",
        "윗줄: 자물쇠·체크·X·＋·교체 / 아랫줄: 도토리·토큰·발바닥·종·경고",
    ),
    "panels-v1.png": (
        ["popup-inner-panel", "toast-frame", "progress-track", "progress-fill"],
        "패널 · 토스트 · 진행막대",
        "안쪽 패널 / 토스트 / 진행 막대(빈 것 + 채운 것)",
    ),
    "badges-v1.png": (
        ["badge-label", "count-pill", "currency-pill", "status-lamp", "popup-close-button", "popup-info-button"],
        "배지 · 램프 · 원형 버튼",
        "라벨+수량 / 재화 알약 / 상태 램프 3종 / 닫기·정보",
    ),
    "extras-v1.png": (
        ["popup-corner-bracket", "tab-badge-dot", "button-dashed", "button-icon-square", "button-chip", "scroll-thumb"],
        "코너 · 점선버튼 · 칩 · 스크롤",
        "코너 꺾쇠 + 알림점 / 점선 추가 버튼 / 정사각 아이콘 버튼(기본·눌림) / 선택 칩(기본·선택) / 스크롤 손잡이",
    ),
    "empty-state-v1.png": (
        ["empty-state"],
        "빈 목록 안내 그림",
        "쿠션에서 잠든 고양이 — '아직 들어온 이벤트가 없습니다' 자리",
    ),
}


def data_uri(path, max_width=520):
    image = Image.open(path).convert("RGBA")
    if image.width > max_width:
        ratio = max_width / image.width
        image = image.resize((max_width, int(image.height * ratio)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
wanted = []
for group in manifest["groups"]:
    for item in group["items"]:
        wanted.append((group["group"], item["id"], item["name"], item.get("used_by", "")))

secured = set()
for contents, *_ in SHEETS.values():
    secured.update(contents)
# 버튼 상태는 매니페스트에서 한 항목으로 묶여 있다
secured.update({"button-primary", "button-secondary", "button-danger"})

cards = ""
total_bytes = 0
for filename, (contents, title, note) in SHEETS.items():
    path = UI / filename
    if not path.exists():
        continue
    size = Image.open(path).size
    total_bytes += path.stat().st_size
    cards += f"""
      <figure class="sheet">
        <div class="shot"><img src="{data_uri(path)}" alt="{title}" /></div>
        <figcaption>
          <b>{title}</b>
          <span class="file">{filename} · {size[0]}×{size[1]} · {path.stat().st_size // 1024}KB</span>
          <span class="note">{note}</span>
          <span class="ids">{" · ".join(contents)}</span>
        </figcaption>
      </figure>"""

rows = ""
current_group = None
done = 0
for group, item_id, name, used_by in wanted:
    if group != current_group:
        rows += f'<tr class="group"><td colspan="4">{group}</td></tr>'
        current_group = group
    ok = item_id in secured
    done += 1 if ok else 0
    rows += (
        f'<tr class="{"ok" if ok else "todo"}"><td><code>{item_id}</code></td><td>{name}</td>'
        f'<td>{used_by}</td><td>{"✔ 확보" if ok else "· 미확보"}</td></tr>'
    )

frame_uri = data_uri(UI / "popup-frame-v1.png", max_width=768)

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>UI 키트 미리보기 — 확보된 이미지 (2026-07-27)</title>
<style>
  :root {{
    --ink:#33302a; --ink-2:#5c564c; --muted:#857e72; --line:#ddd5c6;
    --card:#fffaf0; --ok:#3d6349; --todo:#a5473f; --shadow:0 18px 46px rgba(74,56,43,.13);
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;padding:0 0 72px;color:var(--ink);
    background:radial-gradient(circle at 12% 0%,rgba(226,214,170,.5),transparent 32rem),
      linear-gradient(180deg,#f5efe2 0%,#ece5d5 100%);
    font-family:"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
    line-height:1.62;word-break:keep-all}}
  code{{font-family:"JetBrains Mono","D2Coding",ui-monospace,Consolas,monospace;font-size:.9em}}
  .wrap{{width:min(100% - 32px,1180px);margin:0 auto}}
  header.hero{{margin-top:34px;padding:clamp(24px,4vw,44px);border:1px solid rgba(255,255,255,.6);
    border-radius:26px;background:rgba(255,250,240,.92);box-shadow:var(--shadow)}}
  .kicker{{color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.16em}}
  h1{{margin:8px 0 12px;font-family:Georgia,"Times New Roman",serif;
    font-size:clamp(26px,4.4vw,44px);letter-spacing:-.04em}}
  header.hero p{{margin:0 0 8px;max-width:78ch;color:var(--ink-2);font-size:14.5px}}
  .kpis{{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}}
  .kpi{{display:grid;min-width:120px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;
    background:#fff;color:var(--muted);font-size:11.5px;font-weight:800}}
  .kpi b{{color:var(--ink);font-size:21px;letter-spacing:-.02em}}
  h2{{margin:42px 0 6px;font-size:clamp(20px,3.2vw,29px);letter-spacing:-.03em}}
  h2 + p{{margin:0 0 18px;color:var(--ink-2);font-size:14px}}
  .sheets{{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}}
  .sheet{{margin:0;padding:13px;border:1px solid var(--line);border-radius:20px;background:var(--card);
    box-shadow:var(--shadow)}}
  .shot{{display:grid;place-items:center;padding:10px;border-radius:14px;
    background-color:#fbf6ea;
    background-image:linear-gradient(45deg,#e8dfcc 25%,transparent 25%),
      linear-gradient(-45deg,#e8dfcc 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#e8dfcc 75%),
      linear-gradient(-45deg,transparent 75%,#e8dfcc 75%);
    background-size:18px 18px;
    background-position:0 0,0 9px,9px -9px,-9px 0}}
  .shot img{{max-width:100%;height:auto;display:block}}
  .sheet figcaption{{display:grid;gap:3px;margin-top:9px}}
  .sheet figcaption b{{font-size:14px}}
  .sheet .file{{color:var(--ink-2);font-size:11.5px;font-family:ui-monospace,Consolas,monospace}}
  .sheet .note{{color:var(--ink-2);font-size:12px}}
  .sheet .ids{{color:var(--muted);font-size:10.5px;word-break:break-all}}
  .panel{{padding:20px 22px;border:1px solid var(--line);border-radius:20px;background:var(--card);
    box-shadow:var(--shadow);overflow-x:auto}}
  table{{width:100%;border-collapse:collapse;font-size:12.5px}}
  th,td{{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left}}
  th{{color:var(--muted);font-size:10.5px;letter-spacing:.06em}}
  tr.group td{{background:rgba(133,126,114,.12);font-weight:900;font-size:12px}}
  tr.ok td:last-child{{color:var(--ok);font-weight:800}}
  tr.todo td:last-child{{color:var(--todo);font-weight:800}}
  .stretch-demo{{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-top:6px}}
  .stretch{{border-style:solid;border-width:36px 34px 42px 34px;
    border-image:url("{frame_uri}") 72 72 96 72 fill stretch;
    min-height:150px;padding:12px;color:#6b6155;font-size:12.5px}}
  .stretch.tall{{min-height:280px}}
  .stretch.wide{{min-height:110px}}
  footer{{margin-top:36px;color:var(--muted);font-size:12px}}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">UI KIT PREVIEW · 2026-07-27</span>
    <h1>확보된 UI 이미지</h1>
    <p>
      고양이와 스프 참고 이미지의 문법으로 만든 UI 조각들입니다. 모두 투명 PNG이고,
      글자·아이콘은 앱이 위에 얹도록 <b>속을 비워</b> 뒀습니다. 격자무늬는 투명 영역입니다.
    </p>
    <div class="kpis">
      <div class="kpi"><b>{done}</b>확보</div>
      <div class="kpi"><b>{len(wanted) - done}</b>남음</div>
      <div class="kpi"><b>{len(SHEETS)}</b>시트 파일</div>
      <div class="kpi"><b>{total_bytes // 1024}KB</b>합계</div>
    </div>
  </header>

  <h2>① 확보한 시트</h2>
  <p>파일 하나에 여러 조각이 들어 있습니다. 잘라 쓰는 작업은 다음 단계입니다.</p>
  <div class="sheets">{cards}
  </div>

  <h2>② 팝업 프레임 9-slice 시연</h2>
  <p>같은 그림 한 장을 CSS <code>border-image</code> 로 늘린 것입니다. 모서리가 안 뭉개지면 성공입니다.</p>
  <div class="stretch-demo">
    <div class="stretch">작은 상자</div>
    <div class="stretch tall">세로로 긴 상자 — 승인 쪽지처럼</div>
    <div class="stretch wide">가로로 넓은 상자 — 토스트처럼</div>
  </div>

  <h2>③ 매니페스트 대조</h2>
  <p>계획한 33종 중 무엇이 들어왔고 무엇이 남았는지입니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>id</th><th>이름</th><th>쓰이는 곳</th><th>상태</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>

  <footer>
    Agent Forest · UI 키트 미리보기 · 2026-07-27 ·
    원본 폴더 <code>public/art/ui/</code> · 매니페스트 <code>assets/ui-kit-manifest.json</code> ·
    생성 <code>scripts/build_ui_kit_preview.py</code> · 그림은 파일 안에 포함
  </footer>
</div>
</body>
</html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({len(html.encode('utf-8')) // 1024}KB)")
print(f"확보 {done} / 전체 {len(wanted)} · 시트 {len(SHEETS)}개")
