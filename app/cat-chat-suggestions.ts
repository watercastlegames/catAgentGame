import type { CompanionBackendId } from "./companion-backends";

export type CatSuggestionDepartment =
  | "general"
  | "coding"
  | "design"
  | "music";

export type CatSuggestionEvent = {
  type: string;
  prompt?: string | null;
  threadId?: string | null;
};

type SuggestionTheme =
  | "debug"
  | "feature"
  | "design"
  | "performance"
  | "planning"
  | "ai"
  | "general";

const LEGACY_CONNECTION_PROMPT =
  "도구를 사용하지 말고 현재 Codex와 연결되었다는 사실을 한 문장으로 알려줘.";
const USER_PROMPT_EVENTS = new Set(["task.queued", "pm-chat.queued"]);

const LOCAL_CAPABILITY_SUGGESTIONS: Record<
  CatSuggestionDepartment,
  readonly string[]
> = {
  general: [
    "현재 진행 상황을 확인하고 다음 할 일 3가지를 정리해줘.",
    "최근 변경사항을 검토하고 빠진 작업이 있는지 찾아줘.",
    "지금 프로젝트에서 가장 먼저 해결할 일을 골라 진행해줘.",
  ],
  coding: [
    "현재 프로젝트에서 오류가 나는 부분을 찾아 수정해줘.",
    "원하는 기능을 구현하고 관련 테스트까지 실행해줘.",
    "최근 코드를 검토하고 안전하게 개선할 부분 3가지를 찾아줘.",
  ],
  design: [
    "현재 화면을 확인하고 어색한 UI를 개선해줘.",
    "PC와 모바일에서 글자·정렬·버튼 상태를 점검해줘.",
    "기존 그림체와 색감을 유지하며 화면 완성도를 높여줘.",
  ],
  music: [
    "현재 장면에 필요한 효과음과 재생 조건을 정리해줘.",
    "고양이 행동별로 어울리는 소리를 연결해줘.",
    "배경음과 효과음의 크기·반복·전환을 점검해줘.",
  ],
};

const CHAT_CAPABILITY_SUGGESTIONS: Record<
  CatSuggestionDepartment,
  readonly string[]
> = {
  general: [
    "내 아이디어를 정리하고 다음 할 일 3가지를 제안해줘.",
    "현재 고민의 장단점을 비교해서 가장 좋은 방향을 골라줘.",
    "내가 놓치고 있을 가능성이 큰 부분을 질문으로 확인해줘.",
  ],
  coding: [
    "구현하려는 기능의 구조와 개발 순서를 정리해줘.",
    "이 오류의 가능한 원인과 확인 순서를 알려줘.",
    "PC와 모바일을 함께 고려한 테스트 항목을 만들어줘.",
  ],
  design: [
    "이 화면을 더 보기 편하게 만드는 개선안을 제안해줘.",
    "귀여운 게임 UI에 맞는 배치와 색상 방향을 정리해줘.",
    "버튼·팝업·글자 크기를 점검할 체크리스트를 만들어줘.",
  ],
  music: [
    "이 장면에 어울리는 배경음과 효과음 아이디어를 제안해줘.",
    "고양이 행동별 사운드 연출표를 만들어줘.",
    "소리가 반복돼도 피곤하지 않게 만드는 방법을 알려줘.",
  ],
};

const THEME_KEYWORDS: Array<{
  theme: SuggestionTheme;
  keywords: RegExp;
}> = [
  {
    theme: "debug",
    keywords:
      /오류|에러|버그|안\s*돼|안되|깨지|이상|문제|충돌|실패|원인|수정/,
  },
  {
    theme: "design",
    keywords:
      /디자인|화면|UI|팝업|버튼|이미지|색상|색감|아웃라인|정렬|폰트|크기|배치/,
  },
  {
    theme: "performance",
    keywords: /느리|로딩|성능|최적화|렉|프레임|렌더|메모리|속도/,
  },
  {
    theme: "planning",
    keywords: /기획|계획|목록|체크리스트|순서|정리|진행\s*상황|다음\s*작업/,
  },
  {
    theme: "ai",
    keywords: /AI|Codex|Puter|Worker|세션|연결|프롬프트|대화|에이전트/i,
  },
  {
    theme: "feature",
    keywords: /기능|구현|추가|적용|연동|만들|변경|개선|개발/,
  },
];

const THEME_FOLLOW_UPS: Record<SuggestionTheme, readonly string[]> = {
  debug: [
    "같은 증상이 생길 수 있는 다른 부분도 함께 점검해줘.",
    "원인·재현 방법·수정 우선순위를 순서대로 정리해줘.",
  ],
  feature: [
    "이 기능과 자연스럽게 이어질 다음 기능도 제안해줘.",
    "PC와 모바일에서 모두 잘 작동하는지 검증해줘.",
  ],
  design: [
    "같은 스타일을 유지하면서 화면 완성도를 더 높여줘.",
    "글자 크기·정렬·눌림 상태까지 함께 점검해줘.",
  ],
  performance: [
    "느려지는 구간을 나눠서 가장 큰 원인부터 찾아줘.",
    "화질을 유지하면서 가볍게 만들 수 있는 방법을 제안해줘.",
  ],
  planning: [
    "지금까지 끝난 일과 남은 일을 우선순위대로 정리해줘.",
    "다음 단계에서 놓치기 쉬운 항목 3가지를 알려줘.",
  ],
  ai: [
    "각 AI 연결 방식의 역할과 제한을 다시 비교해줘.",
    "이 대화 흐름을 더 편하게 만들 개선안을 제안해줘.",
  ],
  general: [
    "같은 주제로 다음에 하면 좋은 일 3가지를 제안해줘.",
    "이 요청에서 아직 확인하지 않은 부분이 있는지 찾아줘.",
  ],
};

function normalizePrompt(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function promptTopic(prompt: string) {
  if (prompt.length <= 34) return prompt;
  return `${prompt.slice(0, 33).trim()}…`;
}

function detectTheme(prompts: readonly string[]): SuggestionTheme {
  const scores = new Map<SuggestionTheme, number>();
  prompts.slice(0, 8).forEach((prompt, index) => {
    const weight = Math.max(1, 8 - index);
    for (const entry of THEME_KEYWORDS) {
      if (entry.keywords.test(prompt)) {
        scores.set(entry.theme, (scores.get(entry.theme) ?? 0) + weight);
      }
    }
  });
  return (
    [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "general"
  );
}

function uniqueSuggestions(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizePrompt(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function buildCatChatSuggestions({
  events,
  focusedCatId,
  department,
  backend,
}: {
  events: readonly CatSuggestionEvent[];
  focusedCatId: string;
  department: CatSuggestionDepartment;
  backend: CompanionBackendId;
}) {
  const promptEvents = events.filter(
    (event) =>
      USER_PROMPT_EVENTS.has(event.type) &&
      normalizePrompt(event.prompt) !== LEGACY_CONNECTION_PROMPT,
  );
  const catPrompts = promptEvents
    .filter((event) => event.threadId === focusedCatId)
    .map((event) => normalizePrompt(event.prompt))
    .filter(Boolean);
  const otherPrompts = promptEvents
    .filter((event) => event.threadId !== focusedCatId)
    .map((event) => normalizePrompt(event.prompt))
    .filter(Boolean);
  const recentPrompts = uniqueSuggestions([...catPrompts, ...otherPrompts]);
  const capabilitySuggestions =
    backend === "local-session"
      ? LOCAL_CAPABILITY_SUGGESTIONS[department]
      : CHAT_CAPABILITY_SUGGESTIONS[department];

  if (recentPrompts.length === 0) {
    return [...capabilitySuggestions].slice(0, 3);
  }

  const topic = promptTopic(recentPrompts[0]);
  const theme = detectTheme(recentPrompts);
  return uniqueSuggestions([
    `“${topic}”에서 아직 놓친 부분이 있는지 확인해줘.`,
    ...THEME_FOLLOW_UPS[theme],
    ...capabilitySuggestions,
  ]).slice(0, 3);
}
