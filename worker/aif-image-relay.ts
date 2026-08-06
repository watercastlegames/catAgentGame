type AifImageRelayEnv = {
  AIF_IMAGE_ENDPOINT?: string;
  AIF_IMAGE_API_KEY?: string;
  AIF_IMAGE_PROJECT_ID?: string;
};

type AifTaskBody = {
  success?: boolean;
  task_id?: number;
  status?: string;
  error_message?: string;
  error?: { message?: string };
  image?: { url?: string };
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const DEFAULT_ENDPOINT =
  "http://1.248.227.240/autodev/AutoImageCreate/api/v1/";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function endpointFor(env: AifImageRelayEnv) {
  try {
    const endpoint = new URL(env.AIF_IMAGE_ENDPOINT?.trim() || DEFAULT_ENDPOINT);
    if (!/^https?:$/.test(endpoint.protocol)) return null;
    if (!endpoint.pathname.endsWith("/")) endpoint.pathname += "/";
    return endpoint;
  } catch {
    return null;
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as AifTaskBody;
  } catch {
    return null;
  }
}

async function fetchTask(endpoint: URL, apiKey: string, taskId: number) {
  const statusUrl = new URL("tasks.asp", endpoint);
  statusUrl.searchParams.set("id", String(taskId));
  const response = await fetch(statusUrl, {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
    signal: AbortSignal.timeout(20_000),
  });
  return { response, body: await readJson(response) };
}

function taskIdFrom(url: URL) {
  const taskId = Number(url.searchParams.get("id"));
  return Number.isSafeInteger(taskId) && taskId > 0 ? taskId : null;
}

export async function handleAifImageRequest(
  request: Request,
  env: AifImageRelayEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/aif-image/")) return null;

  const endpoint = endpointFor(env);
  const apiKey = env.AIF_IMAGE_API_KEY?.trim() ?? "";
  if (!endpoint || !apiKey) {
    return json({ error: "고화질 이미지 생성 서버가 설정되지 않았어요." }, 503);
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/aif-image/health") {
      return json({ ready: true, provider: "aif-chatgpt-cli" });
    }

    if (request.method === "POST" && url.pathname === "/api/aif-image/generate") {
      const raw = await request.text();
      if (raw.length > 12_000) return json({ error: "프롬프트가 너무 길어요." }, 400);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt || prompt.length > 8_000) {
        return json({ error: "이미지 설명은 1~8,000자로 입력해 주세요." }, 400);
      }
      const generateUrl = new URL("generate.asp", endpoint);
      const upstream = await fetch(generateUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          prompt,
          project_id: Number(env.AIF_IMAGE_PROJECT_ID ?? 1) || 1,
          generation_type: "chatgpt_cli",
          width: 1024,
          height: 1024,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const upstreamBody = await readJson(upstream);
      if (!upstream.ok || !upstreamBody?.success || !upstreamBody.task_id) {
        return json(
          {
            error:
              upstreamBody?.error?.message ??
              "고화질 이미지 생성을 접수하지 못했어요.",
          },
          upstream.ok ? 502 : upstream.status,
        );
      }
      return json({
        taskId: upstreamBody.task_id,
        status: upstreamBody.status ?? "queued",
      });
    }

    if (request.method === "GET" && url.pathname === "/api/aif-image/status") {
      const taskId = taskIdFrom(url);
      if (!taskId) return json({ error: "작업 번호가 올바르지 않아요." }, 400);
      const { response, body } = await fetchTask(endpoint, apiKey, taskId);
      if (!response.ok || !body?.success) {
        return json({ error: body?.error?.message ?? "생성 상태를 확인하지 못했어요." }, 502);
      }
      return json({
        taskId,
        status: body.status ?? "queued",
        error: body.error_message ?? null,
        resultUrl:
          body.status === "completed" && body.image?.url
            ? `/api/aif-image/result?id=${taskId}`
            : null,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/aif-image/result") {
      const taskId = taskIdFrom(url);
      if (!taskId) return json({ error: "작업 번호가 올바르지 않아요." }, 400);
      const { response, body } = await fetchTask(endpoint, apiKey, taskId);
      if (!response.ok || body?.status !== "completed" || !body.image?.url) {
        return json({ error: "완성된 이미지가 아직 없어요." }, 404);
      }
      const imageUrl = new URL(body.image.url, endpoint.origin);
      if (imageUrl.origin !== endpoint.origin) {
        return json({ error: "허용되지 않은 이미지 주소예요." }, 502);
      }
      const imageResponse = await fetch(imageUrl, {
        signal: AbortSignal.timeout(35_000),
      });
      if (!imageResponse.ok || !imageResponse.body) {
        return json({ error: "완성 이미지를 불러오지 못했어요." }, 502);
      }
      return new Response(imageResponse.body, {
        headers: {
          "Content-Type": imageResponse.headers.get("content-type") || "image/png",
          "Cache-Control": "private, max-age=3600",
          "Content-Disposition": `inline; filename="agent-forest-${taskId}.png"`,
        },
      });
    }

    return json({ error: "지원하지 않는 이미지 요청이에요." }, 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "고화질 이미지 서버에 연결하지 못했어요.",
      },
      502,
    );
  }
}
