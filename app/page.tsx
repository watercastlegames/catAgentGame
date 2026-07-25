"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AgentWorld3D, { type AgentWorldLocation } from "./agent-world-3d";

type Department = "general" | "coding" | "design" | "music";
type AgentStatus =
  | "idle"
  | "queued"
  | "briefing"
  | "moving"
  | "working"
  | "reporting"
  | "waiting_approval"
  | "failed"
  | "completed";

type BridgeEvent = {
  id: string;
  type: string;
  occurredAt: string;
  taskId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  requestId?: string;
  agentId?: string;
  department?: Department;
  status?: AgentStatus;
  location?: AgentWorldLocation;
  title?: string;
  detail?: string;
  prompt?: string;
  result?: string;
  mode?: "codex" | "simulation";
  version?: string | null;
  available?: boolean;
  running?: boolean;
  decision?: "approve" | "reject" | "cancel";
  approvalKind?: "command" | "fileChange" | "permissions";
  command?: string;
  session?: CodexSession;
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  } | null;
};

type ActiveTask = {
  taskId: string;
  threadId?: string | null;
  prompt: string;
  department: Department;
  mode: "codex" | "simulation";
  title: string;
  detail: string;
  result: string;
};

type CodexSession = {
  id: string;
  sessionId: string;
  title: string;
  preview: string;
  projectName: string;
  status: "notLoaded" | "idle" | "active" | "systemError" | string;
  activeFlags: string[];
  source: string;
  modelProvider: string;
  updatedAt: string;
  createdAt: string;
  ephemeral: boolean;
  canAcceptDirectInput: boolean;
};

type BridgeHealth = {
  available?: boolean;
  version?: string | null;
  appServerConnected?: boolean;
  paired?: boolean;
  requiresPairing?: boolean;
};

type CompanionTransport = "local" | "cloud";

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? "http://127.0.0.1:4317";
const COMPANION_TOKEN_KEY = "agent-forest-companion-token";
const COMPANION_TRANSPORT_KEY = "agent-forest-companion-transport";
const SELECTED_SESSION_KEY = "agent-forest-selected-session";

const DEPARTMENTS: Record<
  Department,
  { label: string; agent: string; emoji: string; color: string }
> = {
  general: {
    label: "General",
    agent: "매니저 모모",
    emoji: "🐱",
    color: "#f0c784",
  },
  coding: {
    label: "Coding",
    agent: "개발자 토토",
    emoji: "🐈‍⬛",
    color: "#9bc8db",
  },
  design: {
    label: "Design",
    agent: "디자이너 보리",
    emoji: "😺",
    color: "#e7a6a3",
  },
  music: {
    label: "Music",
    agent: "뮤지션 코코",
    emoji: "😸",
    color: "#b8c887",
  },
};

const STATUS_COPY: Record<AgentStatus, string> = {
  idle: "대기 중",
  queued: "업무 접수",
  briefing: "업무 분석",
  moving: "이동 중",
  working: "작업 중",
  reporting: "보고 중",
  waiting_approval: "승인 대기",
  failed: "문제 발생",
  completed: "완료",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function compactNumber(value?: number) {
  if (!value) return "0";
  return new Intl.NumberFormat("ko-KR", { notation: "compact" }).format(value);
}

function sessionStatusLabel(status: string) {
  if (status === "active") return "실행 중";
  if (status === "idle") return "대기";
  if (status === "systemError") return "오류";
  return "저장됨";
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const difference = Math.max(0, Date.now() - time);
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function Home() {
  const [bridgeState, setBridgeState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [codexVersion, setCodexVersion] = useState<string | null>(null);
  const [codexAvailable, setCodexAvailable] = useState(false);
  const [department, setDepartment] = useState<Department>("coding");
  const [prompt, setPrompt] = useState(
    "도구를 사용하지 말고 현재 Codex와 연결되었다는 사실을 한 문장으로 알려줘.",
  );
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [agentLocation, setAgentLocation] =
    useState<AgentWorldLocation>("general");
  const [activeDepartment, setActiveDepartment] =
    useState<Department>("general");
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalEvent, setApprovalEvent] = useState<BridgeEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [companionToken, setCompanionToken] = useState<string | null>(null);
  const [companionTransport, setCompanionTransport] =
    useState<CompanionTransport>("local");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const relayEventCursor = useRef(0);

  const agent = DEPARTMENTS[activeDepartment];

  const latestEvents = useMemo(() => events.slice(0, 8), [events]);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedThreadId) ?? null,
    [selectedThreadId, sessions],
  );

  const apiFetch = useCallback(
    (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (companionToken) {
        headers.set("Authorization", `Bearer ${companionToken}`);
      }
      const base =
        companionTransport === "cloud" ? "/api/relay" : BRIDGE_URL;
      return fetch(`${base}${pathname}`, { ...init, headers });
    },
    [companionToken, companionTransport],
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem(COMPANION_TOKEN_KEY);
    const savedTransport = window.localStorage.getItem(
      COMPANION_TRANSPORT_KEY,
    );
    const savedSession = window.localStorage.getItem(SELECTED_SESSION_KEY);
    queueMicrotask(() => {
      if (savedToken) setCompanionToken(savedToken);
      if (savedTransport === "cloud") setCompanionTransport("cloud");
      if (savedSession) setSelectedThreadId(savedSession);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const authorization: Record<string, string> = {};
    if (companionToken) {
      authorization.Authorization = `Bearer ${companionToken}`;
    }

    const base =
      companionTransport === "cloud" ? "/api/relay" : BRIDGE_URL;
    fetch(`${base}/health`, { headers: authorization })
      .then((response) => response.json())
      .then((health: BridgeHealth) => {
        if (disposed) return;
        setCodexAvailable(Boolean(health.available));
        setCodexVersion(health.version ?? null);
        setBridgeState(health.paired ? "connected" : "disconnected");
        if (companionToken && !health.paired) {
          window.localStorage.removeItem(COMPANION_TOKEN_KEY);
          window.localStorage.removeItem(COMPANION_TRANSPORT_KEY);
          setCompanionToken(null);
        }
      })
      .catch(() => {
        if (!disposed) setBridgeState("disconnected");
      });

    return () => {
      disposed = true;
    };
  }, [companionToken, companionTransport]);

  const consumeBridgeEvent = useCallback((event: BridgeEvent) => {
    if (event.version !== undefined) setCodexVersion(event.version ?? null);
    if (event.available !== undefined) setCodexAvailable(event.available);

    if (event.type === "task.queued") {
      const taskDepartment = event.department ?? "general";
      setActiveDepartment(taskDepartment);
      setActiveTask({
        taskId: event.taskId ?? "unknown",
        threadId: event.threadId,
        prompt: event.prompt ?? event.detail ?? "",
        department: taskDepartment,
        mode: event.mode ?? "simulation",
        title: event.title ?? "새 업무를 접수했어요",
        detail: event.detail ?? "",
        result: "",
      });
      setAgentStatus("queued");
      setAgentLocation("general");
    }

    if (
      ["agent.status", "task.result", "task.failed", "task.completed"].includes(
        event.type,
      )
    ) {
      if (event.department) setActiveDepartment(event.department);
      if (event.status) setAgentStatus(event.status);
      if (event.location) setAgentLocation(event.location);
      setActiveTask((task) =>
        task
          ? {
              ...task,
              title: event.title ?? task.title,
              detail: event.detail ?? task.detail,
              result: event.result ?? task.result,
            }
          : task,
      );
    }

    if (event.type === "approval.required") {
      setAgentStatus("waiting_approval");
      setAgentLocation("office");
      setApprovalEvent(event);
      setActiveTask((task) =>
        task
          ? {
              ...task,
              title: event.title ?? task.title,
              detail: event.detail ?? task.detail,
              result: event.result ?? task.result,
            }
          : task,
      );
    }

    if (["task.failed", "task.completed"].includes(event.type)) {
      setIsSubmitting(false);
      if (event.type === "task.failed") {
        setToast(event.detail ?? "작업이 완료되지 않았어요.");
      }
    }

    if (event.type === "approval.decided") {
      setAgentStatus(event.status ?? "idle");
      setAgentLocation(event.location ?? "general");
      setApprovalEvent(null);
      setToast(event.title ?? "결정을 저장했어요.");
    }

    if (event.type === "session.updated" && event.session) {
      setSessions((current) => {
        const others = current.filter(
          (session) => session.id !== event.session?.id,
        );
        return [event.session as CodexSession, ...others].slice(0, 30);
      });
    }

    if (!["bridge.snapshot", "bridge.status"].includes(event.type)) {
      setEvents((current) => [event, ...current].slice(0, 30));
    }
  }, []);

  useEffect(() => {
    if (!companionToken) return;
    let disposed = false;

    if (companionTransport === "local") {
      const source = new EventSource(
        `${BRIDGE_URL}/events?token=${encodeURIComponent(companionToken)}`,
      );
      source.onopen = () => {
        if (!disposed) setBridgeState("connected");
      };
      source.onerror = () => {
        if (!disposed) setBridgeState("disconnected");
      };
      source.onmessage = (message) => {
        if (disposed) return;
        try {
          consumeBridgeEvent(JSON.parse(message.data) as BridgeEvent);
        } catch {
          // Ignore malformed bridge messages and keep the event stream alive.
        }
      };
      return () => {
        disposed = true;
        source.close();
      };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (disposed) return;
      try {
        const response = await fetch(
          `/api/relay/events?after=${relayEventCursor.current}`,
          {
            headers: { Authorization: `Bearer ${companionToken}` },
            cache: "no-store",
          },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "외부 이벤트를 불러오지 못했어요.");
        }
        for (const entry of body.events ?? []) {
          relayEventCursor.current = Math.max(
            relayEventCursor.current,
            Number(entry.cursor ?? 0),
          );
          consumeBridgeEvent(entry.event as BridgeEvent);
        }
        setBridgeState("connected");
      } catch {
        if (!disposed) setBridgeState("disconnected");
      } finally {
        if (!disposed) timer = setTimeout(poll, 1_250);
      }
    };
    void poll();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [companionToken, companionTransport, consumeBridgeEvent]);

  const refreshSessions = useCallback(async () => {
    if (!companionToken) return;
    setSessionsLoading(true);
    try {
      const response = await apiFetch("/v2/sessions?limit=20");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "세션을 불러오지 못했어요.");
      const nextSessions = (body.data ?? []) as CodexSession[];
      setSessions(nextSessions);
      setSelectedThreadId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) {
          return current;
        }
        const next = nextSessions[0]?.id ?? null;
        if (next) window.localStorage.setItem(SELECTED_SESSION_KEY, next);
        return next;
      });
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "세션을 불러오지 못했어요.",
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [apiFetch, companionToken]);

  useEffect(() => {
    if (companionToken) {
      queueMicrotask(() => void refreshSessions());
    }
  }, [companionToken, refreshSessions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function pairCompanion(event: FormEvent) {
    event.preventDefault();
    if (pairingBusy || pairingCode.trim().length !== 6) return;
    setPairingBusy(true);
    try {
      const code = pairingCode.trim();
      let response: Response | null = null;
      let body: Record<string, unknown> = {};
      let transport: CompanionTransport = "local";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_800);
      try {
        response = await fetch(`${BRIDGE_URL}/v2/pair`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal: controller.signal,
        });
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        response = null;
      } finally {
        clearTimeout(timeout);
      }

      if (!response?.ok || !body.token) {
        transport = "cloud";
        response = await fetch("/api/relay/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        body = (await response.json()) as Record<string, unknown>;
      }

      if (!response.ok || typeof body.token !== "string") {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "PC Companion에 연결하지 못했어요.",
        );
      }
      window.localStorage.setItem(COMPANION_TOKEN_KEY, body.token);
      window.localStorage.setItem(COMPANION_TRANSPORT_KEY, transport);
      setCompanionTransport(transport);
      setCompanionToken(body.token);
      relayEventCursor.current = Number(body.eventCursor ?? 0);
      setBridgeState("connected");
      setPairingCode("");
      setToast(
        transport === "cloud"
          ? "외부 네트워크에서 내 PC의 Codex와 연결됐어요."
          : "내 PC의 Codex Companion과 연결됐어요.",
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "PC Companion에 연결하지 못했어요.",
      );
    } finally {
      setPairingBusy(false);
    }
  }

  function disconnectCompanion() {
    window.localStorage.removeItem(COMPANION_TOKEN_KEY);
    window.localStorage.removeItem(COMPANION_TRANSPORT_KEY);
    window.localStorage.removeItem(SELECTED_SESSION_KEY);
    setCompanionToken(null);
    setCompanionTransport("local");
    setSelectedThreadId(null);
    setSessions([]);
    setBridgeState("disconnected");
    setAgentStatus("idle");
    setAgentLocation("general");
  }

  async function selectSession(threadId: string) {
    setSelectedThreadId(threadId);
    window.localStorage.setItem(SELECTED_SESSION_KEY, threadId);
    try {
      const response = await apiFetch(
        `/v2/sessions/${encodeURIComponent(threadId)}/resume`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "세션을 열지 못했어요.");
      setToast(
        body.queued
          ? "PC에 세션 연결 요청을 보냈어요."
          : `“${body.session?.title ?? "Codex 세션"}”을 연결했어요.`,
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "세션을 열지 못했어요.");
    }
  }

  async function createNewSession() {
    setSessionsLoading(true);
    try {
      const response = await apiFetch("/v2/sessions", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "새 세션을 만들지 못했어요.");
      if (body.queued) {
        setToast("PC에 새 Codex 세션 생성 요청을 보냈어요.");
        setTimeout(() => void refreshSessions(), 2_500);
        return;
      }
      const session = body.session as CodexSession;
      setSessions((current) => [session, ...current]);
      setSelectedThreadId(session.id);
      window.localStorage.setItem(SELECTED_SESSION_KEY, session.id);
      setToast("이 프로젝트의 새 Codex 세션을 만들었어요.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "새 세션을 만들지 못했어요.",
      );
    } finally {
      setSessionsLoading(false);
    }
  }

  async function startTask(mode: "codex" | "simulation") {
    if (!prompt.trim()) return;
    const canSteer =
      mode === "codex" && isSubmitting && activeTask?.mode === "codex";
    if (isSubmitting && !canSteer) return;
    if (mode === "codex" && !selectedThreadId) {
      setToast("먼저 연결할 Codex 세션을 선택해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setApprovalEvent(null);
    if (!canSteer) setEvents([]);
    try {
      const endpoint =
        mode === "simulation"
          ? "/simulate"
          : canSteer
            ? `/v2/sessions/${encodeURIComponent(selectedThreadId as string)}/steer`
            : `/v2/sessions/${encodeURIComponent(selectedThreadId as string)}/turns`;
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          department,
          threadId: selectedThreadId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "작업을 시작하지 못했어요.");
      if (mode === "simulation") {
        setTimeout(() => setIsSubmitting(false), 5100);
      } else if (canSteer) {
        setToast("진행 중인 Codex 작업에 추가 지시를 보냈어요.");
      }
    } catch (error) {
      setIsSubmitting(false);
      setToast(
        error instanceof Error ? error.message : "브리지에 연결하지 못했어요.",
      );
    }
  }

  async function interruptTask() {
    if (!selectedThreadId) return;
    try {
      const response = await apiFetch(
        `/v2/sessions/${encodeURIComponent(selectedThreadId)}/interrupt`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "작업을 중단하지 못했어요.");
      setIsSubmitting(false);
      setAgentStatus("idle");
      setAgentLocation("general");
      setToast("현재 Codex 작업을 중단했어요.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "작업을 중단하지 못했어요.",
      );
    }
  }

  function submitTask(event: FormEvent) {
    event.preventDefault();
    void startTask("codex");
  }

  async function decide(decision: "approve" | "reject" | "cancel") {
    if (!approvalEvent?.requestId) return;
    try {
      const response = await apiFetch(
        `/v2/approvals/${encodeURIComponent(approvalEvent.requestId)}`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) throw new Error("결정을 저장하지 못했어요.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "결정을 저장하지 못했어요.",
      );
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-paw" aria-hidden="true">🐾</span>
          <div>
            <p>OPENCLAW PERSONAL OFFICE</p>
            <h1>Agent Forest</h1>
          </div>
        </div>

        <div className="connection-group" aria-live="polite">
          <span className={`connection-dot ${bridgeState}`} />
          <div>
            <strong>
              {bridgeState === "connected" && companionToken
                ? codexAvailable
                  ? companionTransport === "cloud"
                    ? "외부에서 내 PC Codex 연결됨"
                    : "내 PC Codex 연결됨"
                  : "브리지만 연결됨"
                : bridgeState === "connecting"
                  ? "연결 확인 중"
                  : companionToken
                    ? "PC Companion 확인 필요"
                    : "PC 연결 필요"}
            </strong>
            <small>
              {companionToken
                ? `${companionTransport === "cloud" ? "보안 중계 · " : ""}${codexVersion ?? "Codex 버전 확인 대기"}`
                : "Companion 연결 코드를 입력하세요"}
            </small>
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="world-card" aria-label="AI 에이전트 숲">
          <div className="world-toolbar">
            <div>
              <span className="live-pill">
                <i />
                LIVE OFFICE
              </span>
              <h2>동물 에이전트 팀의 현재 업무</h2>
            </div>
            <div className="world-summary">
              <span>{STATUS_COPY[agentStatus]}</span>
              <strong>{agent.agent}</strong>
            </div>
          </div>

          <div className="world-stage world-stage-3d">
            <AgentWorld3D
              agentName={agent.agent}
              location={agentLocation}
              status={agentStatus}
              statusLabel={STATUS_COPY[agentStatus]}
            />

            <div className="world-caption">
              <span>2.5D WebGL · AUTONOMOUS CAT MOTION ACTIVE</span>
              <b>
                해변 일러스트 · 고양이 자율 행동 · 책상 객체 충돌 회피
              </b>
            </div>
          </div>
        </section>

        <aside className="control-panel">
          <section className="panel-section session-browser">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">CODEX SESSIONS</span>
                <h2>내 PC 세션 연결</h2>
              </div>
              <span className="step-badge">01</span>
            </div>

            {!companionToken ? (
              <form className="pairing-form" onSubmit={pairCompanion}>
                <div className="pairing-copy">
                  <span aria-hidden="true">🔗</span>
                  <div>
                    <strong>PC Companion을 실행해 주세요</strong>
                    <p>PC 터미널의 6자리 코드를 입력하면 휴대폰·외부 네트워크에서도 현재 Codex 세션을 불러옵니다.</p>
                  </div>
                </div>
                <label htmlFor="pairing-code">연결 코드</label>
                <div className="pairing-controls">
                  <input
                    id="pairing-code"
                    value={pairingCode}
                    onChange={(event) =>
                      setPairingCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                  <button
                    type="submit"
                    disabled={pairingBusy || pairingCode.length !== 6}
                  >
                    {pairingBusy ? "연결 중" : "연결"}
                  </button>
                </div>
                <code>npm run bridge</code>
              </form>
            ) : (
              <>
                <div className="session-actions">
                  <button
                    type="button"
                    onClick={() => void refreshSessions()}
                    disabled={sessionsLoading}
                  >
                    {sessionsLoading ? "불러오는 중…" : "↻ 새로고침"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void createNewSession()}
                    disabled={sessionsLoading}
                  >
                    ＋ 새 세션
                  </button>
                  <button
                    type="button"
                    className="session-disconnect"
                    onClick={disconnectCompanion}
                  >
                    연결 해제
                  </button>
                </div>

                <div className="session-list" role="listbox" aria-label="Codex 세션">
                  {sessions.length ? (
                    sessions.map((session) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedThreadId === session.id}
                        className={
                          selectedThreadId === session.id ? "selected" : ""
                        }
                        key={session.id}
                        onClick={() => void selectSession(session.id)}
                      >
                        <span className={`session-state state-${session.status}`} />
                        <span className="session-copy">
                          <strong>{session.title}</strong>
                          <small>
                            {session.projectName} · {relativeTime(session.updatedAt)}
                          </small>
                        </span>
                        <em>{sessionStatusLabel(session.status)}</em>
                      </button>
                    ))
                  ) : (
                    <div className="session-empty">
                      {sessionsLoading
                        ? "PC의 Codex 세션을 확인하고 있어요…"
                        : "표시할 Codex 세션이 없습니다."}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="panel-section task-composer">
            <div className="section-heading">
              <div>
                <span className="section-kicker">NEW MISSION</span>
                <h2>고양이 에이전트에게 업무 맡기기</h2>
              </div>
              <span className="step-badge">02</span>
            </div>

            <div className="selected-session-line">
              <span className={selectedSession ? "ready" : ""} />
              {selectedSession
                ? `${selectedSession.title} · ${selectedSession.projectName}`
                : "연결할 Codex 세션을 선택해 주세요"}
            </div>

            <div className="department-tabs" role="radiogroup" aria-label="담당 부서">
              {(Object.entries(DEPARTMENTS) as [
                Department,
                (typeof DEPARTMENTS)[Department],
              ][]).map(([key, item]) => (
                <button
                  type="button"
                  key={key}
                  className={department === key ? "selected" : ""}
                  onClick={() => setDepartment(key)}
                  role="radio"
                  aria-checked={department === key}
                >
                  <span>{item.emoji}</span>
                  {item.label}
                </button>
              ))}
            </div>

            <form onSubmit={submitTask}>
              <label htmlFor="mission">작업 내용</label>
              <textarea
                id="mission"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Codex에게 맡길 작업을 입력하세요"
              />
              <div className="composer-meta">
                <span>읽기 전용 안전 모드</span>
                <span>{prompt.length}/2,000</span>
              </div>

              <button
                className="run-button"
                type="submit"
                disabled={
                  bridgeState !== "connected" ||
                  !codexAvailable ||
                  !companionToken ||
                  !selectedThreadId ||
                  (isSubmitting && activeTask?.mode !== "codex") ||
                  !prompt.trim()
                }
              >
                <span aria-hidden="true">{isSubmitting ? "🐾" : "✦"}</span>
                {isSubmitting
                  ? "진행 중인 작업에 추가 지시"
                  : "선택한 Codex 세션에서 실행"}
              </button>
              <button
                className="simulate-button"
                type="button"
                disabled={
                  isSubmitting ||
                  bridgeState !== "connected" ||
                  !companionToken
                }
                onClick={() => void startTask("simulation")}
              >
                비용 없는 화면 시연
              </button>
            </form>
            <p className="usage-note">
              실제 실행은 선택한 PC 세션의 로그인·권한·샌드박스 설정을 그대로 사용합니다.
            </p>
          </section>

          <section className="panel-section active-task-card">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">CURRENT TASK</span>
                <h2>진행 상황</h2>
              </div>
              <span className={`status-chip status-${agentStatus}`}>
                {STATUS_COPY[agentStatus]}
              </span>
            </div>

            {activeTask ? (
              <>
                <div className="task-agent">
                  <span style={{ background: agent.color }}>{agent.emoji}</span>
                  <div>
                    <strong>{agent.agent}</strong>
                    <small>
                      {activeTask.mode === "codex" ? "실제 Codex" : "화면 시연"} ·{" "}
                      {DEPARTMENTS[activeTask.department].label}
                    </small>
                  </div>
                </div>
                <h3>{activeTask.title}</h3>
                <p>{activeTask.detail}</p>
                {activeTask.result && (
                  <div className="result-preview">{activeTask.result}</div>
                )}
                {isSubmitting && activeTask.mode === "codex" && (
                  <button
                    type="button"
                    className="interrupt-button"
                    onClick={() => void interruptTask()}
                  >
                    현재 Codex 작업 중단
                  </button>
                )}
              </>
            ) : (
              <div className="empty-task">
                <span aria-hidden="true">💤</span>
                <strong>모두 쉬고 있어요</strong>
                <p>업무를 입력하거나 화면 시연을 시작해 보세요.</p>
              </div>
            )}
          </section>

          <section className="panel-section activity-log">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">ACTIVITY</span>
                <h2>실시간 활동</h2>
              </div>
              <span className="event-count">{events.length}</span>
            </div>

            <ol>
              {latestEvents.length ? (
                latestEvents.map((event) => (
                  <li key={event.id}>
                    <span className={`log-dot status-${event.status ?? "idle"}`} />
                    <div>
                      <strong>{event.title ?? event.type}</strong>
                      <small>{formatTime(event.occurredAt)}</small>
                    </div>
                  </li>
                ))
              ) : (
                <li className="empty-log">아직 들어온 이벤트가 없습니다.</li>
              )}
            </ol>
          </section>
        </aside>
      </div>

      <footer className="app-footer">
        <span>PC Companion integration</span>
        <strong>Codex App Server → Secure Companion → Agent Forest</strong>
        <span>Bridge {BRIDGE_URL.replace("http://", "")}</span>
      </footer>

      {approvalEvent && (
        <div className="approval-backdrop" role="presentation">
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <div className="manager-cat" aria-hidden="true">
              <span>🐱</span>
              <i>REPORT</i>
            </div>
            <div className="approval-copy">
              <span className="section-kicker">MANAGER REPORT</span>
              <h2 id="approval-title">{approvalEvent.title}</h2>
              <p>{approvalEvent.detail}</p>
              {approvalEvent.command && (
                <pre className="approval-command">
                  <code>{approvalEvent.command}</code>
                </pre>
              )}
              {approvalEvent.result && (
                <div className="report-result">{approvalEvent.result}</div>
              )}
              {approvalEvent.usage && (
                <div className="token-row">
                  <span>
                    입력 <b>{compactNumber(approvalEvent.usage.input_tokens)}</b>
                  </span>
                  <span>
                    캐시 <b>{compactNumber(approvalEvent.usage.cached_input_tokens)}</b>
                  </span>
                  <span>
                    출력 <b>{compactNumber(approvalEvent.usage.output_tokens)}</b>
                  </span>
                </div>
              )}

              <div className="approval-actions">
                <button
                  type="button"
                  className="approve"
                  onClick={() => void decide("approve")}
                >
                  이번 요청 승인
                </button>
                <button
                  type="button"
                  className="review"
                  onClick={() => void decide("reject")}
                >
                  거절하고 계속
                </button>
                <button
                  type="button"
                  className="reject"
                  onClick={() => void decide("cancel")}
                >
                  작업 취소
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">🐾</span>
          {toast}
        </div>
      )}
    </main>
  );
}
