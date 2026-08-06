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

export type CatChatTopic =
  | "market"
  | "news"
  | "fortune"
  | "travel"
  | "food"
  | "entertainment"
  | "sports"
  | "tech"
  | "wellbeing"
  | "learning"
  | "creative"
  | "daily";

export type CatChatTopicMemoryEntry = {
  catId: string;
  prompt: string;
  topic: CatChatTopic;
  createdAt: number;
};

export type CatChatTopicMemory = {
  version: 1;
  entries: CatChatTopicMemoryEntry[];
};

export const CAT_CHAT_TOPIC_MEMORY_KEY =
  "agent-forest-cat-chat-topic-memory-v1";

const LEGACY_CONNECTION_PROMPT =
  "도구를 사용하지 말고 현재 Codex와 연결되었다는 사실을 한 문장으로 알려줘.";
const USER_PROMPT_EVENTS = new Set([
  "chat.user.sent",
  "task.queued",
  "pm-chat.queued",
]);
const MAX_MEMORY_ENTRIES = 80;

const FUN_STARTER_SUGGESTIONS = [
  "오늘 꼭 알아야 할 뉴스 3가지를 짧고 재미있게 브리핑해줘.",
  "오늘 주식시장의 분위기와 눈여겨볼 이슈를 쉽게 알려줘.",
  "오늘 내 운세를 재미로 봐주고 행운 포인트도 알려줘.",
] as const;

const TOPIC_KEYWORDS: Array<{
  topic: CatChatTopic;
  keywords: RegExp;
}> = [
  {
    topic: "market",
    keywords:
      /주가|주식|증시|코스피|코스닥|나스닥|환율|투자|종목|시장|금리|비트코인|코인/,
  },
  {
    topic: "news",
    keywords: /뉴스|브리핑|오늘의\s*이슈|정치|경제|사회|국제|시사|속보/,
  },
  {
    topic: "fortune",
    keywords: /운세|사주|타로|행운|별자리|궁합|점괘|오늘의\s*점/,
  },
  {
    topic: "travel",
    keywords: /날씨|여행|나들이|지역|휴가|바다|캠핑|산책|드라이브/,
  },
  {
    topic: "food",
    keywords: /음식|맛집|메뉴|저녁|점심|아침|요리|간식|커피|먹을/,
  },
  {
    topic: "entertainment",
    keywords: /영화|드라마|게임|웹툰|음악|노래|책|콘텐츠|유튜브|공연/,
  },
  {
    topic: "sports",
    keywords: /축구|야구|농구|스포츠|경기|선수|리그|월드컵/,
  },
  {
    topic: "tech",
    keywords:
      /AI|Codex|Puter|Worker|에이전트|기술|컴퓨터|앱|웹|코딩|개발|로봇/i,
  },
  {
    topic: "wellbeing",
    keywords: /건강|운동|마음|기분|스트레스|수면|습관|휴식|명상/,
  },
  {
    topic: "learning",
    keywords: /영어|공부|배우|지식|상식|역사|과학|퀴즈/,
  },
  {
    topic: "creative",
    keywords: /아이디어|상상|이야기|창작|그림|디자인|만들어|캐릭터/,
  },
];

const TOPIC_SUGGESTIONS: Record<CatChatTopic, readonly string[]> = {
  market: [
    "오늘 주식시장을 ‘맑음·흐림·비’로 표현하고 이유도 알려줘.",
    "오늘 시장에서 눈여겨볼 업종 하나를 골라 쉽게 설명해줘.",
    "오늘 시장 뉴스가 내일 어떤 변수로 이어질지 이야기해줘.",
  ],
  news: [
    "오늘 꼭 알아야 할 뉴스 3개를 고양이 브리핑처럼 들려줘.",
    "오늘 뉴스 중 가장 흥미로운 이야기 하나를 쉽게 풀어줘.",
    "오늘의 좋은 뉴스와 걱정되는 뉴스를 하나씩 골라줘.",
  ],
  fortune: [
    "오늘 운세를 재미로 보고 행운의 색과 행동도 알려줘.",
    "오늘 돈·일·사람 운을 별 다섯 개로 평가해줘.",
    "지금 내 기분에 어울리는 한 문장 타로 메시지를 만들어줘.",
  ],
  travel: [
    "오늘 가볍게 떠나기 좋은 나들이 콘셉트 3개를 추천해줘.",
    "바다·숲·도시 중 오늘 내 기분에 맞는 곳을 골라줘.",
    "주말 반나절 여행을 상상해서 귀여운 일정표를 만들어줘.",
  ],
  food: [
    "오늘 뭐 먹을지 질문 세 번만 하고 메뉴를 골라줘.",
    "지금 기분에 어울리는 간식과 음료 조합을 추천해줘.",
    "냉장고에 있을 법한 재료로 간단한 한 끼를 상상해줘.",
  ],
  entertainment: [
    "오늘 보기 좋은 영화·드라마·유튜브 주제를 하나씩 추천해줘.",
    "내 취향을 알아볼 수 있는 콘텐츠 취향 질문 3개를 해줘.",
    "요즘 즐길 만한 게임이나 이야기 소재를 재미있게 소개해줘.",
  ],
  sports: [
    "오늘 주목할 스포츠 경기나 이야기를 짧게 브리핑해줘.",
    "내가 좋아할 만한 선수 한 명을 골라 매력을 소개해줘.",
    "최근 경기 흐름을 초보자도 알기 쉽게 이야기해줘.",
  ],
  tech: [
    "오늘 나온 흥미로운 AI·기술 이야기를 쉽게 들려줘.",
    "내 일상에서 AI를 재미있게 써볼 방법 3가지를 제안해줘.",
    "앞으로 생길 법한 귀여운 미래 기술 하나를 상상해줘.",
  ],
  wellbeing: [
    "지금 기분을 확인할 질문 3개를 하고 작은 휴식을 추천해줘.",
    "오늘 5분 안에 할 수 있는 기분 전환을 골라줘.",
    "잠들기 전에 하기 좋은 짧은 루틴을 만들어줘.",
  ],
  learning: [
    "오늘 알아두면 재미있는 상식 하나를 이야기처럼 알려줘.",
    "내 수준에 맞는 짧은 퀴즈 3개를 내줘.",
    "평소 궁금했지만 잘 몰랐던 주제를 하나 골라 설명해줘.",
  ],
  creative: [
    "나와 고양이가 주인공인 짧고 재미있는 이야기를 만들어줘.",
    "오늘 떠올려볼 만한 엉뚱한 아이디어 3개를 던져줘.",
    "내 취향을 물어보고 새로운 캐릭터 하나를 상상해줘.",
  ],
  daily: [
    "오늘 기분을 한 단어로 물어보고 어울리는 이야기를 들려줘.",
    "지금 심심할 때 5분 동안 해볼 재미있는 일을 골라줘.",
    "내 취향을 알아볼 수 있는 가벼운 질문 3개를 해줘.",
  ],
};

const RECENT_TOPIC_FOLLOWUPS: Record<CatChatTopic, readonly [string, string]> = {
  market: [
    "방금 이야기한 시장 흐름이 바뀔 수 있는 신호 세 가지를 이어서 알려줘.",
    "아까 답변을 바탕으로 긍정·중립·주의 관점을 비교해줘.",
  ],
  news: [
    "방금 이야기한 뉴스와 연결된 후속 소식이나 다른 관점도 찾아줘.",
    "아까 답변에서 앞으로 지켜볼 핵심 포인트 세 가지를 골라줘.",
  ],
  fortune: [
    "아까 운세와 이어서 오늘 피하면 좋은 행동과 해보면 좋은 행동을 알려줘.",
    "방금 이야기한 운세를 일·돈·사람 관계로 나눠 조금 더 자세히 봐줘.",
  ],
  travel: [
    "아까 이야기한 장소 중 내 취향에 가장 잘 맞는 하나를 골라 일정까지 짜줘.",
    "방금 추천과 비슷하지만 비용이 더 적게 드는 선택지도 알려줘.",
  ],
  food: [
    "아까 이야기한 메뉴와 잘 어울리는 음료나 간식도 이어서 골라줘.",
    "방금 추천을 더 간단하고 저렴하게 즐기는 방법도 알려줘.",
  ],
  entertainment: [
    "아까 이야기한 콘텐츠와 비슷한 분위기의 작품 세 개를 더 추천해줘.",
    "방금 추천 중 내 취향에 가장 잘 맞을 하나를 질문 두 개로 골라줘.",
  ],
  sports: [
    "방금 이야기한 경기나 선수에서 다음에 눈여겨볼 포인트를 알려줘.",
    "아까 내용을 초보자도 더 재미있게 볼 수 있도록 관전 포인트로 정리해줘.",
  ],
  tech: [
    "아까 이야기한 기술을 내가 실제로 써볼 수 있는 방법 세 가지를 알려줘.",
    "방금 답변과 이어서 장점뿐 아니라 주의할 점도 함께 설명해줘.",
  ],
  wellbeing: [
    "아까 이야기한 방법 중 지금 바로 할 수 있는 하나를 단계별로 안내해줘.",
    "방금 추천을 내일도 이어갈 수 있는 아주 짧은 루틴으로 만들어줘.",
  ],
  learning: [
    "아까 배운 내용과 연결되는 재미있는 사실 세 가지를 더 알려줘.",
    "방금 내용을 내가 제대로 이해했는지 확인할 짧은 퀴즈를 내줘.",
  ],
  creative: [
    "아까 아이디어를 이어서 조금 더 독특한 방향 세 가지로 발전시켜줘.",
    "방금 만든 설정에서 다음 장면이나 다음 버전을 상상해줘.",
  ],
  daily: [
    "아까 답변에서 가장 흥미로운 부분을 하나 골라 더 자세히 이야기해줘.",
    "방금 대화와 자연스럽게 이어지는 새로운 질문 세 가지를 골라줘.",
  ],
};

function normalizePrompt(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTopic(value: unknown): value is CatChatTopic {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TOPIC_SUGGESTIONS, value)
  );
}

function isMeaningfulPrompt(prompt: string) {
  return (
    prompt.length >= 8 &&
    prompt !== LEGACY_CONNECTION_PROMPT &&
    !/(연결\s*확인|현재\s*Codex와\s*연결)/i.test(prompt) &&
    !/^(연결\s*확인|테스트|test|hello|안녕)[.!?\s]*$/i.test(prompt)
  );
}

function detectTopic(prompt: string): CatChatTopic {
  return (
    TOPIC_KEYWORDS.find((entry) => entry.keywords.test(prompt))?.topic ?? "daily"
  );
}

export function createEmptyCatChatTopicMemory(): CatChatTopicMemory {
  return { version: 1, entries: [] };
}

export function parseCatChatTopicMemory(
  raw: string | null | undefined,
): CatChatTopicMemory {
  if (!raw) return createEmptyCatChatTopicMemory();
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      entries?: unknown;
    };
    if (!Array.isArray(parsed.entries)) {
      return createEmptyCatChatTopicMemory();
    }
    const entries = parsed.entries
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
      .map((entry) => ({
        catId: normalizePrompt(String(entry.catId ?? "")),
        prompt: normalizePrompt(String(entry.prompt ?? "")),
        topic: entry.topic,
        createdAt: Number(entry.createdAt),
      }))
      .filter(
        (entry): entry is CatChatTopicMemoryEntry =>
          Boolean(entry.catId) &&
          isMeaningfulPrompt(entry.prompt) &&
          isTopic(entry.topic) &&
          Number.isFinite(entry.createdAt) &&
          entry.createdAt > 0,
      )
      .slice(0, MAX_MEMORY_ENTRIES);
    return { version: 1, entries };
  } catch {
    return createEmptyCatChatTopicMemory();
  }
}

export function rememberCatChatTopic(
  memory: CatChatTopicMemory,
  {
    catId,
    prompt,
    createdAt = Date.now(),
  }: {
    catId: string;
    prompt: string;
    createdAt?: number;
  },
) {
  const normalized = normalizePrompt(prompt);
  if (!catId || !isMeaningfulPrompt(normalized)) return memory;
  const nextEntry: CatChatTopicMemoryEntry = {
    catId,
    prompt: normalized,
    topic: detectTopic(normalized),
    createdAt,
  };
  const entries = [
    nextEntry,
    ...memory.entries.filter(
      (entry) =>
        entry.catId !== catId ||
        entry.prompt.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
    ),
  ].slice(0, MAX_MEMORY_ENTRIES);
  return { version: 1 as const, entries };
}

function dominantTopic(entries: readonly CatChatTopicMemoryEntry[]) {
  const scores = new Map<CatChatTopic, number>();
  entries.slice(0, 30).forEach((entry, index) => {
    const recencyWeight = Math.max(1, 12 - Math.floor(index / 2));
    scores.set(entry.topic, (scores.get(entry.topic) ?? 0) + recencyWeight);
  });
  return (
    [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null
  );
}

function compactConversationAnchor(prompt: string) {
  const clean = normalizePrompt(prompt).replace(/["“”]/g, "'");
  return clean.length > 38 ? `${clean.slice(0, 37)}…` : clean;
}

function recentConversationFocus(
  events: readonly CatSuggestionEvent[],
  entries: readonly CatChatTopicMemoryEntry[],
  focusedCatId: string,
) {
  const candidates: Array<{ prompt: string; topic: CatChatTopic }> = [];
  const seen = new Set<string>();
  const add = (promptValue: string | null | undefined, topic?: CatChatTopic) => {
    const prompt = normalizePrompt(promptValue);
    const key = prompt.toLocaleLowerCase("ko-KR");
    if (!isMeaningfulPrompt(prompt) || seen.has(key)) return;
    seen.add(key);
    candidates.push({ prompt, topic: topic ?? detectTopic(prompt) });
  };

  events.forEach((event) => {
    if (
      event.threadId === focusedCatId &&
      USER_PROMPT_EVENTS.has(event.type)
    ) {
      add(event.prompt);
    }
  });
  entries.forEach((entry) => add(entry.prompt, entry.topic));

  const latest = candidates[0];
  if (!latest) return null;
  const specificInterest =
    latest.topic === "daily"
      ? (candidates.find((candidate) => candidate.topic !== "daily") ?? latest)
      : latest;
  const historicalInterest = dominantTopic(entries);
  return {
    prompt:
      latest.topic === "daily" && specificInterest !== latest
        ? specificInterest.prompt
        : latest.prompt,
    topic:
      specificInterest.topic === "daily"
        ? (historicalInterest ?? "daily")
        : specificInterest.topic,
  };
}

function buildRecentConversationSuggestions({
  prompt,
  topic,
}: {
  prompt: string;
  topic: CatChatTopic;
}) {
  const anchor = compactConversationAnchor(prompt);
  const followups = RECENT_TOPIC_FOLLOWUPS[topic];
  return [
    `아까 “${anchor}” 이야기에서 가장 중요한 부분을 한 단계 더 깊게 알려줘.`,
    ...followups,
  ];
}

export function seedCatChatTopicMemoryFromEvents(
  events: readonly CatSuggestionEvent[],
  fallbackCatId: string,
) {
  return {
    version: 1 as const,
    entries: events
      .filter(
        (event) =>
          USER_PROMPT_EVENTS.has(event.type) &&
          isMeaningfulPrompt(normalizePrompt(event.prompt)),
      )
      .map((event, index) => ({
        catId: event.threadId || fallbackCatId,
        prompt: normalizePrompt(event.prompt),
        topic: detectTopic(normalizePrompt(event.prompt)),
        createdAt: Date.now() - index,
      }))
      .slice(0, MAX_MEMORY_ENTRIES),
  };
}

export function buildCatChatSuggestions(options: {
  events: readonly CatSuggestionEvent[];
  memory?: CatChatTopicMemory;
  focusedCatId: string;
  department: CatSuggestionDepartment;
  backend: CompanionBackendId;
}) {
  const {
    events,
    memory = createEmptyCatChatTopicMemory(),
    focusedCatId,
  } = options;
  const catEntries = memory.entries.filter(
    (entry) => entry.catId === focusedCatId,
  );
  const recentFocus = recentConversationFocus(
    events,
    catEntries,
    focusedCatId,
  );

  if (!recentFocus) return [...FUN_STARTER_SUGGESTIONS];
  return buildRecentConversationSuggestions(recentFocus).slice(0, 3);
}
