type PmWorkerRelayEnv = {
  PM_WORKER_CHAT_ENDPOINT?: string;
  PM_WORKER_CHAT_API_KEY?: string;
};

type UpstreamBody = {
  reply?: string;
  session_id?: string;
  error?: string;
  code?: number;
  /** ASP 가 워커 원문 응답을 넣어 준다. 원인 파악에 이것만 한 게 없다. */
  debug?: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const DEFAULT_ENDPOINT =
  "https://sidak.kr/autodev/ProjectManager/api/hikami.asp";
const REQUEST_TIMEOUT_MS = 150_000;
const HEALTH_PROBE_TIMEOUT_MS = 20_000;
const HEALTH_CACHE_MS = 5 * 60_000;
let healthCache:
  | { expiresAt: number; ready: true }
  | { expiresAt: number; ready: false; error: string; code: string }
  | null = null;
const CURRENT_WEB_TERMS = [
  "뉴스",
  "속보",
  "주가",
  "주식",
  "증시",
  "코스피",
  "코스닥",
  "시세",
  "환율",
  "금리",
  "비트코인",
  "날씨",
  "예보",
  "미세먼지",
  "경기 결과",
  "경기 일정",
  "스코어",
  "실시간",
  "맛집",
  "나들이",
  "가볼만한",
  "여행 추천",
  "공연",
  "행사",
  "상영시간",
  "웹 검색",
  "인터넷 검색",
  "검색해",
  "찾아봐",
  "알아봐",
  "오늘",
  "현재",
  "최신",
  "최근",
  "요즘",
  "이번 주",
  "방금",
  "며칠",
  "급등",
  "급락",
  "강세",
  "약세",
  "오른 이유",
  "내린 이유",
  "왜 오르",
  "왜 내리",
  "stock price",
  "market news",
  "latest news",
  "exchange rate",
  "weather",
  "search the web",
  "look up",
];

export function needsCurrentWeb(prompt: string) {
  const normalized = prompt.toLocaleLowerCase("ko-KR");
  return CURRENT_WEB_TERMS.some((term) => normalized.includes(term));
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function endpointFor(env: PmWorkerRelayEnv | undefined) {
  const value = env?.PM_WORKER_CHAT_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:") return null;
    return endpoint;
  } catch {
    return null;
  }
}

async function upstreamRequest(
  endpoint: URL,
  apiKey: string,
  action: "health" | "chat",
  prompt = "",
  sessionId = "",
  useCurrentWeb = false,
) {
  const target = new URL(endpoint);
  if (action === "health") {
    /* history 는 저장 API만 살아 있어도 200을 돌려준다. 실제 모델 키가 폐기된
       상태를 "연결됨"으로 오판하지 않도록 아주 짧은 대화 요청으로 검사한다. */
    target.searchParams.set("action", "chat");
    const healthPrompt = "연결 점검입니다. OK만 답해 주세요.";
    const form = new URLSearchParams({
      message: healthPrompt,
      message_b64: utf8Base64(healthPrompt),
    });
    return fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "X-HiKami-Key": apiKey,
      },
      body: form,
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
  }

  target.searchParams.set("action", "chat");
  const form = new URLSearchParams({
    message: prompt,
    message_b64: utf8Base64(prompt),
  });
  if (sessionId) form.set("session_id", sessionId);
  if (useCurrentWeb) form.set("web_search", "1");
  return fetch(target, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "X-HiKami-Key": apiKey,
    },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function bootstrapCurrentWebRelay(endpoint: URL, apiKey: string) {
  const target = new URL("../relay-bootstrap.asp", endpoint);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-HiKami-Key": apiKey,
    },
    signal: AbortSignal.timeout(25_000),
  });
  return response.ok;
}

async function parseUpstreamBody(response: Response) {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as UpstreamBody;
  } catch {
    return null;
  }
}

async function readChatBody(request: Request) {
  const text = await request.text();
  if (text.length > 12_000) throw new Error("대화 내용이 너무 깁니다.");
  const body = text
    ? (JSON.parse(text) as Record<string, unknown>)
    : ({} as Record<string, unknown>);
  const prompt = String(body.prompt ?? "").trim();
  const webQuery = String(body.webQuery ?? prompt).trim();
  const sessionId = String(body.sessionId ?? "").trim();
  if (!prompt || prompt.length > 8_000) {
    throw new Error("AI 문맥을 포함한 대화 내용은 8,000자 이내여야 합니다.");
  }
  if (sessionId && !/^s\d{6}-\d{6}$/.test(sessionId)) {
    throw new Error("PM Worker 대화 세션 정보가 올바르지 않습니다.");
  }
  if (!webQuery || webQuery.length > 2_000) {
    throw new Error("최신 정보 검색어는 1~2,000자로 입력해 주세요.");
  }
  return { prompt, webQuery, sessionId };
}

function currentWebReplyHasSources(reply: string | undefined) {
  if (!reply || !/https?:\/\/\S+/i.test(reply)) return false;
  return !(
    /직접\s*(?:조회|검색).*?(?:못|어렵)/i.test(reply) ||
    /실시간\s*(?:데이터|자료|정보).*?(?:못|어렵|불가)/i.test(reply) ||
    /2025년\s*5월까지의\s*정보/i.test(reply)
  );
}

export async function handlePmWorkerRequest(
  request: Request,
  env: PmWorkerRelayEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isHealth =
    request.method === "GET" && url.pathname === "/api/pm-worker/health";
  const isChat =
    request.method === "POST" && url.pathname === "/api/pm-worker/chat";
  if (!isHealth && !isChat) return null;

  const endpoint = endpointFor(env);
  const apiKey = env?.PM_WORKER_CHAT_API_KEY?.trim() ?? "";
  if (!endpoint || !apiKey) {
    return json(
      {
        error: "PM Worker AI 서버 연결 정보가 아직 설정되지 않았어요.",
        code: "pm_worker_unavailable",
      },
      503,
    );
  }

  try {
    if (isHealth) {
      if (healthCache && healthCache.expiresAt > Date.now()) {
        return healthCache.ready
          ? json({ ready: true, provider: "project-manager-worker" })
          : json(
              {
                ready: false,
                error: healthCache.error,
                code: healthCache.code,
              },
              503,
            );
      }
      const upstream = await upstreamRequest(endpoint, apiKey, "health");
      const body = await parseUpstreamBody(upstream);
      if (!upstream.ok || !body?.reply) {
        const workerDown =
          body?.code === 503 || body?.error === "AI worker error";
        const error = workerDown
          ? "PM Worker AI 인증이 만료되어 현재 대화할 수 없어요. 내 PC Claude Code 또는 Codex를 선택해 주세요."
          : "PM Worker AI가 실제 대화 요청에 응답하지 않아요.";
        const code = workerDown ? "worker_down" : "pm_worker_unavailable";
        healthCache = {
          expiresAt: Date.now() + HEALTH_CACHE_MS,
          ready: false,
          error,
          code,
        };
        return json(
          { ready: false, error, code },
          503,
        );
      }
      healthCache = { expiresAt: Date.now() + HEALTH_CACHE_MS, ready: true };
      return json({ ready: true, provider: "project-manager-worker" });
    }

    const { prompt, webQuery, sessionId } = await readChatBody(request);
    const useCurrentWeb = needsCurrentWeb(webQuery);
    let upstream = await upstreamRequest(
      endpoint,
      apiKey,
      "chat",
      prompt,
      sessionId,
      useCurrentWeb,
    );
    let body = await parseUpstreamBody(upstream);
    if (
      useCurrentWeb &&
      (body?.code === 503 || !currentWebReplyHasSources(body?.reply))
    ) {
      const restarted = await bootstrapCurrentWebRelay(endpoint, apiKey);
      if (restarted) {
        upstream = await upstreamRequest(
          endpoint,
          apiKey,
          "chat",
          prompt,
          sessionId,
          useCurrentWeb,
        );
        body = await parseUpstreamBody(upstream);
      }
    }
    if (!body) {
      return json({ error: "PM Worker AI 응답 형식이 올바르지 않아요." }, 502);
    }
    if (!upstream.ok || !body.reply || !body.session_id) {
      /* ProjectManager 쪽 ASP 는 서버의 AI 워커(5201/5202)가 응답을 못 주면
         언제나 "AI worker error" 한 줄만 준다. 그대로 흘리면 게임에서는
         원인을 알 수 없어 "왜 연결이 안 되지"로만 남는다 — 실제로 무엇이
         멈춘 것인지 말해 준다. 자세한 내용은 ASP 의 debug 에 들어 있다. */
      const workerDown =
        body.code === 503 || body.error === "AI worker error";
      return json(
        {
          error: workerDown
            ? "ProjectManager 서버의 AI 워커가 응답하지 않아요. 서버에서 워커를 다시 켜 주세요."
            : (body.error ??
              (upstream.status >= 500
                ? "PM Worker AI가 잠시 응답하지 않아요."
                : "PM Worker AI 요청을 처리하지 못했어요.")),
          ...(workerDown ? { code: "worker_down" } : {}),
          ...(body.debug ? { detail: String(body.debug).slice(0, 400) } : {}),
        },
        upstream.status >= 400 ? upstream.status : 502,
      );
    }
    if (useCurrentWeb && !currentWebReplyHasSources(body.reply)) {
      return json(
        {
          error:
            "최신 웹 자료와 출처를 확인하지 못했어요. 잠시 후 다시 검색해 주세요.",
          code: "current_web_unverified",
        },
        502,
      );
    }
    return json({
      reply: body.reply,
      sessionId: body.session_id,
      provider: "project-manager-worker",
      webSearchUsed: useCurrentWeb,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return json(
      {
        error: timedOut
          ? "PM Worker AI 응답 시간이 초과됐어요."
          : error instanceof Error
            ? error.message
            : "PM Worker AI 요청에 실패했어요.",
      },
      timedOut ? 504 : 400,
    );
  }
}
