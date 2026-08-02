"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/* 호르무즈 개발자 페이지와 같은 방식으로, 페이지를 언어별로 나누지 않고
   같은 DOM에서 문구만 교체한다. 언어 결정 우선순위도 그쪽과 맞춘다.
     1. ?lang=ko|en  2. 저장값  3. 브라우저 신호(시간대·언어)  4. 기본값 ko
   호르무즈는 IP 국가까지 보지만 여기는 한국어 전용 서비스라 기본값이 ko다.
   네트워크 조회를 넣어 첫 렌더를 늦출 이유가 없다. */

const SUPPORTED = ["ko", "en"] as const;
type Lang = (typeof SUPPORTED)[number];
const DEFAULT_LANG: Lang = "ko";
const LANG_KEY = "agent-forest-developer-lang-v1";

function normalize(value: string | null | undefined): Lang | null {
  const lang = String(value ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  return (SUPPORTED as readonly string[]).includes(lang) ? (lang as Lang) : null;
}

function detectLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const fromQuery = normalize(
    new URLSearchParams(window.location.search).get("lang"),
  );
  if (fromQuery) return fromQuery;
  try {
    const stored = normalize(window.localStorage.getItem(LANG_KEY));
    if (stored) return stored;
  } catch {
    // 사생활 보호 모드에서 저장이 막혀도 페이지는 그대로 뜬다.
  }
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (zone === "Asia/Seoul") return "ko";
  } catch {
    // Intl 이 없으면 아래 navigator 신호로 넘어간다.
  }
  const nav = normalize(navigator.language);
  return nav ?? DEFAULT_LANG;
}

type GameCard = {
  href: string;
  external?: boolean;
  icon: string;
  current?: boolean;
  tag: Record<Lang, string>;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  cta: Record<Lang, string>;
};

const GAMES: GameCard[] = [
  {
    href: "https://play.google.com/store/apps/details?id=com.SonFootballerTycoon.WaterCastleGames&hl=ko",
    external: true,
    icon: "/art/developer/game-son-tycoon-v1.jpg",
    tag: { ko: "MOBILE FOOTBALL TYCOON", en: "MOBILE FOOTBALL TYCOON" },
    title: {
      ko: "SON 키우기 타이쿤 : 아들을 축구 월클선수로",
      en: "SON Tycoon: Raise Your Son into a World-Class Footballer",
    },
    body: {
      ko: "아들을 훈련시키고 커리어를 성장시켜 세계적인 축구 선수로 키우는 모바일 육성 타이쿤 게임입니다.",
      en: "A mobile tycoon game where you train your son and grow his career into a world-class football player.",
    },
    cta: { ko: "Google Play에서 보기 →", en: "View on Google Play →" },
  },
  {
    href: "https://sidak.kr/autodev/GameCreator/crimeGame/",
    external: true,
    icon: "/art/developer/game-crime-case01-v1.png",
    tag: { ko: "AI MYSTERY · FREE", en: "AI MYSTERY · FREE" },
    title: {
      ko: "마크의 마지막 수리 · CASE 01",
      en: "Mark's Last Repair · CASE 01",
    },
    body: {
      ko: "사진 속 단서를 조사하고 동료와 의견을 나누고 집사에게 질문하며 사건의 전말을 완성하는 AI 추리 게임입니다. 소스도 전체 공개했습니다.",
      en: "An AI mystery game: examine clues in photographs, compare notes with your partner, question the butler, and piece the case together. The source is fully public.",
    },
    cta: { ko: "브라우저에서 바로 플레이 →", en: "Play in your browser →" },
  },
  {
    href: "https://sidak.kr/autodev/GameCreator/hormuz/",
    external: true,
    icon: "/art/developer/game-hormuz-v1.jpg",
    tag: { ko: "BROWSER 3D STRATEGY · FREE", en: "BROWSER 3D STRATEGY · FREE" },
    title: { ko: "HORMUZ · 대통령 상황실", en: "HORMUZ · Presidential Situation Room" },
    body: {
      ko: "호르무즈 해협의 실제 지형 위에서 54일의 전쟁과 정치를 지휘하는 브라우저 3D 전략 게임입니다.",
      en: "A browser 3D strategy game where you command 54 days of war and politics over the real terrain of the Strait of Hormuz.",
    },
    cta: { ko: "브라우저에서 바로 플레이 →", en: "Play in your browser →" },
  },
  {
    href: "/",
    icon: "/art/developer/game-agent-forest-v1.jpg",
    current: true,
    tag: { ko: "AI WORKSPACE · FREE", en: "AI WORKSPACE · FREE" },
    title: { ko: "Agent Forest · 해변 사무실", en: "Agent Forest · Beach Office" },
    body: {
      ko: "지금 보고 있는 서비스입니다. 내 PC의 Codex 세션을 해변에서 일하는 고양이로 바꿔 보여줍니다.",
      en: "The service you are looking at. It turns the Codex sessions on your own PC into cats working at a beach office.",
    },
    cta: { ko: "해변 사무실 열기 →", en: "Open the beach office →" },
  },
];

const STACK: Array<{
  tag: Record<Lang, string>;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}> = [
  {
    tag: { ko: "FRONTEND", en: "FRONTEND" },
    title: {
      ko: "Next.js · three.js 2.5D 사무실",
      en: "Next.js · three.js 2.5D office",
    },
    body: {
      ko: "해변과 고양이는 three.js로 그립니다. 외곽선 두 번 그리기와 캔버스 이름표로 손그림 느낌을 냈고, 모바일 브라우저에서도 설치 없이 바로 돌아갑니다.",
      en: "The shore and the cats are drawn with three.js. A two-pass outline and canvas name tags give it a hand-drawn feel, and it runs in a mobile browser with nothing to install.",
    },
  },
  {
    tag: { ko: "EDGE RUNTIME", en: "EDGE RUNTIME" },
    title: { ko: "Cloudflare Workers · D1", en: "Cloudflare Workers · D1" },
    body: {
      ko: "서버를 따로 두지 않고 엣지에서 돌립니다. 페어링 정보만 D1에 저장하고, 게임 진행은 브라우저에 남습니다.",
      en: "It runs on the edge instead of a server of its own. Only pairing data is stored in D1; your game progress stays in the browser.",
    },
  },
  {
    tag: { ko: "REAL WORK", en: "REAL WORK" },
    title: {
      ko: "내 PC의 Codex CLI와 직접 연결",
      en: "Wired straight to the Codex CLI on your PC",
    },
    body: {
      ko: "6자리 코드로 내 PC의 세션과 짝을 짓습니다. 작업 지시·승인·중단은 게임을 거치지 않고 그대로 전달됩니다.",
      en: "A six-digit code pairs the page with a session on your PC. Task requests, approvals and cancellations pass straight through without the game in the way.",
    },
  },
  {
    tag: { ko: "VIBE CODING", en: "VIBE CODING" },
    title: {
      ko: "기획부터 검증까지 AI와 함께",
      en: "Planned, built and verified with AI",
    },
    body: {
      ko: "기획서, 코드, 3D 소품, 밸런스 시뮬레이션, 회귀 테스트까지 AI와 대화하며 만들었습니다. 고양이 15종과 소품은 이미지 한 장에서 3D로 만들어 웹용으로 줄였습니다.",
      en: "Design docs, code, 3D props, balance simulations and regression tests all came out of conversations with AI. The 15 cat styles and the props were generated in 3D from a single image each, then trimmed down for the web.",
    },
  },
];

const T = {
  navBack: { ko: "← 사무실로", en: "← Back to the office" },
  navBackAria: { ko: "해변 사무실로 돌아가기", en: "Back to the beach office" },
  langSwitch: { ko: "언어 선택", en: "Select language" },
  langKo: { ko: "한국어", en: "한국어" },
  langEn: { ko: "English", en: "English" },

  docTitle: {
    ko: "개발자 정보 — Agent Forest",
    en: "Developer — Agent Forest",
  },

  heroEyebrow: { ko: "DEVELOPER FILE", en: "DEVELOPER FILE" },
  heroTitleTop: { ko: "AI가 일하는 걸", en: "I wanted to watch" },
  heroTitleEm: {
    ko: "눈으로 보고 싶었습니다.",
    en: "the AI actually working.",
  },
  heroLead: {
    ko: "터미널에서 Codex가 무언가 하고 있는데, 지금 뭘 하는 중인지 로그를 읽기 전엔 알 수 없었습니다. 그래서 작업 상태를 해변에서 일하는 고양이의 행동으로 바꿔봤습니다. 일을 맡기면 자리로 걸어가 앉고, 끝내면 보고하러 옵니다.",
    en: "Codex was doing something in the terminal, but I could not tell what until I read the logs. So I turned the work state into the behaviour of cats at a beach office. Hand one a task and it walks to its desk; when it finishes, it comes back to report.",
  },
  heroPlay: { ko: "지금 열어보기", en: "Open it now" },
  heroThreads: {
    ko: "Threads에서 제작 기록 보기",
    en: "Read the build log on Threads",
  },
  heroCaption: { ko: "Agent Forest · 해변 사무실", en: "Agent Forest · Beach office" },

  stackEyebrow: { ko: "HOW IT IS BUILT", en: "HOW IT IS BUILT" },
  stackTitle: {
    ko: "브라우저 하나로 돌아가는 작업 공간",
    en: "A workspace that runs in one browser tab",
  },
  stackLead: {
    ko: "설치할 것은 내 PC의 연결 도구 하나뿐입니다.",
    en: "The only thing to install is the connector on your own PC.",
  },

  aboutEyebrow: { ko: "ABOUT THIS SERVICE", en: "ABOUT THIS SERVICE" },
  aboutTitle: {
    ko: "Agent Forest · 고양이가 대신 일하는 사무실",
    en: "Agent Forest · the office where cats do the work",
  },
  aboutBody: {
    ko: "내 PC의 Codex 세션을 해변 사무실의 고양이로 보여줍니다. 고양이를 눌러 일을 맡기고, 승인 요청이 오면 쪽지로 받아 결정합니다. 일이 없을 때 고양이는 스스로 돌아다니고, 배고프면 밥그릇으로 갑니다.",
    en: "It shows the Codex sessions on your PC as cats in a beach office. Tap a cat to hand it work; when an approval is needed it arrives as a note for you to decide on. With nothing to do the cats wander on their own, and head for the bowl when they get hungry.",
  },
  features: {
    ko: [
      "6자리 코드로 내 PC 세션과 연결 · 설치는 연결 도구 하나",
      "작업 지시 · 승인 · 중단을 게임 화면에서 그대로 처리",
      "일을 마치면 조개를 모아 자리와 고양이 털색을 늘림",
      "배고픔 · 배변 · 행복도를 가진 고양이 돌보기",
      "연결 없이도 비용 없는 화면 시연으로 먼저 둘러보기",
    ],
    en: [
      "Pair with a session on your PC using a six-digit code — one connector to install",
      "Request, approve and cancel work straight from the game screen",
      "Finish jobs to collect shells and unlock desks and cat coats",
      "Care for cats with hunger, litter and happiness of their own",
      "Look around first with a free walkthrough, no connection required",
    ],
  },
  noticeTag: { ko: "REAL DEV TOOL", en: "REAL DEV TOOL" },
  noticeTitle: {
    ko: "게임이 실제 작업을 막지 않습니다",
    en: "The game never blocks real work",
  },
  noticeBody: {
    ko: "고양이가 아무리 삐져 있어도 작업 지시·승인·중단은 지연되거나 거부되지 않습니다. 조개와 행복도 같은 게임 요소는 고양이의 자율 행동에만 영향을 줍니다. 실제 명령은 내 PC의 권한과 샌드박스 설정을 그대로 따르며, 승인 화면의 내용을 확인한 뒤 직접 결정합니다.",
    en: "No matter how sulky a cat gets, requesting, approving or cancelling work is never delayed or refused. Shells and happiness only affect what the cats do on their own. Real commands follow the permissions and sandbox settings of your own PC, and you decide after reading the approval screen yourself.",
  },

  moreEyebrow: { ko: "MORE FROM THE DEVELOPER", en: "MORE FROM THE DEVELOPER" },
  moreTitle: { ko: "개발자의 다른 게임", en: "Other games by the developer" },
  moreLead: {
    ko: "Water Castle Games가 만들고 운영하는 다른 프로젝트도 만나보세요.",
    en: "Take a look at the other projects Water Castle Games builds and runs.",
  },

  contactEyebrow: {
    ko: "DEVELOPMENT LOG & CONTACT",
    en: "DEVELOPMENT LOG & CONTACT",
  },
  contactTitle: {
    ko: "새로운 제작 과정은 Threads에 기록합니다.",
    en: "New build notes go up on Threads.",
  },
  contactBody: {
    ko: "업데이트, 시행착오, 다음 게임에 대한 이야기를 확인할 수 있습니다.",
    en: "Updates, wrong turns, and what the next game might be.",
  },

  footerLead: {
    ko: "게임을 만들고, 만드는 과정까지 공유합니다.",
    en: "We make games, and share how they get made.",
  },
  footerTerms: { ko: "이용약관", en: "Terms" },
  footerPrivacy: { ko: "개인정보처리방침", en: "Privacy" },
  footerLicense: { ko: "라이선스", en: "Licenses" },
  footerCta: { ko: "Agent Forest 열기", en: "Open Agent Forest" },
} as const;

export default function DeveloperContent() {
  // 서버 렌더와 첫 클라이언트 렌더는 항상 기본값으로 맞춘다.
  // 감지 결과는 마운트 뒤에 반영해 하이드레이션 불일치를 만들지 않는다.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    setLangState(detectLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = T.docTitle[lang];
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // 저장이 막혀도 이번 방문 동안은 선택이 유지된다.
    }
  }, []);

  const t = <K extends keyof typeof T>(key: K) => T[key][lang];

  return (
    <main className="developer-page">
      <header className="developer-nav">
        <Link className="back-link" href="/" aria-label={t("navBackAria")}>
          {t("navBack")}
        </Link>
        <span>WATER CASTLE GAMES</span>
        <div className="lang-switch" role="group" aria-label={t("langSwitch")}>
          {SUPPORTED.map((code) => (
            <button
              key={code}
              type="button"
              className={code === lang ? "active" : undefined}
              aria-pressed={code === lang}
              onClick={() => {
                if (code !== lang) setLang(code);
              }}
            >
              {code === "ko" ? T.langKo[lang] : T.langEn[lang]}
            </button>
          ))}
        </div>
      </header>

      <section className="developer-hero" aria-labelledby="developerTitle">
        <div className="hero-copy">
          <span className="eyebrow">{t("heroEyebrow")}</span>
          <h1 id="developerTitle">
            {t("heroTitleTop")}
            <br />
            <em>{t("heroTitleEm")}</em>
          </h1>
          <p>{t("heroLead")}</p>
          <div className="hero-actions">
            <Link className="primary-link" href="/">
              {t("heroPlay")}
            </Link>
            <a
              className="secondary-link"
              href="https://www.threads.com/@watercastlegames?hl=ko"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("heroThreads")}
            </a>
          </div>
        </div>
        <figure className="hero-visual">
          <img src="/art/developer/hero-world-v1.jpg" alt="" decoding="async" />
          <figcaption>{t("heroCaption")}</figcaption>
        </figure>
      </section>

      <section className="developer-section" aria-labelledby="stackTitle">
        <div className="section-heading">
          <span>{t("stackEyebrow")}</span>
          <h2 id="stackTitle">{t("stackTitle")}</h2>
          <p>{t("stackLead")}</p>
        </div>
        <div className="stack-grid">
          {STACK.map((item) => (
            <article key={item.tag.en + item.title.en}>
              <b>{item.tag[lang]}</b>
              <h3>{item.title[lang]}</h3>
              <p>{item.body[lang]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section" aria-labelledby="projectTitle">
        <div className="section-heading">
          <span>{t("aboutEyebrow")}</span>
          <h2 id="projectTitle">{t("aboutTitle")}</h2>
        </div>
        <div className="project-layout">
          <div className="project-description">
            <p>{t("aboutBody")}</p>
            <ul>
              {T.features[lang].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <aside className="tool-notice">
            <span>{t("noticeTag")}</span>
            <strong>{t("noticeTitle")}</strong>
            <p>{t("noticeBody")}</p>
          </aside>
        </div>
      </section>

      <section
        className="developer-section other-games"
        aria-labelledby="gamesTitle"
      >
        <div className="section-heading">
          <span>{t("moreEyebrow")}</span>
          <h2 id="gamesTitle">{t("moreTitle")}</h2>
          <p>{t("moreLead")}</p>
        </div>
        {GAMES.map((game) => {
          const inner = (
            <>
              <img src={game.icon} alt="" decoding="async" loading="lazy" />
              <span>
                <small>{game.tag[lang]}</small>
                <strong>{game.title[lang]}</strong>
                <p>{game.body[lang]}</p>
                <b>{game.cta[lang]}</b>
              </span>
            </>
          );
          const className = `game-card${game.current ? " current" : ""}`;
          return game.external ? (
            <a
              key={game.title.en}
              className={className}
              href={game.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {inner}
            </a>
          ) : (
            <Link key={game.title.en} className={className} href={game.href}>
              {inner}
            </Link>
          );
        })}
      </section>

      <section className="developer-contact" aria-labelledby="contactTitle">
        <span>{t("contactEyebrow")}</span>
        <h2 id="contactTitle">{t("contactTitle")}</h2>
        <p>{t("contactBody")}</p>
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
        <p>{t("footerLead")}</p>
        <div className="developer-footer-links">
          <Link href="/legal#terms">{t("footerTerms")}</Link>
          <Link href="/legal#privacy">{t("footerPrivacy")}</Link>
          <Link href="/legal#license">{t("footerLicense")}</Link>
        </div>
        <Link className="footer-cta" href="/">
          {t("footerCta")}
        </Link>
      </footer>
    </main>
  );
}
