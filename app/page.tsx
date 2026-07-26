"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AgentWorld3D, {
  type AgentWorldLocation,
  type SeatId,
  type SeatView,
} from "./agent-world-3d";
import {
  assignSeat,
  enqueueUniqueApproval,
  removeApproval,
  resolveRuntimeKey,
} from "./runtime-state.mjs";

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
type Usage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  total?: {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
  };
};
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
  files?: unknown[];
  permissions?: unknown;
  session?: CodexSession;
  usage?: Usage | null;
  pendingApprovals?: BridgeEvent[];
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
type SessionRuntime = {
  threadId: string;
  taskId?: string | null;
  seatId: SeatId | "queue";
  status: AgentStatus;
  location: AgentWorldLocation;
  department: Department;
  agentName: string;
  activeTask: ActiveTask | null;
  usage: ReturnType<typeof normalizeUsage>;
  pendingApprovalId: string | null;
  lastActivityAt: number;
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
  pendingApprovals?: BridgeEvent[];
};
type CompanionTransport = "local" | "cloud";
type RadioPage = "mission" | "sessions" | "status" | "activity";

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? "http://127.0.0.1:4317";
const COMPANION_TOKEN_KEY = "agent-forest-companion-token";
const COMPANION_TRANSPORT_KEY = "agent-forest-companion-transport";
const SELECTED_SESSION_KEY = "agent-forest-selected-session";
const SEAT_ASSIGNMENTS_KEY = "agent-forest-seat-assignments-v1";
const ACORN_KEY = "agent-forest-acorns-v1";
const DECOR_KEY = "agent-forest-decor-v1";
const DEMO_SEEN_KEY = "agent-forest-demo-seen-v1";
const EVENT_HISTORY_KEY = "agent-forest-event-history-v1";
const INSTALL_HANDOFF =
  "이 저장소의 AGENTS.md를 읽고 Agent Forest를 설치·실행한 뒤 연결 주소를 열어줘.";

const DEPARTMENTS: Record<
  Department,
  { label: string; agent: string; color: string }
> = {
  general: { label: "General", agent: "매니저 모모", color: "#f0c784" },
  coding: { label: "Coding", agent: "개발자 토토", color: "#9bc8db" },
  design: { label: "Design", agent: "디자이너 보리", color: "#e7a6a3" },
  music: { label: "Music", agent: "뮤지션 코코", color: "#b8c887" },
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
const DEMO_EXAMPLES = [
  {
    label: "버튼 색 바꾸기",
    prompt: "홈 화면의 주요 버튼 색을 바다색으로 바꿔줘.",
    result: "버튼 색상과 대비를 확인하고 바다색 테마로 정리했어요.",
    department: "design" as Department,
  },
  {
    label: "테스트 확인",
    prompt: "프로젝트 테스트를 실행하고 실패 원인을 짧게 알려줘.",
    result: "테스트를 확인했고 모두 통과했어요.",
    department: "coding" as Department,
  },
  {
    label: "변경 요약",
    prompt: "오늘 바뀐 파일을 읽고 한 문장으로 요약해줘.",
    result: "오늘 작업은 연결 안정성과 해변 사무실 경험을 개선했어요.",
    department: "general" as Department,
  },
];
const RADIO_MENU: Array<{ key: RadioPage; ariaLabel: string }> = [
  { key: "mission", ariaLabel: "작업 맡기기" },
  { key: "sessions", ariaLabel: "PC 연결" },
  { key: "status", ariaLabel: "진행 상태" },
  { key: "activity", ariaLabel: "활동 기록" },
];
const KEYCAP_CLICK_SOUNDS = [
  "/audio/keycap-click-1.mp3",
  "/audio/keycap-click-2.mp3",
  "/audio/keycap-click-3.mp3",
];

function normalizeUsage(usage?: Usage | null) {
  if (!usage) return null;
  const total = usage.total ?? {};
  return {
    input_tokens:
      usage.input_tokens ?? usage.inputTokens ?? total.inputTokens ?? 0,
    cached_input_tokens:
      usage.cached_input_tokens ??
      usage.cachedInputTokens ??
      total.cachedInputTokens ??
      0,
    output_tokens:
      usage.output_tokens ?? usage.outputTokens ?? total.outputTokens ?? 0,
  };
}

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
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function loadSeatAssignments() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SEAT_ASSIGNMENTS_KEY) ?? "{}",
    ) as Record<string, SeatId>;
    return parsed;
  } catch {
    return {};
  }
}

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
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
  const [runtimes, setRuntimes] = useState<Record<string, SessionRuntime>>({});
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState<BridgeEvent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [companionToken, setCompanionToken] = useState<string | null>(null);
  const [companionTransport, setCompanionTransport] =
    useState<CompanionTransport>("local");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [radioOpen, setRadioOpen] = useState(false);
  const [radioPage, setRadioPage] = useState<RadioPage>("mission");
  const [hudDormant, setHudDormant] = useState(false);
  const [completionSignal, setCompletionSignal] = useState(0);
  const [acorns, setAcorns] = useState(0);
  const [decorChoice, setDecorChoice] = useState("coral");
  const [selectedSeat, setSelectedSeat] = useState<SeatId | null>(null);
  const [pressedRadioKey, setPressedRadioKey] = useState<RadioPage | null>(
    null,
  );

  const relayEventCursor = useRef(0);
  const taskToThreadRef = useRef(new Map<string, string>());
  const runtimesRef = useRef(runtimes);
  const seatAssignmentsRef = useRef<Record<string, SeatId>>(
    loadSeatAssignments(),
  );
  const demoTimersRef = useRef<number[]>([]);
  const alreadyAlertedRef = useRef(new Set<string>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const demoStartedRef = useRef(false);
  const completedTaskIdsRef = useRef(new Set<string>());
  const keycapAudioPoolRef = useRef<HTMLAudioElement[]>([]);
  const keycapAudioIndexRef = useRef(0);
  const keycapPressTimerRef = useRef<number | null>(null);
  const keycapFeedbackPrimedRef = useRef(false);

  const approvalEvent = approvalQueue[0] ?? null;
  const latestEvents = useMemo(() => events.slice(0, 10), [events]);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedThreadId) ?? null,
    [selectedThreadId, sessions],
  );
  const runtimeList = useMemo(
    () =>
      Object.values(runtimes).sort((left, right) => {
        const leftIndex =
          left.seatId === "queue" ? 9 : Number(left.seatId.slice(-1));
        const rightIndex =
          right.seatId === "queue" ? 9 : Number(right.seatId.slice(-1));
        return leftIndex - rightIndex;
      }),
    [runtimes],
  );
  const focusedRuntime = useMemo(() => {
    if (selectedSeat) {
      const bySeat = runtimeList.find(
        (runtime) => runtime.seatId === selectedSeat,
      );
      if (bySeat) return bySeat;
    }
    return (
      runtimeList.find((runtime) => runtime.threadId === selectedThreadId) ??
      runtimeList.find((runtime) => runtime.pendingApprovalId) ??
      runtimeList[0] ??
      null
    );
  }, [runtimeList, selectedSeat, selectedThreadId]);
  const pressedRadioIndex = pressedRadioKey
    ? RADIO_MENU.findIndex((item) => item.key === pressedRadioKey) + 1
    : 0;

  useEffect(() => {
    runtimesRef.current = runtimes;
  }, [runtimes]);
  const seatViews = useMemo<SeatView[]>(() => {
    const active = runtimeList.slice(0, 5).map((runtime) => ({
      seatId: runtime.seatId,
      agentName: runtime.agentName,
      location: runtime.location,
      status: runtime.status,
      statusLabel: STATUS_COPY[runtime.status],
      blocked: Boolean(runtime.pendingApprovalId),
    }));
    return active.length
      ? active
      : [
          {
            seatId: "seat-1",
            agentName: "코치 모모",
            location: "general",
            status: "idle",
            statusLabel: STATUS_COPY.idle,
            blocked: false,
          },
        ];
  }, [runtimeList]);

  const apiFetch = useCallback(
    (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (companionToken) headers.set("Authorization", `Bearer ${companionToken}`);
      const base =
        companionTransport === "cloud" ? "/api/relay" : BRIDGE_URL;
      return fetch(`${base}${pathname}`, { ...init, headers });
    },
    [companionToken, companionTransport],
  );

  const resetHudTimer = useCallback(() => {
    setHudDormant(false);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => setHudDormant(true), 4_000);
  }, []);

  const playBlockedChime = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    [660, 495].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + index * 0.16 + 0.22,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.16);
      oscillator.stop(now + index * 0.16 + 0.24);
    });
  }, []);

  const raiseBlockedAlert = useCallback(
    (event: BridgeEvent, { quiet = false } = {}) => {
      if (!event.requestId || alreadyAlertedRef.current.has(event.requestId)) {
        return;
      }
      alreadyAlertedRef.current.add(event.requestId);
      if (
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      ) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(event.title ?? "Agent Forest 승인 대기", {
            body: event.detail ?? "PC의 Codex가 확인을 기다리고 있어요.",
            icon: "/favicon.svg",
            tag: event.requestId,
          });
        }
      }
      if (!quiet) {
        playBlockedChime();
        navigator.vibrate?.([140, 80, 140]);
      }
    },
    [playBlockedChime],
  );

  const consumeBridgeEvent = useCallback(
    (event: BridgeEvent) => {
      if (event.version !== undefined) setCodexVersion(event.version ?? null);
      if (event.available !== undefined) setCodexAvailable(event.available);
      resetHudTimer();

      if (event.type === "bridge.snapshot") {
        for (const pending of event.pendingApprovals ?? []) {
          setApprovalQueue((queue) => [
            ...enqueueUniqueApproval(queue, pending),
          ]);
          raiseBlockedAlert(pending, { quiet: true });
        }
        return;
      }

      if (event.taskId && event.threadId) {
        taskToThreadRef.current.set(event.taskId, event.threadId);
      }

      setRuntimes((current) => {
        let next = current;
        let runtimeKey = resolveRuntimeKey(event, taskToThreadRef.current);
        if (!runtimeKey) return current;

        if (event.threadId && event.taskId) {
          const pendingKey = `pending:${event.taskId}`;
          if (next[pendingKey] && !next[event.threadId]) {
            const pendingRuntime = next[pendingKey];
            next = { ...next };
            delete next[pendingKey];
            next[event.threadId] = {
              ...pendingRuntime,
              threadId: event.threadId,
            };
            if (pendingRuntime.seatId !== "queue") {
              seatAssignmentsRef.current[event.threadId] =
                pendingRuntime.seatId;
            }
            runtimeKey = event.threadId;
          }
        }

        const existing = next[runtimeKey];
        const taskDepartment =
          event.department ?? existing?.department ?? "general";
        const seatId =
          existing?.seatId ??
          assignSeat(next, runtimeKey, seatAssignmentsRef.current);
        const taskId = event.taskId ?? existing?.taskId ?? null;
        const activeTask: ActiveTask =
          existing?.activeTask ??
          {
            taskId: taskId ?? "unknown",
            threadId: event.threadId,
            prompt: event.prompt ?? event.detail ?? "",
            department: taskDepartment,
            mode: event.mode ?? "codex",
            title: event.title ?? "새 업무를 접수했어요",
            detail: event.detail ?? "",
            result: event.result ?? "",
          };

        let status = event.status ?? existing?.status ?? "idle";
        let location = event.location ?? existing?.location ?? "general";
        let pendingApprovalId = existing?.pendingApprovalId ?? null;
        if (event.type === "approval.required") {
          status = "waiting_approval";
          location = "office";
          pendingApprovalId = event.requestId ?? null;
        }
        if (event.type === "approval.decided") {
          pendingApprovalId =
            pendingApprovalId === event.requestId ? null : pendingApprovalId;
        }

        const runtime: SessionRuntime = {
          threadId: runtimeKey,
          taskId,
          seatId,
          status,
          location,
          department: taskDepartment,
          agentName:
            existing?.agentName ?? DEPARTMENTS[taskDepartment].agent,
          activeTask: {
            ...activeTask,
            taskId: taskId ?? activeTask.taskId,
            threadId: event.threadId ?? activeTask.threadId,
            department: taskDepartment,
            title: event.title ?? activeTask.title,
            detail: event.detail ?? activeTask.detail,
            result: event.result ?? activeTask.result,
          },
          usage:
            event.type === "session.usage"
              ? normalizeUsage(event.usage)
              : existing?.usage ?? normalizeUsage(event.usage),
          pendingApprovalId,
          lastActivityAt: Date.now(),
        };
        const updated = { ...next, [runtimeKey]: runtime };
        runtimesRef.current = updated;
        if (seatId !== "queue") {
          seatAssignmentsRef.current[runtimeKey] = seatId;
          window.localStorage.setItem(
            SEAT_ASSIGNMENTS_KEY,
            JSON.stringify(seatAssignmentsRef.current),
          );
        }
        return updated;
      });

      if (event.type === "approval.required") {
        setApprovalQueue((queue) => [
          ...enqueueUniqueApproval(queue, event),
        ]);
        raiseBlockedAlert(event);
      }
      if (event.type === "approval.decided") {
        setApprovalQueue((queue) => [
          ...removeApproval(queue, event.requestId),
        ]);
        if (event.requestId) alreadyAlertedRef.current.delete(event.requestId);
        setToast(event.title ?? "결정을 저장했어요.");
      }
      if (event.type === "task.completed") {
        setIsSubmitting(false);
        setCompletionSignal((value) => value + 1);
        if (event.taskId && !completedTaskIdsRef.current.has(event.taskId)) {
          completedTaskIdsRef.current.add(event.taskId);
          setAcorns((value) => {
            const next = value + 1;
            window.localStorage.setItem(ACORN_KEY, String(next));
            return next;
          });
        }
      }
      if (event.type === "task.failed") {
        setIsSubmitting(false);
        setToast(event.detail ?? "작업이 완료되지 않았어요.");
      }
      if (event.type === "session.updated" && event.session) {
        setSessions((current) => {
          const others = current.filter(
            (session) => session.id !== event.session?.id,
          );
          return [event.session as CodexSession, ...others].slice(0, 30);
        });
      }
      if (!["bridge.status"].includes(event.type)) {
        setEvents((current) => {
          const next = [event, ...current].slice(0, 40);
          window.localStorage.setItem(EVENT_HISTORY_KEY, JSON.stringify(next));
          return next;
        });
      }
    },
    [raiseBlockedAlert, resetHudTimer],
  );

  const runFreeDemo = useCallback(
    (example = DEMO_EXAMPLES[0]) => {
      demoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      demoTimersRef.current = [];
      const taskId = `demo_${Date.now()}`;
      const base = {
        taskId,
        department: example.department,
        mode: "simulation" as const,
        prompt: example.prompt,
      };
      const sequence: Array<[number, Partial<BridgeEvent>]> = [
        [
          0,
          {
            type: "task.queued",
            status: "queued",
            location: "general",
            title: "무료 시연 업무를 받았어요",
            detail: example.prompt,
          },
        ],
        [
          650,
          {
            type: "agent.status",
            status: "moving",
            location: example.department,
            title: "담당 책상으로 이동하고 있어요",
            detail: "화면 안의 고양이가 업무 자리로 움직입니다.",
          },
        ],
        [
          1_650,
          {
            type: "agent.status",
            status: "working",
            location: example.department,
            title: "코드를 살펴보고 있어요",
            detail: "실제 연결판에서는 이 단계에서 내 PC의 Codex가 작업합니다.",
          },
        ],
        [
          3_650,
          {
            type: "task.result",
            status: "reporting",
            location: "queue",
            title: "결과를 보고하러 가요",
            detail: "완료 내용을 한 줄로 정리했어요.",
            result: example.result,
          },
        ],
        [
          5_000,
          {
            type: "task.completed",
            status: "completed",
            location: "queue",
            title: "무료 시연을 마쳤어요",
            detail: "내 PC의 Codex를 연결하면 같은 흐름으로 실제 업무를 맡길 수 있어요.",
            result: example.result,
          },
        ],
      ];
      sequence.forEach(([delay, partial], index) => {
        const timer = window.setTimeout(() => {
          consumeBridgeEvent({
            id: `${taskId}_${index}`,
            occurredAt: new Date().toISOString(),
            ...base,
            ...partial,
          } as BridgeEvent);
        }, delay);
        demoTimersRef.current.push(timer);
      });
    },
    [consumeBridgeEvent],
  );

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setAcorns(Number(window.localStorage.getItem(ACORN_KEY) ?? 0) || 0);
      setDecorChoice(window.localStorage.getItem(DECOR_KEY) ?? "coral");
      try {
        const savedEvents = JSON.parse(
          window.localStorage.getItem(EVENT_HISTORY_KEY) ?? "[]",
        ) as BridgeEvent[];
        setEvents(savedEvents.slice(0, 40));
      } catch {
        window.localStorage.removeItem(EVENT_HISTORY_KEY);
      }
      const savedToken = window.localStorage.getItem(COMPANION_TOKEN_KEY);
      const savedTransport = window.localStorage.getItem(
        COMPANION_TRANSPORT_KEY,
      );
      const savedSession = window.localStorage.getItem(SELECTED_SESSION_KEY);
      if (savedToken) setCompanionToken(savedToken);
      if (savedTransport === "cloud") setCompanionTransport("cloud");
      if (savedSession) setSelectedThreadId(savedSession);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    queueMicrotask(resetHudTimer);
    const unlockAudio = () => {
      if (!audioContextRef.current && "AudioContext" in window) {
        audioContextRef.current = new AudioContext();
      }
      void audioContextRef.current?.resume();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((name) => {
      window.addEventListener(name, resetHudTimer, { passive: true });
    });
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      events.forEach((name) => window.removeEventListener(name, resetHudTimer));
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, [resetHudTimer]);

  useEffect(() => {
    if (demoStartedRef.current || companionToken) return;
    demoStartedRef.current = true;
    const alreadySeen = window.sessionStorage.getItem(DEMO_SEEN_KEY);
    if (alreadySeen) return;
    window.sessionStorage.setItem(DEMO_SEEN_KEY, "1");
    const timer = window.setTimeout(() => runFreeDemo(), 1_600);
    return () => window.clearTimeout(timer);
  }, [companionToken, runFreeDemo]);

  useEffect(() => {
    keycapAudioPoolRef.current = KEYCAP_CLICK_SOUNDS.map((source) => {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = 0.58;
      audio.load();
      return audio;
    });
    return () => {
      demoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (keycapPressTimerRef.current) {
        window.clearTimeout(keycapPressTimerRef.current);
      }
      keycapAudioPoolRef.current.forEach((audio) => {
        audio.pause();
        audio.removeAttribute("src");
      });
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const authorization: Record<string, string> = {};
    if (companionToken) authorization.Authorization = `Bearer ${companionToken}`;
    const base =
      companionTransport === "cloud" ? "/api/relay" : BRIDGE_URL;
    fetch(`${base}/health`, { headers: authorization })
      .then((response) => response.json() as Promise<BridgeHealth>)
      .then((health) => {
        if (disposed) return;
        setCodexAvailable(Boolean(health.available));
        setCodexVersion(health.version ?? null);
        setBridgeState(health.paired ? "connected" : "disconnected");
        if (health.pendingApprovals?.length) {
          consumeBridgeEvent({
            id: `health_snapshot_${Date.now()}`,
            type: "bridge.snapshot",
            occurredAt: new Date().toISOString(),
            pendingApprovals: health.pendingApprovals,
          });
        }
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
  }, [companionToken, companionTransport, consumeBridgeEvent]);

  useEffect(() => {
    if (!companionToken) return;
    let disposed = false;
    if (companionTransport === "local") {
      const source = new EventSource(
        `${BRIDGE_URL}/events?token=${encodeURIComponent(companionToken)}`,
      );
      source.onopen = () => !disposed && setBridgeState("connected");
      source.onerror = () => !disposed && setBridgeState("disconnected");
      source.onmessage = (message) => {
        if (disposed) return;
        try {
          consumeBridgeEvent(JSON.parse(message.data) as BridgeEvent);
        } catch {
          // Keep the stream alive after a malformed optional event.
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
        const body = (await response.json()) as {
          error?: string;
          events?: Array<{ cursor?: number; event: BridgeEvent }>;
        };
        if (!response.ok) throw new Error(body.error);
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

  useEffect(() => {
    if (!approvalQueue.length) return;
    const originalTitle = document.title;
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const originalIcon = icon?.href;
    let active = false;
    const update = () => {
      active = !active;
      document.title = active
        ? `승인 대기 ${approvalQueue.length}건 · Agent Forest`
        : originalTitle;
      if (icon) {
        icon.href = active
          ? `data:image/svg+xml,${encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect rx="16" width="64" height="64" fill="#f5e7c6"/><path d="M18 38c3-11 25-11 28 0 2 8-5 13-14 13S16 46 18 38Z" fill="#665043"/><circle cx="49" cy="15" r="11" fill="#d45f55"/></svg>',
            )}`
          : originalIcon ?? "/favicon.svg";
      }
    };
    update();
    const timer = window.setInterval(update, 800);
    return () => {
      window.clearInterval(timer);
      document.title = originalTitle;
      if (icon && originalIcon) icon.href = originalIcon;
    };
  }, [approvalQueue.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4_200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshSessions = useCallback(async () => {
    if (!companionToken) return;
    setSessionsLoading(true);
    try {
      const response = await apiFetch("/v2/sessions?limit=20");
      const body = (await response.json()) as {
        error?: string;
        data?: CodexSession[];
      };
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
      setToast(error instanceof Error ? error.message : "세션을 불러오지 못했어요.");
    } finally {
      setSessionsLoading(false);
    }
  }, [apiFetch, companionToken]);

  useEffect(() => {
    if (companionToken) queueMicrotask(() => void refreshSessions());
  }, [companionToken, refreshSessions]);

  async function pairWithCode(code: string) {
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
    const companion = body.companion as
      | { pendingApprovals?: BridgeEvent[] }
      | undefined;
    if (companion?.pendingApprovals?.length) {
      consumeBridgeEvent({
        id: `pair_snapshot_${Date.now()}`,
        type: "bridge.snapshot",
        occurredAt: new Date().toISOString(),
        pendingApprovals: companion.pendingApprovals,
      });
    }
    setPairingCode("");
    setToast(
      transport === "cloud"
        ? "외부 네트워크에서 내 PC의 Codex와 연결됐어요."
        : "내 PC의 Codex Companion과 연결됐어요.",
    );
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("pair");
    if (!code || !/^\d{6}$/.test(code) || companionToken || pairingBusy) return;
    const timer = window.setTimeout(() => {
      setPairingBusy(true);
      void pairWithCode(code)
        .then(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("pair");
          window.history.replaceState({}, "", url);
        })
        .catch((error) =>
          setToast(
            error instanceof Error ? error.message : "자동 연결에 실패했어요.",
          ),
        )
        .finally(() => setPairingBusy(false));
    }, 0);
    return () => window.clearTimeout(timer);
    // pairWithCode intentionally reads current deployment routing once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionToken, pairingBusy]);

  async function pairCompanion(event: FormEvent) {
    event.preventDefault();
    if (pairingBusy || pairingCode.trim().length !== 6) return;
    setPairingBusy(true);
    try {
      await pairWithCode(pairingCode.trim());
    } catch (error) {
      setToast(error instanceof Error ? error.message : "PC Companion에 연결하지 못했어요.");
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
  }

  async function selectSession(threadId: string) {
    setSelectedThreadId(threadId);
    window.localStorage.setItem(SELECTED_SESSION_KEY, threadId);
    try {
      const response = await apiFetch(
        `/v2/sessions/${encodeURIComponent(threadId)}/resume`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: string;
        session?: { title?: string };
      };
      if (!response.ok) throw new Error(body.error ?? "세션을 열지 못했어요.");
      setToast(`“${body.session?.title ?? "Codex 세션"}”을 연결했어요.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "세션을 열지 못했어요.");
    }
  }

  async function createNewSession() {
    setSessionsLoading(true);
    try {
      const response = await apiFetch("/v2/sessions", { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        session: CodexSession;
      };
      if (!response.ok) throw new Error(body.error ?? "새 세션을 만들지 못했어요.");
      const session = body.session as CodexSession;
      setSessions((current) => [session, ...current]);
      setSelectedThreadId(session.id);
      window.localStorage.setItem(SELECTED_SESSION_KEY, session.id);
      setToast("이 프로젝트의 새 Codex 세션을 만들었어요.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "새 세션을 만들지 못했어요.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function startTask(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !selectedThreadId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/v2/sessions/${encodeURIComponent(selectedThreadId)}/turns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            department,
            threadId: selectedThreadId,
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "작업을 시작하지 못했어요.");
      setRadioOpen(false);
    } catch (error) {
      setIsSubmitting(false);
      setToast(error instanceof Error ? error.message : "브리지에 연결하지 못했어요.");
    }
  }

  async function interruptTask() {
    if (!selectedThreadId) return;
    try {
      const response = await apiFetch(
        `/v2/sessions/${encodeURIComponent(selectedThreadId)}/interrupt`,
        { method: "POST" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "작업을 중단하지 못했어요.");
      setIsSubmitting(false);
      setToast("현재 Codex 작업을 중단했어요.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "작업을 중단하지 못했어요.");
    }
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
      if (
        decision === "approve" &&
        "Notification" in window &&
        Notification.permission === "default" &&
        !isIosBrowser()
      ) {
        void Notification.requestPermission();
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "결정을 저장하지 못했어요.");
    }
  }

  async function copyInstallHandoff() {
    try {
      await navigator.clipboard.writeText(INSTALL_HANDOFF);
      setToast("내 AI에게 붙여넣을 설치 문장을 복사했어요.");
    } catch {
      setToast(INSTALL_HANDOFF);
    }
  }

  function chooseDecor(value: string) {
    setDecorChoice(value);
    window.localStorage.setItem(DECOR_KEY, value);
  }

  function pressRadioMenuKey(page: RadioPage) {
    keycapFeedbackPrimedRef.current = true;
    const audioPool = keycapAudioPoolRef.current;
    const sound = audioPool[keycapAudioIndexRef.current % audioPool.length];
    keycapAudioIndexRef.current += 1;
    if (sound) {
      sound.currentTime = 0;
      void sound.play().catch(() => undefined);
    }

    if (keycapPressTimerRef.current) {
      window.clearTimeout(keycapPressTimerRef.current);
    }
    setPressedRadioKey(page);
    keycapPressTimerRef.current = window.setTimeout(() => {
      setPressedRadioKey(null);
      keycapFeedbackPrimedRef.current = false;
      keycapPressTimerRef.current = null;
    }, 180);
  }

  function activateRadioMenu(page: RadioPage) {
    if (!keycapFeedbackPrimedRef.current) {
      pressRadioMenuKey(page);
    }
    keycapFeedbackPrimedRef.current = false;
    setRadioPage(page);
    setRadioOpen(true);
    resetHudTimer();
  }

  return (
    <main
      className={`app-shell decor-${decorChoice} ${
        hudDormant ? "hud-dormant" : ""
      }`}
    >
      <header className={`app-header hud-fade ${hudDormant ? "is-dormant" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p>OPENCLAW PERSONAL OFFICE</p>
            <h1>Agent Forest</h1>
          </div>
        </div>
        <button
          type="button"
          className="radio-launch"
          onClick={() => setRadioOpen(true)}
          aria-label="캠핑 라디오 열기"
        >
          <span className={`radio-lamp ${bridgeState}`} />
          <b>RADIO</b>
          <small>{approvalQueue.length ? `${approvalQueue.length} WAIT` : "F1–F4"}</small>
        </button>
      </header>

      <section className="world-card" aria-label="AI 에이전트 숲">
        <div className={`world-toolbar hud-fade ${hudDormant ? "is-dormant" : ""}`}>
          <div>
            <span className="live-pill">
              <i />
              LIVE OFFICE
            </span>
            <h2>고양이 에이전트가 일하는 해변 사무실</h2>
          </div>
          <div className="world-summary">
            <span>{focusedRuntime ? STATUS_COPY[focusedRuntime.status] : "대기 중"}</span>
            <strong>{focusedRuntime?.agentName ?? "코치 모모"}</strong>
          </div>
        </div>

        <div
          className={`world-stage world-stage-3d ${
            completionSignal ? "has-spectacle" : ""
          }`}
        >
          <AgentWorld3D
            seats={seatViews}
            companionConnected={
              bridgeState === "connected"
                ? "connected"
                : companionToken
                  ? "pairing"
                  : "offline"
            }
            completionSignal={completionSignal}
            onSeatClick={(seatId) => {
              setSelectedSeat(seatId);
              setRadioPage("status");
              setRadioOpen(true);
            }}
            onRadioClick={() => setRadioOpen(true)}
          />

          <nav
            className={`keycap-menu keycap-menu-pressed-${pressedRadioIndex}`}
            aria-label="하단 메뉴"
          >
            <div className="keycap-menu-art" aria-hidden="true">
              <span className="keycap-menu-layer keycap-menu-layer-normal" />
              {RADIO_MENU.map(({ key }, index) => (
                <span
                  key={`pressed-${key}`}
                  className={`keycap-menu-layer keycap-menu-layer-pressed-${index + 1}`}
                />
              ))}
            </div>
            {RADIO_MENU.map(({ key, ariaLabel }, index) => (
              <button
                type="button"
                key={key}
                aria-label={ariaLabel}
                aria-current={radioPage === key ? "page" : undefined}
                className={[
                  "keycap-menu-button",
                  `keycap-menu-button-${index + 1}`,
                  radioPage === key ? "selected" : "",
                  pressedRadioKey === key ? "is-pressed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={() => pressRadioMenuKey(key)}
                onKeyDown={(event) => {
                  if (
                    !event.repeat &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    pressRadioMenuKey(key);
                  }
                }}
                onClick={() => activateRadioMenu(key)}
              />
            ))}
          </nav>

          <div
            className={`demo-shells hud-fade ${hudDormant ? "is-dormant" : ""}`}
            aria-label="무료 시연 예시"
          >
            {DEMO_EXAMPLES.map((example) => (
              <button
                type="button"
                key={example.label}
                onClick={() => runFreeDemo(example)}
              >
                <span aria-hidden="true" />
                {example.label}
              </button>
            ))}
          </div>

          <div className={`world-caption hud-fade ${hudDormant ? "is-dormant" : ""}`}>
            <span>2.5D WebGL · AUTONOMOUS CAT MOTION ACTIVE</span>
            <b>고양이 자율 행동 · 책상 객체 충돌 회피 · 최대 4개 세션</b>
          </div>

          {focusedRuntime?.status === "completed" &&
            focusedRuntime.activeTask?.result && (
              <button
                type="button"
                className="result-printer"
                onClick={() => {
                  setRadioPage("status");
                  setRadioOpen(true);
                }}
              >
                <span>REPORT</span>
                {focusedRuntime.activeTask.result}
              </button>
            )}
        </div>
      </section>

      {radioOpen && (
        <aside className="control-panel radio-panel" aria-label="캠핑 라디오">
          <div className="radio-hardware">
            <span className={`radio-lamp ${bridgeState}`} />
            <strong>AGENT FOREST RADIO</strong>
            <span>{acorns} ACORNS</span>
            <button
              type="button"
              onClick={() => setRadioOpen(false)}
              aria-label="라디오 닫기"
            >
              닫기
            </button>
          </div>
          <div className="radio-screen">
            {radioPage === "mission" && (
              <section className="panel-section task-composer">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">NEW MISSION</span>
                    <h2>고양이 에이전트에게 업무 맡기기</h2>
                  </div>
                </div>
                <div className="selected-session-line">
                  <span className={selectedSession ? "ready" : ""} />
                  {selectedSession
                    ? `${selectedSession.title} · ${selectedSession.projectName}`
                    : "F2에서 연결할 Codex 세션을 선택해 주세요"}
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
                      <span style={{ background: item.color }} />
                      {item.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={startTask}>
                  <label htmlFor="mission">작업 내용</label>
                  <textarea
                    id="mission"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    maxLength={2_000}
                    rows={4}
                    placeholder="Codex에게 맡길 작업을 입력하세요"
                  />
                  <div className="composer-meta">
                    <span>현재 PC 세션의 보안 설정 사용</span>
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
                      isSubmitting ||
                      !prompt.trim()
                    }
                  >
                    {isSubmitting ? "작업 진행 중" : "선택한 Codex 세션에서 실행"}
                  </button>
                  <button
                    className="simulate-button"
                    type="button"
                    onClick={() => {
                      setRadioOpen(false);
                      runFreeDemo();
                    }}
                  >
                    비용 없는 화면 시연
                  </button>
                </form>
              </section>
            )}

            {radioPage === "sessions" && (
              <section className="panel-section session-browser">
                <div className="section-heading compact">
                  <div>
                    <span className="section-kicker">CODEX SESSIONS</span>
                    <h2>내 PC 세션 연결</h2>
                  </div>
                  <span className={`connection-dot ${bridgeState}`} />
                </div>
                {!companionToken ? (
                  <>
                    <div className="install-letter">
                      <strong>내 AI에게 이 한 줄만 전하세요</strong>
                      <p>{INSTALL_HANDOFF}</p>
                      <button type="button" onClick={() => void copyInstallHandoff()}>
                        설치 문장 복사
                      </button>
                    </div>
                    <form className="pairing-form" onSubmit={pairCompanion}>
                      <label htmlFor="pairing-code">최초 1회 연결 코드</label>
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
                    </form>
                  </>
                ) : (
                  <>
                    <div className="session-actions">
                      <button
                        type="button"
                        onClick={() => void refreshSessions()}
                        disabled={sessionsLoading}
                      >
                        {sessionsLoading ? "불러오는 중…" : "새로고침"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void createNewSession()}
                        disabled={sessionsLoading}
                      >
                        새 세션
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
                            className={selectedThreadId === session.id ? "selected" : ""}
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
            )}

            {radioPage === "status" && (
              <section className="panel-section active-task-card">
                <div className="section-heading compact">
                  <div>
                    <span className="section-kicker">CURRENT TASK</span>
                    <h2>진행 상황</h2>
                    <small>
                      {codexAvailable
                        ? `Codex ${codexVersion ?? "연결됨"}`
                        : "무료 화면 시연"}
                    </small>
                  </div>
                  <span
                    className={`status-chip status-${
                      focusedRuntime?.status ?? "idle"
                    }`}
                  >
                    {STATUS_COPY[focusedRuntime?.status ?? "idle"]}
                  </span>
                </div>
                {focusedRuntime?.activeTask ? (
                  <>
                    <div className="task-agent">
                      <span
                        style={{
                          background:
                            DEPARTMENTS[focusedRuntime.department].color,
                        }}
                      />
                      <div>
                        <strong>{focusedRuntime.agentName}</strong>
                        <small>
                          {focusedRuntime.activeTask.mode === "codex"
                            ? "실제 Codex"
                            : "화면 시연"}{" "}
                          · {DEPARTMENTS[focusedRuntime.department].label}
                        </small>
                      </div>
                    </div>
                    <h3>{focusedRuntime.activeTask.title}</h3>
                    <p>{focusedRuntime.activeTask.detail}</p>
                    {focusedRuntime.activeTask.result && (
                      <div className="result-preview">
                        {focusedRuntime.activeTask.result}
                      </div>
                    )}
                    {focusedRuntime.usage && (
                      <div className="token-row live-usage">
                        <span>
                          입력{" "}
                          <b>{compactNumber(focusedRuntime.usage.input_tokens)}</b>
                        </span>
                        <span>
                          캐시{" "}
                          <b>
                            {compactNumber(
                              focusedRuntime.usage.cached_input_tokens,
                            )}
                          </b>
                        </span>
                        <span>
                          출력{" "}
                          <b>{compactNumber(focusedRuntime.usage.output_tokens)}</b>
                        </span>
                      </div>
                    )}
                    {isSubmitting &&
                      focusedRuntime.activeTask.mode === "codex" && (
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
                    <strong>모두 쉬고 있어요</strong>
                    <p>업무를 입력하거나 화면 시연을 시작해 보세요.</p>
                  </div>
                )}
                <div className="free-decor">
                  <div>
                    <strong>무료 해변 꾸미기</strong>
                    <small>작업 완료로 모은 도토리 {acorns}개</small>
                  </div>
                  <div>
                    {[
                      ["coral", "산호"],
                      ["mint", "민트"],
                      ["sunset", "노을"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={decorChoice === value ? "selected" : ""}
                        onClick={() => chooseDecor(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {radioPage === "activity" && (
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
                {events.length > 0 && (
                  <button
                    type="button"
                    className="clear-history"
                    onClick={() => {
                      setEvents([]);
                      window.localStorage.removeItem(EVENT_HISTORY_KEY);
                    }}
                  >
                    이 브라우저의 기록 지우기
                  </button>
                )}
                <div className="legal-links">
                  <a href="/legal#terms">이용약관</a>
                  <a href="/legal#privacy">개인정보처리방침</a>
                  <a href="/legal#license">라이선스</a>
                </div>
              </section>
            )}
          </div>
        </aside>
      )}

      {approvalEvent && (
        <div className="approval-backdrop" role="presentation">
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <div className="manager-cat" aria-hidden="true">
              <span />
              <i>REPORT</i>
            </div>
            <div className="approval-copy">
              <span className="section-kicker">MANAGER REPORT</span>
              <span className="approval-count">
                대기 {approvalQueue.length}건 · 먼저 온 요청부터 표시
              </span>
              <h2 id="approval-title">{approvalEvent.title}</h2>
              <p>{approvalEvent.detail}</p>
              {approvalEvent.command && (
                <pre className="approval-command">
                  <code>{approvalEvent.command}</code>
                </pre>
              )}
              {approvalEvent.files && approvalEvent.files.length > 0 && (
                <div className="approval-detail">
                  변경 파일 {approvalEvent.files.length}개
                </div>
              )}
              {Boolean(approvalEvent.permissions) && (
                <div className="approval-detail">
                  추가 권한 요청 내용이 포함되어 있습니다.
                </div>
              )}
              {approvalEvent.usage && (
                <div className="token-row">
                  <span>
                    입력{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(approvalEvent.usage)?.input_tokens,
                      )}
                    </b>
                  </span>
                  <span>
                    캐시{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(approvalEvent.usage)?.cached_input_tokens,
                      )}
                    </b>
                  </span>
                  <span>
                    출력{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(approvalEvent.usage)?.output_tokens,
                      )}
                    </b>
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
          <span aria-hidden="true" />
          {toast}
        </div>
      )}

      <div className="accessibility-label">
        드래그로 회전 · 휠 또는 두 손가락으로 확대 · 라디오와 고양이 선택 가능
      </div>
    </main>
  );
}
