/**
 * 고양이 스타일 검수 문서(cat-styles-review-*.html)를 다시 만드는 스크립트.
 *
 * 1) 개발서버를 띄운다            npm run dev            (3000이 막혀 있으면 3001)
 * 2) 스타일마다 스틸을 한 장씩 찍는다 — 촬영 페이지는 app/cat-shot/page.tsx
 *      chrome.exe --headless=new --disable-gpu --use-gl=swiftshader --enable-unsafe-swiftshader ^
 *        --hide-scrollbars --default-background-color=00000000 --window-size=520,520 ^
 *        --virtual-time-budget=20000 --screenshot=tmp\cat-shots\Sphynx.png ^
 *        "http://localhost:3001/cat-shot?style=Sphynx"
 * 3) node scripts/build-cat-style-doc.mjs [스틸폴더]     (기본값 tmp/cat-shots)
 *
 * 이미지는 base64 로 문서 안에 박히므로 결과 HTML 한 파일만 있으면 어디서든 열린다.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "tmp", "cat-shots");
const PACK =
  "D:\\UnityProjects\\testSimulation\\agentForest\\Assets\\PolyArt\\Animals\\Cats";
const OUT = path.join(REPO, "docs", "cat-styles-review-20260727.html");

const STYLES = [
  ["Abyssian", "아비시니안", "붉은 갈색 단색. 얼굴만 살짝 밝다."],
  ["Black", "검은 고양이", "완전 검정. 발끝만 회색이 들어간다."],
  ["BlackWhite", "검정·흰 턱시도", "등은 검정, 가슴·발은 흰색."],
  ["Blue", "블루", "회청색 줄무늬. 지금 해변 사무실에서 쓰는 스타일."],
  ["Bobtail", "밥테일", "회색 얼룩에 짧고 뭉툭한 꼬리."],
  ["British", "브리티시 숏헤어", "짙은 청회색. 몸통이 굵고 묵직해 보인다."],
  ["Cream", "크림", "밝은 황갈색 단색."],
  ["Maine", "메인쿤", "은회색 줄무늬 + 흰 양말. 털이 길어 보이는 실루엣."],
  ["Persian", "페르시안", "연한 살구색 단색. 얼굴이 납작한 편."],
  ["Red", "레드 (치즈)", "주황 줄무늬. 가장 눈에 띄는 색."],
  ["RedWhite", "치즈·흰 얼룩", "주황 바탕에 흰 얼룩이 크게 들어간다."],
  ["Siamese", "샴", "크림색 몸에 얼굴·발·꼬리 끝만 어둡다."],
  ["Simple", "심플", "짙은 갈색 체크. 무늬가 가장 단순하다."],
  ["Sphynx", "스핑크스", "분홍빛 무모종. 주름진 피부 톤."],
  ["White", "화이트", "흰색에 옅은 회색 그림자."],
];

const WORLD_STYLE = "Blue";

async function dataUri(file) {
  const buffer = await readFile(file);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function sizeKb(file) {
  const info = await stat(file);
  return Math.round(info.size / 1024);
}

const cards = [];
for (const [id, ko, note] of STYLES) {
  const fbx = path.join(
    REPO,
    "public",
    "models",
    "PolyArt",
    "Animals",
    "Cats",
    "FBX",
    `Lowpoly_Cat_${id}.fbx`,
  );
  cards.push({
    id,
    ko,
    note,
    image: await dataUri(path.join(SHOTS, `${id}.png`)),
    kb: await sizeKb(fbx),
    webPath: `/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_${id}.fbx`,
    sourcePath: `${PACK}\\FBX\\Lowpoly_Cat_${id}.fbx`,
  });
}

const palette = await dataUri(
  path.join(
    REPO,
    "public",
    "models",
    "PolyArt",
    "Animals",
    "Cats",
    "Texture",
    "PolyArt_Cats_color.png",
  ),
);

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

const cardHtml = cards
  .map(
    (card) => `
      <article class="card${card.id === WORLD_STYLE ? " is-current" : ""}">
        <div class="shot"><img src="${card.image}" alt="${esc(card.ko)} 고양이 렌더" loading="lazy" /></div>
        <h3>${esc(card.id)}${card.id === WORLD_STYLE ? '<span class="badge">현재 월드</span>' : ""}</h3>
        <p class="ko">${esc(card.ko)}</p>
        <p class="note">${esc(card.note)}</p>
        <dl>
          <div><dt>웹 경로</dt><dd><code>${esc(card.webPath)}</code></dd></div>
          <div><dt>원본</dt><dd><code class="src">${esc(card.sourcePath)}</code>
            <button type="button" data-copy="${esc(card.sourcePath)}">복사</button></dd></div>
          <div><dt>크기</dt><dd>${card.kb}KB</dd></div>
        </dl>
      </article>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>고양이 스타일 검수 — PolyArt 15종 (2026-07-27)</title>
<style>
  :root {
    --ink: #33302a;
    --ink-2: #5c564c;
    --muted: #857e72;
    --line: #ddd5c6;
    --card: #fffaf0;
    --accent: #466a52;
    --amber: #c68a2e;
    --shadow: 0 18px 46px rgba(74, 56, 43, .13);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 0 72px;
    color: var(--ink);
    background:
      radial-gradient(circle at 12% 0%, rgba(183, 226, 210, .32), transparent 32rem),
      linear-gradient(180deg, #f3ede0 0%, #ece5d5 100%);
    font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    line-height: 1.62;
    word-break: keep-all;
    -webkit-font-smoothing: antialiased;
  }
  code, .mono { font-family: "JetBrains Mono", "D2Coding", ui-monospace, Consolas, monospace; }
  .wrap { width: min(100% - 32px, 1180px); margin: 0 auto; }
  header.hero {
    margin-top: 34px;
    padding: clamp(24px, 4vw, 44px);
    border: 1px solid rgba(255, 255, 255, .6);
    border-radius: 26px;
    background: rgba(255, 250, 240, .9);
    box-shadow: var(--shadow);
  }
  .kicker { color: var(--muted); font-size: 11px; font-weight: 900; letter-spacing: .16em; }
  h1 {
    margin: 8px 0 10px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(30px, 5.4vw, 52px);
    letter-spacing: -.04em;
  }
  header.hero p { margin: 0 0 10px; max-width: 78ch; color: var(--ink-2); font-size: 14.5px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .kpi {
    display: grid;
    min-width: 116px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fff;
    font-size: 11.5px;
    font-weight: 800;
    color: var(--muted);
  }
  .kpi b { color: var(--ink); font-size: 21px; letter-spacing: -.02em; }
  .rootbox {
    margin: 16px 0 0;
    padding: 14px 16px;
    border-left: 4px solid var(--amber);
    border-radius: 0 12px 12px 0;
    background: rgba(198, 138, 46, .09);
    font-size: 13px;
    color: var(--ink-2);
  }
  .rootbox code { font-size: 12px; overflow-wrap: anywhere; }
  h2 {
    margin: 40px 0 6px;
    font-size: clamp(21px, 3.4vw, 30px);
    letter-spacing: -.03em;
  }
  h2 + p { margin: 0 0 18px; color: var(--ink-2); font-size: 14px; }
  .grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(258px, 1fr));
  }
  .card {
    display: flex;
    flex-direction: column;
    padding: 14px 16px 16px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--card);
    box-shadow: var(--shadow);
  }
  .card.is-current { border-color: #8fae94; box-shadow: 0 18px 46px rgba(70, 106, 82, .22); }
  .shot {
    display: grid;
    place-items: center;
    margin: -4px -6px 8px;
    border-radius: 16px;
    background:
      linear-gradient(180deg, #fdf7ea 0%, #f0e6d3 100%);
  }
  .shot img { width: 100%; max-width: 260px; height: auto; display: block; }
  .card h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 17px;
    letter-spacing: -.02em;
  }
  .badge {
    padding: 3px 8px;
    border-radius: 999px;
    background: #dfeadf;
    color: #3d6349;
    font-size: 10px;
    font-weight: 900;
  }
  .ko { margin: 3px 0 2px; color: var(--accent); font-size: 13px; font-weight: 800; }
  .note { margin: 0 0 10px; color: var(--ink-2); font-size: 12.5px; }
  dl { display: grid; margin: auto 0 0; gap: 6px; font-size: 11.5px; }
  dl > div { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: start; }
  dt { color: var(--muted); font-weight: 800; }
  dd { margin: 0; color: var(--ink-2); }
  dd code { font-size: 11px; overflow-wrap: anywhere; }
  dd .src { display: block; margin-bottom: 4px; }
  button[data-copy] {
    padding: 3px 9px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--ink-2);
    font-family: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  button[data-copy]:hover { background: #f4ecdc; }
  .palette {
    display: grid;
    gap: 18px;
    grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
    align-items: center;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--card);
    box-shadow: var(--shadow);
  }
  /* 아틀라스는 아래쪽 40%가 빈 여백이라 색표 부분만 보여 준다. */
  .palette img {
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    object-position: top;
    border: 1px solid var(--line);
    border-radius: 12px;
    image-rendering: pixelated;
  }
  .palette p { margin: 0 0 8px; color: var(--ink-2); font-size: 13.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; }
  th { color: var(--muted); font-size: 11px; letter-spacing: .06em; }
  td code { font-size: 11.5px; overflow-wrap: anywhere; }
  .panel {
    padding: 20px 22px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--card);
    box-shadow: var(--shadow);
  }
  .panel ul { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 13.5px; }
  .panel li + li { margin-top: 6px; }
  footer { margin-top: 34px; color: var(--muted); font-size: 12px; }
  @media (max-width: 700px) { .palette { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <span class="kicker">CAT STYLE REVIEW · 2026-07-27</span>
    <h1>고양이 스타일 15종</h1>
    <p>
      해변 사무실(Agent Forest)은 지금 <b>Blue</b> 한 종류만 쓰고 있습니다. 같은 PolyArt 팩에
      들어 있는 나머지 스타일까지 전부 실제로 렌더해서 한 장에 모았습니다. 아래 그림은 그림 소재가
      아니라 <b>이 저장소에 들어온 FBX를 게임과 같은 조명·외곽선 설정으로 찍은 것</b>이라,
      화면에 올렸을 때 보이는 모습 그대로입니다.
    </p>
    <p>
      이 문서는 <b>고르기용</b>입니다. 고른다고 게임이 바뀌지는 않고, 월드에 배정하는 작업은
      따로 요청하시면 그때 붙입니다.
    </p>
    <div class="kpis">
      <div class="kpi"><b>15</b>스타일</div>
      <div class="kpi"><b>1</b>공용 팔레트 텍스처</div>
      <div class="kpi"><b>2.6MB</b>FBX 합계</div>
      <div class="kpi"><b>1</b>현재 월드 사용</div>
    </div>
    <div class="rootbox">
      원본 팩 <code>${esc(PACK)}\\FBX\\</code><br />
      이 저장소 <code>${esc(REPO)}\\public\\models\\PolyArt\\Animals\\Cats\\FBX\\</code><br />
      돌아가는 3D 진열대는 개발서버에서 <code>/cats</code> 로 볼 수 있습니다(제자리에서 천천히 회전).
    </div>
  </header>

  <h2>스타일 전체</h2>
  <p>이름은 팩의 파일명 그대로입니다. 초록 테두리가 지금 게임에서 쓰는 스타일입니다.</p>
  <div class="grid">${cardHtml}
  </div>

  <h2>15종이 텍스처 한 장을 나눠 쓴다</h2>
  <p>스타일마다 색이 다른 이유는 텍스처가 달라서가 아니라 UV가 다른 칸을 가리키기 때문입니다.</p>
  <div class="palette">
    <img src="${palette}" alt="PolyArt 고양이 팔레트 텍스처" />
    <div>
      <p>
        <code>PolyArt_Cats_color.png</code> — 1024×1024 팔레트 아틀라스 <b>8KB</b> 한 장.
        스타일마다 UV가 이 색표의 다른 칸을 물고 있어서 색이 달라집니다.
      </p>
      <p>
        <b>다만 메시까지 같은 건 아닙니다.</b> 나중에 실측해 보니 정점 수가 8,844(Bobtail)~9,528(Red·Simple)로
        제각각이고, 좌표 해시 기준 15종 중 14종이 서로 다른 메시였습니다(Red와 Simple만 정점이 같고 UV만 다름).
        털 길이·꼬리 모양이 스타일마다 조금씩 다르기 때문입니다. <b>체형(폭 0.130~0.149)은 사실상 같습니다.</b>
        자세한 실측과 통통한 체형 검토는 <code>cat-body-review-20260727.html</code> 에 있습니다.
      </p>
      <p>
        어쨌든 <b>스타일을 늘려도 텍스처는 늘지 않습니다.</b> FBX 하나당 175~185KB만 추가됩니다.
        브라우저에서는 FBX 안에 적힌 텍스처 경로가 풀리지 않아, 코드에서 이 파일을 직접 물려 줍니다.
      </p>
    </div>
  </div>

  <h2>이 팩에서 뺀 것</h2>
  <p>같은 폴더에 있지만 스타일이 아니라 제외했습니다.</p>
  <div class="panel">
    <table>
      <thead><tr><th>파일</th><th>크기</th><th>제외한 이유</th></tr></thead>
      <tbody>
        <tr><td><code>Lowpoly_Cat_All.fbx</code></td><td>2.0MB</td><td>데모 씬용으로 여러 마리가 한 파일에 들어 있는 통짜. 개별 스타일이 아님</td></tr>
        <tr><td><code>Lowpoly_Cat_Animations_IP.fbx</code></td><td>14MB</td><td>애니메이션 전용(In Place). 월드에서 이미 쓰는 중이라 진열대엔 불필요</td></tr>
        <tr><td><code>Lowpoly_Cat_Animations_RM.fbx</code></td><td>14MB</td><td>애니메이션 전용(Root Motion). 이 프로젝트는 IP 쪽을 씀</td></tr>
      </tbody>
    </table>
  </div>

  <h2>이 그림은 어떻게 찍었나</h2>
  <div class="panel">
    <ul>
      <li>촬영 페이지 <code>app/cat-shot/page.tsx</code> — <code>/cat-shot?style=Sphynx</code> 처럼 한 마리만 배경 없이 렌더합니다.</li>
      <li>헤드리스 크로미움으로 <code>--window-size=520,520 --default-background-color=00000000</code> 스크린샷 15장.</li>
      <li>카메라는 게임과 같은 <b>정사영(Orthographic)</b>, 3/4 방향(<code>yaw −0.62rad</code>), 대상 바운딩박스에 맞춰 자동 프레이밍.</li>
      <li>조명·외곽선(<code>OutlineEffect</code>, 두께 0.0045, 색 #6f5040)은 해변 사무실과 같은 값입니다.</li>
      <li>키 높이는 월드와 동일하게 0.86로 정규화 — 그래서 <b>실제 크기 비율이 아니라</b> 모두 같은 키로 맞춰 보입니다.</li>
    </ul>
  </div>

  <footer>
    Agent Forest · 고양이 스타일 검수 문서 · 2026-07-27 생성 · 이미지 15장은 이 파일 안에 포함되어 있어 인터넷 없이도 열립니다.
  </footer>
</div>
<script>
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-copy]");
  if (!button) return;
  const text = button.dataset.copy;
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try { document.execCommand("copy"); } catch (error) {}
  document.body.removeChild(area);
  const original = button.textContent;
  button.textContent = "복사됨";
  setTimeout(() => { button.textContent = original; }, 1100);
});
</script>
</body>
</html>
`;

await writeFile(OUT, html, "utf8");
console.log(`wrote ${OUT} (${Math.round(Buffer.byteLength(html) / 1024)}KB)`);
