type AifGenerateBody = {
  taskId?: number;
  status?: string;
  error?: string;
};

type AifStatusBody = AifGenerateBody & {
  resultUrl?: string | null;
};

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 8 * 60_000;

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function readBody<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new Error(
      String((body as { error?: string }).error ?? "이미지 서버가 응답하지 않아요."),
    );
  }
  return body;
}

export async function generateAifChatGptCliImage(prompt: string) {
  const request = await fetch("/api/aif-image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const queued = await readBody<AifGenerateBody>(request);
  if (!queued.taskId) throw new Error("이미지 작업 번호를 받지 못했어요.");
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await wait(POLL_INTERVAL_MS);
    const statusResponse = await fetch(
      `/api/aif-image/status?id=${encodeURIComponent(queued.taskId)}`,
      { cache: "no-store" },
    );
    const task = await readBody<AifStatusBody>(statusResponse);
    if (task.status === "completed" && task.resultUrl) return task.resultUrl;
    if (task.status === "failed") {
      throw new Error(task.error || "고화질 이미지 생성에 실패했어요.");
    }
  }
  throw new Error("이미지 생성 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.");
}
