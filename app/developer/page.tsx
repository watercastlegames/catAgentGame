import Link from "next/link";

export const metadata = {
  title: "개발자 정보 — Agent Forest",
  description:
    "Agent Forest를 만든 Water Castle Games의 개발 기록과 다른 게임들",
};

type GameCard = {
  href: string;
  external?: boolean;
  icon: string;
  tag: string;
  title: string;
  body: string;
  cta: string;
  current?: boolean;
};

const GAMES: GameCard[] = [
  {
    href: "https://play.google.com/store/apps/details?id=com.SonFootballerTycoon.WaterCastleGames&hl=ko",
    external: true,
    icon: "/art/developer/game-son-tycoon-v1.jpg",
    tag: "MOBILE FOOTBALL TYCOON",
    title: "SON 키우기 타이쿤 : 아들을 축구 월클선수로",
    body: "아들을 훈련시키고 커리어를 성장시켜 세계적인 축구 선수로 키우는 모바일 육성 타이쿤 게임입니다.",
    cta: "Google Play에서 보기 →",
  },
  {
    href: "https://sidak.kr/autodev/GameCreator/crimeGame/",
    external: true,
    icon: "/art/developer/game-crime-case01-v1.png",
    tag: "AI MYSTERY · FREE",
    title: "마크의 마지막 수리 · CASE 01",
    body: "사진 속 단서를 조사하고 동료와 의견을 나누고 집사에게 질문하며 사건의 전말을 완성하는 AI 추리 게임입니다. 소스도 전체 공개했습니다.",
    cta: "브라우저에서 바로 플레이 →",
  },
  {
    href: "https://sidak.kr/autodev/GameCreator/hormuz/",
    external: true,
    icon: "/art/developer/game-hormuz-v1.webp",
    tag: "BROWSER 3D STRATEGY · FREE",
    title: "HORMUZ · 대통령 상황실",
    body: "호르무즈 해협의 실제 지형 위에서 54일의 전쟁과 정치를 지휘하는 브라우저 3D 전략 게임입니다.",
    cta: "브라우저에서 바로 플레이 →",
  },
  {
    href: "/",
    icon: "/art/developer/game-agent-forest-v1.jpg",
    tag: "AI WORKSPACE · FREE",
    title: "Agent Forest · 해변 사무실",
    body: "지금 보고 있는 서비스입니다. 내 PC의 Codex 세션을 해변에서 일하는 고양이로 바꿔 보여줍니다.",
    cta: "해변 사무실 열기 →",
    current: true,
  },
];

const STACK = [
  {
    tag: "FRONTEND",
    title: "Next.js · three.js 2.5D 사무실",
    body: "해변과 고양이는 three.js로 그립니다. 외곽선 두 번 그리기와 캔버스 이름표로 손그림 느낌을 냈고, 모바일 브라우저에서도 설치 없이 바로 돌아갑니다.",
  },
  {
    tag: "EDGE RUNTIME",
    title: "Cloudflare Workers · D1",
    body: "서버를 따로 두지 않고 엣지에서 돌립니다. 페어링 정보만 D1에 저장하고, 게임 진행은 브라우저에 남습니다.",
  },
  {
    tag: "REAL WORK",
    title: "내 PC의 Codex CLI와 직접 연결",
    body: "6자리 코드로 내 PC의 세션과 짝을 짓습니다. 작업 지시·승인·중단은 게임을 거치지 않고 그대로 전달됩니다.",
  },
  {
    tag: "VIBE CODING",
    title: "기획부터 검증까지 AI와 함께",
    body: "기획서, 코드, 3D 소품, 밸런스 시뮬레이션, 회귀 테스트까지 AI와 대화하며 만들었습니다. 고양이 15종과 소품은 이미지 한 장에서 3D로 만들어 웹용으로 줄였습니다.",
  },
];

export default function DeveloperPage() {
  return (
    <main className="developer-page">
      <header className="developer-nav">
        <Link className="back-link" href="/">
          ← 사무실로
        </Link>
        <span>WATER CASTLE GAMES</span>
      </header>

      <section className="developer-hero" aria-labelledby="developerTitle">
        <div className="hero-copy">
          <span className="eyebrow">DEVELOPER FILE</span>
          <h1 id="developerTitle">
            AI가 일하는 걸<br />
            <em>눈으로 보고 싶었습니다.</em>
          </h1>
          <p>
            터미널에서 Codex가 무언가 하고 있는데, 지금 뭘 하는 중인지 로그를
            읽기 전엔 알 수 없었습니다. 그래서 작업 상태를 해변에서 일하는
            고양이의 행동으로 바꿔봤습니다. 일을 맡기면 자리로 걸어가 앉고,
            끝내면 보고하러 옵니다.
          </p>
          <div className="hero-actions">
            <Link className="primary-link" href="/">
              지금 열어보기
            </Link>
            <a
              className="secondary-link"
              href="https://www.threads.com/@watercastlegames?hl=ko"
              target="_blank"
              rel="noopener noreferrer"
            >
              Threads에서 제작 기록 보기
            </a>
          </div>
        </div>
        <figure className="hero-visual">
          <img src="/concept-base.jpg" alt="" decoding="async" />
          <figcaption>Agent Forest · 해변 사무실</figcaption>
        </figure>
      </section>

      <section className="developer-section" aria-labelledby="stackTitle">
        <div className="section-heading">
          <span>HOW IT IS BUILT</span>
          <h2 id="stackTitle">브라우저 하나로 돌아가는 작업 공간</h2>
          <p>설치할 것은 내 PC의 연결 도구 하나뿐입니다.</p>
        </div>
        <div className="stack-grid">
          {STACK.map((item) => (
            <article key={item.tag}>
              <b>{item.tag}</b>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section" aria-labelledby="projectTitle">
        <div className="section-heading">
          <span>ABOUT THIS SERVICE</span>
          <h2 id="projectTitle">Agent Forest · 고양이가 대신 일하는 사무실</h2>
        </div>
        <div className="project-layout">
          <div className="project-description">
            <p>
              내 PC의 Codex 세션을 해변 사무실의 고양이로 보여줍니다. 고양이를
              눌러 일을 맡기고, 승인 요청이 오면 쪽지로 받아 결정합니다. 일이
              없을 때 고양이는 스스로 돌아다니고, 배고프면 밥그릇으로 갑니다.
            </p>
            <ul>
              <li>6자리 코드로 내 PC 세션과 연결 · 설치는 연결 도구 하나</li>
              <li>작업 지시 · 승인 · 중단을 게임 화면에서 그대로 처리</li>
              <li>일을 마치면 조개를 모아 자리와 고양이 털색을 늘림</li>
              <li>배고픔 · 배변 · 행복도를 가진 고양이 돌보기</li>
              <li>연결 없이도 비용 없는 화면 시연으로 먼저 둘러보기</li>
            </ul>
          </div>
          <aside className="tool-notice">
            <span>REAL DEV TOOL</span>
            <strong>게임이 실제 작업을 막지 않습니다</strong>
            <p>
              고양이가 아무리 삐져 있어도 작업 지시·승인·중단은 지연되거나
              거부되지 않습니다. 조개와 행복도 같은 게임 요소는 고양이의 자율
              행동에만 영향을 줍니다. 실제 명령은 내 PC의 권한과 샌드박스 설정을
              그대로 따르며, 승인 화면의 내용을 확인한 뒤 직접 결정합니다.
            </p>
          </aside>
        </div>
      </section>

      <section className="developer-section other-games" aria-labelledby="gamesTitle">
        <div className="section-heading">
          <span>MORE FROM THE DEVELOPER</span>
          <h2 id="gamesTitle">개발자의 다른 게임</h2>
          <p>Water Castle Games가 만들고 운영하는 다른 프로젝트도 만나보세요.</p>
        </div>
        {GAMES.map((game) =>
          game.external ? (
            <a
              key={game.title}
              className={`game-card${game.current ? " current" : ""}`}
              href={game.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={game.icon} alt="" decoding="async" loading="lazy" />
              <span>
                <small>{game.tag}</small>
                <strong>{game.title}</strong>
                <p>{game.body}</p>
                <b>{game.cta}</b>
              </span>
            </a>
          ) : (
            <Link
              key={game.title}
              className={`game-card${game.current ? " current" : ""}`}
              href={game.href}
            >
              <img src={game.icon} alt="" decoding="async" loading="lazy" />
              <span>
                <small>{game.tag}</small>
                <strong>{game.title}</strong>
                <p>{game.body}</p>
                <b>{game.cta}</b>
              </span>
            </Link>
          ),
        )}
      </section>

      <section className="developer-contact" aria-labelledby="contactTitle">
        <span>DEVELOPMENT LOG &amp; CONTACT</span>
        <h2 id="contactTitle">새로운 제작 과정은 Threads에 기록합니다.</h2>
        <p>업데이트, 시행착오, 다음 게임에 대한 이야기를 확인할 수 있습니다.</p>
        <a
          href="https://www.threads.com/@watercastlegames?hl=ko"
          target="_blank"
          rel="noopener noreferrer"
        >
          @watercastlegames
        </a>
      </section>

      <footer className="developer-footer">
        <b>WATER CASTLE GAMES</b>
        <p>게임을 만들고, 만드는 과정까지 공유합니다.</p>
        <div className="developer-footer-links">
          <Link href="/legal#terms">이용약관</Link>
          <Link href="/legal#privacy">개인정보처리방침</Link>
          <Link href="/legal#license">라이선스</Link>
        </div>
        <Link className="footer-cta" href="/">
          Agent Forest 열기
        </Link>
      </footer>
    </main>
  );
}
