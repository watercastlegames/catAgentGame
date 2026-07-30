export const COMPANION_BACKEND_KEY = "agent-forest-companion-backend-v1";

export type AppEdition = "service" | "public";
export type CompanionBackendId =
  | "chatgpt-cli"
  | "claude-cli"
  | "puter"
  | "local-session";

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
    id: "puter",
    title: "무료 AI 대화",
    description: "브라우저에서 Puter AI를 사용해 답변과 아이디어를 받아요.",
    badge: "무료 · 코드 수정 불가",
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
    id: "local-session",
    title: "내 PC Codex 세션",
    description: "내 컴퓨터의 기존 Codex 세션과 실제 프로젝트를 연결해요.",
    badge: "내 PC 세션 필요",
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
];

export function visibleCompanionBackends(edition = APP_EDITION) {
  return COMPANION_BACKENDS.filter((backend) =>
    backend.editions.includes(edition),
  );
}

export function defaultCompanionBackend(
  edition = APP_EDITION,
): CompanionBackendId {
  return edition === "service" ? "chatgpt-cli" : "puter";
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
