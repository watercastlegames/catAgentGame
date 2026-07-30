/* eslint-disable @next/next/no-img-element */
"use client";

import {
  type CSSProperties,
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
import { type CatCue, type WorldAudio, createWorldAudio } from "./world-audio";
import { CAT_STYLES, catStylePreviewUrl } from "./cat-styles";
import type { CatShape } from "./cat-body";
import {
  NEEDS_KEY,
  type CatCareOutcome,
  type CatNeedsStore,
  applyCatCareOutcome,
  computeCatNeedState,
  createDefaultCatNeedState,
  ensureCatNeedState,
  getHappinessBand,
  getNeedTone,
  parseCatNeedsStore,
  updateCatNeedState,
} from "./cat-needs";
import {
  LITTER_BOX_STORAGE_KEY,
  addLitterWaste,
  cleanLitterBox as resetLitterBoxState,
  isLitterBoxFull,
  parseLitterLevel,
} from "./litter-box-state.mjs";
import {
  CAT_STYLE_OWNERSHIP_KEY,
  CAT_STYLE_PRICES,
  parseOwnedCatStyles,
  purchaseCatStyle,
} from "./cat-style-economy";
import {
  ACTIVE_SEAT_KEY,
  MAX_SEAT_COUNT,
  WORKSTATION_SLOTS,
  activeSeatIds,
  nextWorkstationSlot,
  parseActiveSeatCount,
} from "./seat-progression";
import { preloadPopupAssets } from "./popup-assets.mjs";
import {
  type PlayerCloudSync,
  createPlayerCloudSync,
} from "./storage";

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
type RadioPage = "cats" | "desk" | "work" | "status-log";
type CatPage = "list" | "detail";
type WorkTab = "connect" | "task";
type StatusLogTab = "status" | "log";
type ConfirmDialog =
  | { kind: "disconnect" }
  | {
      kind: "seat-unlock";
      seatId: SeatId;
    }
  | null;

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? "http://127.0.0.1:4317";
const COMPANION_TOKEN_KEY = "agent-forest-companion-token";
const COMPANION_TRANSPORT_KEY = "agent-forest-companion-transport";
const SELECTED_SESSION_KEY = "agent-forest-selected-session";
const SEAT_ASSIGNMENTS_KEY = "agent-forest-seat-assignments-v1";
const LEGACY_ACORN_KEY = "agent-forest-acorns-v1";
const SHELL_KEY = "agent-forest-shell-v1";
const FOOD_BOWL_KEY = "agent-forest-food-bowl-v1";
const DECOR_KEY = "agent-forest-decor-v1";
const DEMO_SEEN_KEY = "agent-forest-demo-seen-v1";
const EVENT_HISTORY_KEY = "agent-forest-event-history-v1";
const ONBOARDING_KEY = "agent-forest-onboarding-v1";
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
  { key: "cats", ariaLabel: "고양이 관리" },
  { key: "desk", ariaLabel: "자리 꾸미기" },
  { key: "work", ariaLabel: "PC 연결과 업무 지시" },
  { key: "status-log", ariaLabel: "진행 상태와 활동 기록" },
];
const RADIO_TITLES: Record<RadioPage, string> = {
  cats: "고양이 돌보기",
  desk: "자리 꾸미기",
  work: "PC 연결 · 업무",
  "status-log": "진행 상황 · 기록",
};
const SHOW_LEGACY_OVERLAYS = false;
const AUDIO_ENABLED_KEY = "agent-forest-audio-v1";
const CAT_LOOK_KEY = "agent-forest-cat-look-v1";
const DEMO_CAT_ID = "agent-forest-demo-cat";
// 체형은 프리셋으로만 고른다. 숫자 세 개를 그대로 노출하면 사장님이 만질 물건이 아니게 된다.
const CAT_SHAPE_PRESETS: Array<{
  id: string;
  label: string;
  note: string;
  shape: CatShape;
}> = [
  { id: "slim", label: "원래대로", note: "팩 기본 체형", shape: { belly: 1, sag: 0, legs: 1 } },
  {
    id: "slight",
    label: "살짝",
    note: "말 안 하면 모를 정도",
    shape: { belly: 1.25, sag: 0.4, legs: 0.95 },
  },
  {
    id: "normal",
    label: "통통",
    note: "통통한 집고양이",
    shape: { belly: 1.45, sag: 0.6, legs: 0.9 },
  },
  {
    id: "chonk",
    label: "뚱냥이",
    note: "배가 처지고 다리가 짧다",
    shape: { belly: 1.7, sag: 1, legs: 0.7 },
  },
];
// 상태가 바뀌는 순간에만 고양이가 운다. 없는 상태는 조용히 넘어간다.
//  업무 접수·분석 → 짧은 인사, 보고·완료 → 기본 야옹, 승인 대기 → 조르는 울음.
const CAT_CUE_BY_STATUS: Partial<Record<AgentStatus, CatCue>> = {
  queued: "greet",
  briefing: "greet",
  reporting: "report",
  completed: "report",
  waiting_approval: "demand",
};

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
  const [popupAssetsReady, setPopupAssetsReady] = useState(false);
  const [radioPage, setRadioPage] = useState<RadioPage>("cats");
  const [catPage, setCatPage] = useState<CatPage>("list");
  const [workTab, setWorkTab] = useState<WorkTab>("connect");
  const [statusLogTab, setStatusLogTab] = useState<StatusLogTab>("status");
  const [hudDormant, setHudDormant] = useState(false);
  const [completionSignal, setCompletionSignal] = useState(0);
  const [shells, setShells] = useState(0);
  const [activeSeatCount, setActiveSeatCount] = useState(1);
  const [shellCollectTokens, setShellCollectTokens] = useState<
    Array<{ id: number; x: number; y: number; amount: number }>
  >([]);
  const [shellHudPulse, setShellHudPulse] = useState(0);
  const [decorChoice, setDecorChoice] = useState("coral");
  const [selectedSeat, setSelectedSeat] = useState<SeatId | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [uiPreview, setUiPreview] = useState<string | null>(null);
  const [pressedRadioKey, setPressedRadioKey] = useState<RadioPage | null>(
    null,
  );
  const [audioEnabled, setAudioEnabled] = useState(true);
  // 고양이 외형 — 지금은 섬 전체가 한 마리라 전역 하나. 좌석별로 나눌 때 이 값이 기본값이 된다.
  const [catStyle, setCatStyle] = useState("Blue");
  const [ownedCatStyles, setOwnedCatStyles] = useState<Set<string>>(
    () => new Set(["Blue"]),
  );
  const [pendingCatStyle, setPendingCatStyle] = useState<string | null>(null);
  const catShapeId = "slim";
  const [catNeeds, setCatNeeds] = useState<CatNeedsStore>({});
  const [foodAvailable, setFoodAvailable] = useState(true);
  const [litterLevel, setLitterLevel] = useState(0);

  const relayEventCursor = useRef(0);
  const taskToThreadRef = useRef(new Map<string, string>());
  const runtimesRef = useRef(runtimes);
  const seatAssignmentsRef = useRef<Record<string, SeatId>>(
    loadSeatAssignments(),
  );
  const demoTimersRef = useRef<number[]>([]);
  const alreadyAlertedRef = useRef(new Set<string>());
  const worldAudioRef = useRef<WorldAudio | null>(null);
  const audioPreferenceHydratedRef = useRef(false);
  const catCueStatusRef = useRef(new Map<string, AgentStatus>());
  const catCuePrimedRef = useRef(false);
  const hudTimerRef = useRef<number | null>(null);
  const demoStartedRef = useRef(false);
  const completedTaskIdsRef = useRef(new Set<string>());
  const keycapPressTimerRef = useRef<number | null>(null);
  const keycapFeedbackPrimedRef = useRef(false);
  const radioAudioPrimedRef = useRef(false);
  const previousRadioOpenRef = useRef(false);
  const modalAudioPrimedRef = useRef(false);
  const previousModalOpenRef = useRef(false);
  const catNeedsRef = useRef<CatNeedsStore>({});
  const litterLevelRef = useRef(0);
  const purchaseLockedRef = useRef(false);
  const activeSeatCountRef = useRef(1);
  const shellFlyIdRef = useRef(0);
  const playerCloudSyncRef = useRef<PlayerCloudSync | null>(null);
  const cloudSyncHydratedRef = useRef(false);
  const shellSyncPreviousRef = useRef(0);

  const approvalEvent = approvalQueue[0] ?? null;
  const visibleApprovalEvent =
    approvalEvent ??
    (uiPreview === "s10"
      ? ({
          id: "ui-preview-approval",
          type: "approval.required",
          occurredAt: new Date(0).toISOString(),
          requestId: "ui-preview",
          title: "서버 업데이트를 적용할까요?",
          detail:
            "중요한 변경이에요. 적용하기 전에 요청 내용을 한 번 더 확인해 주세요.",
          command: "npm run build",
          files: ["app/page.tsx"],
        } satisfies BridgeEvent)
      : null);
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
  const focusedCatId = focusedRuntime?.threadId ?? DEMO_CAT_ID;
  const focusedCatNeeds =
    catNeeds[focusedCatId] ?? createDefaultCatNeedState();
  const pendingSeatSlot =
    confirmDialog?.kind === "seat-unlock"
      ? (WORKSTATION_SLOTS.find(
          (slot) => slot.seatId === confirmDialog.seatId,
        ) ?? null)
      : null;
  const modalOpen = Boolean(
    pendingCatStyle ||
      onboardingOpen ||
      pendingSeatSlot ||
      confirmDialog?.kind === "disconnect" ||
      visibleApprovalEvent,
  );
  const nextSeatSlot = nextWorkstationSlot(activeSeatCount);
  const unlockedSeatIds = useMemo(
    () => activeSeatIds(activeSeatCount),
    [activeSeatCount],
  );
  const pressedRadioIndex = pressedRadioKey
    ? RADIO_MENU.findIndex((item) => item.key === pressedRadioKey) + 1
    : 0;

  useEffect(() => {
    runtimesRef.current = runtimes;
  }, [runtimes]);
  useEffect(() => {
    let disposed = false;

    void preloadPopupAssets().then(({ failed }) => {
      if (disposed) return;
      if (failed.length > 0) {
        console.warn("[popup-assets] preload failed", failed);
      }
      // 실패한 자산 하나가 팝업 전체를 영구적으로 막지는 않게 한다.
      // 정상 자산은 이 시점에 모두 로드·디코딩되어 첫 표시 때 깜빡이지 않는다.
      setPopupAssetsReady(true);
    });

    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    catNeedsRef.current = catNeeds;
  }, [catNeeds]);
  useEffect(() => {
    activeSeatCountRef.current = activeSeatCount;
  }, [activeSeatCount]);
  const seatViews = useMemo<SeatView[]>(() => {
    const unlocked = new Set(unlockedSeatIds);
    const active = runtimeList
      .filter(
        (runtime) =>
          runtime.seatId !== "queue" && unlocked.has(runtime.seatId),
      )
      .slice(0, activeSeatCount)
      .map((runtime) => ({
      ...(() => {
        const needs =
          catNeeds[runtime.threadId] ?? createDefaultCatNeedState();
        return {
          hunger: Math.round(needs.hunger),
          toilet: Math.round(needs.toilet),
          happiness: Math.round(needs.happiness),
        };
      })(),
      seatId: runtime.seatId,
      catId: runtime.threadId,
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
            catId: DEMO_CAT_ID,
            agentName: "코치 모모",
            location: "general",
            status: "idle",
            statusLabel: STATUS_COPY.idle,
            blocked: false,
            hunger: Math.round(
              (catNeeds[DEMO_CAT_ID] ?? createDefaultCatNeedState()).hunger,
            ),
            toilet: Math.round(
              (catNeeds[DEMO_CAT_ID] ?? createDefaultCatNeedState()).toilet,
            ),
            happiness: Math.round(
              (catNeeds[DEMO_CAT_ID] ?? createDefaultCatNeedState()).happiness,
            ),
          },
        ];
  }, [activeSeatCount, catNeeds, runtimeList, unlockedSeatIds]);

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
    hudTimerRef.current = window.setTimeout(() => setHudDormant(true), 3_000);
  }, []);

  const playBlockedChime = useCallback(() => {
    const context = worldAudioRef.current?.getContext() ?? null;
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
          assignSeat(
            next,
            runtimeKey,
            seatAssignmentsRef.current,
            activeSeatIds(activeSeatCountRef.current),
          );
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
          setShells((value) => {
            const next = value + 10;
            window.localStorage.setItem(SHELL_KEY, String(next));
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
    [raiseBlockedAlert],
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
    const cloudSync = createPlayerCloudSync();
    playerCloudSyncRef.current = cloudSync;
    queueMicrotask(() => {
      if (disposed) return;
      const savedShells = window.localStorage.getItem(SHELL_KEY);
      const migratedShells =
        savedShells === null
          ? Number(window.localStorage.getItem(LEGACY_ACORN_KEY) ?? 0) || 0
          : Number(savedShells) || 0;
      if (savedShells === null) {
        window.localStorage.setItem(SHELL_KEY, String(migratedShells));
      }
      setShells(migratedShells);
      const savedFoodBowl = window.localStorage.getItem(FOOD_BOWL_KEY);
      setFoodAvailable(savedFoodBowl !== "empty");
      const restoredLitterLevel = parseLitterLevel(
        window.localStorage.getItem(LITTER_BOX_STORAGE_KEY),
      );
      litterLevelRef.current = restoredLitterLevel;
      setLitterLevel(restoredLitterLevel);
      const restoredSeatCount = parseActiveSeatCount(
        window.localStorage.getItem(ACTIVE_SEAT_KEY),
      );
      activeSeatCountRef.current = restoredSeatCount;
      setActiveSeatCount(restoredSeatCount);
      const restoredDecorChoice =
        window.localStorage.getItem(DECOR_KEY) ?? "coral";
      setDecorChoice(restoredDecorChoice);
      const restoredNeeds = parseCatNeedsStore(
        window.localStorage.getItem(NEEDS_KEY),
      );
      const nextNeeds = {
        ...restoredNeeds,
        [DEMO_CAT_ID]: ensureCatNeedState(restoredNeeds, DEMO_CAT_ID),
      };
      catNeedsRef.current = nextNeeds;
      setCatNeeds(nextNeeds);
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
      const preview = new URLSearchParams(window.location.search).get(
        "ui-preview",
      );
      if (window.location.hostname === "localhost" && preview) {
        setUiPreview(preview);
      } else if (
        !savedToken &&
        window.localStorage.getItem(ONBOARDING_KEY) !== "done"
      ) {
        setOnboardingOpen(true);
      }

      void cloudSync
        .bootstrap({
          shellBalance: migratedShells,
          catNeeds: nextNeeds,
          decor: {
            ownedItemIds: [],
            seats: {
              theme: restoredDecorChoice,
              activeSeatCount: restoredSeatCount,
            },
            updatedAt: Date.now(),
          },
        })
        .then((remoteState) => {
          if (disposed) return;
          const mergedState = remoteState ?? {
            shellBalance: migratedShells,
            catNeeds: nextNeeds,
            decor: {
              ownedItemIds: [],
              seats: {
                theme: restoredDecorChoice,
                activeSeatCount: restoredSeatCount,
              },
              updatedAt: Date.now(),
            },
          };
          shellSyncPreviousRef.current = mergedState.shellBalance;
          setShells(mergedState.shellBalance);
          window.localStorage.setItem(
            SHELL_KEY,
            String(mergedState.shellBalance),
          );
          catNeedsRef.current = mergedState.catNeeds;
          setCatNeeds(mergedState.catNeeds);
          window.localStorage.setItem(
            NEEDS_KEY,
            JSON.stringify(mergedState.catNeeds),
          );
          const mergedTheme = mergedState.decor?.seats?.theme;
          if (typeof mergedTheme === "string") {
            setDecorChoice(mergedTheme);
            window.localStorage.setItem(DECOR_KEY, mergedTheme);
          }
          const mergedSeatCount = parseActiveSeatCount(
            String(
              mergedState.decor?.seats?.activeSeatCount ??
                restoredSeatCount,
            ),
          );
          activeSeatCountRef.current = mergedSeatCount;
          setActiveSeatCount(mergedSeatCount);
          window.localStorage.setItem(
            ACTIVE_SEAT_KEY,
            String(mergedSeatCount),
          );
          cloudSyncHydratedRef.current = true;
        });
    });
    return () => {
      disposed = true;
      cloudSync.dispose();
      if (playerCloudSyncRef.current === cloudSync) {
        playerCloudSyncRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cloudSyncHydratedRef.current) return;
    const delta = shells - shellSyncPreviousRef.current;
    shellSyncPreviousRef.current = shells;
    playerCloudSyncRef.current?.recordShellDelta(delta);
  }, [shells]);

  useEffect(() => {
    if (!cloudSyncHydratedRef.current) return;
    playerCloudSyncRef.current?.recordCatNeeds(catNeeds);
  }, [catNeeds]);

  useEffect(() => {
    if (!cloudSyncHydratedRef.current) return;
    playerCloudSyncRef.current?.recordDecor({
      ownedItemIds: [],
      seats: { theme: decorChoice, activeSeatCount },
      updatedAt: Date.now(),
    });
  }, [activeSeatCount, decorChoice]);

  useEffect(() => {
    const syncNeeds = () => {
      const now = Date.now();
      setCatNeeds((current) => {
        const next = Object.fromEntries(
          Object.entries(current).map(([threadId, state]) => [
            threadId,
            computeCatNeedState(state, now),
          ]),
        ) as CatNeedsStore;
        const activeThreadIds = runtimeList.length
          ? runtimeList.map((runtime) => runtime.threadId)
          : [DEMO_CAT_ID];
        activeThreadIds.forEach((threadId) => {
          next[threadId] = ensureCatNeedState(next, threadId, now);
        });
        catNeedsRef.current = next;
        window.localStorage.setItem(NEEDS_KEY, JSON.stringify(next));
        return next;
      });
    };
    const flushNeeds = () => {
      window.localStorage.setItem(
        NEEDS_KEY,
        JSON.stringify(catNeedsRef.current),
      );
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushNeeds();
    };

    queueMicrotask(syncNeeds);
    const interval = window.setInterval(syncNeeds, 30_000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", flushNeeds);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", flushNeeds);
      flushNeeds();
    };
  }, [runtimeList]);

  useEffect(() => {
    queueMicrotask(resetHudTimer);
    // 자동재생 정책상 첫 제스처 전에는 어떤 소리도 나지 않는다.
    const unlockAudio = () => {
      worldAudioRef.current?.unlock();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((name) => {
      window.addEventListener(name, resetHudTimer, { passive: true });
    });
    const unlockEvents = ["pointerdown", "keydown", "touchstart"];
    unlockEvents.forEach((name) => {
      window.addEventListener(name, unlockAudio, { passive: true });
    });
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      events.forEach((name) => window.removeEventListener(name, resetHudTimer));
      unlockEvents.forEach((name) =>
        window.removeEventListener(name, unlockAudio),
      );
    };
  }, [resetHudTimer]);

  useEffect(() => {
    const audio = createWorldAudio();
    worldAudioRef.current = audio;
    const startsEnabled =
      window.localStorage.getItem(AUDIO_ENABLED_KEY) !== "off";
    if (!startsEnabled) {
      audio.setEnabled(false);
      queueMicrotask(() => setAudioEnabled(false));
    }
    const handleVisibility = () => {
      audio.setSuspended(document.visibilityState !== "visible");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      worldAudioRef.current = null;
      audio.dispose();
    };
  }, []);

  useEffect(() => {
    if (!radioAudioPrimedRef.current) {
      radioAudioPrimedRef.current = true;
      previousRadioOpenRef.current = radioOpen;
      return;
    }
    if (previousRadioOpenRef.current === radioOpen) return;
    previousRadioOpenRef.current = radioOpen;
    worldAudioRef.current?.playUi(radioOpen ? "panelOpen" : "panelClose");
  }, [radioOpen]);

  useEffect(() => {
    if (!modalAudioPrimedRef.current) {
      modalAudioPrimedRef.current = true;
      previousModalOpenRef.current = modalOpen;
      return;
    }
    if (previousModalOpenRef.current === modalOpen) return;
    previousModalOpenRef.current = modalOpen;
    worldAudioRef.current?.playUi(modalOpen ? "panelOpen" : "panelClose");
  }, [modalOpen]);

  // 고양이 외형 복원 — 저장돼 있으면 그 모습으로 섬을 연다.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(CAT_LOOK_KEY) ?? "{}",
        ) as { style?: string };
        if (saved.style && CAT_STYLES.some((item) => item.id === saved.style)) {
          setCatStyle(saved.style);
          setOwnedCatStyles(
            parseOwnedCatStyles(
              window.localStorage.getItem(CAT_STYLE_OWNERSHIP_KEY),
              saved.style,
            ),
          );
        } else {
          setOwnedCatStyles(
            parseOwnedCatStyles(
              window.localStorage.getItem(CAT_STYLE_OWNERSHIP_KEY),
              "Blue",
            ),
          );
        }
      } catch {
        window.localStorage.removeItem(CAT_LOOK_KEY);
        setOwnedCatStyles(
          parseOwnedCatStyles(
            window.localStorage.getItem(CAT_STYLE_OWNERSHIP_KEY),
            "Blue",
          ),
        );
      }
    });
  }, []);

  const catShape = CAT_SHAPE_PRESETS[0].shape;

  const applyCatLook = useCallback((style: string) => {
    setCatStyle(style);
    window.localStorage.setItem(
      CAT_LOOK_KEY,
      JSON.stringify({ style, updatedAt: Date.now() }),
    );
  }, []);

  const requestCatLook = useCallback(
    (style: string) => {
      if (ownedCatStyles.has(style)) {
        applyCatLook(style);
        return;
      }
      setPendingCatStyle(style);
    },
    [applyCatLook, ownedCatStyles],
  );

  const confirmCatStylePurchase = useCallback(() => {
    if (!pendingCatStyle) return;
    const purchase = purchaseCatStyle(
      pendingCatStyle,
      shells,
      ownedCatStyles,
    );
    if (!purchase.ok) {
      worldAudioRef.current?.playUi("purchaseFail");
      if (purchase.reason === "insufficient-shells") {
        setToast(
          `${pendingCatStyle} 스타일을 구매하려면 조개 ${purchase.required}개가 필요해요.`,
        );
      }
      return;
    }
    setShells(purchase.balance);
    setOwnedCatStyles(purchase.ownedStyles);
    window.localStorage.setItem(SHELL_KEY, String(purchase.balance));
    window.localStorage.setItem(
      CAT_STYLE_OWNERSHIP_KEY,
      JSON.stringify([...purchase.ownedStyles]),
    );
    applyCatLook(pendingCatStyle);
    worldAudioRef.current?.playUi(
      purchase.charged ? "purchaseSuccess" : "itemEquip",
    );
    setToast(
      purchase.charged
        ? `${pendingCatStyle} 스타일을 조개 ${purchase.charged}개로 구매했어요.`
        : `${pendingCatStyle} 스타일을 적용했어요.`,
    );
    setPendingCatStyle(null);
  }, [applyCatLook, ownedCatStyles, pendingCatStyle, shells]);

  const feedFocusedCat = useCallback(
    (kind: "meal" | "snack") => {
      const now = Date.now();
      setCatNeeds((current) => {
        const before = ensureCatNeedState(current, focusedCatId, now);
        const nextState = updateCatNeedState(
          before,
          kind === "meal"
            ? { hunger: 0, happiness: before.happiness + 4 }
            : {
                hunger: Math.max(0, before.hunger - 20),
                happiness: before.happiness + 8,
              },
          now,
        );
        const next = { ...current, [focusedCatId]: nextState };
        catNeedsRef.current = next;
        window.localStorage.setItem(NEEDS_KEY, JSON.stringify(next));
        return next;
      });
      worldAudioRef.current?.playCat(kind === "meal" ? "greet" : "purr");
      worldAudioRef.current?.playUi(kind === "meal" ? "feedBowl" : "itemEquip");
      setToast(kind === "meal" ? "밥그릇을 채웠어요." : "간식을 건넸어요.");
    },
    [focusedCatId],
  );

  const refillFoodBowl = useCallback(() => {
    if (foodAvailable) {
      setToast("밥그릇에 사료가 가득 차 있어요.");
      return;
    }
    setFoodAvailable(true);
    window.localStorage.setItem(FOOD_BOWL_KEY, "full");
    worldAudioRef.current?.playUi("feedBowl");
    setToast("밥그릇에 사료를 가득 채웠어요.");
  }, [foodAvailable]);

  const cleanLitterFacility = useCallback(() => {
    if (litterLevelRef.current <= 0) {
      setToast("화장실이 이미 깨끗해요.");
      return;
    }
    const nextLevel = resetLitterBoxState();
    litterLevelRef.current = nextLevel;
    setLitterLevel(nextLevel);
    window.localStorage.setItem(
      LITTER_BOX_STORAGE_KEY,
      String(nextLevel),
    );
    worldAudioRef.current?.playUi("toiletDone");
    setToast("화장실의 배변을 깨끗하게 치웠어요.");
  }, []);

  const handleCatCareEvent = useCallback(
    (event: {
      catId: string;
      seatId: SeatId;
      outcome: CatCareOutcome;
    }) => {
      const now = Date.now();
      setCatNeeds((current) => {
        const before = ensureCatNeedState(current, event.catId, now);
        const nextState = applyCatCareOutcome(before, event.outcome, now);
        const next = { ...current, [event.catId]: nextState };
        catNeedsRef.current = next;
        window.localStorage.setItem(NEEDS_KEY, JSON.stringify(next));
        return next;
      });

      if (event.outcome === "meal-completed") {
        worldAudioRef.current?.playUi("catEat");
        setFoodAvailable(false);
        window.localStorage.setItem(FOOD_BOWL_KEY, "empty");
      } else if (event.outcome === "meal-missed") {
        worldAudioRef.current?.playCat("demand");
        setToast("밥그릇이 비어서 고양이의 행복도가 줄었어요.");
      } else if (event.outcome === "toilet-completed") {
        worldAudioRef.current?.playUi("toiletDone");
        const nextLevel = addLitterWaste(litterLevelRef.current);
        litterLevelRef.current = nextLevel;
        setLitterLevel(nextLevel);
        window.localStorage.setItem(
          LITTER_BOX_STORAGE_KEY,
          String(nextLevel),
        );
        setToast(
          isLitterBoxFull(nextLevel)
            ? "화장실이 가득 찼어요. 눌러서 배변을 치워주세요."
            : "화장실에 배변이 쌓였어요.",
        );
      } else if (event.outcome === "toilet-blocked") {
        worldAudioRef.current?.playCat("demand");
        setToast("화장실이 가득 차서 사용할 수 없어요. 행복도가 줄었어요.");
      }
    },
    [],
  );

  useEffect(() => {
    // 첫 effect는 저장값 복원이 끝나기 전이므로 기본값 "on"으로 덮어쓰지 않는다.
    if (!audioPreferenceHydratedRef.current) {
      audioPreferenceHydratedRef.current = true;
      return;
    }
    worldAudioRef.current?.setEnabled(audioEnabled);
    window.localStorage.setItem(
      AUDIO_ENABLED_KEY,
      audioEnabled ? "on" : "off",
    );
  }, [audioEnabled]);

  // 키보드 루프는 "작업 중" 고양이 수를 따라가고, 고양이 울음은 상태 전이에서만 난다.
  useEffect(() => {
    const audio = worldAudioRef.current;
    if (!audio) return;
    const previous = catCueStatusRef.current;
    const seen = new Set<string>();
    let typingCount = 0;
    for (const runtime of runtimeList) {
      seen.add(runtime.threadId);
      if (runtime.status === "working") typingCount += 1;
      const before = previous.get(runtime.threadId);
      if (before === runtime.status) continue;
      previous.set(runtime.threadId, runtime.status);
      if (!catCuePrimedRef.current) continue;
      const cue = CAT_CUE_BY_STATUS[runtime.status];
      if (cue) audio.playCat(cue);
    }
    for (const threadId of previous.keys()) {
      if (!seen.has(threadId)) previous.delete(threadId);
    }
    audio.setTypingCount(typingCount);
    // 첫 렌더에서 복원된 상태까지 울어대지 않도록 한 박자 늦게 연다.
    catCuePrimedRef.current = true;
  }, [runtimeList]);

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
    if (!uiPreview) return;
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      if (uiPreview === "s00") {
        setOnboardingOpen(true);
        setRadioOpen(false);
        return;
      }
      setOnboardingOpen(false);
      if (uiPreview === "s01") {
        setRadioOpen(false);
        return;
      }
      setRadioOpen(true);
      if (uiPreview === "s02" || uiPreview === "s03") {
        setRadioPage("cats");
        setCatPage(uiPreview === "s02" ? "list" : "detail");
      } else if (uiPreview === "s04" || uiPreview === "s05") {
        setRadioPage("desk");
        if (uiPreview === "s05") {
          const slot = nextWorkstationSlot(activeSeatCountRef.current);
          if (slot) {
            setConfirmDialog({ kind: "seat-unlock", seatId: slot.seatId });
          }
        }
      } else if (uiPreview === "s06" || uiPreview === "s07") {
        setRadioPage("work");
        setWorkTab(uiPreview === "s06" ? "connect" : "task");
      } else if (uiPreview === "s08" || uiPreview === "s09") {
        setRadioPage("status-log");
        setStatusLogTab(uiPreview === "s08" ? "status" : "log");
      } else if (uiPreview === "s11") {
        setRadioPage("status-log");
        setStatusLogTab("status");
      } else if (uiPreview === "s12") {
        setRadioPage("work");
        setWorkTab("connect");
        setConfirmDialog({ kind: "disconnect" });
      }
    });
    return () => {
      disposed = true;
    };
  }, [uiPreview]);

  useEffect(() => {
    if (!pendingCatStyle && !confirmDialog && !onboardingOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPendingCatStyle(null);
      setConfirmDialog(null);
      if (!uiPreview) setOnboardingOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [confirmDialog, onboardingOpen, pendingCatStyle, uiPreview]);

  useEffect(() => {
    return () => {
      demoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (keycapPressTimerRef.current) {
        window.clearTimeout(keycapPressTimerRef.current);
      }
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

  function requestDisconnectCompanion() {
    setConfirmDialog({ kind: "disconnect" });
  }

  function requestSeatUnlock() {
    const slot = nextWorkstationSlot(activeSeatCount);
    if (!slot) {
      setToast("네 자리 모두 열렸어요.");
      return;
    }
    setConfirmDialog({ kind: "seat-unlock", seatId: slot.seatId });
  }

  function confirmSeatUnlock() {
    if (!pendingSeatSlot || purchaseLockedRef.current) return;
    purchaseLockedRef.current = true;
    try {
      if (shells < pendingSeatSlot.price) {
        worldAudioRef.current?.playUi("purchaseFail");
        setToast(`조개 ${pendingSeatSlot.price - shells}개가 더 필요해요.`);
        return;
      }
      const nextCount = Math.min(MAX_SEAT_COUNT, activeSeatCount + 1);
      const nextShells = shells - pendingSeatSlot.price;
      activeSeatCountRef.current = nextCount;
      setActiveSeatCount(nextCount);
      setShells(nextShells);
      setSelectedSeat(pendingSeatSlot.seatId);
      window.localStorage.setItem(ACTIVE_SEAT_KEY, String(nextCount));
      window.localStorage.setItem(SHELL_KEY, String(nextShells));
      worldAudioRef.current?.playUi(
        nextCount === MAX_SEAT_COUNT ? "milestone" : "tierUpgrade",
      );
      setConfirmDialog(null);
      setToast(
        `자리 ${pendingSeatSlot.seatId.slice(-1)}과 ${pendingSeatSlot.title}을 열었어요.`,
      );
    } finally {
      window.setTimeout(() => {
        purchaseLockedRef.current = false;
      }, 240);
    }
  }

  const collectBeachShell = useCallback(
    ({
      amount,
      x,
      y,
    }: {
      amount: number;
      x: number;
      y: number;
    }) => {
      const id = ++shellFlyIdRef.current;
      setShells((current) => {
        const next = current + amount;
        window.localStorage.setItem(SHELL_KEY, String(next));
        return next;
      });
      setShellCollectTokens((current) => [
        ...current,
        { id, x, y, amount },
      ]);
      worldAudioRef.current?.playUi("shellPickup");
      window.setTimeout(() => {
        setShellCollectTokens((current) =>
          current.filter((token) => token.id !== id),
        );
        setShellHudPulse((current) => current + 1);
      }, 680);
    },
    [],
  );

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
    worldAudioRef.current?.playUi("itemEquip");
  }

  function pressRadioMenuKey(page: RadioPage) {
    keycapFeedbackPrimedRef.current = true;
    worldAudioRef.current?.playUi("keycapClick");

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
    if (page === "cats") setCatPage("list");
    setRadioOpen(true);
    resetHudTimer();
  }

  return (
    <main
      className={`app-shell decor-${decorChoice} ${
        hudDormant ? "hud-dormant" : ""
      }`}
      data-popup-assets={popupAssetsReady ? "ready" : "loading"}
    >
      {SHOW_LEGACY_OVERLAYS && (
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
      )}

      <section className="world-card" aria-label="AI 에이전트 숲">
        {SHOW_LEGACY_OVERLAYS && (
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
        )}

        <div
          className={`world-stage world-stage-3d ${
            completionSignal ? "has-spectacle" : ""
          }`}
        >
          <AgentWorld3D
            // 외형이 바뀌면 씬을 통째로 다시 만든다 — FBX가 달라지고 정점도 새로 부풀려야 한다.
            key={`${catStyle}-${catShapeId}`}
            catStyle={catStyle}
            catShape={catShape}
            seats={seatViews}
            activeSeatCount={activeSeatCount}
            companionConnected={
              bridgeState === "connected"
                ? "connected"
                : companionToken
                  ? "pairing"
                  : "offline"
            }
            completionSignal={completionSignal}
            foodAvailable={foodAvailable}
            litterLevel={litterLevel}
            onFoodBowlClick={refillFoodBowl}
            onLitterBoxClick={cleanLitterFacility}
            onCatCareEvent={handleCatCareEvent}
            onShellCollect={collectBeachShell}
            onSeatClick={(seatId) => {
              // 쓰다듬는 반응 — 짧게 인사하고 잠깐 골골거린다.
              worldAudioRef.current?.playCat("greet");
              worldAudioRef.current?.playCat("purr");
              setSelectedSeat(seatId);
              setStatusLogTab("status");
              setRadioPage("status-log");
              setRadioOpen(true);
            }}
            onRadioClick={() => setRadioOpen(true)}
          />

          <div
            key={`shell-hud-${shellHudPulse}`}
            className="world-currency-hud"
            aria-label={`조개 ${shells}개`}
          >
            <img src="/art/ui/hud-shell-v2.png" alt="" aria-hidden="true" />
            <strong>{shells.toLocaleString("ko-KR")}</strong>
          </div>

          {shellCollectTokens.map((token) => (
            <span
              className="shell-collect-token"
              key={token.id}
              style={{
                "--shell-from-x": `${token.x * 100}%`,
                "--shell-from-y": `${token.y * 100}%`,
              } as CSSProperties}
              aria-hidden="true"
            >
              <img src="/art/ui/hud-shell-v2.png" alt="" />
              <b>+{token.amount}</b>
            </span>
          ))}

          <button
            type="button"
            className="sound-toggle"
            aria-pressed={audioEnabled}
            aria-label={audioEnabled ? "소리 끄기" : "소리 켜기"}
            title={audioEnabled ? "소리 끄기" : "소리 켜기"}
            onClick={() => {
              const audio = worldAudioRef.current;
              const next = !audioEnabled;
              audio?.unlock();
              if (next) {
                audio?.setEnabled(true);
                audio?.playUi("toggleOn");
              } else {
                audio?.playUi("toggleOff");
                audio?.setEnabled(false);
              }
              setAudioEnabled(next);
            }}
          >
            <img
              src={
                audioEnabled
                  ? "/art/ui/hud-sound-on-v2.png"
                  : "/art/ui/hud-sound-off-v2.png"
              }
              alt=""
              aria-hidden="true"
            />
          </button>

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

          {SHOW_LEGACY_OVERLAYS && (
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
          )}

          {SHOW_LEGACY_OVERLAYS && (
            <div className={`world-caption hud-fade ${hudDormant ? "is-dormant" : ""}`}>
              <span>2.5D WebGL · AUTONOMOUS CAT MOTION ACTIVE</span>
              <b>고양이 자율 행동 · 책상 객체 충돌 회피 · 최대 4개 세션</b>
            </div>
          )}

          {SHOW_LEGACY_OVERLAYS &&
            focusedRuntime?.status === "completed" &&
            focusedRuntime.activeTask?.result && (
              <button
                type="button"
                className="result-printer"
                onClick={() => {
                  setStatusLogTab("status");
                  setRadioPage("status-log");
                  setRadioOpen(true);
                }}
              >
                <span>REPORT</span>
                {focusedRuntime.activeTask.result}
              </button>
            )}
        </div>
      </section>

      {radioOpen && popupAssetsReady && (
        <aside
          className="control-panel radio-panel game-popup"
          aria-label={RADIO_TITLES[radioPage]}
          data-page={radioPage}
        >
          <div className="radio-hardware">
            <span className={`radio-lamp ${bridgeState}`} />
            <strong>{RADIO_TITLES[radioPage]}</strong>
            <span>{shells} 조개</span>
            <button
              type="button"
              onClick={() => setRadioOpen(false)}
              aria-label="팝업 닫기"
              className="game-popup-close"
            >
              닫기
            </button>
          </div>
          <div
            className={`radio-screen ${
              radioPage === "desk" ||
              radioPage === "work" ||
              radioPage === "status-log"
                ? "has-tabs"
                : ""
            }`}
          >
            {radioPage === "cats" && catPage === "list" && (
              <section className="panel-section cat-list-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">MY CATS</span>
                    <h2>지금 일하는 고양이</h2>
                    <small>최대 네 마리까지 자리를 맡길 수 있어요</small>
                  </div>
                </div>
                <div className="cat-list-grid" role="list" aria-label="고양이 목록">
                  {Array.from({ length: activeSeatCount }, (_, index) => {
                    const seatId = `seat-${index + 1}` as SeatId;
                    const seat =
                      seatViews.find((candidate) => candidate.seatId === seatId) ??
                      (index === 0 ? seatViews[0] : null);
                    if (!seat) {
                      return (
                        <button
                          type="button"
                          className="cat-list-card empty"
                          key={seatId}
                          onClick={() => {
                            setWorkTab("connect");
                            setRadioPage("work");
                          }}
                        >
                          <span className="cat-card-avatar plus" aria-hidden="true" />
                          <span>
                            <strong>빈 자리 {index + 1}</strong>
                            <small>Codex 세션 연결</small>
                          </span>
                        </button>
                      );
                    }
                    const attention =
                      (seat.hunger ?? 0) >= 70 || (seat.toilet ?? 0) >= 70;
                    return (
                      <button
                        type="button"
                        className={[
                          "cat-list-card",
                          index === 0 ? "selected" : "",
                          attention ? "attention" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={seatId}
                        onClick={() => {
                          setSelectedSeat(seatId);
                          setCatPage("detail");
                        }}
                      >
                        <span className="cat-card-avatar" aria-hidden="true" />
                        <span className="cat-card-copy">
                          <strong>{seat.agentName}</strong>
                          <small>{seat.statusLabel}</small>
                          <span className="cat-card-gauges" aria-hidden="true">
                            <i>
                              <b style={{ width: `${seat.hunger ?? 0}%` }} />
                            </i>
                            <i>
                              <b style={{ width: `${seat.toilet ?? 0}%` }} />
                            </i>
                            <i>
                              <b style={{ width: `${seat.happiness ?? 0}%` }} />
                            </i>
                          </span>
                        </span>
                        <em>{attention ? "돌봄" : "상세"}</em>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="cat-add-button"
                  disabled={activeSeatCount >= MAX_SEAT_COUNT}
                  onClick={requestSeatUnlock}
                >
                  {activeSeatCount >= MAX_SEAT_COUNT
                    ? "모든 자리 사용 중"
                    : `자리 ${activeSeatCount + 1} 추가하기`}
                  <small>
                    {activeSeatCount >= MAX_SEAT_COUNT
                      ? "최대 네 자리까지 사용할 수 있어요"
                      : "새 업무 객체와 고양이 자리를 함께 열어요"}
                  </small>
                </button>
              </section>
            )}

            {radioPage === "cats" && catPage === "detail" && (
              <section className="panel-section cat-detail-panel">
                <button
                  type="button"
                  className="game-back-button"
                  onClick={() => {
                    worldAudioRef.current?.playUi("tabSwitch");
                    setCatPage("list");
                  }}
                >
                  고양이 목록
                </button>
                <div className="cat-roster">
                  <div className="cat-roster-head cat-profile-head">
                    <span className="cat-card-avatar" aria-hidden="true" />
                    <span>
                      <b>{focusedRuntime?.agentName ?? "코치 모모"}</b>
                      <small>
                        자리 {(selectedSeat ?? "seat-1").slice(-1)} ·{" "}
                        {focusedRuntime
                          ? STATUS_COPY[focusedRuntime.status]
                          : "대기 중"}
                      </small>
                    </span>
                    <em>행복 {Math.round(focusedCatNeeds.happiness)}</em>
                  </div>
                  <div
                    className="cat-needs-summary"
                    aria-label={`${focusedRuntime?.agentName ?? "코치 모모"} 욕구 상태`}
                  >
                    {(
                      [
                        ["hunger", "배고픔", focusedCatNeeds.hunger],
                        ["toilet", "배설", focusedCatNeeds.toilet],
                      ] as Array<[string, string, number]>
                    ).map(([key, label, value]) => (
                      <div className="cat-need-row" key={key}>
                        <span>{label}</span>
                        <i className={`need-track tone-${getNeedTone(value)}`}>
                          <b style={{ width: `${Math.round(value)}%` }} />
                        </i>
                        <em>{Math.round(value)}</em>
                      </div>
                    ))}
                    <div className="cat-need-row cat-happiness-row">
                      <span>행복도</span>
                      <i
                        className={`need-track happiness-track band-${getHappinessBand(
                          focusedCatNeeds.happiness,
                        )}`}
                        role="progressbar"
                        aria-label="고양이 행복도"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(focusedCatNeeds.happiness)}
                      >
                        <b
                          style={{
                            width: `${Math.round(focusedCatNeeds.happiness)}%`,
                          }}
                        />
                      </i>
                      <em>{Math.round(focusedCatNeeds.happiness)}</em>
                    </div>
                    <div className="cat-happiness-line">
                      <span>행복 상태</span>
                      <small>{getHappinessBand(focusedCatNeeds.happiness)}</small>
                    </div>
                  </div>

                  <label className="cat-field-label">털 색 · 무늬</label>
                  <div className="cat-style-grid" role="radiogroup" aria-label="고양이 스타일">
                    {CAT_STYLES.map((style) => {
                      const owned = ownedCatStyles.has(style.id);
                      const selected = catStyle === style.id;
                      return (
                        <button
                          type="button"
                          key={style.id}
                          role="radio"
                          aria-checked={selected}
                          className={[
                            selected ? "selected" : "",
                            owned ? "owned" : "for-sale",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => requestCatLook(style.id)}
                          title={style.ko}
                        >
                          <img
                            className="cat-style-preview"
                            src={catStylePreviewUrl(style.id)}
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                          />
                          <span>{style.id}</span>
                          <small>
                            {selected
                              ? "사용 중"
                              : owned
                                ? "보유"
                                : `${CAT_STYLE_PRICES[style.id]} 조개`}
                          </small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="cat-care-actions">
                    <button
                      type="button"
                      className="game-button secondary"
                      onClick={refillFoodBowl}
                    >
                      사료 주기
                    </button>
                    <button
                      type="button"
                      className="game-button primary"
                      onClick={() => feedFocusedCat("snack")}
                    >
                      간식 주기
                    </button>
                  </div>
                </div>
              </section>
            )}

            {radioPage === "desk" && (
              <div className="desk-seat-tabs" role="tablist" aria-label="꾸밀 좌석">
                {unlockedSeatIds.map(
                  (seatId, index) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={(selectedSeat ?? "seat-1") === seatId}
                      className={(selectedSeat ?? "seat-1") === seatId ? "selected" : ""}
                      key={seatId}
                      onClick={() => setSelectedSeat(seatId)}
                    >
                      자리 {index + 1}
                    </button>
                  ),
                )}
                {activeSeatCount < MAX_SEAT_COUNT && (
                  <button
                    type="button"
                    className="seat-unlock-tab"
                    aria-label={`자리 ${activeSeatCount + 1} 추가`}
                    onClick={requestSeatUnlock}
                  >
                    + 자리
                  </button>
                )}
              </div>
            )}

            {radioPage === "desk" && (
              <section className="panel-section desk-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">MY WORKSTATIONS</span>
                    <h2>자리 꾸미기</h2>
                  </div>
                  <span className="shell-balance">{shells} 조개</span>
                </div>
                <div className="desk-tier-summary">
                  <span>
                    <strong>{activeSeatCount}개의 업무 자리</strong>
                    <small>
                      {nextSeatSlot
                        ? `다음 자리 ${nextSeatSlot.price} 조개`
                        : "모든 자리 해금 완료"}
                    </small>
                  </span>
                  <em>{shells} 조개</em>
                  <i aria-label={`자리 해금 ${activeSeatCount * 25}%`}>
                    <b style={{ width: `${activeSeatCount * 25}%` }} />
                  </i>
                </div>
                <div className="desk-item-grid" role="group" aria-label="자리 객체">
                  {WORKSTATION_SLOTS.map((slot, index) => {
                    const unlocked = index < activeSeatCount;
                    const next = index === activeSeatCount;
                    return (
                      <button
                        type="button"
                        className={[
                          "desk-item-card",
                          unlocked ? "equipped" : "",
                          !unlocked ? "locked" : "",
                          next ? "next-seat" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={slot.seatId}
                        disabled={!unlocked && !next}
                        onClick={() => {
                          if (unlocked) {
                            setSelectedSeat(slot.seatId);
                            return;
                          }
                          if (next) requestSeatUnlock();
                        }}
                      >
                        <span
                          className="desk-item-preview"
                          style={{
                            backgroundImage: `url("${slot.preview}")`,
                            backgroundPosition: "center",
                          }}
                          aria-hidden="true"
                        />
                        <strong>{slot.title}</strong>
                        <small>{slot.description}</small>
                        <em>
                          {unlocked
                            ? "배치 완료"
                            : next
                              ? `${slot.price} 조개로 추가`
                              : "이전 자리 먼저 추가"}
                        </em>
                      </button>
                    );
                  })}
                </div>
                <p className="desk-safety-note">
                  자리 하나마다 업무 객체 하나만 배치됩니다.
                </p>
              </section>
            )}

            {radioPage === "work" && (
              <div className="radio-subtabs" role="tablist" aria-label="업무 메뉴">
                <button
                  type="button"
                  role="tab"
                  aria-selected={workTab === "connect"}
                  className={workTab === "connect" ? "selected" : ""}
                  onClick={() => {
                    worldAudioRef.current?.playUi("tabSwitch");
                    setWorkTab("connect");
                  }}
                >
                  세션 연결
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workTab === "task"}
                  className={workTab === "task" ? "selected" : ""}
                  onClick={() => {
                    worldAudioRef.current?.playUi("tabSwitch");
                    setWorkTab("task");
                  }}
                >
                  업무 지시
                </button>
              </div>
            )}

            {radioPage === "work" && workTab === "task" && (
              <section className="panel-section task-composer">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">NEW MISSION</span>
                    <h2>이 고양이에게 업무 맡기기</h2>
                  </div>
                </div>
                <div className="selected-session-line">
                  <span className={selectedSession ? "ready" : ""} />
                  {selectedSession
                    ? `${selectedSession.title} · ${selectedSession.projectName}`
                    : "WORK의 세션 연결에서 사용할 Codex 세션을 선택해 주세요"}
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

            {radioPage === "work" && workTab === "connect" && (
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
                        onClick={requestDisconnectCompanion}
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
                        <div className="ui-empty-state session-empty">
                          <span
                            className={`ui-empty-icon ${
                              sessionsLoading ? "loading" : "offline"
                            }`}
                            aria-hidden="true"
                          />
                          <strong>
                            {sessionsLoading ? "세션 확인 중" : "연결된 세션이 없어요"}
                          </strong>
                          <p>
                            {sessionsLoading
                              ? "내 PC의 Codex 세션을 불러오고 있어요."
                              : "연결 코드를 확인한 뒤 다시 시도해 주세요."}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            {radioPage === "status-log" && (
              <div className="radio-subtabs" role="tablist" aria-label="현황과 기록 메뉴">
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusLogTab === "status"}
                  className={statusLogTab === "status" ? "selected" : ""}
                  onClick={() => {
                    worldAudioRef.current?.playUi("tabSwitch");
                    setStatusLogTab("status");
                  }}
                >
                  진행 상태
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusLogTab === "log"}
                  className={statusLogTab === "log" ? "selected" : ""}
                  onClick={() => {
                    worldAudioRef.current?.playUi("tabSwitch");
                    setStatusLogTab("log");
                  }}
                >
                  활동 기록
                </button>
              </div>
            )}

            {radioPage === "status-log" && statusLogTab === "status" && (
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
                {uiPreview === "s11" ? (
                  <div className="ui-empty-state state-error">
                    <span className="ui-empty-icon error" aria-hidden="true" />
                    <strong>PC 연결을 확인해 주세요</strong>
                    <p>
                      오프라인 상태라 작업 상태를 불러오지 못했어요. 연결 화면에서
                      다시 확인할 수 있어요.
                    </p>
                    <button
                      type="button"
                      className="game-button primary"
                      onClick={() => {
                        setRadioPage("work");
                        setWorkTab("connect");
                      }}
                    >
                      연결 화면 열기
                    </button>
                  </div>
                ) : focusedRuntime?.activeTask ? (
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
                  <div className="ui-empty-state empty-task">
                    <span className="ui-empty-icon idle" aria-hidden="true" />
                    <strong>모두 쉬고 있어요</strong>
                    <p>업무 지시에서 새 일을 맡겨 보세요.</p>
                  </div>
                )}
                <div className="free-decor">
                  <div>
                    <strong>무료 해변 꾸미기</strong>
                    <small>작업 완료로 모은 조개 {shells}개</small>
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

            {radioPage === "status-log" && statusLogTab === "log" && (
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
                    <li className="ui-empty-state empty-log">
                      <span className="ui-empty-icon log" aria-hidden="true" />
                      <strong>아직 활동 기록이 없어요</strong>
                      <p>고양이가 일을 시작하면 최근 기록이 여기에 쌓여요.</p>
                    </li>
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
                  <a href="/cats">고양이 스타일 전체 보기</a>
                  <a href="/legal#terms">이용약관</a>
                  <a href="/legal#privacy">개인정보처리방침</a>
                  <a href="/legal#license">라이선스</a>
                </div>
              </section>
            )}
          </div>
        </aside>
      )}

      {pendingCatStyle && popupAssetsReady && (
        <div
          className="style-purchase-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPendingCatStyle(null);
          }}
        >
          <section
            className="style-purchase-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="style-purchase-title"
          >
            <span className="style-purchase-title" id="style-purchase-title">
              털 색 · 무늬 구매
            </span>
            <button
              type="button"
              className="game-popup-close"
              aria-label="구매 창 닫기"
              onClick={() => setPendingCatStyle(null)}
            >
              닫기
            </button>
            <div className="style-purchase-copy">
              <img
                className="style-purchase-cat-preview"
                src={catStylePreviewUrl(pendingCatStyle)}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <strong>{pendingCatStyle}</strong>
              <p>
                처음 한 번만 구매하면 이후에는 조개 없이 다시 적용할 수
                있어요.
              </p>
              <div className="style-purchase-balance">
                <span>가격 {CAT_STYLE_PRICES[pendingCatStyle]} 조개</span>
                <span>보유 {shells} 조개</span>
              </div>
              <div className="style-purchase-actions">
                <button
                  type="button"
                  className="game-button secondary"
                  onClick={() => setPendingCatStyle(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="game-button primary"
                  disabled={shells < CAT_STYLE_PRICES[pendingCatStyle]}
                  onClick={confirmCatStylePurchase}
                >
                  {shells < CAT_STYLE_PRICES[pendingCatStyle]
                    ? "조개 부족"
                    : "구매하고 적용"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {onboardingOpen && popupAssetsReady && (
        <div
          className="style-purchase-backdrop onboarding-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget || uiPreview === "s00") return;
            setOnboardingOpen(false);
          }}
        >
          <section
            className="style-purchase-modal onboarding-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
          >
            <span className="style-purchase-title" id="onboarding-title">
              내 PC와 첫 연결
            </span>
            <button
              type="button"
              className="game-popup-close"
              aria-label="첫 연결 안내 닫기"
              onClick={() => {
                window.localStorage.setItem(ONBOARDING_KEY, "done");
                setOnboardingOpen(false);
              }}
            >
              닫기
            </button>
            <div className="onboarding-copy">
              <span className="onboarding-cat" aria-hidden="true" />
              <strong>고양이에게 첫 업무 자리를 만들어 주세요</strong>
              <p>
                PC Companion에 표시된 여섯 자리 연결 코드를 입력하면 Codex 세션이
                고양이로 나타나요.
              </p>
              <ol aria-label="연결 순서">
                <li><b>1</b> PC Companion 실행</li>
                <li><b>2</b> 여섯 자리 코드 확인</li>
                <li><b>3</b> 연결 화면에서 한 번 입력</li>
              </ol>
              <button
                type="button"
                className="game-button primary onboarding-start"
                onClick={() => {
                  window.localStorage.setItem(ONBOARDING_KEY, "done");
                  setOnboardingOpen(false);
                  setRadioPage("work");
                  setWorkTab("connect");
                  setRadioOpen(true);
                }}
              >
                연결 시작하기
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingSeatSlot && popupAssetsReady && (
        <div
          className="style-purchase-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setConfirmDialog(null);
          }}
        >
          <section
            className="style-purchase-modal seat-unlock-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seat-unlock-title"
          >
            <span className="style-purchase-title" id="seat-unlock-title">
              새 자리 추가
            </span>
            <button
              type="button"
              className="game-popup-close"
              aria-label="새 자리 추가 닫기"
              onClick={() => setConfirmDialog(null)}
            >
              닫기
            </button>
            <div className="style-purchase-copy">
              <span
                className="desk-purchase-preview workstation-unlock-preview"
                style={{
                  backgroundImage: `url("${pendingSeatSlot.preview}")`,
                }}
                aria-hidden="true"
              />
              <strong>{pendingSeatSlot.title}</strong>
              <p>
                자리 {pendingSeatSlot.seatId.slice(-1)}과{" "}
                {pendingSeatSlot.description} 객체를 함께 배치할까요?
              </p>
              <div className="style-purchase-balance">
                <span>가격 {pendingSeatSlot.price} 조개</span>
                <span>보유 {shells} 조개</span>
              </div>
              <div className="style-purchase-actions">
                <button
                  type="button"
                  className="game-button secondary"
                  onClick={() => setConfirmDialog(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="game-button primary"
                  disabled={shells < pendingSeatSlot.price}
                  onClick={confirmSeatUnlock}
                >
                  {shells < pendingSeatSlot.price ? "조개 부족" : "자리 추가"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {confirmDialog?.kind === "disconnect" && popupAssetsReady && (
        <div
          className="style-purchase-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setConfirmDialog(null);
          }}
        >
          <section
            className="style-purchase-modal important-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-confirm-title"
          >
            <span className="style-purchase-title" id="disconnect-confirm-title">
              PC 연결 해제
            </span>
            <button
              type="button"
              className="game-popup-close"
              aria-label="연결 해제 확인 닫기"
              onClick={() => setConfirmDialog(null)}
            >
              닫기
            </button>
            <div className="style-purchase-copy">
              <span className="important-warning-icon" aria-hidden="true" />
              <strong>정말 연결을 해제할까요?</strong>
              <p>
                진행 중인 작업 표시는 멈추고 PC 세션 목록이 사라집니다. Codex의
                실제 작업 파일은 삭제되지 않아요.
              </p>
              <div className="style-purchase-actions">
                <button
                  type="button"
                  className="game-button secondary"
                  onClick={() => setConfirmDialog(null)}
                >
                  계속 연결
                </button>
                <button
                  type="button"
                  className="game-button danger"
                  onClick={() => {
                    disconnectCompanion();
                    setConfirmDialog(null);
                  }}
                >
                  연결 해제
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {visibleApprovalEvent && popupAssetsReady && (
        <div
          className="approval-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (approvalEvent) void decide("cancel");
            else setUiPreview(null);
          }}
        >
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <span className="approval-dialog-title">승인 요청</span>
            <button
              type="button"
              className="game-popup-close approval-close"
              aria-label="승인 요청 닫기"
              onClick={() => {
                if (approvalEvent) void decide("cancel");
                else setUiPreview(null);
              }}
            >
              닫기
            </button>
            <div className="manager-cat" aria-hidden="true">
              <span />
              <i>REPORT</i>
            </div>
            <div className="approval-copy">
              <span className="section-kicker">MANAGER REPORT</span>
              <span className="approval-count">
                대기 {Math.max(1, approvalQueue.length)}건 · 먼저 온 요청부터 표시
              </span>
              <h2 id="approval-title">{visibleApprovalEvent.title}</h2>
              <p>{visibleApprovalEvent.detail}</p>
              {visibleApprovalEvent.command && (
                <pre className="approval-command">
                  <code>{visibleApprovalEvent.command}</code>
                </pre>
              )}
              {visibleApprovalEvent.files &&
                visibleApprovalEvent.files.length > 0 && (
                <div className="approval-detail">
                  변경 파일 {visibleApprovalEvent.files.length}개
                </div>
              )}
              {Boolean(visibleApprovalEvent.permissions) && (
                <div className="approval-detail">
                  추가 권한 요청 내용이 포함되어 있습니다.
                </div>
              )}
              {visibleApprovalEvent.usage && (
                <div className="token-row">
                  <span>
                    입력{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(visibleApprovalEvent.usage)?.input_tokens,
                      )}
                    </b>
                  </span>
                  <span>
                    캐시{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(visibleApprovalEvent.usage)?.cached_input_tokens,
                      )}
                    </b>
                  </span>
                  <span>
                    출력{" "}
                    <b>
                      {compactNumber(
                        normalizeUsage(visibleApprovalEvent.usage)?.output_tokens,
                      )}
                    </b>
                  </span>
                </div>
              )}
              <div className="approval-actions">
                <button
                  type="button"
                  className="approve"
                  onClick={() => {
                    if (approvalEvent) void decide("approve");
                    else setUiPreview(null);
                  }}
                >
                  이번 요청 승인
                </button>
                <button
                  type="button"
                  className="review"
                  onClick={() => {
                    if (approvalEvent) void decide("reject");
                    else setUiPreview(null);
                  }}
                >
                  거절하고 계속
                </button>
                <button
                  type="button"
                  className="reject"
                  onClick={() => {
                    if (approvalEvent) void decide("cancel");
                    else setUiPreview(null);
                  }}
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
