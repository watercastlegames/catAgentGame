export const COMPANION_BACKEND_KEY = "agent-forest-companion-backend-v1";

export type AppEdition = "service" | "public";
export type CompanionBackendId =
  | "chatgpt-cli"
  | "claude-cli"
  | "local-session"
  | "local-claude"
  | "puter"
  | "pm-worker";

export type CompanionCapabilities = {
  fileEdit: boolean;
  shellExec: boolean;
  approvalFlow: boolean;
  streaming: boolean;
  multiSession: boolean;
};

export type CompanionBackendDefinition = {
  id: CompanionBackendId;
  title: string;
  description: string;
  badge: string;
  editions: AppEdition[];
  available: "ready" | "requires-pairing" | "server-pending";
  capabilities: CompanionCapabilities;
};

export const APP_EDITION: AppEdition =
  process.env.NEXT_PUBLIC_APP_EDITION === "service" ? "service" : "public";

export const COMPANION_BACKENDS: CompanionBackendDefinition[] = [
  {
    id: "chatgpt-cli",
    title: "Agent Forest ChatGPT",
    description: "서비스 서버의 격리된 작업공간에서 업무를 처리해요.",
    badge: "사장님 전용",
    editions: ["service"],
    available: "server-pending",
    capabilities: {
      fileEdit: true,
      shellExec: true,
      approvalFlow: true,
      streaming: false,
      multiSession: false,
    },
  },
  {
    id: "claude-cli",
    title: "Agent Forest Claude",
    description: "서비스 서버의 Claude 실행기로 업무를 처리해요.",
    badge: "사장님 전용",
    editions: ["service"],
    available: "server-pending",
    capabilities: {
      fileEdit: true,
      shellExec: true,
      approvalFlow: true,
      streaming: false,
      multiSession: false,
    },
  },
  {
    id: "local-session",
    title: "ChatGPT Codex (내 PC)",
    description:
      "내 PC의 Codex 세션과 실제 프로젝트를 연결해요. 질문마다 조개 5개를 사용해요.",
    badge: "조개 5 · 내 PC 연결",
    editions: ["service", "public"],
    available: "requires-pairing",
    capabilities: {
      fileEdit: true,
      shellExec: true,
      approvalFlow: true,
      streaming: true,
      multiSession: true,
    },
  },
  {
    id: "local-claude",
    title: "Claude Code (내 PC)",
    description:
      "내 PC의 Claude Code 세션과 실제 프로젝트를 연결해요. 질문마다 조개 5개를 사용해요.",
    badge: "조개 5 · 내 PC 연결",
    editions: ["service", "public"],
    available: "requires-pairing",
    capabilities: {
      fileEdit: true,
      shellExec: true,
      approvalFlow: false,
      streaming: true,
      multiSession: true,
    },
  },
  {
    id: "puter",
    title: "무료 AI 대화",
    description:
      "Puter 로그인 후 답변과 아이디어를 받아요. 게임 대화마다 조개 5개를 사용해요.",
    badge: "조개 5 · 대화 전용",
    editions: ["service", "public"],
    available: "ready",
    capabilities: {
      fileEdit: false,
      shellExec: false,
      approvalFlow: false,
      streaming: false,
      multiSession: false,
    },
  },
  {
    id: "pm-worker",
    title: "PM Worker AI",
    description:
      "ProjectManager의 공용 AI 워커와 대화해요. 질문마다 조개 5개를 사용해요.",
    badge: "조개 5 · 대화 전용",
    editions: ["service", "public"],
    available: "ready",
    capabilities: {
      fileEdit: false,
      shellExec: false,
      approvalFlow: false,
      streaming: false,
      multiSession: false,
    },
  },
];

export function visibleCompanionBackends(edition = APP_EDITION) {
  return COMPANION_BACKENDS.filter((backend) =>
    backend.editions.includes(edition),
  );
}

/* 기본은 PM Worker 다 — 사용자가 아는 "공용 AI" 이름을 유지한다.
   서버 대화 워커가 인증을 잃어 답하지 못하면, 게임이 자동으로
   내 PC Claude Code(브리지)로 위임한다(delegateToLocalClaude).
   그래서 6자리 코드로 한 번 연결해 두면 서버 상태와 무관하게 답이 온다.
   sidak.kr 미러에서는 cloud 릴레이 프록시를 타고 이 PC 에 닿는다. */
export function defaultCompanionBackend(
  _edition = APP_EDITION,
): CompanionBackendId {
  return "pm-worker";
}

export function parseCompanionBackend(
  value: string | null,
  edition = APP_EDITION,
): CompanionBackendId {
  const visible = visibleCompanionBackends(edition);
  return (
    visible.find((backend) => backend.id === value)?.id ??
    defaultCompanionBackend(edition)
  );
}
