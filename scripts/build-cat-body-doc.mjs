/**
 * 고양이 체형 검수 문서(cat-body-review-*.html)를 만드는 스크립트.
 *
 * 스틸은 촬영 페이지 app/cat-shot/page.tsx 로 찍는다. 쓸 수 있는 파라미터:
 *   ?style=Blue            팩 안의 스타일
 *   ?url=/models/...fbx    팩 밖의 모델
 *   ?tex=/models/...png    텍스처 강제 지정
 *   ?fat=1.45&sag=1&legs=0.7   체형 (app/cat-body.ts)
 *   ?anim=Walk_F&t=0.5     그 시각의 애니메이션 포즈로 정지
 *   ?half=0.62             자동 프레이밍을 끄고 고정 배율 — 비교 컷에 필수
 *   ?yaw=-1.5708           옆모습
 *
 * node scripts/build-cat-body-doc.mjs [스틸폴더]   (기본 tmp/cat-body-shots)
 *
 * 주의: 이 파일에는 한글이 많다. PowerShell 의 Get-Content/Set-Content 로 다시 쓰면
 * 인코딩이 깨진다. 편집은 에디터나 Write 도구로 할 것.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "tmp", "cat-body-shots");
const OUT = path.join(REPO, "docs", "cat-body-review-20260727.html");

// /cat-inspect 페이지에서 실측한 값(원본 FBX 단위, 정규화 전).
const MEASURED = [
  ["Abyssian", 9120, 0.138, 0.388, 0.627],
  ["Black", 9060, 0.142, 0.39, 0.634],
  ["BlackWhite", 9042, 0.141, 0.386, 0.635],
  ["Blue", 9018, 0.144, 0.39, 0.634],
  ["Bobtail", 8844, 0.13, 0.395, 0.481],
  ["British", 9030, 0.145, 0.386, 0.634],
  ["Cream", 9060, 0.141, 0.386, 0.635],
  ["Maine", 9300, 0.149, 0.4, 0.635],
  ["Persian", 9030, 0.146, 0.389, 0.62],
  ["Red", 9528, 0.141, 0.386, 0.635],
  ["RedWhite", 9480, 0.141, 0.386, 0.635],
  ["Siamese", 9120, 0.142, 0.384, 0.63],
  ["Simple", 9528, 0.141, 0.386, 0.635],
  ["Sphynx", 9060, 0.132, 0.397, 0.614],
  ["White", 9060, 0.141, 0.385, 0.633],
];

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

async function shot(name) {
  const buffer = await readFile(path.join(SHOTS, `${name}.png`));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

const images = Object.fromEntries(
  await Promise.all(
    [
      "blue-100",
      "blue-125",
      "blue-145",
      "blue-170",
      "maine-145",
      "anim-walk-100",
      "anim-walk-145",
      "anim-sit-145",
      "probe2-Cat_1",
      "probe2-Cat_2",
      "probe2-Cat_3",
      "probe2-Cat_4",
      "probe2-Cat_5",
      "sag-a",
      "sag-b",
      "sag-c",
      "sag-d",
      "sag-walk",
      "sag-sit",
      "sag-side",
      "side-100",
      "side-145",
      "side-170",
      "side-195",
      "old-lumpy",
    ].map(async (name) => [name, await shot(name)]),
  ),
);

const widths = MEASURED.map(([, , width]) => width);
const minWidth = Math.min(...widths);
const maxWidth = Math.max(...widths);

const measuredRows = MEASURED.map(
  ([id, verts, width, height, length]) => `
        <tr${id === "Blue" ? ' class="is-current"' : ""}>
          <td><b>${esc(id)}</b>${id === "Blue" ? ' <span class="badge">현재</span>' : ""}</td>
          <td>${verts.toLocaleString("ko-KR")}</td>
          <td>${width.toFixed(3)}</td>
          <td>${height.toFixed(3)}</td>
          <td>${length.toFixed(3)}</td>
          <td>${(width / length).toFixed(3)}</td>
        </tr>`,
).join("");

function cards(entries) {
  return entries
    .map(
      ([key, title, note]) => `
      <figure class="card">
        <img src="${images[key]}" alt="${esc(title)}" />
        <figcaption><b>${esc(title)}</b><span>${esc(note)}</span></figcaption>
      </figure>`,
    )
    .join("");
}

const fatCards = cards([
  ["blue-100", "fat = 1.0", "원본. 지금 해변 사무실에 서 있는 몸이다."],
  ["blue-125", "fat = 1.25", "살짝 도톰. 옆에 놓고 봐야 차이가 보이는 정도."],
  ["blue-145", "fat = 1.45", "확실히 통통. 다리·머리는 그대로라 비율이 안 무너진다."],
  ["blue-170", "fat = 1.7", "많이 부풀림. 이 이상은 배가 다리를 먹는다."],
]);

const animCards = cards([
  ["anim-walk-100", "걷기 · 원본", "Walk_F 클립 0.5초 지점."],
  ["anim-walk-145", "걷기 · fat 1.45", "같은 클립, 같은 시각. 다리 움직임 그대로."],
  ["anim-sit-145", "앉기 · fat 1.45", "Caress_sitting 1.2초 지점. 앉은 자세도 안 깨진다."],
]);

const sagCards = cards([
  ["sag-a", "sag 0 · legs 1.0", "폭만 키운 상태. 고르게 부풀어서 통은 굵은데 배가 안 처진다."],
  ["sag-b", "sag 0.6 · legs 0.85", "아랫배가 내려오기 시작하고 다리가 15% 짧아졌다."],
  ["sag-c", "sag 1.0 · legs 0.7", "배가 확실히 처지고 다리도 짧다. 요청하신 느낌."],
  ["sag-d", "belly 1.95 · sag 1.0 · legs 0.6", "최대치. 배가 다리 사이를 거의 덮는다."],
]);

const sideCards = cards([
  ["side-100", "원본", "등에서 배까지 거의 일직선. 배 라인이 위로 붙어 있다."],
  ["side-145", "belly 1.45 · sag 0.6 · legs 0.9", "배가 살짝 내려오고 다리가 짧아진다."],
  ["side-170", "belly 1.7 · sag 1.0 · legs 0.7", "앞다리와 뒷다리 사이가 축 처진다."],
  ["side-195", "belly 1.95 · sag 1.0 · legs 0.6", "배가 다리 사이를 거의 채운다."],
]);

const sagAnimCards = cards([
  ["sag-walk", "걷기", "Walk_F 0.5초. 무거운 몸으로도 다리 동작 그대로."],
  ["sag-sit", "앉기", "Caress_sitting 1.2초. 앉은 자세에서 배가 접힌다."],
  ["sag-side", "다른 색(Cream)", "같은 설정을 다른 스타일에 그대로 적용."],
]);

const probeCards = [1, 2, 3, 4, 5]
  .map(
    (index) => `
      <figure class="card">
        <img src="${images[`probe2-Cat_${index}`]}" alt="Cat_${index}" />
        <figcaption><b>Cat_${index}</b><span>색만 다르고 메시는 5종 모두 동일</span></figcaption>
      </figure>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>고양이 체형 검수 — 통통한 고양이가 가능한가 (2026-07-27)</title>
<style>
  :root {
    --ink: #33302a; --ink-2: #5c564c; --muted: #857e72; --line: #ddd5c6;
    --card: #fffaf0; --accent: #466a52; --amber: #c68a2e; --warn: #a5473f;
    --shadow: 0 18px 46px rgba(74, 56, 43, .13);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 0 72px; color: var(--ink);
    background:
      radial-gradient(circle at 12% 0%, rgba(183, 226, 210, .32), transparent 32rem),
      linear-gradient(180deg, #f3ede0 0%, #ece5d5 100%);
    font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    line-height: 1.62; word-break: keep-all; -webkit-font-smoothing: antialiased;
  }
  code { font-family: "JetBrains Mono", "D2Coding", ui-monospace, Consolas, monospace; }
  .wrap { width: min(100% - 32px, 1180px); margin: 0 auto; }
  header.hero {
    margin-top: 34px; padding: clamp(24px, 4vw, 44px);
    border: 1px solid rgba(255, 255, 255, .6); border-radius: 26px;
    background: rgba(255, 250, 240, .9); box-shadow: var(--shadow);
  }
  .kicker { color: var(--muted); font-size: 11px; font-weight: 900; letter-spacing: .16em; }
  h1 {
    margin: 8px 0 12px; font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(28px, 5vw, 48px); letter-spacing: -.04em;
  }
  header.hero p, .lead { margin: 0 0 10px; max-width: 80ch; color: var(--ink-2); font-size: 14.5px; }
  .verdict {
    display: grid; gap: 10px; margin-top: 18px; padding: 18px 20px;
    border-left: 5px solid var(--accent); border-radius: 0 14px 14px 0;
    background: rgba(70, 106, 82, .09); font-size: 14px;
  }
  .verdict b { color: var(--accent); }
  h2 { margin: 42px 0 6px; font-size: clamp(20px, 3.2vw, 29px); letter-spacing: -.03em; }
  h2 + p { margin: 0 0 18px; color: var(--ink-2); font-size: 14px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card {
    display: flex; flex-direction: column; margin: 0; padding: 12px;
    border: 1px solid var(--line); border-radius: 18px; background: var(--card);
    box-shadow: var(--shadow);
  }
  .card img {
    width: 100%; height: auto; border-radius: 14px;
    background: linear-gradient(180deg, #fdf7ea 0%, #f0e6d3 100%);
  }
  .card figcaption { display: grid; gap: 2px; margin-top: 8px; }
  .card figcaption b { font-size: 14px; }
  .card figcaption span { color: var(--ink-2); font-size: 12px; }
  .panel {
    padding: 20px 22px; border: 1px solid var(--line); border-radius: 20px;
    background: var(--card); box-shadow: var(--shadow);
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
  th { color: var(--muted); font-size: 11px; letter-spacing: .06em; }
  tr.is-current td { background: rgba(70, 106, 82, .08); }
  .badge {
    padding: 2px 7px; border-radius: 999px; background: #dfeadf;
    color: #3d6349; font-size: 10px; font-weight: 900;
  }
  .ways { display: grid; gap: 14px; }
  .way {
    display: grid; gap: 6px; padding: 16px 18px; border: 1px solid var(--line);
    border-radius: 16px; background: var(--card);
  }
  .way.pick { border-color: #8fae94; background: #fbfff8; }
  .way h3 { margin: 0; font-size: 15.5px; }
  .way p { margin: 0; color: var(--ink-2); font-size: 13px; }
  .tag {
    justify-self: start; padding: 3px 9px; border-radius: 999px;
    font-size: 10.5px; font-weight: 900;
  }
  .tag.no { background: #fbeceb; color: var(--warn); }
  .tag.yes { background: #dfeadf; color: #3d6349; }
  pre {
    margin: 10px 0 0; padding: 12px 14px; border-radius: 12px;
    background: #262533; color: #ece7de; font-size: 12px; overflow-x: auto;
  }
  .rootbox {
    margin-top: 14px; padding: 13px 16px; border-left: 4px solid var(--amber);
    border-radius: 0 12px 12px 0; background: rgba(198, 138, 46, .09);
    font-size: 13px; color: var(--ink-2);
  }
  footer { margin-top: 36px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">CAT BODY REVIEW · 2026-07-27</span>
    <h1>통통한 고양이, 가능한가</h1>
    <p>
      "지금 고양이가 너무 날씬하다, 도톰한 체형은 없나"에 대한 조사 결과입니다.
      숫자는 전부 <b>브라우저에서 FBX를 직접 열어 실측</b>한 값이고, 그림은 전부 실제 렌더입니다.
    </p>
    <div class="verdict">
      <div><b>① 쓰고 있는 팩(PolyArt) 안에는 통통한 체형이 없다.</b> 15종의 몸통 폭이
        ${minWidth.toFixed(3)}~${maxWidth.toFixed(3)} 로 최대 차이가 ${Math.round((maxWidth / minWidth - 1) * 100)}%에 불과합니다.
        털·꼬리·색만 다른 <b>같은 체형</b>입니다. 모프 타깃(체형 슬라이더)도 0개입니다.</div>
      <div><b>② 통통한 고양이는 다른 팩에 있다.</b> SonFootballerTycoon 쪽 <code>Cat_1~5.fbx</code> 가
        둥글둥글한 체형입니다(폭÷길이 0.38 vs PolyArt 0.23). 다만 <b>뼈가 15개뿐이라 지금 쓰는 애니메이션 68클립과 호환되지 않습니다.</b></div>
      <div><b>③ 그래서 코드로 살을 붙였고, 실제로 됩니다.</b> 몸통 축에서 방사 방향으로 부풀리는 방식이라
        걷기·앉기 애니메이션이 그대로 살아 있습니다.</div>
      <div><b>지금 게임에는 적용하지 않았습니다.</b> 프리셋만 고르시면 한 줄로 켭니다.</div>
    </div>
  </header>

  <h2>① 팩 안에는 통통이가 없다 — 실측표</h2>
  <p>정규화 전 원본 FBX 단위입니다. 맨 오른쪽이 "폭 ÷ 길이" — 클수록 통통합니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>스타일</th><th>정점</th><th>폭(X)</th><th>키(Y)</th><th>길이(Z)</th><th>폭÷길이</th></tr></thead>
      <tbody>${measuredRows}
      </tbody>
    </table>
    <div class="rootbox">
      <b>덤으로 확인된 것</b> — 15종은 텍스처만 다른 게 아니라 <b>메시 자체가 서로 다릅니다</b>(정점 8,844~9,528).
      Bobtail은 꼬리가 짧아 길이가 0.481로 확 짧고, Red와 Simple만 정점 좌표가 완전히 같습니다(둘은 UV만 다름).
      먼저 만든 스타일 문서에 "메시는 모두 동일"이라고 적었던 부분은 이 실측으로 바로잡았습니다.
    </div>
  </div>

  <h2>② 체형을 바꾸는 세 가지 방법</h2>
  <p>이 리그의 조건(뼈 36개, 모프 0개, 클립 68개가 전부 <code>.scale</code> 트랙 보유)에서 따져본 결과입니다.</p>
  <div class="ways">
    <div class="way">
      <span class="tag no">기각</span>
      <h3>모델 전체를 비균등 스케일</h3>
      <p><code>model.scale.set(1.4, 0.95, 1)</code> 한 줄. 가장 싸지만 다리·머리·꼬리까지 같이 굵어져서
        "살찐 고양이"가 아니라 "가로로 눌린 고양이"가 됩니다.</p>
    </div>
    <div class="way">
      <span class="tag no">기각</span>
      <h3>몸통 뼈만 키우기</h3>
      <p>이론상 가장 깔끔하지만, 이 팩의 애니메이션 클립 68개가 <b>모든 뼈에 <code>.scale</code> 트랙을 갖고 있습니다</b>
        (트랙 종류별 개수: position 2,516 / quaternion 2,516 / <b>scale 2,516</b>).
        뼈 스케일을 키워 놔도 믹서가 매 프레임 1로 덮어씁니다. 클립을 직접 고쳐 쓰면 가능하지만 68개를 손봐야 합니다.</p>
    </div>
    <div class="way pick">
      <span class="tag yes">채택</span>
      <h3>바인드 포즈 정점을 몸통 축 기준으로 부풀리기</h3>
      <p>스키닝이 적용되기 <b>전</b>의 정점을 건드리므로 애니메이션과 충돌하지 않습니다.
        몸통 뼈(<code>Spine_base·spine_02·spine_03</code>) 가중치를 마스크로 쓰되, 그 값을 그대로 쓰지 않고
        <b>매끄럽게 편 다음</b> 등뼈 축에서의 방사 방향으로 밀어냅니다. 구현은 <code>app/cat-body.ts</code> 의 <code>fattenCat()</code>.</p>
      <pre>// 로딩 직후 한 줄
fattenCat(model, { belly: 1.7, sag: 1, legs: 0.7 });</pre>
    </div>
  </div>

  <h2>③ 강도별 비교</h2>
  <p>같은 Blue 고양이에 배율만 바꿔 찍었습니다. 다리 굵기와 머리 크기가 안 변하는 점을 보세요.</p>
  <div class="grid">${fatCards}
  </div>

  <h2>④ 애니메이션은 그대로 산다</h2>
  <p>살찌운 모델에 실제 클립을 물려 특정 시각에서 정지시킨 그림입니다. 스키닝이 깨지지 않았습니다.</p>
  <div class="grid">${animCards}
  </div>

  <h2>⑤ 배는 아래로 처지게, 다리는 짧게</h2>
  <p>
    "폭만 키우니 통이 굵어질 뿐 배가 안 나온다"는 지적에 따라 조절 손잡이를 셋으로 나눴습니다.
    실제 살찐 고양이처럼 <b>살이 아래로 쏠리고</b>, 다리는 몸에 파묻혀 짧아 보이게 만듭니다.
  </p>
  <div class="panel" style="margin-bottom:18px">
    <table>
      <thead><tr><th>손잡이</th><th>하는 일</th><th>범위</th></tr></thead>
      <tbody>
        <tr><td><code>belly</code></td><td>몸통 둘레 배율. 등뼈 축에서 방사 방향으로 부푼다</td><td>1.0 ~ 2.0</td></tr>
        <tr><td><code>sag</code></td><td>갈비뼈~뒷다리 사이 뱃살이 아래로 처진다. 등·목·엉덩이는 그대로</td><td>0 ~ 1</td></tr>
        <tr><td><code>legs</code></td><td>엉덩이 아래 구간만 세로로 눌러 다리를 줄이고, 몸통은 그만큼 통째로 내린다</td><td>0.6 ~ 1.0</td></tr>
      </tbody>
    </table>
    <pre>fattenCat(model, { belly: 1.7, sag: 1, legs: 0.7 });</pre>
  </div>
  <div class="grid">${sagCards}
  </div>

  <h2>⑥ 옆에서 본 배 라인</h2>
  <p>배가 처졌는지는 <b>옆모습</b>이라야 보입니다. 넷 다 같은 배율로 고정해 찍었습니다.</p>
  <div class="grid">${sideCards}
  </div>

  <div class="panel" style="margin-top:22px">
    <h3 style="margin:0 0 8px;font-size:16px">울퉁불퉁하던 첫 판을 고친 내역</h3>
    <p class="lead">
      처음 만든 판은 배가 한쪽만 불룩하고 표면이 우글거려 "임신한 고양이"처럼 보였습니다.
      원인이 셋이었고 전부 고쳤습니다.
    </p>
    <table>
      <thead><tr><th>원인</th><th>고친 방법</th></tr></thead>
      <tbody>
        <tr>
          <td>스킨 가중치를 그대로 배율에 곱함 — 정점마다 값이 튀어 표면이 우글거림</td>
          <td>같은 위치의 정점을 하나로 묶고(비인덱스 메시라 한 점이 여러 번 들어 있음),
              삼각형 인접 그래프로 <b>라플라시안 스무딩 3회</b>를 돌린 뒤 사용</td>
        </tr>
        <tr>
          <td>X축으로만 늘려서 단면이 납작해짐</td>
          <td>슬라이스마다 등뼈 높이를 구해 <b>축에서의 방사 방향</b>으로 밀어 단면을 둥글게 유지.
              등은 55%만, 배는 100% 부풀게 나눔</td>
        </tr>
        <tr>
          <td>배 가운데만 뭉쳐서 임신한 것처럼 보임</td>
          <td>몸통 길이 방향으로 <b>목·엉덩이에서 0으로 수렴하는 종 모양</b> 프로파일을 곱하고,
              처짐은 갈비뼈~뒷다리 사이(길이의 62% 지점)에 종 모양으로 몰아 줌</td>
        </tr>
      </tbody>
    </table>
    <div class="grid" style="margin-top:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      <figure class="card">
        <img src="${images["old-lumpy"]}" alt="고치기 전" />
        <figcaption><b>고치기 전</b><span>표면이 우글거리고 배가 한쪽만 불룩</span></figcaption>
      </figure>
      <figure class="card">
        <img src="${images["sag-d"]}" alt="고친 뒤" />
        <figcaption><b>고친 뒤 (같은 설정)</b><span>실루엣이 매끄럽고 배가 고르게 처진다</span></figcaption>
      </figure>
    </div>
  </div>

  <p style="margin-top:26px" class="lead">움직임도 그대로입니다.</p>
  <div class="grid">${sagAnimCards}
  </div>

  <h2>⑦ 다른 팩의 통통한 고양이</h2>
  <p>SonFootballerTycoon 프로젝트에 있던 <code>Assets\\Project Data\\Game\\Models\\Animals\\Cat_1~5.fbx</code> 입니다.</p>
  <div class="grid">${probeCards}
  </div>
  <div class="panel" style="margin-top:16px">
    <table>
      <thead><tr><th>항목</th><th>PolyArt (현재)</th><th>Animals 팩 (통통)</th></tr></thead>
      <tbody>
        <tr><td>폭 ÷ 길이</td><td>0.227</td><td><b>0.377</b> — 훨씬 둥글다</td></tr>
        <tr><td>정점</td><td>9,018</td><td>2,262 — 더 단순한 로우폴리</td></tr>
        <tr><td>뼈</td><td>36개</td><td><b>15개</b></td></tr>
        <tr><td>내장 애니메이션</td><td>별도 파일 68클립(걷기·앉기·꾹꾹이 등)</td><td><b>0개</b> — <code>A_Cat_Idle.fbx</code>·<code>A_Cat_Walk.fbx</code> 두 개뿐</td></tr>
        <tr><td>텍스처</td><td>팔레트 아틀라스(코드에서 직접 물려 줌)</td><td>FBX 안 경로가 남의 PC 바탕화면 psd로 깨져 있음 → <code>Animals_Atlas.png</code> 를 직접 물려야 나옴</td></tr>
        <tr><td>5종 차이</td><td>메시가 서로 다름</td><td>메시 완전 동일, 색만 다름</td></tr>
      </tbody>
    </table>
    <div class="rootbox">
      <b>이 팩으로 갈아타면</b> 리그가 달라 지금 애니메이션(꾹꾹이·타이핑·앉기 포함 68개)을 못 씁니다.
      Idle·Walk 두 개만 남고 나머지 연출은 새로 만들어야 합니다. 체형 하나 때문에 치르기엔 큰 비용이라
      <b>③ 방식(코드로 살찌우기)을 권합니다.</b>
    </div>
  </div>

  <h2>⑧ 다음 결정</h2>
  <div class="panel">
    <p class="lead">고르실 것은 <b>프리셋 하나</b>입니다.</p>
    <table>
      <thead><tr><th>프리셋</th><th>설정</th><th>느낌</th></tr></thead>
      <tbody>
        <tr><td>살짝</td><td><code>belly 1.25 · sag 0.4 · legs 0.95</code></td><td>말 안 하면 모를 정도</td></tr>
        <tr><td><b>보통</b></td><td><code>belly 1.45 · sag 0.6 · legs 0.9</code></td><td>통통한 집고양이</td></tr>
        <tr class="is-current"><td><b>뚱냥이</b> <span class="badge">요청하신 느낌</span></td><td><code>belly 1.7 · sag 1.0 · legs 0.7</code></td><td>배가 축 처지고 다리가 짧다</td></tr>
        <tr><td>최대</td><td><code>belly 1.95 · sag 1.0 · legs 0.6</code></td><td>배가 다리 사이를 덮는다</td></tr>
      </tbody>
    </table>
    <p class="lead" style="margin-top:14px">정하시면 <code>app/agent-world-3d.tsx</code> 의 고양이 로딩 직후에
      <code>fattenCat(model, 프리셋)</code> 한 줄을 넣습니다. 보조 고양이(다른 좌석)도 같은 모델을 복제해 쓰므로
      한 곳만 고치면 전부 반영됩니다. 좌석마다 다른 값을 주면 "뚱냥이 / 날씬이"가 섞인 사무실도 됩니다.</p>
  </div>

  <footer>
    Agent Forest · 고양이 체형 검수 · 2026-07-27 · 실측은 <code>/cat-inspect</code>, 촬영은 <code>/cat-shot</code>,
    문서 생성은 <code>scripts/build-cat-body-doc.mjs</code> · 그림은 파일 안에 포함되어 인터넷 없이 열립니다.
  </footer>
</div>
</body>
</html>
`;

await writeFile(OUT, html, "utf8");
console.log(`wrote ${OUT} (${Math.round(Buffer.byteLength(html) / 1024)}KB)`);
