const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";

type PuterChatResponse =
  | string
  | {
      text?: string;
      message?: {
        content?: string | Array<{ text?: string; type?: string }>;
      };
    };

declare global {
  interface Window {
    puter?: {
      ai?: {
        chat: (
          prompt: string,
          options?: Record<string, unknown>,
        ) => Promise<PuterChatResponse>;
      };
    };
  }
}

let puterLoadPromise: Promise<void> | null = null;

export function loadPuterCompanion() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Puter AI는 브라우저에서만 사용할 수 있어요."));
  }
  if (window.puter?.ai?.chat) return Promise.resolve();
  if (puterLoadPromise) return puterLoadPromise;
  puterLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PUTER_SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");
    const fail = () => {
      puterLoadPromise = null;
      reject(new Error("무료 AI 연결 모듈을 불러오지 못했어요."));
    };
    const complete = () => {
      if (window.puter?.ai?.chat) resolve();
      else fail();
    };
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = PUTER_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    } else if (window.puter?.ai?.chat) {
      resolve();
    }
  });
  return puterLoadPromise;
}

function readPuterText(response: PuterChatResponse) {
  if (typeof response === "string") return response.trim();
  if (typeof response.text === "string") return response.text.trim();
  const content = response.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

export async function submitPuterTask(prompt: string) {
  await loadPuterCompanion();
  const chat = window.puter?.ai?.chat;
  if (!chat) throw new Error("무료 AI가 아직 준비되지 않았어요.");
  const response = await chat(prompt, { model: "gpt-5-nano" });
  const result = readPuterText(response);
  if (!result) throw new Error("무료 AI가 빈 답변을 반환했어요.");
  return result;
}
