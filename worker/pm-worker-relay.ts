type PmWorkerRelayEnv = {
  PM_WORKER_CHAT_ENDPOINT?: string;
  PM_WORKER_CHAT_API_KEY?: string;
};

type UpstreamBody = {
  reply?: string;
  session_id?: string;
  error?: string;
  code?: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const DEFAULT_ENDPOINT =
  "https://sidak.kr/autodev/ProjectManager/api/hikami.asp";
const REQUEST_TIMEOUT_MS = 150_000;

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
) {
  const target = new URL(endpoint);
  if (action === "health") {
    target.searchParams.set("action", "history");
    target.searchParams.set("session_id", "agentforest-health");
    return fetch(target, {
      headers: {
        Accept: "application/json",
        "X-HiKami-Key": apiKey,
      },
      signal: AbortSignal.timeout(12_000),
    });
  }

  target.searchParams.set("action", "chat");
  const form = new URLSearchParams({ message: prompt });
  if (sessionId) form.set("session_id", sessionId);
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

async function readChatBody(request: Request) {
  const text = await request.text();
  if (text.length > 12_000) throw new Error("대화 내용이 너무 깁니다.");
  const body = text
    ? (JSON.parse(text) as Record<string, unknown>)
    : ({} as Record<string, unknown>);
  const prompt = String(body.prompt ?? "").trim();
  const sessionId = String(body.sessionId ?? "").trim();
  if (!prompt || prompt.length > 2_000) {
    throw new Error("1~2,000자의 대화 내용을 입력해 주세요.");
  }
  if (sessionId && !/^s\d{6}-\d{6}$/.test(sessionId)) {
    throw new Error("PM Worker 대화 세션 정보가 올바르지 않습니다.");
  }
  return { prompt, sessionId };
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
      const upstream = await upstreamRequest(endpoint, apiKey, "health");
      if (!upstream.ok) {
        return json(
          { ready: false, error: "PM Worker AI가 응답하지 않아요." },
          503,
        );
      }
      return json({ ready: true, provider: "project-manager-worker" });
    }

    const { prompt, sessionId } = await readChatBody(request);
    const upstream = await upstreamRequest(
      endpoint,
      apiKey,
      "chat",
      prompt,
      sessionId,
    );
    const responseText = await upstream.text();
    let body: UpstreamBody = {};
    try {
      body = JSON.parse(responseText) as UpstreamBody;
    } catch {
      return json({ error: "PM Worker AI 응답 형식이 올바르지 않아요." }, 502);
    }
    if (!upstream.ok || !body.reply || !body.session_id) {
      return json(
        {
          error:
            body.error ??
            (upstream.status >= 500
              ? "PM Worker AI가 잠시 응답하지 않아요."
              : "PM Worker AI 요청을 처리하지 못했어요."),
        },
        upstream.status >= 400 ? upstream.status : 502,
      );
    }
    return json({
      reply: body.reply,
      sessionId: body.session_id,
      provider: "project-manager-worker",
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
