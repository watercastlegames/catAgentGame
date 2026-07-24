"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
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
  decision?: "approve" | "review" | "reject";
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  } | null;
};

type ActiveTask = {
  taskId: string;
  prompt: string;
  department: Department;
  mode: "codex" | "simulation";
  title: string;
  detail: string;
  result: string;
};

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? "http://127.0.0.1:4317";

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
  const [reviewMode, setReviewMode] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const agent = DEPARTMENTS[activeDepartment];

  const latestEvents = useMemo(() => events.slice(0, 8), [events]);

  useEffect(() => {
    let disposed = false;
    const source = new EventSource(`${BRIDGE_URL}/events`);

    source.onopen = () => {
      if (!disposed) setBridgeState("connected");
    };
    source.onerror = () => {
      if (!disposed) setBridgeState("disconnected");
    };
    source.onmessage = (message) => {
      if (disposed) return;
      try {
        const event = JSON.parse(message.data) as BridgeEvent;
        if (event.version !== undefined) setCodexVersion(event.version ?? null);
        if (event.available !== undefined) setCodexAvailable(event.available);

        if (event.type === "task.queued") {
          const taskDepartment = event.department ?? "general";
          setActiveDepartment(taskDepartment);
          setActiveTask({
            taskId: event.taskId ?? "unknown",
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
          ["agent.status", "task.result", "task.failed"].includes(event.type)
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
          setIsSubmitting(false);
        }

        if (event.type === "task.failed") {
          setIsSubmitting(false);
          setToast(event.detail ?? "작업이 완료되지 않았어요.");
        }

        if (event.type === "approval.decided") {
          setAgentStatus(event.status ?? "idle");
          setAgentLocation(event.location ?? "general");
          setApprovalEvent(null);
          setReviewMode(false);
          setFeedback("");
          setToast(event.title ?? "결정을 저장했어요.");
        }

        if (!["bridge.snapshot", "bridge.status"].includes(event.type)) {
          setEvents((current) => [event, ...current].slice(0, 30));
        }
      } catch {
        // Ignore malformed bridge messages and keep the event stream alive.
      }
    };

    fetch(`${BRIDGE_URL}/health`)
      .then((response) => response.json())
      .then((health) => {
        if (disposed) return;
        setCodexAvailable(Boolean(health.available));
        setCodexVersion(health.version ?? null);
        setBridgeState("connected");
      })
      .catch(() => {
        if (!disposed) setBridgeState("disconnected");
      });

    return () => {
      disposed = true;
      source.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function startTask(mode: "codex" | "simulation") {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setApprovalEvent(null);
    setEvents([]);
    try {
      const response = await fetch(`${BRIDGE_URL}/${mode === "codex" ? "run" : "simulate"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), department }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "작업을 시작하지 못했어요.");
      if (mode === "simulation") {
        setTimeout(() => setIsSubmitting(false), 5100);
      }
    } catch (error) {
      setIsSubmitting(false);
      setToast(
        error instanceof Error ? error.message : "브리지에 연결하지 못했어요.",
      );
    }
  }

  function submitTask(event: FormEvent) {
    event.preventDefault();
    void startTask("codex");
  }

  async function decide(decision: "approve" | "review" | "reject") {
    if (decision === "review" && !reviewMode) {
      setReviewMode(true);
      return;
    }
    try {
      const response = await fetch(`${BRIDGE_URL}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: approvalEvent?.taskId,
          decision,
          feedback: decision === "review" ? feedback : "",
        }),
      });
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
              {bridgeState === "connected"
                ? codexAvailable
                  ? "Codex 연결됨"
                  : "브리지만 연결됨"
                : bridgeState === "connecting"
                  ? "연결 확인 중"
                  : "로컬 브리지 꺼짐"}
            </strong>
            <small>{codexVersion ?? "Codex 버전 확인 대기"}</small>
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
          <section className="panel-section task-composer">
            <div className="section-heading">
              <div>
                <span className="section-kicker">NEW MISSION</span>
                <h2>고양이 에이전트에게 업무 맡기기</h2>
              </div>
              <span className="step-badge">01</span>
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
                  isSubmitting ||
                  !prompt.trim()
                }
              >
                <span aria-hidden="true">{isSubmitting ? "🐾" : "✦"}</span>
                {isSubmitting ? "고양이가 일하는 중…" : "Codex로 실제 실행"}
              </button>
              <button
                className="simulate-button"
                type="button"
                disabled={isSubmitting || bridgeState !== "connected"}
                onClick={() => void startTask("simulation")}
              >
                비용 없는 화면 시연
              </button>
            </form>
            <p className="usage-note">
              실제 실행은 현재 로그인된 Codex 계정과 설정을 사용하며 사용량이 발생할 수 있습니다.
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
        <span>Local integration prototype</span>
        <strong>Codex JSONL → Agent Bridge → Forest UI</strong>
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

              {reviewMode && (
                <label className="feedback-field">
                  재검토 의견
                  <textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="어떤 부분을 다시 확인할까요?"
                    rows={3}
                    autoFocus
                  />
                </label>
              )}

              <div className="approval-actions">
                <button
                  type="button"
                  className="approve"
                  onClick={() => void decide("approve")}
                >
                  확인
                </button>
                <button
                  type="button"
                  className="review"
                  onClick={() => void decide("review")}
                >
                  {reviewMode ? "의견 보내기" : "재검토"}
                </button>
                <button
                  type="button"
                  className="reject"
                  onClick={() => void decide("reject")}
                >
                  반려
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
