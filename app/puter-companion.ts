const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";

type PuterChatResponse =
  | string
  | {
      text?: string;
      message?: {
        content?: string | Array<{ text?: string; type?: string }>;
      };
    };

type PuterAuth = {
  isSignedIn: () => boolean;
  signIn: () => Promise<unknown>;
};

declare global {
  interface Window {
    puter?: {
      auth?: PuterAuth;
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
  if (window.puter?.ai?.chat && window.puter?.auth) return Promise.resolve();
  if (puterLoadPromise) return puterLoadPromise;
  puterLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PUTER_SCRIPT_URL}"]`,
    );
    if (existing && !window.puter) existing.remove();
    const script = document.createElement("script");
    const fail = () => {
      script.remove();
      puterLoadPromise = null;
      reject(new Error("무료 AI 연결 모듈을 불러오지 못했어요."));
    };
    const complete = () => {
      if (window.puter?.ai?.chat && window.puter?.auth) resolve();
      else fail();
    };
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", fail, { once: true });
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    document.head.appendChild(script);
  });
  return puterLoadPromise;
}

export type PuterConnectionState = "loading" | "signed-out" | "ready" | "error";

export async function inspectPuterConnection(): Promise<
  Exclude<PuterConnectionState, "loading" | "error">
> {
  await loadPuterCompanion();
  const auth = window.puter?.auth;
  if (!auth) throw new Error("무료 AI 로그인 모듈을 준비하지 못했어요.");
  return auth.isSignedIn() ? "ready" : "signed-out";
}

export function signInPuterCompanion() {
  const auth = window.puter?.auth;
  if (!auth) {
    return Promise.reject(
      new Error("무료 AI 모듈을 먼저 준비해 주세요."),
    );
  }
  // Puter 로그인 팝업은 사용자 클릭 이벤트 안에서 곧바로 열어야 한다.
  return auth.signIn().then(() => {
    if (!auth.isSignedIn()) {
      throw new Error("무료 AI 로그인이 완료되지 않았어요.");
    }
  });
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
  if (!window.puter?.auth?.isSignedIn()) {
    throw new Error("세션 연결에서 먼저 무료 AI에 로그인해 주세요.");
  }
  const chat = window.puter?.ai?.chat;
  if (!chat) throw new Error("무료 AI가 아직 준비되지 않았어요.");
  const response = await chat(prompt);
  const result = readPuterText(response);
  if (!result) throw new Error("무료 AI가 빈 답변을 반환했어요.");
  return result;
}
