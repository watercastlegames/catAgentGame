"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  findAvoidancePath2D,
  resolvePointOutsideObstacles2D,
  steerAroundNeighbors2D,
} from "./navigation.mjs";
import { catStyleModelUrl } from "./cat-styles";
import {
  type CatPersonalityProfile,
  catPersonalityForStyle,
  pickPersonalityAmbientKey,
  pickPersonalityYieldAnimation,
} from "./cat-personalities.mjs";
import { type CatShape, fattenCat } from "./cat-body";
import {
  type CatCareIntent,
  type CatCareOutcome,
  selectCatCareIntent,
} from "./cat-needs";
import {
  SNACK_EATING_SECONDS,
  snackApproachTimeoutSeconds,
} from "./cat-interactions";
import { FOOD_PROFILES, type FoodGrade } from "./food-bowl-state";
import {
  addLitterWaste,
  isLitterBoxFull,
} from "./litter-box-state.mjs";
import { SketchOutlineEffect } from "./sketch-outline-effect";
import {
  CARE_FACILITY_LAYOUT_IDS,
  EXTRA_CARE_FACILITY_DEFAULT_POSES,
  HARD_CODED_WORLD_OBJECT_LAYOUT,
  MAX_CARE_FACILITY_COUNT,
  PURCHASABLE_WORLD_OBJECT_DEFAULT_POSES,
  WORLD_OBJECT_LAYOUT_STORAGE_KEY,
  getWorldLayoutAdminEnabled,
  subscribeWorldLayoutAdmin,
  parseWorldObjectLayout,
  transformObstacleBounds,
  transformWorldPoint,
  type WorldObjectLayout,
  type WorldObjectPose,
} from "./world-object-layout.mjs";
import {
  WORLD_DAY_NIGHT_DEFAULT_PHASE,
  WORLD_DAY_NIGHT_STORAGE_KEY,
  createWorldDayNightAnchor,
  sampleWorldDayNight,
  worldDayNightDebugPhase,
  worldDayNightPhaseAt,
} from "./world-day-night.mjs";
import {
  WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY,
  parseWorkstationScreenLayout,
  type WorkstationScreenLayout,
  type WorkstationScreenPose,
} from "./workstation-screen-layout.mjs";

export type AgentWorldLocation =
  | "entrance"
  | "general"
  | "coding"
  | "design"
  | "music"
  | "queue"
  | "office";

export type SeatId = "seat-1" | "seat-2" | "seat-3" | "seat-4";

export type SeatView = {
  seatId: SeatId | "queue";
  catId: string;
  agentName: string;
  location: AgentWorldLocation;
  status: string;
  statusLabel: string;
  blocked: boolean;
  hasUnreadReply?: boolean;
  hunger?: number;
  toilet?: number;
  happiness?: number;
  level?: number;
  catStyle?: string;
};

export type WorldPlacementMode = "snack" | "laser" | "toy" | null;

type WorldTimeTestMode = "auto" | "dawn" | "day" | "sunset" | "night";

const WORLD_TIME_TEST_OPTIONS: ReadonlyArray<{
  mode: WorldTimeTestMode;
  label: string;
}> = [
  { mode: "auto", label: "자동" },
  { mode: "dawn", label: "새벽" },
  { mode: "day", label: "낮" },
  { mode: "sunset", label: "노을" },
  { mode: "night", label: "밤" },
];

export type SnackPlacement = {
  id: number;
  x: number;
  z: number;
};

type AgentWorld3DProps = {
  seats: SeatView[];
  activeSeatCount: number;
  companionConnected: "connected" | "pairing" | "offline";
  completionSignal: number;
  /** 팩의 스타일 id(예: "Blue"). 바뀌면 상위에서 key 로 씬을 다시 만든다. */
  catStyle?: string;
  /** 몸통을 부풀리는 정도. 없으면 원본 체형. */
  catShape?: CatShape;
  onSeatClick?: (seatId: SeatId) => void;
  onRadioClick?: () => void;
  onShellCollect?: (event: {
    amount: number;
    x: number;
    y: number;
  }) => void;
  /** 손가락 가이드가 가리킬 대상. 매 프레임 화면 비율(0~1)로 알려준다.
      화면 밖이면 visible=false 로 보내 가이드가 엉뚱한 곳을 짚지 않게 한다. */
  tutorialAnchor?: "cat" | "shell" | null;
  onTutorialAnchor?: (event: {
    target: "cat" | "shell";
    x: number;
    y: number;
    visible: boolean;
  }) => void;
  worldShellSpawningEnabled: boolean;
  placementMode: WorldPlacementMode;
  interactionCatId?: string;
  snackPlacement: SnackPlacement | null;
  onWorldPlacement?: (position: { x: number; z: number }) => void;
  onSnackResolved?: (event: {
    placementId: number;
    catId: string;
    consumed: boolean;
  }) => void;
  onLaserResolved?: (event: {
    catId: string;
    completed: boolean;
  }) => void;
  onToyResolved?: (event: {
    catId: string;
    completed: boolean;
  }) => void;
  foodAvailable: boolean;
  foodGrade: FoodGrade | null;
  foodBowlCount?: 1 | 2;
  litterLevel: number;
  litterMaxLevel: number;
  litterBoxCount?: 1 | 2;
  exerciseWheelOwned?: boolean;
  workstationDecor?: Partial<Record<SeatId, string[]>>;
  onFoodBowlClick?: () => void;
  onLitterBoxClick?: () => void;
  onCatCareEvent?: (event: {
    catId: string;
    seatId: SeatId;
    outcome: CatCareOutcome;
  }) => void;
  onKneadingCompleted?: (event: {
    catId: string;
    seatId: SeatId;
  }) => void;
  onCatWheelPlay?: (event: {
    catId: string;
    seatId: SeatId;
  }) => void;
};

type CatCarePhase =
  | "approaching"
  | "waiting"
  | "using"
  | "recovering"
  | "returning";

type CatCareRuntime = {
  intent: CatCareIntent;
  phase: CatCarePhase;
  timer: number;
  insideFacility: boolean;
  facilityIndex: number | null;
};

type CareFacilityState = {
  occupants: Array<string | null>;
  queue: string[];
};

type CollectibleShell = {
  id: string;
  group: THREE.Group;
  proxy: THREE.Object3D;
  ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  sparkles: Array<{
    star: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
    halo: THREE.Sprite<THREE.SpriteMaterial>;
    baseScale: number;
    haloBaseScale: number;
    phase: number;
    baseY: number;
    spin: number;
  }>;
  baseY: number;
  baseScale: number;
  baseRotationY: number;
  phase: number;
  collecting: boolean;
  elapsed: number;
};

const DEFAULT_SEAT_VIEW: SeatView = {
  seatId: "seat-1",
  catId: "demo-cat",
  agentName: "코치 모모",
  location: "general",
  status: "idle",
  statusLabel: "대기 중",
  blocked: false,
  hasUnreadReply: false,
  hunger: 0,
  toilet: 0,
  happiness: 30,
  level: 1,
};

const TENT_WORKSTATION_POSITION = new THREE.Vector3(-2.05, 0, -3.65);
const ROUND_LAPTOP_STATION_POSITION = new THREE.Vector3(-2.2, 0, -0.42);
const FOLDING_LAPTOP_STATION_POSITION = new THREE.Vector3(2.18, 0, -0.18);
const LOW_MONITOR_STATION_POSITION = new THREE.Vector3(2.12, 0, 3.42);
const LOW_MONITOR_STATION_ROTATION_Y = -0.06;
const LOW_MONITOR_SCREEN_LOCAL_POSITION = new THREE.Vector3(
  0.048,
  0.853,
  -0.481,
);
const LOW_MONITOR_SCREEN_SIZE = new THREE.Vector2(0.71, 0.465);
const LOW_MONITOR_KEYCAP_START_X = -0.23;
const LOW_MONITOR_KEYCAP_SPACING = 0.2;
const LOW_MONITOR_KEYCAP_Y = 0.579;
const LOW_MONITOR_KEYCAP_Z = -0.17;
const LOW_MONITOR_KNEADING_LOCAL_TARGET = new THREE.Vector3(
  0.08,
  LOW_MONITOR_KEYCAP_Y,
  LOW_MONITOR_KEYCAP_Z,
);
type WorkstationInteractionLayout = {
  seatId: SeatId;
  stationPosition: THREE.Vector3;
  stationRotationY: number;
  screenPosition: THREE.Vector3;
  screenSize: THREE.Vector2;
  screenRotationX: number;
  animatedKeycaps: boolean;
};

type MonitorScreenCalibrationRuntime = {
  setEnabled: (enabled: boolean) => void;
  selectSeat: (seatId: SeatId) => void;
  nudgeSelected: (deltaX: number, deltaY: number) => void;
  nudgeDepthSelected: (deltaZ: number) => void;
  resizeSelected: (deltaWidth: number, deltaHeight: number) => void;
  scaleSelected: (deltaRatio: number) => void;
  tiltSelected: (radians: number) => void;
  resetSelected: () => void;
  saveLayout: () => void;
};

type MonitorScreenCalibrationMetrics = WorkstationScreenPose & {
  rotationDegrees: number;
};

// Each workstation model is a single baked mesh, so the live work display is
// mounted as a small independent plane directly over that model's screen.
// Positions are in the normalized workstation group's local coordinates.
/* 화면 위치·크기는 관리자 보정 도구(7 → 화면)에서 맞춘 값을 그대로 옮겨 적은 것이다.
   보정은 브라우저 localStorage 에만 남아 기기를 옮기면 사라진다 — 확정된 값은
   여기에 못 박아 두어야 모두에게 같은 화면이 나온다. (2026-08-06 보정본) */
const WORKSTATION_INTERACTION_LAYOUTS: Record<
  SeatId,
  WorkstationInteractionLayout
> = {
  "seat-1": {
    seatId: "seat-1",
    stationPosition: LOW_MONITOR_STATION_POSITION,
    stationRotationY: LOW_MONITOR_STATION_ROTATION_Y,
    screenPosition: LOW_MONITOR_SCREEN_LOCAL_POSITION,
    screenSize: LOW_MONITOR_SCREEN_SIZE,
    screenRotationX: 0,
    animatedKeycaps: true,
  },
  "seat-2": {
    seatId: "seat-2",
    stationPosition: TENT_WORKSTATION_POSITION,
    stationRotationY: 0.08,
    screenPosition: new THREE.Vector3(-0.035, 0.66, -0.078),
    screenSize: new THREE.Vector2(0.615, 0.37),
    screenRotationX: 0,
    animatedKeycaps: false,
  },
  "seat-3": {
    seatId: "seat-3",
    stationPosition: ROUND_LAPTOP_STATION_POSITION,
    stationRotationY: 0.08,
    screenPosition: new THREE.Vector3(-0.075, 0.747, -0.755),
    // This laptop has a visibly wider baked bezel than the other three
    // workstations. Fill a little more of its recessed display so the
    // remaining frame reads at the same screen-space thickness.
    screenSize: new THREE.Vector2(0.6846, 0.5025),
    screenRotationX: -0.2,
    animatedKeycaps: false,
  },
  "seat-4": {
    seatId: "seat-4",
    stationPosition: FOLDING_LAPTOP_STATION_POSITION,
    stationRotationY: -0.12,
    screenPosition: new THREE.Vector3(-0.477, 0.86, -0.46),
    screenSize: new THREE.Vector2(0.586, 0.3794),
    screenRotationX: -0.32,
    animatedKeycaps: false,
  },
};
const MONITOR_SCREEN_SIZE_LIMITS = {
  minWidth: 0.12,
  maxWidth: 1.3,
  minHeight: 0.08,
  maxHeight: 1,
};
const MONITOR_SCREEN_POSITION_LIMITS = {
  minX: -1.5,
  maxX: 1.5,
  minY: 0.05,
  maxY: 1.8,
  minZ: -1.5,
  maxZ: 0.5,
};
const CAMPING_SUPPLY_CLUSTER_POSITION = new THREE.Vector3(-2.72, 0, 3.42);
const CAMPING_LANTERN_POSITION = new THREE.Vector3(-3.42, 0, -1.82);
const CODING_DESK_TARGET = new THREE.Vector3(2.12, 0, 4.12);
const DESK_KNEADING_EXIT_POSITION = new THREE.Vector3(2.12, 0, 4.62);
const WORLD_TARGETS: Record<AgentWorldLocation, THREE.Vector3> = {
  entrance: new THREE.Vector3(-1.65, 0, 5.05),
  general: new THREE.Vector3(-2.08, 0, -2.82),
  coding: CODING_DESK_TARGET,
  design: new THREE.Vector3(-2.3, 0, 0.34),
  // 4번 자리(접이식 노트북)와 같은 자리다 — SEAT_WORLD_POSITIONS["seat-4"] 와 함께 옮긴다.
  music: new THREE.Vector3(1.78, 0, 0.38),
  queue: new THREE.Vector3(-0.25, 0, 2.45),
  office: new THREE.Vector3(-2.08, 0, -2.82),
};

const LOCATION_LABELS: Record<AgentWorldLocation, string> = {
  entrance: "입구",
  general: "General",
  coding: "Coding Desk",
  design: "Design",
  music: "Music",
  queue: "보고 대기열",
  office: "Personal Office",
};

const ILLUSTRATION_OUTLINE_COLOR = new THREE.Color(0x735b4f);
/** 색을 건드리지 않는 tint. 소품은 저마다 보정값이 있지만 고양이는 원본 그대로 쓴다. */
const ILLUSTRATION_NEUTRAL_TINT = new THREE.Color(0xffffff);
const ILLUSTRATION_OUTLINE_THICKNESS = 0.0038;
const ILLUSTRATION_OUTLINE_ALPHA = 0.72;
const FAR_OCEAN_STYLE_COLOR = 0x77cbbd;
const CHARACTER_HEIGHT = 0.86;
const DEFAULT_CHARACTER_YAW = 0.6;
const WORLD_INTERACTION_LIMIT_RATIO = 0.2;
const WORLD_YAW_LIMIT = Math.PI * WORLD_INTERACTION_LIMIT_RATIO;
const WORLD_ZOOM_MIN = 1 - WORLD_INTERACTION_LIMIT_RATIO;
const WORLD_ZOOM_MAX = 1 + WORLD_INTERACTION_LIMIT_RATIO;
const AMBIENT_MOVE_SPEED = 0.46;
const TASK_MOVE_SPEED = 1.35;
const AMBIENT_ARRIVAL_DISTANCE = 0.045;
const TASK_ARRIVAL_DISTANCE = 0.025;
const CARE_ARRIVAL_DISTANCE = 0.075;
const CARE_MOVE_SPEED = 0.62;
const CARE_EATING_TURN_SPEED = 14;
// The visible character is wider than its root point. Start turning before
// the final separation pass has to push overlapping meshes apart.
const CAT_MIN_SEPARATION = 0.62;
const CAT_AVOIDANCE_LOOK_AHEAD = 1.24;
const CAT_WANDER_RESERVATION_DISTANCE = 0.96;
const CAT_CROWD_REDIRECT_DISTANCE = 0.76;
const CAT_CROWD_REDIRECT_COOLDOWN = 2.4;
const CAT_AVOIDANCE_HOLD_MIN_SECONDS = 0.9;
const CAT_AVOIDANCE_HOLD_MAX_SECONDS = 1.45;
const CAT_AVOIDANCE_YIELD_MIN_SECONDS = 0.58;
const CAT_AVOIDANCE_YIELD_MAX_SECONDS = 1.08;
const CAT_SEPARATION_CORRECTION_SPEED = 0.12;
const SEAT_WORK_VISUAL_LIFTS: Record<SeatId, number> = {
  "seat-1": 0,
  "seat-2": 0.07,
  "seat-3": 0.08,
  "seat-4": 0.13,
};
const LASER_CHASE_DURATION_SECONDS = 20;
const LASER_CHASE_MOVE_SPEED = 0.88;
const FOOD_USE_SECONDS = 5.2;
const TOILET_USE_SECONDS = 5.8;
const CARE_RECOVERY_SECONDS = 1.4;
const EMPTY_BOWL_RETRY_SECONDS = 24;
const LITTER_FULL_RETRY_SECONDS = 30;
const DESK_KNEADING_ANIMATION_KEY = "desk-knead";
const DESK_KNEADING_ANIMATION_SUFFIX = "|Caress_sitting";
const DESK_CONTACT_MARGIN = 0.2;
const DESK_KEYCAP_PRESS_DEPTH = 0.052;
const DESK_KEYCAP_PRESS_HZ = 1.05;
const MONITOR_CODE_FRAME_RATE = 8;
const CAT_ANIMATIONS_URL =
  "/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Animations_IP.fbx";
const PALM_TREE_MODEL_URL =
  "/models/palm-tree-meshy6-web-v1.glb";
const TENT_WORKSTATION_MODEL_URL =
  "/models/camping-style-hybrid-v1/tent-workstation-smooth-cartoon-v1.glb?rev=4";
const ROUND_LAPTOP_STATION_MODEL_URL =
  "/models/camping-style-hybrid-v1/round-laptop-workstation-smooth-cartoon-v1.glb?rev=4";
const FOLDING_LAPTOP_STATION_MODEL_URL =
  "/models/camping-style-hybrid-v1/folding-laptop-radio-workstation-smooth-cartoon-v1.glb?rev=5";
const LOW_MONITOR_STATION_MODEL_URL =
  "/models/camping-style-hybrid-v1/low-monitor-cat-keycap-workstation-smooth-cartoon-v1.glb?rev=2";
const DEFAULT_WORLD_RENDER_SCALE = 4;
const CAMPING_SUPPLIES_MODEL_URL =
  "/models/camping-style-hybrid-v1/camping-supplies-cluster-smooth-cartoon-v1.glb?rev=2";
const CAMPING_LANTERN_MODEL_URL =
  "/models/camping-style-locked-v1/camping-lantern-meshy6-web-v1.glb";
const TROPICAL_FOLIAGE_MODEL_URL =
  "/models/camping-style-locked-v1/tropical-foliage-flowers-cluster-meshy6-web-v1.glb";
const SHORELINE_DECOR_MODEL_URL =
  "/models/camping-style-locked-v1/shoreline-rock-starfish-shell-cluster-meshy6-web-v1.glb";
const COLLECTIBLE_SHELL_MODEL_URL =
  "/models/collectible-shell-v2/plump-closed-scallop-meshy6-v1.glb";
const COLLECTIBLE_SHELL_SOFT_SEAM_TEXTURE_URL =
  "/models/collectible-shell-v2/plump-closed-scallop-meshy6-v1_base_color-soft-seam-v2.png";
const FOOD_BOWL_EMPTY_MODEL_URL =
  "/models/cat-care-v1/cat-food-bowl-empty-meshy6-web-v1.glb";
const FOOD_BOWL_FULL_MODEL_URL =
  "/models/cat-care-v1/cat-food-bowl-full-meshy6-web-v1.glb";
const CAT_EXERCISE_WHEEL_MODEL_URL =
  "/models/cat-exercise-wheel-v1/cat-exercise-wheel-meshy6-web-v1.glb";
// Keep both care facilities together below the upper-right palm. The bowl is
// offset to the left so its coffee-cup-sized silhouette remains unobstructed.
const FOOD_BOWL_POSITION = new THREE.Vector3(2.18, 0, -2.65);
const FOOD_BOWL_APPROACH_POSITION = new THREE.Vector3(2.12, 0, -2.08);
const FOOD_BOWL_WAIT_POSITION = new THREE.Vector3(1.56, 0, -1.75);
// Meshy props are normalized to one world-unit tall. The coding-desk coffee
// cup is about 0.15 world units tall after the desk scale is applied.
const FOOD_BOWL_RENDER_HEIGHT = 0.15;
const LITTER_BOX_POSITION = new THREE.Vector3(3.05, 0, -2.58);
const LITTER_BOX_APPROACH_POSITION = new THREE.Vector3(2.96, 0, -1.92);
const LITTER_BOX_USE_POSITION = new THREE.Vector3(3.05, 0, -2.5);
const LITTER_BOX_WAIT_POSITION = new THREE.Vector3(2.54, 0, -1.52);
const CAT_EXERCISE_WHEEL_POSITION = new THREE.Vector3(0, 0, 3.72);
const CAT_EXERCISE_WHEEL_ROTATION_Y = -0.28;
const CAT_EXERCISE_WHEEL_USE_POSITION = new THREE.Vector3(0.03, 0, 3.57);
const CAT_EXERCISE_WHEEL_EXIT_POSITION = new THREE.Vector3(-0.45, 0, 2.55);
const CAT_EXERCISE_WHEEL_CAT_LIFT = 0.38;
const CAT_EXERCISE_WHEEL_RUN_SECONDS = 12;
const CAT_EXERCISE_WHEEL_FIRST_VISIT_SECONDS = 10;
const CAT_EXERCISE_WHEEL_REVISIT_MIN_SECONDS = 90;
const CAT_EXERCISE_WHEEL_REVISIT_MAX_SECONDS = 150;
// Keep the illustrated front face and the right hinge cap visible, matching
// plump-closed-scallop-ref-v1.png. Math.PI exposed the generated back plate.
const COLLECTIBLE_SHELL_REFERENCE_YAW = THREE.MathUtils.degToRad(-10);
const DESK_KEYCAP_TEXTURE_URLS = [
  "/art/desk-keycap-1-top-flat-v1.png",
  "/art/desk-keycap-2-top-flat-v1.png",
  "/art/desk-keycap-3-top-flat-v1.png",
  "/art/desk-keycap-4-top-flat-v1.png",
];
const AUTONOMOUS_STATUSES = new Set(["idle", "completed", "failed"]);
const SEAT_WORLD_POSITIONS: Record<SeatId, THREE.Vector3> = {
  // 자리 1은 우측 하단 모니터, 자리 2는 좌측 상단 텐트다.
  // 두 값을 뒤집으면 두 번째 고양이가 텐트 대신 1번 자리로 향한다.
  "seat-1": new THREE.Vector3(2.12, 0, 4.12),
  "seat-2": new THREE.Vector3(-2.08, 0, -2.82),
  "seat-3": new THREE.Vector3(-2.3, 0, 0.34),
  /* 고양이는 모델 원점이 아니라 각 화면 중심과 의자·쿠션의 앞쪽 접촉점에 맞춘다.
     작업 중에는 자기 자리 obstacle 을 제외하므로 테이블 경계 안쪽까지 접근할 수 있다. */
  "seat-4": new THREE.Vector3(1.78, 0, 0.38),
};

// 이름표와 차단 비콘은 씬의 어떤 오브젝트·외곽선보다 위에 그린다.
// OutlineEffect 는 본편을 그린 뒤 autoClear:false 로 외곽선을 한 번 더 덧그린다.
// 즉 외곽선은 이름표가 이미 그려진 화면 위에 나중에 칠해지므로, 같은 패스 안의
// renderOrder·depthTest 를 아무리 올려도 외곽선이 이름표를 갉아먹는다.
// 그래서 마커만 전용 레이어로 빼서, 외곽선 패스가 끝난 뒤 깊이를 비우고 따로 그린다.
const WORLD_LAYER = 0;
const MARKER_OVERLAY_LAYER = 1;
const MARKER_LABEL_RENDER_ORDER = 240;
const MARKER_BEACON_RENDER_ORDER = 241;

// 타건 중 이름표는 고양이의 로컬 오프셋이 아니라 실제 모니터의 월드 좌표에 고정한다.
// 모니터 회전과 화면 크기, 이름표 높이까지 반영해 화면 상단과 일정한 간격을 유지한다.
const MARKER_LABEL_LOCAL_Y = 1.17;
const MARKER_LABEL_HEIGHT = 0.31;
const MONITOR_MARKER_GAP = 0.075;
const WORKSTATION_LOCAL_UP = new THREE.Vector3(0, 1, 0);

function workstationScreenWorldPosition(
  layout: WorkstationInteractionLayout,
) {
  return layout.screenPosition
    .clone()
    .applyAxisAngle(WORKSTATION_LOCAL_UP, layout.stationRotationY)
    .add(layout.stationPosition);
}

function workstationWorkingMarkerWorldPosition(
  layout: WorkstationInteractionLayout,
) {
  const screenCenter = workstationScreenWorldPosition(layout);
  const screenTopOffset = new THREE.Vector3(
    0,
    layout.screenSize.y / 2,
    0,
  )
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), layout.screenRotationX)
    .applyAxisAngle(WORKSTATION_LOCAL_UP, layout.stationRotationY);
  return screenCenter.add(screenTopOffset).add(
    new THREE.Vector3(
      0,
      MONITOR_MARKER_GAP + MARKER_LABEL_HEIGHT / 2 - MARKER_LABEL_LOCAL_Y,
      0,
    ),
  );
}

const LOW_MONITOR_WORKING_MARKER_WORLD_POSITION =
  workstationWorkingMarkerWorldPosition(
    WORKSTATION_INTERACTION_LAYOUTS["seat-1"],
  );

const SEAT_WORKING_MARKER_WORLD_POSITIONS: Record<SeatId, THREE.Vector3> = {
  "seat-1": LOW_MONITOR_WORKING_MARKER_WORLD_POSITION,
  "seat-2": workstationWorkingMarkerWorldPosition(
    WORKSTATION_INTERACTION_LAYOUTS["seat-2"],
  ),
  "seat-3": workstationWorkingMarkerWorldPosition(
    WORKSTATION_INTERACTION_LAYOUTS["seat-3"],
  ),
  "seat-4": workstationWorkingMarkerWorldPosition(
    WORKSTATION_INTERACTION_LAYOUTS["seat-4"],
  ),
};
const MARKER_MOVE_EASE = 7.5;

function markerAnchorFor(
  root: THREE.Object3D,
  seatId: SeatId | "queue",
  working: boolean,
  target: THREE.Vector3,
  workingPositions = SEAT_WORKING_MARKER_WORLD_POSITIONS,
) {
  if (!working || seatId === "queue") return target.set(0, 0, 0);
  root.updateWorldMatrix(true, false);
  return root.worldToLocal(
    target.copy(workingPositions[seatId]),
  );
}

function typingMonitorAnchorFor(
  root: THREE.Object3D,
  isTyping: boolean,
  target: THREE.Vector3,
  workingPosition = LOW_MONITOR_WORKING_MARKER_WORLD_POSITION,
) {
  if (!isTyping) return target.set(0, 0, 0);
  root.updateWorldMatrix(true, false);
  return root.worldToLocal(target.copy(workingPosition));
}

type AmbientAnimation = {
  key: string;
  suffix: string;
  label: string;
  minSeconds: number;
  maxSeconds: number;
  timeScale: number;
};

const AMBIENT_ANIMATIONS: AmbientAnimation[] = [
  {
    key: "idle-look",
    suffix: "|Idle_1",
    label: "주변을 구경하는 중",
    minSeconds: 4.5,
    maxSeconds: 7.5,
    timeScale: 0.82,
  },
  {
    key: "idle-relax",
    suffix: "|Idle_2",
    label: "느긋하게 쉬는 중",
    minSeconds: 4,
    maxSeconds: 7,
    timeScale: 0.78,
  },
  {
    key: "sit",
    suffix: "|Sitting_Idle",
    label: "앉아서 쉬는 중",
    minSeconds: 5,
    maxSeconds: 8,
    timeScale: 0.8,
  },
  {
    key: "sit-play",
    suffix: "|Sitting_idle_2",
    label: "앉아서 노는 중",
    minSeconds: 4.5,
    maxSeconds: 7,
    timeScale: 0.9,
  },
  {
    key: "sit-groom",
    suffix: "|Sitting_idle_3",
    label: "털을 정리하는 중",
    minSeconds: 5,
    maxSeconds: 8,
    timeScale: 0.82,
  },
  {
    key: "lie",
    suffix: "|Lie_Idle",
    label: "모래 위에 누워 쉬는 중",
    minSeconds: 6,
    maxSeconds: 10,
    timeScale: 0.72,
  },
  {
    key: "eat-drink",
    suffix: "|EatDrink",
    label: "간식을 먹고 우유를 마시는 중",
    minSeconds: 5,
    maxSeconds: 8,
    timeScale: 0.8,
  },
];

const AMBIENT_WANDER_POINTS = [
  new THREE.Vector3(-0.45, 0, -2.45),
  new THREE.Vector3(0.35, 0, -3.55),
  new THREE.Vector3(3.7, 0, -2.45),
  new THREE.Vector3(0.15, 0, -0.2),
  new THREE.Vector3(0.35, 0, 2.15),
  new THREE.Vector3(-1.45, 0, 1.9),
  new THREE.Vector3(-3.25, 0, 1.85),
];

type SceneObstacle = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type EditableWorldObject = {
  id: string;
  label: string;
  object: THREE.Object3D;
  initialPose: WorldObjectPose;
  defaultPose: WorldObjectPose;
  obstacle: SceneObstacle | null;
  initialObstacle: SceneObstacle | null;
  onTransform?: (entry: EditableWorldObject) => void;
};

type WorldLayoutEditorRuntime = {
  setEnabled: (enabled: boolean) => void;
  rotateSelected: (radians: number) => void;
  resetSelected: () => void;
  saveLayout: () => void;
  addCareFacility: (intent: CatCareIntent) => boolean;
};

const WORLD_OBJECT_ROTATION_STEP = THREE.MathUtils.degToRad(15);
const WORLD_OBJECT_POSITION_LIMITS = {
  minX: -4.35,
  maxX: 4.35,
  minZ: -5.65,
  maxZ: 5.85,
};

const DESK_POSITION = LOW_MONITOR_STATION_POSITION;
const DESK_MODEL_SCALE = 0.82 / 1.5;
const DESK_ROTATION_Y = LOW_MONITOR_STATION_ROTATION_Y;
const DESK_OBSTACLE: SceneObstacle = {
  id: "low-monitor-workstation",
  minX: 1.08,
  maxX: 3.18,
  minZ: 2.65,
  maxZ: 4.38,
};

type IslandPropPlacement = {
  id: string;
  position: THREE.Vector3;
  rotationY: number;
  scale: number;
};

type MeshyWorkstationPlacement = {
  id: string;
  url: string;
  position: THREE.Vector3;
  rotationY: number;
  height: number;
  shadowRadius: number;
  obstacle: SceneObstacle;
};

type MeshyDecorationPlacement = {
  id: string;
  position: THREE.Vector3;
  rotationY: number;
  height: number;
  shadowRadius: number;
  obstacle?: SceneObstacle;
};

type MeshyDecorationAsset = {
  id: string;
  url: string;
  placements: MeshyDecorationPlacement[];
};

type PalmLeafSwayTarget = {
  mesh: THREE.Mesh;
  phase: number;
};

const PALM_LEAF_SWAY_MORPH_VERSION = "palm-leaf-sway-morph-v2";

const PALM_TREE_PLACEMENTS: IslandPropPlacement[] = [
  {
    id: "palm-tree-northwest",
    position: new THREE.Vector3(-3.55, 0, -4.85),
    rotationY: 0.78,
    scale: 1.12,
  },
  {
    id: "palm-tree-northeast",
    position: new THREE.Vector3(3.55, 0, -4.55),
    rotationY: -0.78,
    scale: 1.12,
  },
  {
    id: "palm-tree-southwest",
    position: new THREE.Vector3(-3.75, 0, 3.95),
    rotationY: 0.78,
    scale: 0.96,
  },
];

const ROCK_CLUSTER_PLACEMENTS: IslandPropPlacement[] = [
  {
    id: "shore-rocks-west",
    position: new THREE.Vector3(-3.85, 0, -0.8),
    rotationY: 0.2,
    scale: 0.92,
  },
  {
    id: "shore-rocks-east",
    position: new THREE.Vector3(3.82, 0, 1.65),
    rotationY: -0.35,
    scale: 0.84,
  },
  {
    id: "shore-rocks-south",
    position: new THREE.Vector3(3.25, 0, 5.45),
    rotationY: 0.52,
    scale: 0.78,
  },
  {
    id: "shore-rocks-north",
    position: new THREE.Vector3(-2.7, 0, -5.7),
    rotationY: -0.16,
    scale: 0.72,
  },
];

const PALM_TREE_OBSTACLES: SceneObstacle[] = PALM_TREE_PLACEMENTS.map(
  ({ id, position, scale }) => {
    const radius = 0.42 * scale;
    return {
      id,
      minX: position.x - radius,
      maxX: position.x + radius,
      minZ: position.z - radius,
      maxZ: position.z + radius,
    };
  },
);
const ROCK_CLUSTER_OBSTACLES: SceneObstacle[] =
  ROCK_CLUSTER_PLACEMENTS.map(({ id, position, scale }) => {
    const radius = 0.5 * scale;
    return {
      id,
      minX: position.x - radius,
      maxX: position.x + radius,
      minZ: position.z - radius,
      maxZ: position.z + radius,
    };
  });
const BEACH_OFFICE_HUT_OBSTACLE: SceneObstacle = {
  id: "beach-office-hut",
  minX: 0.55,
  maxX: 4.35,
  minZ: 3.72,
  maxZ: 6.55,
};
const TENT_WORKSTATION_OBSTACLE: SceneObstacle = {
  id: "tent-workstation",
  minX: -3.18,
  maxX: -0.92,
  minZ: -4.48,
  maxZ: -2.72,
};
const ROUND_LAPTOP_STATION_OBSTACLE: SceneObstacle = {
  id: "round-laptop-workstation",
  minX: -3.18,
  maxX: -1.2,
  minZ: -1.32,
  maxZ: 0.48,
};
const FOLDING_LAPTOP_STATION_OBSTACLE: SceneObstacle = {
  id: "folding-laptop-radio-workstation",
  minX: 1.02,
  maxX: 3.32,
  minZ: -1.12,
  maxZ: 0.88,
};
const CAMPING_SUPPLY_CLUSTER_OBSTACLE: SceneObstacle = {
  id: "camping-supply-cluster",
  minX: -3.48,
  maxX: -1.84,
  minZ: 2.82,
  maxZ: 4.08,
};
const CAMPING_LANTERN_OBSTACLE: SceneObstacle = {
  id: "camping-lantern",
  minX: -3.76,
  maxX: -3.08,
  minZ: -2.16,
  maxZ: -1.48,
};
const FOOD_BOWL_OBSTACLE: SceneObstacle = {
  id: "cat-food-bowl",
  minX: FOOD_BOWL_POSITION.x - 0.17,
  maxX: FOOD_BOWL_POSITION.x + 0.17,
  minZ: FOOD_BOWL_POSITION.z - 0.15,
  maxZ: FOOD_BOWL_POSITION.z + 0.15,
};
const LITTER_BOX_OBSTACLE: SceneObstacle = {
  id: "covered-cat-litter-box",
  minX: LITTER_BOX_POSITION.x - 0.55,
  maxX: LITTER_BOX_POSITION.x + 0.55,
  minZ: LITTER_BOX_POSITION.z - 0.5,
  maxZ: LITTER_BOX_POSITION.z + 0.5,
};
const CAT_EXERCISE_WHEEL_OBSTACLE: SceneObstacle = {
  id: "cat-exercise-wheel",
  minX: CAT_EXERCISE_WHEEL_POSITION.x - 1.17,
  maxX: CAT_EXERCISE_WHEEL_POSITION.x + 1.17,
  minZ: CAT_EXERCISE_WHEEL_POSITION.z - 0.69,
  maxZ: CAT_EXERCISE_WHEEL_POSITION.z + 0.69,
};
const MESHY_WORKSTATION_PLACEMENTS: MeshyWorkstationPlacement[] = [
  {
    id: TENT_WORKSTATION_OBSTACLE.id,
    url: TENT_WORKSTATION_MODEL_URL,
    position: TENT_WORKSTATION_POSITION,
    rotationY: 0.08,
    height: 1.82,
    shadowRadius: 0.95,
    obstacle: TENT_WORKSTATION_OBSTACLE,
  },
  {
    id: ROUND_LAPTOP_STATION_OBSTACLE.id,
    url: ROUND_LAPTOP_STATION_MODEL_URL,
    position: ROUND_LAPTOP_STATION_POSITION,
    rotationY: 0.08,
    height: 1.04,
    shadowRadius: 0.82,
    obstacle: ROUND_LAPTOP_STATION_OBSTACLE,
  },
  {
    id: FOLDING_LAPTOP_STATION_OBSTACLE.id,
    url: FOLDING_LAPTOP_STATION_MODEL_URL,
    position: FOLDING_LAPTOP_STATION_POSITION,
    rotationY: -0.12,
    height: 1.08,
    shadowRadius: 0.95,
    obstacle: FOLDING_LAPTOP_STATION_OBSTACLE,
  },
  {
    id: DESK_OBSTACLE.id,
    url: LOW_MONITOR_STATION_MODEL_URL,
    position: LOW_MONITOR_STATION_POSITION,
    rotationY: LOW_MONITOR_STATION_ROTATION_Y,
    height: 1.12,
    shadowRadius: 0.88,
    obstacle: DESK_OBSTACLE,
  },
];
const WORKSTATION_PLACEMENT_SEATS: SeatId[] = [
  "seat-2",
  "seat-3",
  "seat-4",
  "seat-1",
];
const MESHY_DECORATION_ASSETS: MeshyDecorationAsset[] = [
  {
    id: "camping-supplies",
    url: CAMPING_SUPPLIES_MODEL_URL,
    placements: [
      {
        id: CAMPING_SUPPLY_CLUSTER_OBSTACLE.id,
        position: CAMPING_SUPPLY_CLUSTER_POSITION,
        rotationY: 0.12,
        height: 0.88,
        shadowRadius: 0.74,
        obstacle: CAMPING_SUPPLY_CLUSTER_OBSTACLE,
      },
    ],
  },
  {
    id: "tropical-foliage",
    url: TROPICAL_FOLIAGE_MODEL_URL,
    placements: [
      {
        id: "foliage-northwest",
        position: new THREE.Vector3(-3.35, 0, -3.1),
        rotationY: 0.28,
        height: 0.62,
        shadowRadius: 0.45,
      },
      {
        id: "foliage-northeast",
        position: new THREE.Vector3(3.25, 0, -3.2),
        rotationY: -0.48,
        height: 0.68,
        shadowRadius: 0.49,
      },
      {
        id: "foliage-southwest",
        position: new THREE.Vector3(-3.4, 0, 4.72),
        rotationY: 0.58,
        height: 0.58,
        shadowRadius: 0.42,
      },
      {
        id: "foliage-southeast",
        position: new THREE.Vector3(3.32, 0, 4.82),
        rotationY: -0.72,
        height: 0.58,
        shadowRadius: 0.42,
      },
    ],
  },
  {
    id: "shoreline-decoration",
    url: SHORELINE_DECOR_MODEL_URL,
    placements: [
      {
        id: "shoreline-decoration-southwest",
        position: new THREE.Vector3(-2.78, 0, 5.58),
        rotationY: 0.38,
        height: 0.52,
        shadowRadius: 0.48,
      },
      {
        id: "shoreline-decoration-southeast",
        position: new THREE.Vector3(2.82, 0, 5.52),
        rotationY: -0.42,
        height: 0.46,
        shadowRadius: 0.43,
      },
    ],
  },
  {
    id: "cat-exercise-wheel",
    url: CAT_EXERCISE_WHEEL_MODEL_URL,
    placements: [
      {
        id: CAT_EXERCISE_WHEEL_OBSTACLE.id,
        position: CAT_EXERCISE_WHEEL_POSITION,
        rotationY: CAT_EXERCISE_WHEEL_ROTATION_Y,
        height: 2.13,
        shadowRadius: 1.08,
        obstacle: CAT_EXERCISE_WHEEL_OBSTACLE,
      },
    ],
  },
];
const SCENE_OBSTACLES = [
  DESK_OBSTACLE,
  ...PALM_TREE_OBSTACLES,
  ...ROCK_CLUSTER_OBSTACLES,
  TENT_WORKSTATION_OBSTACLE,
  ROUND_LAPTOP_STATION_OBSTACLE,
  FOLDING_LAPTOP_STATION_OBSTACLE,
  CAMPING_SUPPLY_CLUSTER_OBSTACLE,
  FOOD_BOWL_OBSTACLE,
  LITTER_BOX_OBSTACLE,
  CAT_EXERCISE_WHEEL_OBSTACLE,
];
const WORKSTATION_OBSTACLES = new Set<SceneObstacle>([
  DESK_OBSTACLE,
  TENT_WORKSTATION_OBSTACLE,
  ROUND_LAPTOP_STATION_OBSTACLE,
  FOLDING_LAPTOP_STATION_OBSTACLE,
]);
const STATIC_SCENE_OBSTACLES = SCENE_OBSTACLES.filter(
  (obstacle) => !WORKSTATION_OBSTACLES.has(obstacle),
);

function getActiveWorkstationObstacles(activeSeatCount: number) {
  const activeSeatIds = new Set(
    WORKSTATION_PLACEMENT_SEATS.filter((seatId) => {
      const seatIndex = Number(seatId.slice(-1));
      return seatIndex <= activeSeatCount;
    }),
  );
  return MESHY_WORKSTATION_PLACEMENTS.filter((_, index) =>
    activeSeatIds.has(WORKSTATION_PLACEMENT_SEATS[index]),
  ).map((placement) => placement.obstacle);
}

function getActiveSceneObstacles(activeSeatCount: number) {
  return [
    ...STATIC_SCENE_OBSTACLES,
    ...getActiveWorkstationObstacles(activeSeatCount),
  ];
}
const OBSTACLE_WAYPOINT_MARGIN = 0.28;
const OBSTACLE_WAYPOINT_REACHED_DISTANCE = 0.055;
const OBSTACLE_ESCAPE_CLEARANCE = 0.065;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function lerpAngle(from: number, to: number, amount: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

function isInsideObstacle(
  point: THREE.Vector3,
  obstacle: SceneObstacle,
) {
  return (
    point.x > obstacle.minX &&
    point.x < obstacle.maxX &&
    point.z > obstacle.minZ &&
    point.z < obstacle.maxZ
  );
}

function isTouchingObstacle(
  point: THREE.Vector3,
  obstacle: SceneObstacle,
  margin: number,
) {
  return (
    point.x >= obstacle.minX - margin &&
    point.x <= obstacle.maxX + margin &&
    point.z >= obstacle.minZ - margin &&
    point.z <= obstacle.maxZ + margin
  );
}

function findAvoidancePath(
  start: THREE.Vector3,
  destination: THREE.Vector3,
  obstacles: SceneObstacle[],
  margin = OBSTACLE_WAYPOINT_MARGIN,
) {
  return findAvoidancePath2D(
    start,
    destination,
    obstacles,
    margin,
  ).map(
    (point: { x: number; z: number }) =>
      new THREE.Vector3(point.x, 0, point.z),
  );
}

function resolvePositionOutsideObstacles(
  position: THREE.Vector3,
  obstacles: SceneObstacle[],
  clearance = OBSTACLE_ESCAPE_CLEARANCE,
) {
  const resolved = resolvePointOutsideObstacles2D(
    position,
    obstacles,
    clearance,
  );
  position.set(resolved.x, position.y, resolved.z);
}

function disableOutline(material: THREE.Material) {
  material.userData.outlineParameters = { visible: false };
}

function createWorldAtmosphereBackdrop() {
  const uniforms = {
    atmosphereTime: { value: 0 },
    skyTopColor: { value: new THREE.Color(0x66c8d3) },
    skyHorizonColor: { value: new THREE.Color(0xf8e5b6) },
    distantSeaColor: { value: new THREE.Color(0x50b9c2) },
    sunlightColor: { value: new THREE.Color(0xffe28b) },
    moonlightColor: { value: new THREE.Color(0xc8ddff) },
    daylightAmount: { value: 1 },
    goldenAmount: { value: 0 },
    sunsetAmount: { value: 0 },
    nightAmount: { value: 0 },
    dawnAmount: { value: 0 },
    starAmount: { value: 0 },
    sunPosition: { value: new THREE.Vector2(0.38, 0.86) },
    moonPosition: { value: new THREE.Vector2(0.18, 0.82) },
    sunVisibility: { value: 1 },
    moonVisibility: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
varying vec2 atmosphereUv;

void main() {
  atmosphereUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`,
    fragmentShader: `
varying vec2 atmosphereUv;

uniform float atmosphereTime;
uniform vec3 skyTopColor;
uniform vec3 skyHorizonColor;
uniform vec3 distantSeaColor;
uniform vec3 sunlightColor;
uniform vec3 moonlightColor;
uniform float daylightAmount;
uniform float goldenAmount;
uniform float sunsetAmount;
uniform float nightAmount;
uniform float dawnAmount;
uniform float starAmount;
uniform vec2 sunPosition;
uniform vec2 moonPosition;
uniform float sunVisibility;
uniform float moonVisibility;

float atmosphereHash(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

float softEllipse(vec2 uv, vec2 center, vec2 radius) {
  float distanceToCenter = length((uv - center) / radius);
  return 1.0 - smoothstep(0.82, 1.06, distanceToCenter);
}

void main() {
  const float horizon = 0.715;
  vec2 uv = atmosphereUv;
  float skyHeight = smoothstep(horizon, 1.0, uv.y);
  vec3 skyColor = mix(skyHorizonColor, skyTopColor, pow(skyHeight, 0.72));
  float seaDepth = clamp((horizon - uv.y) / horizon, 0.0, 1.0);
  vec3 seaBottomColor = distantSeaColor * mix(0.78, 0.62, nightAmount);
  vec3 seaColor = mix(distantSeaColor * 1.05, seaBottomColor, seaDepth);
  vec3 color = uv.y >= horizon ? skyColor : seaColor;

  float horizonLine = 1.0 - smoothstep(0.0, 0.0035, abs(uv.y - horizon));
  color = mix(color, mix(vec3(1.0, 0.91, 0.72), moonlightColor, nightAmount), horizonLine * 0.58);

  float cloudBand = smoothstep(horizon + 0.03, horizon + 0.12, uv.y) *
    (1.0 - smoothstep(horizon + 0.2, horizon + 0.34, uv.y));
  float cloudShape =
    softEllipse(uv, vec2(0.13, horizon + 0.15), vec2(0.09, 0.025)) +
    softEllipse(uv, vec2(0.21, horizon + 0.16), vec2(0.075, 0.022)) +
    softEllipse(uv, vec2(0.76, horizon + 0.1), vec2(0.085, 0.023)) +
    softEllipse(uv, vec2(0.84, horizon + 0.115), vec2(0.06, 0.018));
  float cloudOpacity = clamp(cloudShape, 0.0, 1.0) * cloudBand * mix(0.32, 0.1, nightAmount);
  color = mix(color, mix(vec3(1.0, 0.97, 0.89), vec3(0.56, 0.61, 0.76), nightAmount), cloudOpacity);

  vec2 starGridUv = vec2(uv.x * 122.0, (uv.y - horizon) * 178.0);
  vec2 starCell = floor(starGridUv);
  vec2 starPoint = fract(starGridUv) - 0.5;
  float starSeed = atmosphereHash(starCell);
  float starCore = (1.0 - smoothstep(0.025, 0.11, length(starPoint))) * step(0.982, starSeed);
  float twinkle = 0.68 + 0.32 * sin(atmosphereTime * (0.7 + starSeed * 1.4) + starSeed * 19.0);
  float star = starCore * twinkle * starAmount * smoothstep(horizon + 0.025, horizon + 0.14, uv.y);
  color += mix(vec3(1.0, 0.92, 0.72), vec3(0.78, 0.88, 1.0), starSeed) * star;

  float sunDistance = length(uv - sunPosition);
  float sunDisc = 1.0 - smoothstep(0.032, 0.039, sunDistance);
  float sunGlow = exp(-sunDistance * 15.0) * 0.62;
  float visibleSunDisc = sunVisibility * sunDisc;
  color += sunlightColor * sunGlow * sunVisibility * (0.42 + goldenAmount * 0.5 + sunsetAmount * 0.45);
  color = mix(color, sunlightColor, visibleSunDisc * 0.96);

  float moonDistance = length(uv - moonPosition);
  float moonDisc = 1.0 - smoothstep(0.027, 0.034, moonDistance);
  float moonGlow = exp(-moonDistance * 18.0) * 0.46;
  float moonShade = smoothstep(0.005, 0.048, length(uv - (moonPosition + vec2(0.012, 0.005))));
  color += moonlightColor * moonGlow * moonVisibility * 0.62;
  color = mix(color, moonlightColor * mix(0.82, 1.0, moonShade), moonDisc * moonVisibility * 0.94);

  float leftIsland = softEllipse(uv, vec2(0.13, horizon + 0.003), vec2(0.12, 0.017));
  float rightIsland = softEllipse(uv, vec2(0.85, horizon + 0.001), vec2(0.085, 0.013));
  float distantIsland = clamp(leftIsland + rightIsland, 0.0, 1.0);
  color = mix(color, mix(vec3(0.26, 0.43, 0.45), vec3(0.18, 0.22, 0.34), nightAmount), distantIsland * 0.72);

  float belowHorizon = clamp((horizon - uv.y) / 0.7, 0.0, 1.0);
  float reflectionWidth = mix(0.018, 0.18, belowHorizon);
  float sunReflectionBand = 1.0 - smoothstep(reflectionWidth * 0.25, reflectionWidth, abs(uv.x - sunPosition.x));
  float sunReflectionStripe = 0.3 + 0.7 * max(0.0, sin(uv.y * 205.0 + sin(uv.x * 41.0) * 1.7));
  float sunReflection = sunReflectionBand * sunReflectionStripe * belowHorizon *
    sunVisibility * (0.08 * daylightAmount + 0.5 * goldenAmount + 0.9 * sunsetAmount);
  color += sunlightColor * sunReflection * 0.64;

  float moonReflectionBand = 1.0 - smoothstep(reflectionWidth * 0.2, reflectionWidth * 0.85, abs(uv.x - moonPosition.x));
  float moonReflectionStripe = 0.24 + 0.76 * max(0.0, sin(uv.y * 188.0 - sin(uv.x * 37.0)));
  float moonReflection = moonReflectionBand * moonReflectionStripe * belowHorizon * moonVisibility * nightAmount;
  color += moonlightColor * moonReflection * 0.34;

  float distantRipple = sin(uv.y * 255.0 + uv.x * 34.0 + atmosphereTime * 0.14) *
    sin(uv.y * 92.0 - uv.x * 57.0);
  color += mix(vec3(0.025, 0.045, 0.05), vec3(0.018, 0.03, 0.07), nightAmount) *
    distantRipple * belowHorizon * 0.32;

  float watercolorGrain = atmosphereHash(floor(gl_FragCoord.xy * 0.58)) - 0.5;
  color += watercolorGrain * mix(0.013, 0.008, nightAmount);
  color = mix(color, color * vec3(0.98, 0.96, 0.94), dawnAmount * 0.06);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
  disableOutline(material);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = "world-atmosphere-horizon-backdrop";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.layers.set(WORLD_LAYER);
  return { mesh, material, uniforms };
}

function createIllustratedMaterial(color: number) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
  });
  material.userData.renderingStyle = "illustrated-lit";
  material.userData.outlineParameters = {
    thickness: ILLUSTRATION_OUTLINE_THICKNESS,
    color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
    alpha: ILLUSTRATION_OUTLINE_ALPHA,
    visible: true,
  };
  return material;
}

function createUnlitIllustratedMaterial(color: number) {
  const material = new THREE.MeshBasicMaterial({
    color,
    toneMapped: true,
  });
  material.userData.renderingStyle = "illustrated-unlit";
  material.userData.outlineParameters = {
    thickness: ILLUSTRATION_OUTLINE_THICKNESS,
    color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
    alpha: ILLUSTRATION_OUTLINE_ALPHA,
    visible: true,
  };
  return material;
}

const WORKSTATION_DECOR_SLOT_BY_ID: Record<
  string,
  "deskTop" | "inputDevice" | "seatCushion" | "floorAmbient"
> = {
  "shell-planter": "deskTop",
  "enamel-mug": "deskTop",
  "mini-palm": "deskTop",
  "shell-frame": "deskTop",
  "pastel-keycaps": "inputDevice",
  "neon-keycaps": "inputDevice",
  "wood-cushion": "seatCushion",
  "quilt-cushion": "seatCushion",
  "camping-stool": "seatCushion",
  "round-rug": "floorAmbient",
  "mini-lantern": "floorAmbient",
  "shell-windchime": "floorAmbient",
};

function createWorkstationDecorVisual(itemId: string) {
  const group = new THREE.Group();
  group.name = `workstation-decor-${itemId}`;
  const cream = createIllustratedMaterial(0xf4ead6);
  const brown = createIllustratedMaterial(0x8e6753);
  const coral = createIllustratedMaterial(0xe79b87);
  const mint = createIllustratedMaterial(0x79aa87);
  const yellow = createIllustratedMaterial(0xf0c36c);
  const teal = createIllustratedMaterial(0x77bbb5);
  const lavender = createIllustratedMaterial(0xb59abc);
  const addRounded = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    radius = 0.025,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      material,
    );
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };

  if (itemId === "shell-planter" || itemId === "mini-palm") {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.18, 16),
      itemId === "mini-palm" ? yellow : coral,
    );
    pot.position.y = 0.09;
    group.add(pot);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.22, 10),
      brown,
    );
    stem.position.y = 0.27;
    group.add(stem);
    const leafCount = itemId === "mini-palm" ? 5 : 3;
    for (let index = 0; index < leafCount; index += 1) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 12, 8),
        mint,
      );
      leaf.scale.set(0.48, 0.18, 1);
      leaf.position.set(
        Math.cos((index / leafCount) * Math.PI * 2) * 0.075,
        0.37 + (index % 2) * 0.035,
        Math.sin((index / leafCount) * Math.PI * 2) * 0.075,
      );
      leaf.rotation.y = (index / leafCount) * Math.PI * 2;
      group.add(leaf);
    }
  } else if (itemId === "enamel-mug") {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.085, 0.2, 18),
      cream,
    );
    cup.position.y = 0.1;
    group.add(cup);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.018, 8, 18, Math.PI * 1.55),
      cream,
    );
    handle.position.set(0.095, 0.12, 0);
    handle.rotation.y = Math.PI / 2;
    group.add(handle);
  } else if (itemId === "shell-frame") {
    const frame = addRounded([0.27, 0.28, 0.055], [0, 0.2, 0], brown);
    frame.rotation.x = -0.13;
    const center = addRounded([0.2, 0.2, 0.02], [0, 0.2, -0.038], cream);
    center.rotation.x = -0.13;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 14, 10),
      coral,
    );
    shell.scale.set(1, 0.18, 0.75);
    shell.position.set(0, 0.2, -0.065);
    group.add(shell);
  } else if (
    itemId === "pastel-keycaps" ||
    itemId === "neon-keycaps"
  ) {
    addRounded([0.58, 0.07, 0.2], [0, 0.035, 0], cream, 0.025);
    const materials =
      itemId === "neon-keycaps"
        ? [teal, lavender, yellow, coral]
        : [coral, yellow, lavender, teal];
    [-0.21, -0.07, 0.07, 0.21].forEach((x, index) => {
      addRounded([0.11, 0.09, 0.14], [x, 0.105, 0], materials[index], 0.025);
    });
  } else if (itemId === "camping-stool") {
    addRounded([0.44, 0.1, 0.34], [0, 0.32, 0], coral, 0.05);
    [-0.16, 0.16].forEach((x) => {
      [-0.1, 0.1].forEach((z) => {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.035, 0.32, 10),
          brown,
        );
        leg.position.set(x, 0.16, z);
        leg.rotation.z = x < 0 ? -0.08 : 0.08;
        group.add(leg);
      });
    });
  } else if (itemId === "wood-cushion" || itemId === "quilt-cushion") {
    const cushion = addRounded(
      [0.46, 0.13, 0.4],
      [0, 0.12, 0],
      itemId === "quilt-cushion" ? teal : yellow,
      0.065,
    );
    if (itemId === "quilt-cushion") {
      const button = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 10, 8),
        cream,
      );
      button.scale.y = 0.35;
      button.position.y = 0.19;
      group.add(button);
    }
    cushion.rotation.y = 0.08;
  } else if (itemId === "round-rug") {
    const rug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.035, 36),
      teal,
    );
    rug.position.y = 0.018;
    rug.scale.z = 0.72;
    group.add(rug);
  } else if (itemId === "mini-lantern") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.1, 16),
      coral,
    );
    base.position.y = 0.05;
    group.add(base);
    const glowMaterial = createIllustratedMaterial(0xffd98a);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 10),
      glowMaterial,
    );
    glow.scale.y = 1.2;
    glow.position.y = 0.2;
    group.add(glow);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.06, 14),
      brown,
    );
    cap.position.y = 0.34;
    group.add(cap);
  } else if (itemId === "shell-windchime") {
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.15, 0.08, 16),
      yellow,
    );
    top.position.y = 0.48;
    group.add(top);
    [-0.12, 0, 0.12].forEach((x, index) => {
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.28, 6),
        brown,
      );
      cord.position.set(x, 0.32 - index * 0.025, 0);
      group.add(cord);
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 8),
        index % 2 ? cream : coral,
      );
      shell.scale.set(1, 0.25, 0.75);
      shell.position.set(x, 0.16 - index * 0.05, 0);
      group.add(shell);
    });
  }

  const slot = WORKSTATION_DECOR_SLOT_BY_ID[itemId] ?? "deskTop";
  if (slot === "deskTop") group.position.set(-0.5, 0.72, -0.05);
  if (slot === "inputDevice") group.position.set(0.12, 0.72, 0.18);
  if (slot === "seatCushion") group.position.set(0.1, 0.04, 0.83);
  if (slot === "floorAmbient") group.position.set(0.75, 0.015, 0.68);
  group.scale.setScalar(slot === "floorAmbient" ? 0.9 : 0.82);
  return group;
}

function createCoveredCatLitterBox() {
  const litterBox = new THREE.Group();
  litterBox.name = "covered-cat-litter-box";
  const bodyMaterial = createUnlitIllustratedMaterial(0xf6e6c8);
  const rimMaterial = createUnlitIllustratedMaterial(0xe6957e);
  const interiorMaterial = createUnlitIllustratedMaterial(0x79645c);
  const scoopMaterial = createUnlitIllustratedMaterial(0x83bfc0);

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(1.06, 0.32, 0.84, 4, 0.12),
    rimMaterial,
  );
  base.name = "covered-cat-litter-box-base";
  base.position.y = 0.16;
  litterBox.add(base);

  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.54,
      32,
      18,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    ),
    bodyMaterial,
  );
  hood.name = "covered-cat-litter-box-hood";
  hood.position.y = 0.31;
  hood.scale.set(1, 1.05, 0.78);
  litterBox.add(hood);

  const doorway = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 32),
    interiorMaterial,
  );
  doorway.name = "covered-cat-litter-box-door";
  doorway.position.set(0, 0.48, 0.425);
  doorway.scale.set(0.78, 1.12, 1);
  litterBox.add(doorway);

  const doorwayLower = new THREE.Mesh(
    new RoundedBoxGeometry(0.39, 0.31, 0.025, 3, 0.04),
    interiorMaterial,
  );
  doorwayLower.name = "covered-cat-litter-box-door-lower";
  doorwayLower.position.set(0, 0.34, 0.425);
  litterBox.add(doorwayLower);

  const entranceLip = new THREE.Mesh(
    new RoundedBoxGeometry(0.55, 0.09, 0.18, 3, 0.04),
    rimMaterial,
  );
  entranceLip.name = "covered-cat-litter-box-entrance-lip";
  entranceLip.position.set(0, 0.12, 0.48);
  litterBox.add(entranceLip);

  const scoopHandle = new THREE.Mesh(
    new RoundedBoxGeometry(0.1, 0.42, 0.08, 3, 0.035),
    scoopMaterial,
  );
  scoopHandle.name = "covered-cat-litter-box-scoop-handle";
  scoopHandle.position.set(0.54, 0.35, -0.04);
  scoopHandle.rotation.z = -0.22;
  litterBox.add(scoopHandle);

  const scoop = new THREE.Mesh(
    new RoundedBoxGeometry(0.24, 0.18, 0.07, 3, 0.045),
    scoopMaterial,
  );
  scoop.name = "covered-cat-litter-box-scoop";
  scoop.position.set(0.58, 0.13, -0.01);
  scoop.rotation.z = -0.22;
  litterBox.add(scoop);
  return litterBox;
}

function createFallbackFoodBowl(filled: boolean) {
  const bowl = new THREE.Group();
  const bodyMaterial = createUnlitIllustratedMaterial(0xf7ecd7);
  const rimMaterial = createUnlitIllustratedMaterial(0xe98f78);
  const foodMaterial = createUnlitIllustratedMaterial(0xb97942);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.52, 0.2, 32, 1, true),
    bodyMaterial,
  );
  body.position.y = 0.1;
  bowl.add(body);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.055, 12, 40),
    rimMaterial,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  bowl.add(rim);
  const basin = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 32),
    bodyMaterial,
  );
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = 0.11;
  bowl.add(basin);
  if (filled) {
    for (let index = 0; index < 13; index += 1) {
      const angle = (index / 13) * Math.PI * 2;
      const radius = 0.08 + (index % 3) * 0.09;
      const kibble = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 7),
        foodMaterial,
      );
      kibble.position.set(
        Math.cos(angle) * radius,
        0.16 + (index % 2) * 0.025,
        Math.sin(angle) * radius,
      );
      bowl.add(kibble);
    }
  }
  return bowl;
}

function disposeMaterial(material: THREE.Material) {
  const textureKeys = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "emissiveMap",
    "aoMap",
    "alphaMap",
  ] as const;

  for (const key of textureKeys) {
    const texture = (material as THREE.MeshStandardMaterial)[key];
    if (texture instanceof THREE.Texture) texture.dispose();
  }
  material.dispose();
}

type DeskTextureSet = {
  wood: THREE.Texture;
  watercolorGrain: THREE.Texture;
  groundArea: THREE.Texture;
  keycapTops: THREE.Texture[];
};

function createMonitorScreenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function drawMonitorScreen(
  texture: THREE.CanvasTexture,
  isCoding: boolean,
  elapsed: number,
) {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return;

  if (!isCoding) {
    const idleGradient = context.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    idleGradient.addColorStop(0, "#7f8586");
    idleGradient.addColorStop(1, "#a6a7a2");
    context.fillStyle = idleGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255, 255, 255, 0.22)";
    context.fillRect(0, canvas.height - 12, canvas.width, 12);
    context.fillStyle = "rgba(55, 65, 67, 0.5)";
    context.font = "600 20px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textAlign = "center";
    context.fillText("STANDBY", canvas.width / 2, canvas.height / 2 + 7);
    texture.needsUpdate = true;
    return;
  }

  context.fillStyle = "#111827";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1f2937";
  context.fillRect(0, 0, canvas.width, 38);
  ["#fb7185", "#fbbf24", "#4ade80"].forEach((color, index) => {
    context.beginPath();
    context.arc(18 + index * 20, 19, 6, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  });
  context.fillStyle = "#cbd5e1";
  context.font = "600 16px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textAlign = "left";
  context.fillText("kneading.ts", 86, 25);

  const codeLines = [
    'const paws = ["left", "right"];',
    "while (cat.isKneading) {",
    "  keyboard.press(paws[step % 2]);",
    '  monitor.render("coding");',
    "  await nap(120);",
    "}",
  ];
  const scrollStep = Math.floor(elapsed * 1.4) % codeLines.length;
  context.font = "500 17px ui-monospace, SFMono-Regular, Consolas, monospace";
  codeLines.forEach((_, lineIndex) => {
    const sourceIndex = (lineIndex + scrollStep) % codeLines.length;
    const y = 70 + lineIndex * 31;
    context.fillStyle = "#64748b";
    context.fillText(String(sourceIndex + 1).padStart(2, "0"), 18, y);
    context.fillStyle =
      sourceIndex === 0
        ? "#67e8f9"
        : sourceIndex === 1 || sourceIndex === 5
          ? "#c4b5fd"
          : sourceIndex === 3
            ? "#fda4af"
            : "#e2e8f0";
    context.fillText(codeLines[sourceIndex], 58, y);
  });

  const cursorVisible = Math.floor(elapsed * 4) % 2 === 0;
  if (cursorVisible) {
    context.fillStyle = "#fbbf24";
    context.fillRect(58, 250, 10, 20);
  }
  // Keep the status footer in the same dark family as the editor surface.
  // A saturated teal footer reads as the baked blue monitor texture leaking
  // around the live overlay, especially on the small perspective screens.
  context.fillStyle = "#111827";
  context.fillRect(0, canvas.height - 18, canvas.width, 18);
  context.fillStyle = "#94a3b8";
  context.font = "600 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.fillText("CATCODE   UTF-8   RUNNING", 14, canvas.height - 5);
  texture.needsUpdate = true;
}

// Retained as an offline procedural fallback for the external desk model.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createIllustratedDesk(textures: DeskTextureSet) {
  const deskGroup = new THREE.Group();
  deskGroup.name = DESK_OBSTACLE.id;
  deskGroup.position.copy(DESK_POSITION);
  deskGroup.rotation.y = DESK_ROTATION_Y;
  deskGroup.scale.setScalar(DESK_MODEL_SCALE);
  deskGroup.userData.isNavigationObstacle = true;
  deskGroup.userData.collisionBounds = {
    minX: DESK_OBSTACLE.minX,
    maxX: DESK_OBSTACLE.maxX,
    minZ: DESK_OBSTACLE.minZ,
    maxZ: DESK_OBSTACLE.maxZ,
  };

  const createToonMaterial = (color: number) =>
    new THREE.MeshToonMaterial({
      color,
      map: textures.watercolorGrain,
    });
  const woodMaterial = new THREE.MeshToonMaterial({
    color: 0xffffff,
    map: textures.wood,
  });
  const monitorFrameMaterial = createToonMaterial(0x756b68);
  const monitorScreenTexture = createMonitorScreenTexture();
  drawMonitorScreen(monitorScreenTexture, false, 0);
  const monitorScreenMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: monitorScreenTexture,
    toneMapped: false,
  });
  disableOutline(monitorScreenMaterial);
  const monitorStandMaterial = createToonMaterial(0xafa6a0);
  const keypadBaseMaterial = createToonMaterial(0xf2eadf);
  const mousePadMaterial = createToonMaterial(0x968883);
  const mouseMaterial = createToonMaterial(0xb8b7b6);
  const cupMaterial = createToonMaterial(0xe6aa72);
  const coffeeMaterial = createToonMaterial(0x704833);
  const keyMaterials = [
    createToonMaterial(0xf2a160),
    createToonMaterial(0x9d8c9f),
    createToonMaterial(0xef858a),
    createToonMaterial(0xf0c175),
  ];

  const addRoundedPart = (
    name: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    material: THREE.Material,
    radius: number,
  ) => {
    const part = new THREE.Mesh(
      new RoundedBoxGeometry(size.x, size.y, size.z, 3, radius),
      material,
    );
    part.name = name;
    part.position.copy(position);
    deskGroup.add(part);
    return part;
  };

  const groundAreaMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: textures.groundArea,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  disableOutline(groundAreaMaterial);
  const groundArea = new THREE.Mesh(
    new THREE.PlaneGeometry(4.7, 3.12),
    groundAreaMaterial,
  );
  groundArea.name = "coding-desk-ground-illustration";
  groundArea.rotation.x = -Math.PI / 2;
  groundArea.position.set(0, 0.012, 0.32);
  groundArea.renderOrder = 1;
  deskGroup.add(groundArea);

  const deskShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x6f5040,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  disableOutline(deskShadowMaterial);
  const deskShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 48),
    deskShadowMaterial,
  );
  deskShadow.name = "coding-desk-contact-shadow";
  deskShadow.rotation.x = -Math.PI / 2;
  deskShadow.position.set(0, 0.018, 0.05);
  deskShadow.scale.set(1.2, 0.62, 1);
  deskShadow.renderOrder = 2;
  deskGroup.add(deskShadow);

  addRoundedPart(
    "coding-desk-top",
    new THREE.Vector3(3.1, 0.14, 1.5),
    new THREE.Vector3(0, 0.82, 0),
    woodMaterial,
    0.06,
  );

  for (const x of [-1.34, 1.34]) {
    for (const z of [-0.58, 0.58]) {
      addRoundedPart(
        "coding-desk-leg",
        new THREE.Vector3(0.17, 0.76, 0.17),
        new THREE.Vector3(x, 0.41, z),
        woodMaterial,
        0.055,
      );
    }
  }

  addRoundedPart(
    "coding-desk-monitor-frame",
    new THREE.Vector3(1.18, 0.72, 0.11),
    new THREE.Vector3(-0.48, 1.4, -0.42),
    monitorFrameMaterial,
    0.055,
  );
  addRoundedPart(
    "coding-desk-monitor-screen",
    new THREE.Vector3(1.01, 0.56, 0.025),
    new THREE.Vector3(-0.48, 1.4, -0.35),
    monitorScreenMaterial,
    0.035,
  );
  addRoundedPart(
    "coding-desk-monitor-stem",
    new THREE.Vector3(0.15, 0.43, 0.13),
    new THREE.Vector3(-0.48, 1.08, -0.43),
    monitorStandMaterial,
    0.035,
  );
  addRoundedPart(
    "coding-desk-monitor-base",
    new THREE.Vector3(0.58, 0.08, 0.34),
    new THREE.Vector3(-0.48, 0.94, -0.39),
    monitorStandMaterial,
    0.035,
  );

  const keypadX = 0.12;
  addRoundedPart(
    "coding-desk-four-key-keypad-base",
    new THREE.Vector3(1.08, 0.08, 0.38),
    new THREE.Vector3(keypadX, 0.94, 0.18),
    keypadBaseMaterial,
    0.045,
  );
  keyMaterials.forEach((material, index) => {
    const keyX = keypadX - 0.375 + index * 0.25;
    addRoundedPart(
      `coding-desk-keycap-${index + 1}`,
      new THREE.Vector3(0.21, 0.11, 0.25),
      new THREE.Vector3(keyX, 1.035, 0.18),
      material,
      0.04,
    );

    for (const earOffset of [-0.052, 0.052]) {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.034, 0.065, 3),
        material,
      );
      ear.name = `coding-desk-keycap-${index + 1}-cat-ear`;
      ear.position.set(keyX + earOffset, 1.11, 0.14);
      ear.rotation.y = Math.PI / 2;
      deskGroup.add(ear);
    }

    const keycapTopMaterial = new THREE.MeshBasicMaterial({
      map: textures.keycapTops[index],
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    disableOutline(keycapTopMaterial);
    const keycapTop = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.205),
      keycapTopMaterial,
    );
    keycapTop.name = `coding-desk-keycap-${index + 1}-top-texture`;
    keycapTop.rotation.x = -Math.PI / 2;
    keycapTop.position.set(keyX, 1.093, 0.18);
    keycapTop.renderOrder = 4;
    deskGroup.add(keycapTop);
  });

  addRoundedPart(
    "coding-desk-mouse-pad",
    new THREE.Vector3(0.58, 0.025, 0.46),
    new THREE.Vector3(1.03, 0.905, 0.18),
    mousePadMaterial,
    0.06,
  );
  addRoundedPart(
    "coding-desk-mouse",
    new THREE.Vector3(0.2, 0.09, 0.27),
    new THREE.Vector3(1.03, 0.97, 0.18),
    mouseMaterial,
    0.075,
  );

  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.12, 0.27, 24),
    cupMaterial,
  );
  cup.name = "coding-desk-coffee-cup";
  cup.position.set(-1.02, 1.035, 0.27);
  deskGroup.add(cup);

  const cupHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.027, 8, 20),
    cupMaterial,
  );
  cupHandle.name = "coding-desk-coffee-cup-handle";
  cupHandle.position.set(-0.86, 1.04, 0.27);
  cupHandle.scale.y = 1.12;
  deskGroup.add(cupHandle);

  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.112, 24),
    coffeeMaterial,
  );
  coffee.name = "coding-desk-coffee";
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(-1.02, 1.174, 0.27);
  deskGroup.add(coffee);

  return { deskGroup, monitorScreenTexture };
}

function createCodingStationInteractionOverlay(
  layout: WorkstationInteractionLayout,
  keycapTopTextures: THREE.Texture[],
) {
  const interactionGroup = new THREE.Group();
  interactionGroup.name = `workstation-interaction-overlay-${layout.seatId}`;

  const monitorScreenTexture = createMonitorScreenTexture();
  drawMonitorScreen(monitorScreenTexture, false, 0);
  const monitorScreenMaterial = new THREE.MeshBasicMaterial({
    map: monitorScreenTexture,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disableOutline(monitorScreenMaterial);
  const monitorScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(
      layout.screenSize.x,
      layout.screenSize.y,
    ),
    monitorScreenMaterial,
  );
  monitorScreen.name = `workstation-live-code-screen-${layout.seatId}`;
  monitorScreen.position.copy(layout.screenPosition);
  monitorScreen.rotation.x = layout.screenRotationX;
  monitorScreen.renderOrder = 20;
  monitorScreen.visible = false;
  interactionGroup.add(monitorScreen);

  const keyColors = [0xf2a160, 0x9d8c9f, 0xef858a, 0xf0c175];
  const animatedDeskKeycaps = layout.animatedKeycaps
    ? keyColors.map((color, index) => {
    const keycapName = `coding-desk-keycap-${index + 1}`;
    const keycapMaterial = new THREE.MeshToonMaterial({
      color,
      depthTest: false,
      depthWrite: false,
    });
    const keycap = new THREE.Mesh(
      new RoundedBoxGeometry(0.15, 0.065, 0.16, 3, 0.025),
      keycapMaterial,
    );
    keycap.name = keycapName;
    keycap.position.set(
      LOW_MONITOR_KEYCAP_START_X + index * LOW_MONITOR_KEYCAP_SPACING,
      LOW_MONITOR_KEYCAP_Y,
      LOW_MONITOR_KEYCAP_Z,
    );
    keycap.renderOrder = 21;
    keycap.visible = false;
    interactionGroup.add(keycap);

    const keycapTopMaterial = new THREE.MeshBasicMaterial({
      map: keycapTopTextures[index],
      transparent: true,
      alphaTest: 0.02,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      depthTest: false,
      depthWrite: false,
    });
    disableOutline(keycapTopMaterial);
    const keycapTop = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.13),
      keycapTopMaterial,
    );
    keycapTop.name = `${keycapName}-top-texture`;
    keycapTop.rotation.x = -Math.PI / 2;
    keycapTop.position.set(
      keycap.position.x,
      LOW_MONITOR_KEYCAP_Y + 0.035,
      keycap.position.z,
    );
    keycapTop.renderOrder = 22;
    keycapTop.visible = false;
    interactionGroup.add(keycapTop);

        return [
          { object: keycap as THREE.Object3D, restingY: keycap.position.y },
          {
            object: keycapTop as THREE.Object3D,
            restingY: keycapTop.position.y,
          },
        ];
      })
    : [];

  return {
    seatId: layout.seatId,
    interactionGroup,
    monitorScreen,
    monitorScreenTexture,
    animatedDeskKeycaps,
    elapsed: 0,
    blend: 0,
    screenFrame: -1,
  };
}

function createPalmFrondGeometry(
  length: number,
  width: number,
  droop: number,
) {
  const segmentCount = 7;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    const halfWidth = Math.sin(progress * Math.PI) * width;
    const height =
      Math.sin(progress * Math.PI) * 0.07 - droop * progress * progress;
    const forward = length * progress;
    positions.push(forward, height, -halfWidth);
    positions.push(forward, height, halfWidth);
    uvs.push(progress, 0, progress, 1);

    if (index < segmentCount) {
      const current = index * 2;
      indices.push(
        current,
        current + 2,
        current + 1,
        current + 2,
        current + 3,
        current + 1,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPalmTree(
  watercolorGrain: THREE.Texture,
  placement: IslandPropPlacement,
) {
  const palm = new THREE.Group();
  palm.name = placement.id;
  palm.position.copy(placement.position);
  palm.rotation.y = placement.rotationY;
  palm.scale.setScalar(placement.scale);
  palm.userData.isNavigationObstacle = true;

  const obstacle = PALM_TREE_OBSTACLES.find(
    (candidate) => candidate.id === placement.id,
  );
  if (obstacle) palm.userData.collisionBounds = { ...obstacle };

  const trunkMaterial = new THREE.MeshToonMaterial({
    color: 0xb8794f,
    map: watercolorGrain,
  });
  const trunkBandMaterial = new THREE.MeshToonMaterial({
    color: 0x8f5e42,
    map: watercolorGrain,
  });
  const leafMaterial = new THREE.MeshToonMaterial({
    color: 0x718d62,
    map: watercolorGrain,
    side: THREE.DoubleSide,
  });
  const leafVeinMaterial = new THREE.MeshToonMaterial({
    color: 0x667e58,
    map: watercolorGrain,
  });
  const coconutMaterial = new THREE.MeshToonMaterial({
    color: 0x936846,
    map: watercolorGrain,
  });

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5f6247,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  disableOutline(shadowMaterial);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 36),
    shadowMaterial,
  );
  shadow.name = `${placement.id}-contact-shadow`;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.007;
  shadow.scale.set(1.35, 0.72, 1);
  palm.add(shadow);

  const trunkSegmentHeight = 0.34;
  for (let index = 0; index < 5; index += 1) {
    const progress = index / 4;
    const trunkSegment = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.095 - progress * 0.012,
        0.13 - progress * 0.01,
        trunkSegmentHeight,
        9,
      ),
      trunkMaterial,
    );
    trunkSegment.name = `${placement.id}-trunk-${index + 1}`;
    trunkSegment.position.set(
      Math.sin(index * 0.72) * 0.025,
      0.17 + index * 0.3,
      Math.cos(index * 0.66) * 0.018,
    );
    trunkSegment.rotation.z = -0.018 + index * 0.012;
    palm.add(trunkSegment);

    if (index < 4) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.112 - progress * 0.012, 0.012, 6, 14),
        trunkBandMaterial,
      );
      band.name = `${placement.id}-trunk-band-${index + 1}`;
      band.rotation.x = Math.PI / 2;
      band.position.set(
        trunkSegment.position.x,
        0.31 + index * 0.3,
        trunkSegment.position.z,
      );
      palm.add(band);
    }
  }

  const frondGeometry = createPalmFrondGeometry(1.24, 0.22, 0.25);
  for (let index = 0; index < 10; index += 1) {
    const frond = new THREE.Mesh(
      frondGeometry,
      leafMaterial,
    );
    frond.name = `${placement.id}-frond-${index + 1}`;
    frond.position.set(0.025, 1.56, 0);
    frond.rotation.y = (index / 10) * Math.PI * 2;
    frond.rotation.z = index % 2 === 0 ? 0.04 : -0.025;
    frond.scale.setScalar(0.94 + (index % 2) * 0.04);
    palm.add(frond);

    const vein = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.02, 1.18, 6),
      leafVeinMaterial,
    );
    vein.name = `${placement.id}-frond-vein-${index + 1}`;
    vein.position.set(0.58, 1.53, 0);
    vein.rotation.y = (index / 10) * Math.PI * 2;
    vein.rotation.z = Math.PI / 2 + 0.1;
    palm.add(vein);
  }

  for (let index = 0; index < 3; index += 1) {
    const coconut = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 10, 7),
      coconutMaterial,
    );
    const angle = (index / 3) * Math.PI * 2 + 0.35;
    coconut.name = `${placement.id}-coconut-${index + 1}`;
    coconut.position.set(
      Math.cos(angle) * 0.11,
      1.48 - index * 0.018,
      Math.sin(angle) * 0.11,
    );
    palm.add(coconut);
  }

  return palm;
}

function createRockCluster(
  watercolorGrain: THREE.Texture,
  placement: IslandPropPlacement,
) {
  const cluster = new THREE.Group();
  cluster.name = placement.id;
  cluster.position.copy(placement.position);
  cluster.rotation.y = placement.rotationY;
  cluster.scale.setScalar(placement.scale);
  cluster.userData.isNavigationObstacle = true;

  const obstacle = ROCK_CLUSTER_OBSTACLES.find(
    (candidate) => candidate.id === placement.id,
  );
  if (obstacle) cluster.userData.collisionBounds = { ...obstacle };

  const rockMaterials = [
    new THREE.MeshToonMaterial({
      color: 0xb8aa98,
      map: watercolorGrain,
    }),
    new THREE.MeshToonMaterial({
      color: 0x9f9a91,
      map: watercolorGrain,
    }),
    new THREE.MeshToonMaterial({
      color: 0xc6b59d,
      map: watercolorGrain,
    }),
  ];
  const rockSpecs = [
    {
      position: new THREE.Vector3(-0.18, 0.16, 0.02),
      scale: new THREE.Vector3(1.3, 0.78, 1),
      rotation: new THREE.Euler(0.08, 0.24, -0.05),
    },
    {
      position: new THREE.Vector3(0.17, 0.12, 0.1),
      scale: new THREE.Vector3(0.82, 0.62, 0.72),
      rotation: new THREE.Euler(-0.04, -0.42, 0.1),
    },
    {
      position: new THREE.Vector3(0.02, 0.09, -0.18),
      scale: new THREE.Vector3(0.62, 0.48, 0.7),
      rotation: new THREE.Euler(0.12, 0.64, -0.08),
    },
  ];

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x6f6252,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  disableOutline(shadowMaterial);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 32),
    shadowMaterial,
  );
  shadow.name = `${placement.id}-contact-shadow`;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  shadow.scale.set(1.2, 0.65, 1);
  cluster.add(shadow);

  rockSpecs.forEach((spec, index) => {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.25, 1),
      rockMaterials[index],
    );
    rock.name = `${placement.id}-rock-${index + 1}`;
    rock.position.copy(spec.position);
    rock.scale.copy(spec.scale);
    rock.rotation.copy(spec.rotation);
    cluster.add(rock);
  });

  return cluster;
}

function createCampingSupplyCluster(watercolorGrain: THREE.Texture) {
  const supplies = new THREE.Group();
  supplies.name = CAMPING_SUPPLY_CLUSTER_OBSTACLE.id;
  supplies.position.copy(CAMPING_SUPPLY_CLUSTER_POSITION);
  supplies.rotation.y = 0.12;
  supplies.userData.isNavigationObstacle = true;
  supplies.userData.collisionBounds = {
    ...CAMPING_SUPPLY_CLUSTER_OBSTACLE,
  };

  const createMaterial = (color: number) =>
    new THREE.MeshToonMaterial({
      color,
      map: watercolorGrain,
    });
  const wickerMaterial = createMaterial(0xb98a50);
  const wickerDarkMaterial = createMaterial(0x8e623e);
  const blanketCreamMaterial = createMaterial(0xf2e4cc);
  const blanketCoralMaterial = createMaterial(0xd98270);
  const coolerMaterial = createMaterial(0xd97b6d);
  const coolerLightMaterial = createMaterial(0xf1e9dc);
  const coolerHandleMaterial = createMaterial(0xb4aaa0);
  const mugMaterial = createMaterial(0x79aeb1);
  const coffeeMaterial = createMaterial(0x6d4936);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x6a5946,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  disableOutline(shadowMaterial);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.96, 40),
    shadowMaterial,
  );
  shadow.name = "camping-supply-cluster-contact-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.008, 0.02);
  shadow.scale.set(1.25, 0.72, 1);
  supplies.add(shadow);

  const basket = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 0.42, 0.64, 3, 0.12),
    wickerMaterial,
  );
  basket.name = "camping-wicker-basket";
  basket.position.set(-0.38, 0.24, -0.02);
  supplies.add(basket);

  for (const y of [0.11, 0.25, 0.38]) {
    const basketBand = new THREE.Mesh(
      new RoundedBoxGeometry(0.97, 0.035, 0.68, 2, 0.012),
      wickerDarkMaterial,
    );
    basketBand.name = "camping-wicker-basket-band";
    basketBand.position.set(-0.38, y, -0.02);
    supplies.add(basketBand);
  }

  const basketHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.045, 8, 32, Math.PI),
    wickerDarkMaterial,
  );
  basketHandle.name = "camping-wicker-basket-handle";
  basketHandle.position.set(-0.38, 0.48, -0.03);
  supplies.add(basketHandle);

  const blanket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.62, 24),
    blanketCreamMaterial,
  );
  blanket.name = "camping-rolled-blanket";
  blanket.position.set(-0.38, 0.52, 0.02);
  blanket.rotation.z = Math.PI / 2;
  supplies.add(blanket);

  for (const x of [-0.58, -0.38, -0.18]) {
    const blanketStripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.222, 0.042, 7, 22),
      blanketCoralMaterial,
    );
    blanketStripe.name = "camping-rolled-blanket-stripe";
    blanketStripe.position.set(x, 0.52, 0.02);
    blanketStripe.rotation.y = Math.PI / 2;
    supplies.add(blanketStripe);
  }

  const coolerBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.76, 0.54, 0.58, 3, 0.1),
    coolerMaterial,
  );
  coolerBody.name = "camping-coral-cooler";
  coolerBody.position.set(0.5, 0.3, 0.08);
  supplies.add(coolerBody);

  const coolerLid = new THREE.Mesh(
    new RoundedBoxGeometry(0.82, 0.15, 0.64, 3, 0.1),
    coolerLightMaterial,
  );
  coolerLid.name = "camping-cooler-cream-lid";
  coolerLid.position.set(0.5, 0.61, 0.08);
  supplies.add(coolerLid);

  const coolerHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.035, 7, 28, Math.PI),
    coolerHandleMaterial,
  );
  coolerHandle.name = "camping-cooler-handle";
  coolerHandle.position.set(0.5, 0.58, 0.06);
  coolerHandle.rotation.y = Math.PI / 2;
  supplies.add(coolerHandle);

  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.11, 0.25, 20),
    mugMaterial,
  );
  mug.name = "camping-enamel-mug";
  mug.position.set(0.96, 0.14, 0.18);
  supplies.add(mug);

  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.025, 7, 20),
    mugMaterial,
  );
  mugHandle.name = "camping-enamel-mug-handle";
  mugHandle.position.set(1.08, 0.16, 0.18);
  supplies.add(mugHandle);

  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 20),
    coffeeMaterial,
  );
  coffee.name = "camping-enamel-mug-coffee";
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(0.96, 0.27, 0.18);
  supplies.add(coffee);

  return supplies;
}

function createCampingLantern(watercolorGrain: THREE.Texture) {
  const lantern = new THREE.Group();
  lantern.name = CAMPING_LANTERN_OBSTACLE.id;
  lantern.position.copy(CAMPING_LANTERN_POSITION);
  lantern.rotation.y = -0.18;
  lantern.userData.isNavigationObstacle = true;
  lantern.userData.collisionBounds = { ...CAMPING_LANTERN_OBSTACLE };

  const brassMaterial = new THREE.MeshToonMaterial({
    color: 0xc58d42,
    map: watercolorGrain,
  });
  const darkBrassMaterial = new THREE.MeshToonMaterial({
    color: 0x8c633d,
    map: watercolorGrain,
  });
  const glowMaterial = new THREE.MeshToonMaterial({
    color: 0xffe6a8,
    emissive: 0xffb74d,
    emissiveIntensity: 0.18,
    map: watercolorGrain,
    transparent: true,
    opacity: 0.92,
  });

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x6a5946,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  disableOutline(shadowMaterial);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 32),
    shadowMaterial,
  );
  shadow.name = "camping-lantern-contact-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  shadow.scale.set(1.18, 0.72, 1);
  lantern.add(shadow);

  for (const [name, radius, height, y, material] of [
    ["base", 0.31, 0.12, 0.08, darkBrassMaterial],
    ["base-ring", 0.25, 0.1, 0.17, brassMaterial],
    ["top-ring", 0.23, 0.1, 0.78, brassMaterial],
    ["cap", 0.17, 0.14, 0.89, darkBrassMaterial],
  ] as const) {
    const part = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.88, radius, height, 20),
      material,
    );
    part.name = `camping-lantern-${name}`;
    part.position.y = y;
    lantern.add(part);
  }

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.2, 0.52, 20),
    glowMaterial,
  );
  glass.name = "camping-lantern-glass";
  glass.position.y = 0.49;
  lantern.add(glass);

  for (const x of [-0.23, 0.23]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.58, 7),
      darkBrassMaterial,
    );
    rail.name = "camping-lantern-side-rail";
    rail.position.set(x, 0.5, 0);
    lantern.add(rail);
  }

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.025, 7, 30, Math.PI),
    darkBrassMaterial,
  );
  handle.name = "camping-lantern-carry-handle";
  handle.position.y = 0.93;
  lantern.add(handle);

  const pointLight = new THREE.PointLight(0xffcb6f, 0.32, 2.8, 2);
  pointLight.name = "camping-lantern-soft-light";
  pointLight.position.y = 0.52;
  lantern.add(pointLight);

  return lantern;
}

type BeachOfficeTextureSet = {
  watercolorGrain: THREE.Texture;
  wood: THREE.Texture;
};

// Retained as an offline procedural fallback for the detailed hut model.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createBeachOfficeHut(textures: BeachOfficeTextureSet) {
  const hut = new THREE.Group();
  hut.name = BEACH_OFFICE_HUT_OBSTACLE.id;
  hut.position.set(2.35, 0, 5.12);
  hut.rotation.y = THREE.MathUtils.degToRad(-70);
  hut.scale.setScalar(0.78);
  hut.userData.isNavigationObstacle = true;
  hut.userData.collisionBounds = { ...BEACH_OFFICE_HUT_OBSTACLE };

  const createMaterial = (color: number) =>
    new THREE.MeshToonMaterial({
      color,
      map: textures.watercolorGrain,
    });
  const woodMaterial = new THREE.MeshToonMaterial({
    color: 0xffffff,
    map: textures.wood,
  });
  const paleWoodMaterial = createMaterial(0xc99666);
  const wallMaterial = createMaterial(0xd9ad7d);
  const thatchMaterial = createMaterial(0xc79a5f);
  const thatchEdgeMaterial = createMaterial(0xa97745);
  const darkWoodMaterial = createMaterial(0x8a6248);
  const screenMaterial = createMaterial(0x9ed4d5);
  const chairMaterial = createMaterial(0xb97b69);
  const chairFrameMaterial = createMaterial(0x786866);
  const rugMaterial = createMaterial(0xa8b879);
  const keyboardMaterial = createMaterial(0xe8ded0);
  const bookMaterials = [
    createMaterial(0xc37767),
    createMaterial(0x7c9b7b),
    createMaterial(0xd0af6e),
    createMaterial(0x8290a1),
  ];

  const addBox = (
    name: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    material: THREE.Material,
    radius = 0.025,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size.x, size.y, size.z, 2, radius),
      material,
    );
    mesh.name = name;
    mesh.position.copy(position);
    hut.add(mesh);
    return mesh;
  };

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x765b46,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  disableOutline(shadowMaterial);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.0, 48),
    shadowMaterial,
  );
  shadow.name = "beach-office-hut-contact-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.006, 0.08);
  shadow.scale.set(1.12, 0.72, 1);
  hut.add(shadow);

  addBox(
    "beach-office-deck",
    new THREE.Vector3(3.45, 0.18, 2.35),
    new THREE.Vector3(0, 0.12, 0),
    woodMaterial,
    0.05,
  );
  for (let plank = -2; plank <= 2; plank += 1) {
    addBox(
      `beach-office-deck-plank-${plank + 3}`,
      new THREE.Vector3(0.025, 0.018, 2.12),
      new THREE.Vector3(plank * 0.64, 0.222, 0),
      darkWoodMaterial,
      0.006,
    );
  }

  addBox(
    "beach-office-back-wall",
    new THREE.Vector3(3.18, 1.72, 0.14),
    new THREE.Vector3(0, 1.08, -1.02),
    wallMaterial,
    0.035,
  );
  addBox(
    "beach-office-side-wall",
    new THREE.Vector3(0.14, 1.72, 2.06),
    new THREE.Vector3(1.52, 1.08, -0.02),
    wallMaterial,
    0.035,
  );
  for (const x of [-1.53, 1.53]) {
    for (const z of [-0.98, 0.98]) {
      addBox(
        "beach-office-support-post",
        new THREE.Vector3(0.13, 1.92, 0.13),
        new THREE.Vector3(x, 1.12, z),
        darkWoodMaterial,
        0.035,
      );
    }
  }

  const backRoof = new THREE.Mesh(
    new RoundedBoxGeometry(3.7, 0.18, 1.08, 3, 0.07),
    thatchMaterial,
  );
  backRoof.name = "beach-office-thatched-roof-back-cutaway";
  backRoof.position.set(0, 2.25, -0.72);
  backRoof.rotation.x = -0.16;
  hut.add(backRoof);

  const sideRoof = new THREE.Mesh(
    new RoundedBoxGeometry(1.02, 0.18, 2.42, 3, 0.07),
    thatchMaterial,
  );
  sideRoof.name = "beach-office-thatched-roof-side-cutaway";
  sideRoof.position.set(1.34, 2.18, 0.1);
  sideRoof.rotation.z = 0.15;
  hut.add(sideRoof);

  for (const x of [-1.45, -0.95, -0.45, 0.05, 0.55, 1.05, 1.45]) {
    addBox(
      "beach-office-thatch-fringe",
      new THREE.Vector3(0.12, 0.16, 0.32),
      new THREE.Vector3(x, 2.12, -0.18),
      thatchEdgeMaterial,
      0.025,
    );
  }

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 40),
    rugMaterial,
  );
  rug.name = "beach-office-interior-rug";
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.38, 0.225, 0.28);
  rug.scale.set(1.12, 0.82, 1);
  hut.add(rug);

  addBox(
    "beach-office-worktop",
    new THREE.Vector3(2.25, 0.14, 0.68),
    new THREE.Vector3(-0.25, 0.83, -0.59),
    paleWoodMaterial,
    0.045,
  );
  for (const x of [-1.2, 0.7]) {
    addBox(
      "beach-office-desk-leg",
      new THREE.Vector3(0.13, 0.72, 0.13),
      new THREE.Vector3(x, 0.47, -0.59),
      darkWoodMaterial,
      0.03,
    );
  }
  addBox(
    "beach-office-monitor",
    new THREE.Vector3(0.9, 0.58, 0.1),
    new THREE.Vector3(-0.48, 1.25, -0.69),
    darkWoodMaterial,
    0.05,
  );
  addBox(
    "beach-office-monitor-screen",
    new THREE.Vector3(0.75, 0.44, 0.025),
    new THREE.Vector3(-0.48, 1.25, -0.63),
    screenMaterial,
    0.035,
  );
  addBox(
    "beach-office-monitor-stand",
    new THREE.Vector3(0.12, 0.34, 0.1),
    new THREE.Vector3(-0.48, 0.98, -0.69),
    darkWoodMaterial,
    0.025,
  );
  addBox(
    "beach-office-keyboard",
    new THREE.Vector3(0.72, 0.06, 0.25),
    new THREE.Vector3(0.3, 0.93, -0.38),
    keyboardMaterial,
    0.025,
  );

  for (const shelfY of [1.15, 1.67]) {
    addBox(
      "beach-office-wall-shelf",
      new THREE.Vector3(1.02, 0.08, 0.28),
      new THREE.Vector3(0.82, shelfY, -0.82),
      darkWoodMaterial,
      0.025,
    );
  }
  for (let index = 0; index < 4; index += 1) {
    addBox(
      `beach-office-book-${index + 1}`,
      new THREE.Vector3(0.15, 0.35 + (index % 2) * 0.08, 0.2),
      new THREE.Vector3(0.57 + index * 0.18, 1.39, -0.79),
      bookMaterials[index],
      0.018,
    );
  }

  addBox(
    "beach-office-chair-seat",
    new THREE.Vector3(0.74, 0.16, 0.68),
    new THREE.Vector3(0.42, 0.68, 0.34),
    chairMaterial,
    0.12,
  );
  const chairBack = addBox(
    "beach-office-chair-back",
    new THREE.Vector3(0.78, 0.78, 0.16),
    new THREE.Vector3(0.42, 1.08, 0.66),
    chairMaterial,
    0.13,
  );
  chairBack.rotation.x = -0.08;
  const chairPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.42, 12),
    chairFrameMaterial,
  );
  chairPedestal.name = "beach-office-chair-pedestal";
  chairPedestal.position.set(0.42, 0.42, 0.34);
  hut.add(chairPedestal);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const chairLeg = addBox(
      "beach-office-chair-wheel-leg",
      new THREE.Vector3(0.44, 0.07, 0.08),
      new THREE.Vector3(
        0.42 + Math.cos(angle) * 0.18,
        0.24,
        0.34 + Math.sin(angle) * 0.18,
      ),
      chairFrameMaterial,
      0.025,
    );
    chairLeg.rotation.y = -angle;
  }

  return hut;
}

type MeshyPropMaterialStyle = "source" | "unlit";

function isMeshyColorTextureMaterial(
  material: THREE.Material,
): material is
  | THREE.MeshBasicMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshToonMaterial
  | THREE.MeshPhongMaterial {
  return (
    material instanceof THREE.MeshBasicMaterial ||
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshToonMaterial ||
    material instanceof THREE.MeshPhongMaterial
  );
}

function createUnlitMeshyMaterial(
  sourceMaterial:
    | THREE.MeshBasicMaterial
    | THREE.MeshStandardMaterial
    | THREE.MeshPhysicalMaterial
    | THREE.MeshToonMaterial
    | THREE.MeshPhongMaterial,
  tint: THREE.Color,
  anisotropy: number,
) {
  const map = sourceMaterial.map ?? null;
  const alphaMap = sourceMaterial.alphaMap ?? null;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
  }
  if (alphaMap) alphaMap.anisotropy = anisotropy;

  const material = new THREE.MeshBasicMaterial({
    color: sourceMaterial.color.clone().multiply(tint),
    map,
    alphaMap,
    transparent: sourceMaterial.transparent,
    opacity: sourceMaterial.opacity,
    alphaTest: sourceMaterial.alphaTest,
    side: THREE.DoubleSide,
    depthTest: sourceMaterial.depthTest,
    depthWrite: sourceMaterial.depthWrite,
    toneMapped: sourceMaterial.toneMapped,
    vertexColors: sourceMaterial.vertexColors,
  });
  material.name = `${sourceMaterial.name || "meshy-prop"}-unlit`;
  material.userData = {
    ...sourceMaterial.userData,
    renderingStyle: "illustrated-unlit",
    sourceMaterialType: sourceMaterial.type,
  };
  return material;
}

function createMeshyPropTemplate(
  source: THREE.Object3D,
  tint: THREE.Color,
  anisotropy: number,
  outlineThickness = ILLUSTRATION_OUTLINE_THICKNESS,
  outlineAlpha = ILLUSTRATION_OUTLINE_ALPHA,
  materialStyle: MeshyPropMaterialStyle = "source",
) {
  const template = new THREE.Group();
  const visual = source.clone(true);

  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const styledMaterials = materials.map((sourceMaterial) => {
      const material =
        materialStyle === "unlit" &&
        isMeshyColorTextureMaterial(sourceMaterial)
          ? createUnlitMeshyMaterial(sourceMaterial, tint, anisotropy)
          : sourceMaterial.clone();
      if (materialStyle === "unlit") {
        material.userData.renderingStyle = "illustrated-unlit";
      }
      if (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial
      ) {
        material.color.multiply(tint);
        material.metalness = 0;
        material.roughness = 1;
        material.emissive.set(0x000000);
        material.envMapIntensity = 0;
        material.side = THREE.DoubleSide;
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = anisotropy;
        }
      } else if (
        material instanceof THREE.MeshBasicMaterial ||
        material instanceof THREE.MeshToonMaterial
      ) {
        if (materialStyle !== "unlit") material.color.multiply(tint);
        material.side = THREE.DoubleSide;
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = anisotropy;
        }
      }
      material.userData.outlineParameters = {
        thickness: outlineThickness,
        color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
        alpha: outlineAlpha,
        visible: true,
      };
      material.needsUpdate = true;
      return material;
    });

    object.material = Array.isArray(object.material)
      ? styledMaterials
      : styledMaterials[0];
  });

  const bounds = new THREE.Box3().setFromObject(visual);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const unitScale = 1 / Math.max(size.y, 0.0001);
  visual.scale.setScalar(unitScale);
  visual.position.set(
    -center.x * unitScale,
    -bounds.min.y * unitScale,
    -center.z * unitScale,
  );
  template.add(visual);
  return template;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = THREE.MathUtils.clamp(
    (value - edge0) / (edge1 - edge0),
    0,
    1,
  );
  return progress * progress * (3 - 2 * progress);
}

function ensurePalmLeafSwayMorphTargets(geometry: THREE.BufferGeometry) {
  if (
    geometry.userData.palmLeafSwayMorphVersion ===
    PALM_LEAF_SWAY_MORPH_VERSION
  ) {
    return true;
  }

  const position = geometry.getAttribute("position");
  if (!position || position.itemSize < 3) return false;

  const swayAcross = new Float32Array(position.count * 3);
  const swayDepth = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, z);
    const crownMask = smoothstep(-0.22, 0.08, y);
    const branchMask = smoothstep(0.08, 0.38, radius);
    const tipFactor = THREE.MathUtils.clamp(radius / 0.85, 0, 1);
    const leafMask =
      crownMask * branchMask * (0.35 + tipFactor * 0.65);
    const angle = Math.atan2(z, x);
    const offset = index * 3;

    swayAcross[offset] =
      leafMask * (0.036 + tipFactor * 0.024) *
      (0.84 + Math.sin(angle * 5) * 0.16);
    swayAcross[offset + 1] =
      leafMask * Math.sin(x * 7 + z * 5) * 0.008;
    swayAcross[offset + 2] =
      leafMask * Math.sin(y * 5 + angle * 2) * 0.011;

    swayDepth[offset] =
      leafMask * Math.cos(y * 4 + angle * 3) * 0.013;
    swayDepth[offset + 1] =
      leafMask * Math.cos(x * 5 - z * 6) * 0.008;
    swayDepth[offset + 2] =
      leafMask * (0.028 + tipFactor * 0.02) *
      (0.84 + Math.cos(angle * 6) * 0.16);
  }

  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(swayAcross, 3),
    new THREE.Float32BufferAttribute(swayDepth, 3),
  ];
  geometry.morphTargetsRelative = true;
  geometry.userData.palmLeafSwayMorphVersion =
    PALM_LEAF_SWAY_MORPH_VERSION;
  return true;
}

function registerPalmLeafSway(
  root: THREE.Object3D,
  phase: number,
  targets: PalmLeafSwayTarget[],
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!ensurePalmLeafSwayMorphTargets(object.geometry)) return;

    object.updateMorphTargets();
    if (!object.morphTargetInfluences) return;
    targets.push({ mesh: object, phase });
  });
}

function createMeshyPropShadow(
  name: string,
  radius: number,
  opacity: number,
) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x665746,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  disableOutline(material);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    material,
  );
  shadow.name = `${name}-contact-shadow`;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  shadow.scale.set(1.18, 0.72, 1);
  return shadow;
}

function createInteractionProxy(clickTargetId: string, radius = 0.5) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  disableOutline(material);
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8),
    material,
  );
  proxy.name = `${clickTargetId}-click-proxy`;
  proxy.position.y = radius;
  proxy.userData.clickTargetId = clickTargetId;
  return proxy;
}

function createAgentMarker(
  initialSeat: SeatView,
  replyReadyTexture: THREE.Texture,
) {
  const marker = new THREE.Group();
  marker.name = `agent-marker-${initialSeat.agentName}`;
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let signature = "";
  const update = (seat: SeatView) => {
    const nextSignature = [
      seat.agentName,
      Math.round(seat.hunger ?? 0),
      Math.round(seat.toilet ?? 0),
      Math.round(seat.happiness ?? 30),
    ].join(":");
    if (!context || nextSignature === signature) return;
    signature = nextSignature;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(251, 241, 213, 0.96)";
    context.strokeStyle = "#816553";
    context.lineWidth = 7;
    context.beginPath();
    context.roundRect(8, 8, 368, 112, 22);
    context.fill();
    context.stroke();
    context.fillStyle = "#4d4038";
    context.font = "700 30px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(seat.agentName.slice(0, 14), 192, 40);

    const gauges = [
      { value: seat.hunger ?? 0, color: "#dfa56d" },
      { value: seat.toilet ?? 0, color: "#7eb7aa" },
      { value: seat.happiness ?? 30, color: "#e99a9a" },
    ];
    gauges.forEach(({ value, color }, index) => {
      const x = 38 + index * 110;
      context.fillStyle = "rgba(111, 88, 70, 0.18)";
      context.beginPath();
      context.roundRect(x, 72, 88, 18, 9);
      context.fill();
      context.fillStyle = color;
      context.beginPath();
      context.roundRect(x + 3, 75, Math.max(5, 82 * (value / 100)), 12, 6);
      context.fill();
      context.fillStyle = "#6d574c";
      context.font = "700 16px sans-serif";
      context.fillText(["●", "◆", "♥"][index], x + 44, 104);
    });
    texture.needsUpdate = true;
  };
  update(initialSeat);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  disableOutline(material);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.94, MARKER_LABEL_HEIGHT),
    material,
  );
  label.position.y = MARKER_LABEL_LOCAL_Y;
  label.renderOrder = MARKER_LABEL_RENDER_ORDER;
  marker.add(label);

  const beacon = new THREE.Group();
  beacon.name = `blocked-beacon-${initialSeat.agentName}`;
  const beaconMaterial = new THREE.MeshBasicMaterial({
    map: replyReadyTexture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.03,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  disableOutline(beaconMaterial);
  const icon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.44),
    beaconMaterial,
  );
  beacon.add(icon);
  beacon.position.y = 1.45;
  const updateBeacon = (seat: SeatView) => {
    beacon.visible = seat.blocked || Boolean(seat.hasUnreadReply);
    beaconMaterial.color.setHex(seat.blocked ? 0xf2b3ac : 0xffffff);
  };
  updateBeacon(initialSeat);
  beacon.renderOrder = MARKER_BEACON_RENDER_ORDER;
  icon.renderOrder = MARKER_BEACON_RENDER_ORDER;
  marker.add(beacon);
  // 마커 전체를 오버레이 레이어로 옮긴다 — 본편·외곽선 패스에서는 아예 빠지고
  // 외곽선이 다 칠해진 뒤의 마지막 패스에서만 그려진다.
  marker.traverse((object) => {
    object.layers.set(MARKER_OVERLAY_LAYER);
  });
  return { marker, label, beacon, texture, update, updateBeacon };
}

function createLitterLevelGauge(initialLevel: number, initialMaxLevel = 100) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let signature = -1;
  const update = (level: number, maxLevel = initialMaxLevel) => {
    const safeMaxLevel = Math.max(1, maxLevel);
    const nextSignature = Math.round(
      THREE.MathUtils.clamp((level / safeMaxLevel) * 100, 0, 100),
    );
    if (!context || signature === nextSignature) return;
    signature = nextSignature;
    const ratio = nextSignature / 100;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(251, 241, 213, 0.97)";
    context.strokeStyle = "#816553";
    context.lineWidth = 7;
    context.beginPath();
    context.roundRect(7, 7, 306, 98, 25);
    context.fill();
    context.stroke();

    context.fillStyle = "#765745";
    context.beginPath();
    context.arc(40, 66, 14, Math.PI, 0);
    context.arc(54, 66, 15, Math.PI, 0);
    context.arc(68, 66, 13, Math.PI, 0);
    context.lineTo(75, 78);
    context.lineTo(33, 78);
    context.closePath();
    context.fill();
    context.beginPath();
    context.arc(54, 49, 11, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(111, 88, 70, 0.2)";
    context.beginPath();
    context.roundRect(92, 42, 190, 38, 19);
    context.fill();
    if (ratio > 0) {
      const fillWidth = Math.max(16, 182 * ratio);
      context.fillStyle =
        ratio >= 1 ? "#bd665b" : ratio >= 0.67 ? "#d99a61" : "#83b99d";
      context.beginPath();
      context.roundRect(96, 46, fillWidth, 30, 15);
      context.fill();
    }
    if (ratio >= 1) {
      context.fillStyle = "#fff4d9";
      context.font = "900 25px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("!", 187, 61);
    }
    texture.needsUpdate = true;
  };
  update(initialLevel);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  disableOutline(material);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.31),
    material,
  );
  label.name = "litter-box-level-gauge";
  label.renderOrder = MARKER_LABEL_RENDER_ORDER;
  label.layers.set(MARKER_OVERLAY_LAYER);
  return { label, texture, update };
}

function createLitterOdorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    for (let radius = 44; radius >= 4; radius -= 2) {
      const coreRatio = 1 - radius / 44;
      context.fillStyle = `rgba(145, 155, 91, ${
        0.015 + coreRatio * coreRatio * 0.12
      })`;
      context.beginPath();
      context.arc(48, 48, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function AgentWorld3D({
  seats,
  activeSeatCount,
  completionSignal,
  catStyle = "Blue",
  catShape,
  onSeatClick,
  onRadioClick,
  onShellCollect,
  tutorialAnchor,
  onTutorialAnchor,
  worldShellSpawningEnabled,
  placementMode,
  interactionCatId,
  snackPlacement,
  onWorldPlacement,
  onSnackResolved,
  onLaserResolved,
  onToyResolved,
  foodAvailable,
  foodGrade,
  foodBowlCount = 1,
  litterLevel,
  litterMaxLevel,
  litterBoxCount = 1,
  exerciseWheelOwned = false,
  workstationDecor = {},
  onFoodBowlClick,
  onLitterBoxClick,
  onCatCareEvent,
  onKneadingCompleted,
  onCatWheelPlay,
}: AgentWorld3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const primarySeat = seats[0] ?? DEFAULT_SEAT_VIEW;
  const motionRef = useRef({
    location: primarySeat.location,
    status: primarySeat.status,
  });
  const seatsRef = useRef(seats);
  const completionSignalRef = useRef(completionSignal);
  const onSeatClickRef = useRef(onSeatClick);
  const onRadioClickRef = useRef(onRadioClick);
  const activeSeatCountRef = useRef(activeSeatCount);
  const onShellCollectRef = useRef(onShellCollect);
  const tutorialAnchorRef = useRef(tutorialAnchor);
  const worldReadyRef = useRef(false);
  const onTutorialAnchorRef = useRef(onTutorialAnchor);
  const worldShellSpawningEnabledRef = useRef(worldShellSpawningEnabled);
  const placementModeRef = useRef<WorldPlacementMode>(placementMode);
  const interactionCatIdRef = useRef(interactionCatId);
  const snackPlacementRef = useRef<SnackPlacement | null>(snackPlacement);
  const onWorldPlacementRef = useRef(onWorldPlacement);
  const onSnackResolvedRef = useRef(onSnackResolved);
  const onLaserResolvedRef = useRef(onLaserResolved);
  const onToyResolvedRef = useRef(onToyResolved);
  const foodAvailableRef = useRef(foodAvailable);
  const foodGradeRef = useRef<FoodGrade | null>(foodGrade);
  const litterLevelRef = useRef(litterLevel);
  const litterMaxLevelRef = useRef(litterMaxLevel);
  const exerciseWheelOwnedRef = useRef(exerciseWheelOwned);
  const workstationDecorRef =
    useRef<Partial<Record<SeatId, string[]>>>(workstationDecor);
  const onFoodBowlClickRef = useRef(onFoodBowlClick);
  const onLitterBoxClickRef = useRef(onLitterBoxClick);
  const onCatCareEventRef = useRef(onCatCareEvent);
  const onKneadingCompletedRef = useRef(onKneadingCompleted);
  const onCatWheelPlayRef = useRef(onCatWheelPlay);
  const layoutEditorRuntimeRef = useRef<WorldLayoutEditorRuntime | null>(null);
  const monitorCalibrationRuntimeRef =
    useRef<MonitorScreenCalibrationRuntime | null>(null);
  const forcedWorldDayNightPhaseRef = useRef<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [ambientLabel, setAmbientLabel] = useState("주변을 구경하는 중");
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [monitorCalibrationMode, setMonitorCalibrationMode] = useState(false);
  const [selectedMonitorScreenSeatId, setSelectedMonitorScreenSeatId] =
    useState<SeatId>("seat-2");
  const [monitorScreenCalibrationMetrics, setMonitorScreenCalibrationMetrics] =
    useState<MonitorScreenCalibrationMetrics | null>(null);
  const [monitorCalibrationSaveRevision, setMonitorCalibrationSaveRevision] =
    useState(0);
  const [worldTimeTestMode, setWorldTimeTestMode] =
    useState<WorldTimeTestMode>("auto");
  const layoutAdminEnabled = useSyncExternalStore(
    subscribeWorldLayoutAdmin,
    getWorldLayoutAdminEnabled,
    () => false,
  );
  const [layoutSaveRevision, setLayoutSaveRevision] = useState(0);
  const [careFacilityCounts, setCareFacilityCounts] = useState<
    Record<CatCareIntent, number>
  >({
    food: 1,
    toilet: 1,
  });
  const [selectedLayoutObjectLabel, setSelectedLayoutObjectLabel] = useState<
    string | null
  >(null);

  useEffect(() => {
    const requestedWorkPreview = new URLSearchParams(
      window.location.search,
    ).get("workPreview");
    const requestedWorkPreviewSeatId = [
      "seat-1",
      "seat-2",
      "seat-3",
      "seat-4",
    ].includes(requestedWorkPreview ?? "")
      ? (requestedWorkPreview as SeatId)
      : null;
    const localWorkPreviewEnabled =
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        window.location.hostname,
      ) && requestedWorkPreviewSeatId !== null;
    const previewStyle = seats[0]?.catStyle;
    const runtimeSeats = localWorkPreviewEnabled
      ? ([
          {
            ...DEFAULT_SEAT_VIEW,
            seatId: "seat-1",
            catId: "work-preview-seat-1",
            agentName: "자리 1",
            location: "coding",
            status:
              requestedWorkPreviewSeatId === "seat-1" ? "working" : "idle",
            statusLabel:
              requestedWorkPreviewSeatId === "seat-1" ? "작업 중" : "쉬는 중",
            catStyle: previewStyle,
          },
          {
            ...DEFAULT_SEAT_VIEW,
            seatId: "seat-2",
            catId: "work-preview-seat-2",
            agentName: "자리 2",
            location: "general",
            status:
              requestedWorkPreviewSeatId === "seat-2" ? "working" : "idle",
            statusLabel:
              requestedWorkPreviewSeatId === "seat-2" ? "작업 중" : "쉬는 중",
            catStyle: previewStyle,
          },
          {
            ...DEFAULT_SEAT_VIEW,
            seatId: "seat-3",
            catId: "work-preview-seat-3",
            agentName: "자리 3",
            location: "design",
            status:
              requestedWorkPreviewSeatId === "seat-3" ? "working" : "idle",
            statusLabel:
              requestedWorkPreviewSeatId === "seat-3" ? "작업 중" : "쉬는 중",
            catStyle: previewStyle,
          },
          {
            ...DEFAULT_SEAT_VIEW,
            seatId: "seat-4",
            catId: "work-preview-seat-4",
            agentName: "자리 4",
            location: "music",
            status:
              requestedWorkPreviewSeatId === "seat-4" ? "working" : "idle",
            statusLabel:
              requestedWorkPreviewSeatId === "seat-4" ? "작업 중" : "쉬는 중",
            catStyle: previewStyle,
          },
        ] satisfies SeatView[])
      : seats;
    const currentPrimary = runtimeSeats[0] ?? DEFAULT_SEAT_VIEW;
    motionRef.current = {
      location: currentPrimary.location,
      status: currentPrimary.status,
    };
    seatsRef.current = runtimeSeats;
    completionSignalRef.current = completionSignal;
    onSeatClickRef.current = onSeatClick;
    onRadioClickRef.current = onRadioClick;
    activeSeatCountRef.current = localWorkPreviewEnabled ? 4 : activeSeatCount;
    onShellCollectRef.current = onShellCollect;
    tutorialAnchorRef.current = tutorialAnchor;
    onTutorialAnchorRef.current = onTutorialAnchor;
    worldShellSpawningEnabledRef.current = worldShellSpawningEnabled;
    placementModeRef.current = placementMode;
    interactionCatIdRef.current = interactionCatId;
    snackPlacementRef.current = snackPlacement;
    onWorldPlacementRef.current = onWorldPlacement;
    onSnackResolvedRef.current = onSnackResolved;
    onLaserResolvedRef.current = onLaserResolved;
    onToyResolvedRef.current = onToyResolved;
    foodAvailableRef.current = foodAvailable;
    foodGradeRef.current = foodGrade;
    litterLevelRef.current = litterLevel;
    litterMaxLevelRef.current = litterMaxLevel;
    exerciseWheelOwnedRef.current = exerciseWheelOwned;
    workstationDecorRef.current = workstationDecor;
    onFoodBowlClickRef.current = onFoodBowlClick;
    onLitterBoxClickRef.current = onLitterBoxClick;
    onCatCareEventRef.current = onCatCareEvent;
    onKneadingCompletedRef.current = onKneadingCompleted;
    onCatWheelPlayRef.current = onCatWheelPlay;
  }, [
    activeSeatCount,
    completionSignal,
    onRadioClick,
    onSeatClick,
    onShellCollect,
    tutorialAnchor,
    onTutorialAnchor,
    worldShellSpawningEnabled,
    placementMode,
    interactionCatId,
    snackPlacement,
    onWorldPlacement,
    onSnackResolved,
    onLaserResolved,
    onToyResolved,
    foodAvailable,
    foodGrade,
    litterLevel,
    litterMaxLevel,
    exerciseWheelOwned,
    workstationDecor,
    onFoodBowlClick,
    onLitterBoxClick,
    onCatCareEvent,
    onKneadingCompleted,
    onCatWheelPlay,
    seats,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const diagnosticParams = new URLSearchParams(window.location.search);
    const fixedWorldDayNightPhase = worldDayNightDebugPhase(
      diagnosticParams.get("worldTime"),
    );
    const requestedWorldTimeMode = diagnosticParams.get("worldTime");
    forcedWorldDayNightPhaseRef.current = fixedWorldDayNightPhase;
    if (
      requestedWorldTimeMode === "dawn" ||
      requestedWorldTimeMode === "day" ||
      requestedWorldTimeMode === "sunset" ||
      requestedWorldTimeMode === "night"
    ) {
      setWorldTimeTestMode(requestedWorldTimeMode);
    }
    let worldDayNightAnchor = createWorldDayNightAnchor(
      Date.now(),
      WORLD_DAY_NIGHT_DEFAULT_PHASE,
    );
    if (fixedWorldDayNightPhase === null) {
      try {
        const storedAnchor = Number.parseFloat(
          window.localStorage.getItem(WORLD_DAY_NIGHT_STORAGE_KEY) ?? "",
        );
        if (Number.isFinite(storedAnchor)) {
          worldDayNightAnchor = storedAnchor;
        } else {
          window.localStorage.setItem(
            WORLD_DAY_NIGHT_STORAGE_KEY,
            String(worldDayNightAnchor),
          );
        }
      } catch {
        // Private browsing can reject storage. The cycle still runs in-memory.
      }
    }
    const interactionDebugMode =
      diagnosticParams.get("interactionDebug") === "1";
    let exerciseWheelSecondaryPreviewPending =
      interactionDebugMode &&
      diagnosticParams.get("wheelPreview") === "secondary";
    /* 장면을 만드는 이 이펙트는 한 번만 돈다. 값을 여기서 박아 두면
       7 을 눌러 켜도 이번 세션에서는 배치 편집이 영영 안 열린다.
       그래서 쓸 때마다 현재 값을 읽는 함수로 둔다. */
    const layoutEditorAuthorized = () => getWorldLayoutAdminEnabled();
    const requestedCarePreview = diagnosticParams.get("carePreview");
    const carePreviewMode =
      ["food", "empty-food", "toilet"].includes(
        requestedCarePreview ?? "",
      ) &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        window.location.hostname,
      )
        ? requestedCarePreview
        : null;
    let carePreviewConsumed = false;
    const hasFoodAvailable = () =>
      carePreviewMode === "empty-food"
        ? false
        : foodAvailableRef.current;
    const monitorAblationMode = diagnosticParams.get("monitorAblation");
    const suppressMonitorInteraction =
      diagnosticParams.get("monitorCapture") === "static";
    const forceMonitorDiagnosticScreen =
      !suppressMonitorInteraction &&
      diagnosticParams.get("monitorScreen") === "coding";
    const requestedRenderScale = Number.parseFloat(
      diagnosticParams.get("renderScale") ?? "",
    );
    const diagnosticRenderScale = Number.isFinite(requestedRenderScale)
      ? THREE.MathUtils.clamp(requestedRenderScale, 0.75, 4)
      : null;
    const worldStage = host.closest<HTMLElement>(".world-stage-3d");
    if (monitorAblationMode === "no-vignette") {
      worldStage?.classList.add("monitor-ablation-no-vignette");
    }

    let disposed = false;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      worldStage?.classList.remove("monitor-ablation-no-vignette");
      queueMicrotask(() => setFailed(true));
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping =
      monitorAblationMode === "no-tone-mapping"
        ? THREE.NoToneMapping
        : THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    const renderPixelRatio =
      diagnosticRenderScale ??
      (monitorAblationMode === "two-x-render-scale"
        ? 2
        : DEFAULT_WORLD_RENDER_SCALE);
    renderer.setPixelRatio(renderPixelRatio);
    renderer.domElement.className = "world-3d-canvas";
    renderer.domElement.dataset.renderScale = String(renderPixelRatio);
    renderer.domElement.setAttribute(
      "aria-label",
      "드래그하면 월드가 회전하고, 마우스 휠이나 두 손가락으로 확대하고 축소할 수 있습니다.",
    );
    renderer.domElement.title =
      "드래그: 월드 회전 · 휠/두 손가락: 확대 및 축소";
    host.appendChild(renderer.domElement);

    const outlineEffect = new SketchOutlineEffect(renderer, {
      defaultThickness: ILLUSTRATION_OUTLINE_THICKNESS,
      defaultColor: ILLUSTRATION_OUTLINE_COLOR.toArray(),
      defaultAlpha: ILLUSTRATION_OUTLINE_ALPHA,
    });
    outlineEffect.setPixelRatio(renderPixelRatio);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FAR_OCEAN_STYLE_COLOR);
    scene.fog = new THREE.Fog(FAR_OCEAN_STYLE_COLOR, 15, 27);
    const atmosphereBackdrop = createWorldAtmosphereBackdrop();
    atmosphereBackdrop.mesh.visible = false;
    scene.add(atmosphereBackdrop.mesh);
    const clickableObjects: THREE.Object3D[] = [];
    const billboardObjects: THREE.Object3D[] = [];
    const workstationGroups = new Map<SeatId, THREE.Group>();
    const workstationDecorGroups = new Map<SeatId, THREE.Group>();
    const workstationDecorSignatures = new Map<SeatId, string>();
    const disposeDecorGroup = (group: THREE.Group) => {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach(disposeMaterial);
      });
      group.clear();
    };
    const syncWorkstationDecorGroups = () => {
      workstationDecorGroups.forEach((group, seatId) => {
        const itemIds = workstationDecorRef.current[seatId] ?? [];
        const signature = itemIds.join("|");
        if (workstationDecorSignatures.get(seatId) === signature) return;
        disposeDecorGroup(group);
        itemIds.forEach((itemId) => {
          group.add(createWorkstationDecorVisual(itemId));
        });
        workstationDecorSignatures.set(seatId, signature);
      });
    };

    const camera = new THREE.OrthographicCamera(-5, 5, 6, -6, 0.1, 50);
    const cameraBase = new THREE.Vector3(0, 9.2, 12.9);
    const cameraLookAt = new THREE.Vector3(0, 0.2, 0);
    const cameraBaseOffset = cameraBase.clone().sub(cameraLookAt);
    const cameraBaseSpherical = new THREE.Spherical().setFromVector3(
      cameraBaseOffset,
    );
    const cameraOrbitSpherical = cameraBaseSpherical.clone();
    const cameraOrbitOffset = new THREE.Vector3();
    const worldPitchLimit =
      cameraBaseSpherical.phi * WORLD_INTERACTION_LIMIT_RATIO;
    const requestedWorldYawDegrees = Number.parseFloat(
      diagnosticParams.get("worldYaw") ?? "",
    );
    const requestedWorldPitchDegrees = Number.parseFloat(
      diagnosticParams.get("worldPitch") ?? "",
    );
    const requestedWorldZoom = Number.parseFloat(
      diagnosticParams.get("worldZoom") ?? "",
    );
    const initialWorldYaw = Number.isFinite(requestedWorldYawDegrees)
      ? THREE.MathUtils.clamp(
          THREE.MathUtils.degToRad(requestedWorldYawDegrees),
          -WORLD_YAW_LIMIT,
          WORLD_YAW_LIMIT,
        )
      : 0;
    const initialWorldPitch = Number.isFinite(requestedWorldPitchDegrees)
      ? THREE.MathUtils.clamp(
          THREE.MathUtils.degToRad(requestedWorldPitchDegrees),
          -worldPitchLimit,
          worldPitchLimit,
        )
      : 0;
    const initialWorldZoom = Number.isFinite(requestedWorldZoom)
      ? THREE.MathUtils.clamp(
          requestedWorldZoom,
          WORLD_ZOOM_MIN,
          WORLD_ZOOM_MAX,
        )
      : 1;
    let worldYawTarget = initialWorldYaw;
    let worldYawCurrent = initialWorldYaw;
    let worldPitchTarget = initialWorldPitch;
    let worldPitchCurrent = initialWorldPitch;
    let worldZoomTarget = initialWorldZoom;
    let worldZoomCurrent = initialWorldZoom;
    camera.position.copy(cameraBase);
    camera.lookAt(cameraLookAt);

    const runtimeObstacleById = new Map(
      SCENE_OBSTACLES.map((obstacle) => [
        obstacle.id,
        { ...obstacle } satisfies SceneObstacle,
      ]),
    );
    const dynamicCareObstacleIds = new Set<string>();
    let catExerciseWheelGroup: THREE.Group | null = null;
    const runtimeObstacleFor = (obstacle: SceneObstacle) =>
      runtimeObstacleById.get(obstacle.id) ?? { ...obstacle };
    const getRuntimeSceneObstacles = (seatCount: number) => {
      const obstacles = getActiveSceneObstacles(seatCount)
        .filter(
          (obstacle) =>
            obstacle.id !== CAT_EXERCISE_WHEEL_OBSTACLE.id ||
            exerciseWheelOwnedRef.current,
        )
        .map(runtimeObstacleFor);
      dynamicCareObstacleIds.forEach((id) => {
        const obstacle = runtimeObstacleById.get(id);
        if (obstacle && !obstacles.includes(obstacle)) {
          obstacles.push(obstacle);
        }
      });
      return obstacles;
    };
    const deskObstacle = runtimeObstacleFor(DESK_OBSTACLE);
    const foodBowlObstacle = runtimeObstacleFor(FOOD_BOWL_OBSTACLE);
    const litterBoxObstacle = runtimeObstacleFor(LITTER_BOX_OBSTACLE);

    const codingDeskTarget = CODING_DESK_TARGET.clone();
    const worldTargets: Record<AgentWorldLocation, THREE.Vector3> = {
      entrance: WORLD_TARGETS.entrance.clone(),
      general: WORLD_TARGETS.general.clone(),
      coding: codingDeskTarget,
      design: WORLD_TARGETS.design.clone(),
      music: WORLD_TARGETS.music.clone(),
      queue: WORLD_TARGETS.queue.clone(),
      office: WORLD_TARGETS.office.clone(),
    };
    const seatWorldPositions: Record<SeatId, THREE.Vector3> = {
      "seat-1": SEAT_WORLD_POSITIONS["seat-1"].clone(),
      "seat-2": SEAT_WORLD_POSITIONS["seat-2"].clone(),
      "seat-3": SEAT_WORLD_POSITIONS["seat-3"].clone(),
      "seat-4": SEAT_WORLD_POSITIONS["seat-4"].clone(),
    };
    const seatWorkingMarkerWorldPositions: Record<SeatId, THREE.Vector3> = {
      "seat-1": SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-1"].clone(),
      "seat-2": SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-2"].clone(),
      "seat-3": SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-3"].clone(),
      "seat-4": SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-4"].clone(),
    };
    const baseSeatWorkLookTargets: Record<SeatId, THREE.Vector3> = {
      "seat-1": workstationScreenWorldPosition(
        WORKSTATION_INTERACTION_LAYOUTS["seat-1"],
      ),
      "seat-2": workstationScreenWorldPosition(
        WORKSTATION_INTERACTION_LAYOUTS["seat-2"],
      ),
      "seat-3": workstationScreenWorldPosition(
        WORKSTATION_INTERACTION_LAYOUTS["seat-3"],
      ),
      "seat-4": workstationScreenWorldPosition(
        WORKSTATION_INTERACTION_LAYOUTS["seat-4"],
      ),
    };
    const seatWorkLookTargets: Record<SeatId, THREE.Vector3> = {
      "seat-1": baseSeatWorkLookTargets["seat-1"].clone(),
      "seat-2": baseSeatWorkLookTargets["seat-2"].clone(),
      "seat-3": baseSeatWorkLookTargets["seat-3"].clone(),
      "seat-4": baseSeatWorkLookTargets["seat-4"].clone(),
    };
    const lowMonitorWorkingMarkerWorldPosition =
      LOW_MONITOR_WORKING_MARKER_WORLD_POSITION.clone();
    const deskKneadingExitPosition = DESK_KNEADING_EXIT_POSITION.clone();
    const baseDeskKneadingLookTarget =
      LOW_MONITOR_KNEADING_LOCAL_TARGET.clone()
        .applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          LOW_MONITOR_STATION_ROTATION_Y,
        )
        .add(LOW_MONITOR_STATION_POSITION);
    const deskKneadingLookTarget = baseDeskKneadingLookTarget.clone();
    const foodBowlApproachPosition = FOOD_BOWL_APPROACH_POSITION.clone();
    const foodBowlWaitPosition = FOOD_BOWL_WAIT_POSITION.clone();
    const litterBoxApproachPosition = LITTER_BOX_APPROACH_POSITION.clone();
    const litterBoxUsePosition = LITTER_BOX_USE_POSITION.clone();
    const litterBoxWaitPosition = LITTER_BOX_WAIT_POSITION.clone();
    const catExerciseWheelUsePosition =
      CAT_EXERCISE_WHEEL_USE_POSITION.clone();
    const catExerciseWheelExitPosition =
      CAT_EXERCISE_WHEEL_EXIT_POSITION.clone();
    let catExerciseWheelRunYaw = CAT_EXERCISE_WHEEL_ROTATION_Y + Math.PI / 2;

    let savedWorldLayout: WorldObjectLayout = {};
    if (layoutEditorAuthorized()) {
      try {
        savedWorldLayout = parseWorldObjectLayout(
          window.localStorage.getItem(WORLD_OBJECT_LAYOUT_STORAGE_KEY),
        );
      } catch {
        // Storage can be unavailable in privacy mode. Editing still works in-memory.
      }
    }
    const initialFoodBowlCount = foodBowlCount;
    const initialLitterBoxCount = litterBoxCount;

    const editableWorldObjects = new Map<string, EditableWorldObject>();
    let addCareFacilityInScene: (intent: CatCareIntent) => boolean =
      () => false;
    let selectedEditableObject: EditableWorldObject | null = null;
    let layoutEditorEnabled = false;
    let objectDragPointerId: number | null = null;
    let objectDragMoved = false;
    const objectDragOffset = new THREE.Vector3();
    const objectDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const objectDragHit = new THREE.Vector3();
    const objectPoseFor = (object: THREE.Object3D): WorldObjectPose => ({
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
    });
    const persistWorldLayout = () => {
      if (!layoutEditorAuthorized()) return;
      try {
        window.localStorage.setItem(
          WORLD_OBJECT_LAYOUT_STORAGE_KEY,
          JSON.stringify(savedWorldLayout),
        );
      } catch {
        // Keep the current scene editable even when local storage is blocked.
      }
    };
    const persistEditableObject = (entry: EditableWorldObject) => {
      if (!layoutEditorAuthorized()) return;
      savedWorldLayout[entry.id] = objectPoseFor(entry.object);
      persistWorldLayout();
    };
    const updateAnchoredVector = (
      entry: EditableWorldObject,
      base: THREE.Vector3,
      target: THREE.Vector3,
    ) => {
      const transformed = transformWorldPoint(
        base,
        entry.initialPose,
        objectPoseFor(entry.object),
      );
      target.set(transformed.x, base.y, transformed.z);
    };
    const syncWorkstationAnchors = (entry: EditableWorldObject) => {
      switch (entry.id) {
        case TENT_WORKSTATION_OBSTACLE.id:
          updateAnchoredVector(
            entry,
            SEAT_WORLD_POSITIONS["seat-2"],
            seatWorldPositions["seat-2"],
          );
          updateAnchoredVector(
            entry,
            WORLD_TARGETS.general,
            worldTargets.general,
          );
          updateAnchoredVector(
            entry,
            WORLD_TARGETS.office,
            worldTargets.office,
          );
          /* 작업 중에는 자기 텐트 obstacle 을 이동 경로에서 제외한다.
             여기서 다시 바깥으로 밀면 노트북과 고양이 사이가 벌어진다. */
          updateAnchoredVector(
            entry,
            SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-2"],
            seatWorkingMarkerWorldPositions["seat-2"],
          );
          updateAnchoredVector(
            entry,
            baseSeatWorkLookTargets["seat-2"],
            seatWorkLookTargets["seat-2"],
          );
          break;
        case ROUND_LAPTOP_STATION_OBSTACLE.id:
          updateAnchoredVector(
            entry,
            SEAT_WORLD_POSITIONS["seat-3"],
            seatWorldPositions["seat-3"],
          );
          updateAnchoredVector(
            entry,
            WORLD_TARGETS.design,
            worldTargets.design,
          );
          /* 피크닉 자리도 작업 좌표는 쿠션과 노트북 사이의 접촉점이다. */
          updateAnchoredVector(
            entry,
            SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-3"],
            seatWorkingMarkerWorldPositions["seat-3"],
          );
          updateAnchoredVector(
            entry,
            baseSeatWorkLookTargets["seat-3"],
            seatWorkLookTargets["seat-3"],
          );
          break;
        case FOLDING_LAPTOP_STATION_OBSTACLE.id:
          updateAnchoredVector(
            entry,
            SEAT_WORLD_POSITIONS["seat-4"],
            seatWorldPositions["seat-4"],
          );
          updateAnchoredVector(
            entry,
            WORLD_TARGETS.music,
            worldTargets.music,
          );
          /* 자리 4의 작업 앵커는 접이식 노트북 바로 앞의 의도된 접촉점이다.
             작업 중에는 아래 이동 로직이 자기 책상 obstacle 을 이미 제외하므로,
             여기서 다시 바깥으로 밀면 고양이만 책상에서 멀어지게 된다. */
          updateAnchoredVector(
            entry,
            SEAT_WORKING_MARKER_WORLD_POSITIONS["seat-4"],
            seatWorkingMarkerWorldPositions["seat-4"],
          );
          updateAnchoredVector(
            entry,
            baseSeatWorkLookTargets["seat-4"],
            seatWorkLookTargets["seat-4"],
          );
          break;
        case DESK_OBSTACLE.id:
          updateAnchoredVector(
            entry,
            SEAT_WORLD_POSITIONS["seat-1"],
            seatWorldPositions["seat-1"],
          );
          updateAnchoredVector(
            entry,
            CODING_DESK_TARGET,
            codingDeskTarget,
          );
          updateAnchoredVector(
            entry,
            DESK_KNEADING_EXIT_POSITION,
            deskKneadingExitPosition,
          );
          updateAnchoredVector(
            entry,
            LOW_MONITOR_WORKING_MARKER_WORLD_POSITION,
            lowMonitorWorkingMarkerWorldPosition,
          );
          seatWorkingMarkerWorldPositions["seat-1"].copy(
            lowMonitorWorkingMarkerWorldPosition,
          );
          updateAnchoredVector(
            entry,
            baseSeatWorkLookTargets["seat-1"],
            seatWorkLookTargets["seat-1"],
          );
          updateAnchoredVector(
            entry,
            baseDeskKneadingLookTarget,
            deskKneadingLookTarget,
          );
          break;
      }
    };
    const syncEditableObject = (entry: EditableWorldObject) => {
      if (entry.obstacle && entry.initialObstacle) {
        const nextBounds = transformObstacleBounds(
          entry.initialObstacle,
          entry.initialPose,
          objectPoseFor(entry.object),
        );
        Object.assign(entry.obstacle, nextBounds);
        entry.object.userData.collisionBounds = {
          ...entry.obstacle,
        };
      }
      entry.onTransform?.(entry);
    };

    const selectionRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdc79,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    disableOutline(selectionRingMaterial);
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 0.94, 48),
      selectionRingMaterial,
    );
    selectionRing.name = "world-layout-selection-ring";
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.028;
    selectionRing.renderOrder = 225;
    selectionRing.visible = false;
    scene.add(selectionRing);

    const updateSelectionRing = () => {
      if (!selectedEditableObject || !layoutEditorEnabled) {
        selectionRing.visible = false;
        return;
      }

      const entry = selectedEditableObject;
      const width = entry.obstacle
        ? entry.obstacle.maxX - entry.obstacle.minX
        : 0.7;
      const depth = entry.obstacle
        ? entry.obstacle.maxZ - entry.obstacle.minZ
        : 0.7;
      const radius = THREE.MathUtils.clamp(
        Math.max(width, depth) * 0.66,
        0.32,
        1.6,
      );
      selectionRing.position.set(
        entry.object.position.x,
        0.028,
        entry.object.position.z,
      );
      selectionRing.scale.setScalar(radius);
      selectionRing.visible = true;
    };
    const selectEditableObject = (entry: EditableWorldObject | null) => {
      selectedEditableObject = entry;
      setSelectedLayoutObjectLabel(entry?.label ?? null);
      updateSelectionRing();
    };
    const registerEditableWorldObject = ({
      id,
      label,
      object,
      obstacle,
      onTransform,
    }: {
      id: string;
      label: string;
      object: THREE.Object3D;
      obstacle?: SceneObstacle;
      onTransform?: (entry: EditableWorldObject) => void;
    }) => {
      const initialPose = objectPoseFor(object);
      const defaultPose =
        HARD_CODED_WORLD_OBJECT_LAYOUT[id] ??
        EXTRA_CARE_FACILITY_DEFAULT_POSES[id] ??
        PURCHASABLE_WORLD_OBJECT_DEFAULT_POSES[id] ??
        initialPose;
      const entry: EditableWorldObject = {
        id,
        label,
        object,
        initialPose,
        defaultPose,
        obstacle: obstacle ?? null,
        initialObstacle: obstacle ? { ...obstacle } : null,
        onTransform,
      };
      object.userData.editableWorldObjectId = id;
      object.userData.editableWorldObjectLabel = label;
      editableWorldObjects.set(id, entry);

      const appliedPose = savedWorldLayout[id] ?? defaultPose;
      if (appliedPose) {
        object.position.x = THREE.MathUtils.clamp(
          appliedPose.x,
          WORLD_OBJECT_POSITION_LIMITS.minX,
          WORLD_OBJECT_POSITION_LIMITS.maxX,
        );
        object.position.z = THREE.MathUtils.clamp(
          appliedPose.z,
          WORLD_OBJECT_POSITION_LIMITS.minZ,
          WORLD_OBJECT_POSITION_LIMITS.maxZ,
        );
        object.rotation.y = appliedPose.rotationY;
      }
      syncEditableObject(entry);
      return entry;
    };
    const setLayoutEditorEnabled = (enabled: boolean) => {
      if (enabled && !layoutEditorAuthorized()) return;
      layoutEditorEnabled = enabled;
      objectDragPointerId = null;
      objectDragMoved = false;
      renderer.domElement.classList.toggle("is-layout-editing", enabled);
      renderer.domElement.style.cursor = enabled ? "crosshair" : "grab";
      setLayoutEditMode(enabled);
      if (!enabled) selectEditableObject(null);
    };
    const rotateSelectedEditableObject = (radians: number) => {
      if (!selectedEditableObject) return;
      selectedEditableObject.object.rotation.y += radians;
      syncEditableObject(selectedEditableObject);
      updateSelectionRing();
      persistEditableObject(selectedEditableObject);
    };
    const resetSelectedEditableObject = () => {
      if (!selectedEditableObject) return;
      selectedEditableObject.object.position.x =
        selectedEditableObject.defaultPose.x;
      selectedEditableObject.object.position.z =
        selectedEditableObject.defaultPose.z;
      selectedEditableObject.object.rotation.y =
        selectedEditableObject.defaultPose.rotationY;
      delete savedWorldLayout[selectedEditableObject.id];
      syncEditableObject(selectedEditableObject);
      updateSelectionRing();
      persistWorldLayout();
    };
    const saveCurrentWorldLayout = () => {
      if (!layoutEditorAuthorized()) return;
      savedWorldLayout = Object.fromEntries(
        [...editableWorldObjects.entries()]
          .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
          .map(([id, entry]) => [id, objectPoseFor(entry.object)]),
      );
      persistWorldLayout();
      host.dataset.savedWorldLayout = JSON.stringify(savedWorldLayout);
      setLayoutSaveRevision((revision) => revision + 1);
    };
    layoutEditorRuntimeRef.current = {
      setEnabled: setLayoutEditorEnabled,
      rotateSelected: rotateSelectedEditableObject,
      resetSelected: resetSelectedEditableObject,
      saveLayout: saveCurrentWorldLayout,
      addCareFacility: (intent) => addCareFacilityInScene(intent),
    };

    const hemisphereLight = new THREE.HemisphereLight(
      0xfff6dd,
      0x536c49,
      1.7,
    );
    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.1);
    keyLight.position.set(-4, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fcbe0, 0.65);
    fillLight.position.set(8, 5, -4);
    scene.add(fillLight);

    const moonLight = new THREE.DirectionalLight(0xa9c9ed, 0);
    moonLight.position.set(-7, 7, -5);
    scene.add(moonLight);

    const nightLanternLight = new THREE.PointLight(0xffc774, 0, 4.2, 2);
    nightLanternLight.position.copy(CAMPING_LANTERN_POSITION);
    nightLanternLight.position.y = 0.9;
    scene.add(nightLanternLight);

    const nightWorkstationLight = new THREE.PointLight(
      0xffd397,
      0,
      5.4,
      2,
    );
    nightWorkstationLight.position.copy(LOW_MONITOR_STATION_POSITION);
    nightWorkstationLight.position.y = 1.15;
    scene.add(nightWorkstationLight);

    const textureLoader = new THREE.TextureLoader();
    const replyReadyTexture = textureLoader.load(
      "/art/ui/reply-ready-exclamation-v1.png",
    );
    replyReadyTexture.colorSpace = THREE.SRGBColorSpace;
    replyReadyTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const catPaletteTexture = textureLoader.load(
      "/models/PolyArt/Animals/Cats/Texture/PolyArt_Cats_color.png",
    );
    catPaletteTexture.colorSpace = THREE.SRGBColorSpace;
    catPaletteTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const oceanTexture = textureLoader.load(
      "/art/ocean-water-tile-v1.png",
    );
    oceanTexture.colorSpace = THREE.SRGBColorSpace;
    oceanTexture.wrapS = THREE.RepeatWrapping;
    oceanTexture.wrapT = THREE.RepeatWrapping;
    oceanTexture.repeat.set(18, 18);
    oceanTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const oceanMaterial = new THREE.MeshBasicMaterial({
      map: oceanTexture,
      transparent: false,
      toneMapped: false,
    });
    oceanMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP

  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float sourceLuma = dot(
    sampledDiffuseColor.rgb,
    vec3( 0.2126, 0.7152, 0.0722 )
  );
  float watercolorDetail = ( sourceLuma - 0.36 ) * 0.42;
  vec3 styleLockedOcean = vec3( 0.1845, 0.5972, 0.5097 );
  sampledDiffuseColor.rgb = clamp(
    styleLockedOcean +
      watercolorDetail * vec3( 0.68, 0.9, 0.94 ),
    0.0,
    1.0
  );
  #ifdef DECODE_VIDEO_TEXTURE

    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );

  #endif

  diffuseColor *= sampledDiffuseColor;

#endif`,
      );
    };
    oceanMaterial.customProgramCacheKey = () =>
      "infinite-ocean-no-horizon-v1";
    disableOutline(oceanMaterial);
    const outerOcean = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      oceanMaterial,
    );
    outerOcean.name = "infinite-ocean-floor";
    outerOcean.rotation.x = -Math.PI / 2;
    outerOcean.position.y = -0.07;
    scene.add(outerOcean);

    const groundTexture = textureLoader.load(
      "/art/beach-island-ocean-v4-style-locked.png",
      () => {
        if (!disposed) setLoadingProgress((value) => Math.max(value, 22));
      },
    );
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );

    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      toneMapped: false,
    });
    const oceanTideUniform = { value: 0 };
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.oceanTideTime = oceanTideUniform;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform float oceanTideTime;

float shoreWaterSignal( vec3 color ) {
  float turquoiseLead = ( color.g + color.b ) * 0.5 - color.r;
  return smoothstep( 0.025, 0.16, turquoiseLead );
}`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP

  vec2 islandCenter = vec2( 0.5 );
  vec2 islandRadius = vMapUv - islandCenter;
  vec2 coastDirection =
    islandRadius / max( length( islandRadius ), 0.001 );
  float tideBreath =
    sin( oceanTideTime * 0.785 ) * 0.82 +
    sin( oceanTideTime * 0.31 + 1.2 ) * 0.18;
  float tideScale = tideBreath * 0.014;
  vec2 shoreTangent = vec2( -coastDirection.y, coastDirection.x );
  float smallCurrent =
    sin(
      oceanTideTime * 1.08 +
      vMapUv.x * 17.0 +
      vMapUv.y * 11.0
    ) * 0.0016;
  vec2 tideUv =
    islandCenter +
    islandRadius * ( 1.0 + tideScale ) +
    shoreTangent * smallCurrent;

  vec4 stillWaterColor = texture2D( map, vMapUv );
  vec4 movingWaterColor = texture2D( map, tideUv );
  float stillWater = shoreWaterSignal( stillWaterColor.rgb );
  float movingWater = shoreWaterSignal( movingWaterColor.rgb );
  float nearbyWater = max(
    stillWater,
    shoreWaterSignal(
      texture2D( map, vMapUv + coastDirection * 0.009 ).rgb
    )
  );
  float brightFoam = smoothstep(
    0.77,
    0.98,
    dot( stillWaterColor.rgb, vec3( 0.299, 0.587, 0.114 ) )
  );
  float shoreFoam = brightFoam * smoothstep( 0.04, 0.55, nearbyWater );
  float movingWaterMask = clamp(
    max( max( stillWater, movingWater ), shoreFoam ),
    0.0,
    1.0
  );
  vec4 sampledDiffuseColor = mix(
    stillWaterColor,
    movingWaterColor,
    movingWaterMask
  );
  float waterSurface = max( stillWater, movingWater );
  float surfaceRipple =
    sin(
      ( vMapUv.x + vMapUv.y ) * 38.0 +
      oceanTideTime * 1.08
    ) * 0.64 +
    sin(
      vMapUv.x * -29.0 +
      vMapUv.y * 44.0 -
      oceanTideTime * 0.74
    ) * 0.36;
  sampledDiffuseColor.rgb +=
    vec3( 0.02, 0.041, 0.052 ) *
    surfaceRipple *
    waterSurface;
  float foamPulse = ( tideBreath * 0.5 + 0.5 ) * shoreFoam;
  sampledDiffuseColor.rgb += vec3( 0.035, 0.065, 0.075 ) * foamPulse;
  float sourceLuma = dot(
    sampledDiffuseColor.rgb,
    vec3( 0.2126, 0.7152, 0.0722 )
  );
  vec3 unifiedOceanColor = clamp(
    vec3( 0.1845, 0.5972, 0.5097 ) +
      ( sourceLuma - 0.36 ) * 0.42 * vec3( 0.68, 0.9, 0.94 ),
    0.0,
    1.0
  );
  float unifiedWaterMask = max( waterSurface, shoreFoam * 0.32 );
  sampledDiffuseColor.rgb = mix(
    sampledDiffuseColor.rgb,
    unifiedOceanColor,
    unifiedWaterMask * 0.82
  );
  float edgeDistance = min(
    min( vMapUv.x, 1.0 - vMapUv.x ),
    min( vMapUv.y, 1.0 - vMapUv.y )
  );
  float edgeBlend = 1.0 - smoothstep( 0.0, 0.085, edgeDistance );
  sampledDiffuseColor.a *=
    1.0 - max( waterSurface, shoreFoam ) * edgeBlend;

  #ifdef DECODE_VIDEO_TEXTURE

    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );

  #endif

  diffuseColor *= sampledDiffuseColor;

#endif`,
      );
    };
    groundMaterial.customProgramCacheKey = () =>
      "shore-tide-infinite-ocean-v1";
    disableOutline(groundMaterial);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 15),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    scene.add(ground);

    const shoreWaterOverlayMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
    });
    shoreWaterOverlayMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
float shoreOverlayWaterSignal( vec3 color ) {
  float turquoiseLead = ( color.g + color.b ) * 0.5 - color.r;
  return smoothstep( 0.02, 0.14, turquoiseLead );
}`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP

  vec2 islandCenter = vec2( 0.5 );
  vec2 coastDirection =
    ( vMapUv - islandCenter ) /
    max( length( vMapUv - islandCenter ), 0.001 );
  vec4 shoreColor = texture2D( map, vMapUv );
  float waterMask = shoreOverlayWaterSignal( shoreColor.rgb );
  float nearbyWater = max(
    waterMask,
    shoreOverlayWaterSignal(
      texture2D( map, vMapUv + coastDirection * 0.012 ).rgb
    )
  );
  float foamBrightness = smoothstep(
    0.76,
    0.98,
    dot( shoreColor.rgb, vec3( 0.299, 0.587, 0.114 ) )
  );
  float foamMask =
    foamBrightness * smoothstep( 0.035, 0.5, nearbyWater );
  shoreColor.a *= clamp( max( waterMask, foamMask ), 0.0, 1.0 );
  float edgeDistance = min(
    min( vMapUv.x, 1.0 - vMapUv.x ),
    min( vMapUv.y, 1.0 - vMapUv.y )
  );
  shoreColor.a *= smoothstep( 0.0, 0.095, edgeDistance );

  #ifdef DECODE_VIDEO_TEXTURE

    shoreColor = sRGBTransferEOTF( shoreColor );

  #endif

  diffuseColor *= shoreColor;

#endif`,
      );
    };
    shoreWaterOverlayMaterial.customProgramCacheKey = () =>
      "shore-water-infinite-ocean-v1";
    disableOutline(shoreWaterOverlayMaterial);
    const shoreWaterOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 15),
      shoreWaterOverlayMaterial,
    );
    shoreWaterOverlay.name = "animated-shore-water-overlay";
    shoreWaterOverlay.rotation.x = -Math.PI / 2;
    shoreWaterOverlay.position.y = -0.017;
    shoreWaterOverlay.renderOrder = 1;
    scene.add(shoreWaterOverlay);

    const maximumAnisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const deskKeycapTopTextures = DESK_KEYCAP_TEXTURE_URLS.map((url) => {
      const texture = textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maximumAnisotropy;
      return texture;
    });
    const workstationInteractions = new Map(
      (Object.keys(WORKSTATION_INTERACTION_LAYOUTS) as SeatId[]).map(
        (seatId) => [
          seatId,
          createCodingStationInteractionOverlay(
            WORKSTATION_INTERACTION_LAYOUTS[seatId],
            deskKeycapTopTextures,
          ),
        ],
      ),
    );
    let monitorCalibrationEnabled = false;
    let selectedMonitorSeatIdInScene: SeatId = "seat-2";
    let savedMonitorScreenLayout: WorkstationScreenLayout = {};

    const defaultMonitorScreenPoseFor = (
      seatId: SeatId,
    ): WorkstationScreenPose => {
      const layout = WORKSTATION_INTERACTION_LAYOUTS[seatId];
      return {
        x: layout.screenPosition.x,
        y: layout.screenPosition.y,
        z: layout.screenPosition.z,
        width: layout.screenSize.x,
        height: layout.screenSize.y,
        rotationX: layout.screenRotationX,
      };
    };
    const monitorScreenPoseFor = (seatId: SeatId): WorkstationScreenPose => {
      const layout = WORKSTATION_INTERACTION_LAYOUTS[seatId];
      const screen = workstationInteractions.get(seatId)?.monitorScreen;
      if (!screen) return defaultMonitorScreenPoseFor(seatId);
      return {
        x: screen.position.x,
        y: screen.position.y,
        z: screen.position.z,
        width: layout.screenSize.x * screen.scale.x,
        height: layout.screenSize.y * screen.scale.y,
        rotationX: screen.rotation.x,
      };
    };
    const applyMonitorScreenPose = (
      seatId: SeatId,
      pose: WorkstationScreenPose,
    ) => {
      const layout = WORKSTATION_INTERACTION_LAYOUTS[seatId];
      const screen = workstationInteractions.get(seatId)?.monitorScreen;
      if (!screen) return;
      screen.position.set(pose.x, pose.y, pose.z);
      screen.scale.set(
        pose.width / layout.screenSize.x,
        pose.height / layout.screenSize.y,
        1,
      );
      screen.rotation.x = pose.rotationX;
    };
    const publishSelectedMonitorMetrics = () => {
      const pose = monitorScreenPoseFor(selectedMonitorSeatIdInScene);
      setSelectedMonitorScreenSeatId(selectedMonitorSeatIdInScene);
      setMonitorScreenCalibrationMetrics({
        ...pose,
        rotationDegrees: THREE.MathUtils.radToDeg(pose.rotationX),
      });
    };
    const persistMonitorScreenLayout = () => {
      if (!layoutEditorAuthorized()) return;
      try {
        window.localStorage.setItem(
          WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY,
          JSON.stringify(savedMonitorScreenLayout),
        );
      } catch {
        // Privacy mode can block storage. Calibration remains available in-memory.
      }
    };
    const persistSelectedMonitor = () => {
      savedMonitorScreenLayout[selectedMonitorSeatIdInScene] =
        monitorScreenPoseFor(selectedMonitorSeatIdInScene);
      persistMonitorScreenLayout();
      publishSelectedMonitorMetrics();
    };
    const mutateSelectedMonitor = (
      mutate: (screen: THREE.Mesh, pose: WorkstationScreenPose) => void,
    ) => {
      const screen = workstationInteractions.get(
        selectedMonitorSeatIdInScene,
      )?.monitorScreen;
      if (!screen) return;
      mutate(screen, monitorScreenPoseFor(selectedMonitorSeatIdInScene));
      persistSelectedMonitor();
    };
    const nudgeSelectedMonitor = (deltaX: number, deltaY: number) => {
      mutateSelectedMonitor((screen) => {
        screen.position.x = THREE.MathUtils.clamp(
          screen.position.x + deltaX,
          MONITOR_SCREEN_POSITION_LIMITS.minX,
          MONITOR_SCREEN_POSITION_LIMITS.maxX,
        );
        screen.position.y = THREE.MathUtils.clamp(
          screen.position.y + deltaY,
          MONITOR_SCREEN_POSITION_LIMITS.minY,
          MONITOR_SCREEN_POSITION_LIMITS.maxY,
        );
      });
    };
    const nudgeSelectedMonitorDepth = (deltaZ: number) => {
      mutateSelectedMonitor((screen) => {
        screen.position.z = THREE.MathUtils.clamp(
          screen.position.z + deltaZ,
          MONITOR_SCREEN_POSITION_LIMITS.minZ,
          MONITOR_SCREEN_POSITION_LIMITS.maxZ,
        );
      });
    };
    const resizeSelectedMonitor = (
      deltaWidth: number,
      deltaHeight: number,
    ) => {
      mutateSelectedMonitor((_screen, pose) => {
        applyMonitorScreenPose(selectedMonitorSeatIdInScene, {
          ...pose,
          width: THREE.MathUtils.clamp(
            pose.width + deltaWidth,
            MONITOR_SCREEN_SIZE_LIMITS.minWidth,
            MONITOR_SCREEN_SIZE_LIMITS.maxWidth,
          ),
          height: THREE.MathUtils.clamp(
            pose.height + deltaHeight,
            MONITOR_SCREEN_SIZE_LIMITS.minHeight,
            MONITOR_SCREEN_SIZE_LIMITS.maxHeight,
          ),
        });
      });
    };
    const scaleSelectedMonitor = (deltaRatio: number) => {
      mutateSelectedMonitor((_screen, pose) => {
        const ratio = Math.max(0.1, 1 + deltaRatio);
        applyMonitorScreenPose(selectedMonitorSeatIdInScene, {
          ...pose,
          width: THREE.MathUtils.clamp(
            pose.width * ratio,
            MONITOR_SCREEN_SIZE_LIMITS.minWidth,
            MONITOR_SCREEN_SIZE_LIMITS.maxWidth,
          ),
          height: THREE.MathUtils.clamp(
            pose.height * ratio,
            MONITOR_SCREEN_SIZE_LIMITS.minHeight,
            MONITOR_SCREEN_SIZE_LIMITS.maxHeight,
          ),
        });
      });
    };
    const tiltSelectedMonitor = (radians: number) => {
      mutateSelectedMonitor((screen) => {
        screen.rotation.x = THREE.MathUtils.clamp(
          screen.rotation.x + radians,
          -Math.PI / 3,
          Math.PI / 3,
        );
      });
    };

    if (layoutEditorAuthorized()) {
      try {
        savedMonitorScreenLayout = parseWorkstationScreenLayout(
          window.localStorage.getItem(WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY),
        );
      } catch {
        // Storage is optional; hard-coded values remain the fallback.
      }
      (Object.entries(savedMonitorScreenLayout) as Array<
        [SeatId, WorkstationScreenPose]
      >).forEach(([seatId, pose]) => applyMonitorScreenPose(seatId, pose));
    }

    const setMonitorCalibrationEnabled = (enabled: boolean) => {
      if (enabled && !layoutEditorAuthorized()) return;
      monitorCalibrationEnabled = enabled;
      setMonitorCalibrationMode(enabled);
      if (enabled) {
        if (layoutEditorEnabled) setLayoutEditorEnabled(false);
        publishSelectedMonitorMetrics();
      } else {
        setMonitorScreenCalibrationMetrics(null);
      }
    };
    const selectMonitorSeat = (seatId: SeatId) => {
      selectedMonitorSeatIdInScene = seatId;
      publishSelectedMonitorMetrics();
    };
    const resetSelectedMonitor = () => {
      delete savedMonitorScreenLayout[selectedMonitorSeatIdInScene];
      applyMonitorScreenPose(
        selectedMonitorSeatIdInScene,
        defaultMonitorScreenPoseFor(selectedMonitorSeatIdInScene),
      );
      persistMonitorScreenLayout();
      publishSelectedMonitorMetrics();
    };
    const saveMonitorScreenLayout = () => {
      if (!layoutEditorAuthorized()) return;
      savedMonitorScreenLayout = Object.fromEntries(
        (Object.keys(WORKSTATION_INTERACTION_LAYOUTS) as SeatId[]).map(
          (seatId) => [seatId, monitorScreenPoseFor(seatId)],
        ),
      );
      persistMonitorScreenLayout();
      host.dataset.savedMonitorScreenLayout = JSON.stringify(
        savedMonitorScreenLayout,
      );
      setMonitorCalibrationSaveRevision((revision) => revision + 1);
    };
    const isMonitorCalibrationTextTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest("input, textarea, select, a, [contenteditable='true']"),
      );
    };
    const handleMonitorCalibrationKeyDown = (event: KeyboardEvent) => {
      if (
        !monitorCalibrationEnabled ||
        event.ctrlKey ||
        event.metaKey ||
        isMonitorCalibrationTextTarget(event.target)
      ) {
        return;
      }

      const positionStep = event.altKey ? 0.001 : event.shiftKey ? 0.02 : 0.005;
      const sizeStep = event.altKey ? 0.001 : event.shiftKey ? 0.02 : 0.005;
      const scaleStep = event.altKey ? 0.002 : event.shiftKey ? 0.04 : 0.01;
      const rotationStep = THREE.MathUtils.degToRad(
        event.altKey ? 0.1 : event.shiftKey ? 2 : 0.5,
      );
      let handled = true;

      switch (event.code) {
        case "ArrowLeft":
          nudgeSelectedMonitor(-positionStep, 0);
          break;
        case "ArrowRight":
          nudgeSelectedMonitor(positionStep, 0);
          break;
        case "ArrowUp":
          nudgeSelectedMonitor(0, positionStep);
          break;
        case "ArrowDown":
          nudgeSelectedMonitor(0, -positionStep);
          break;
        case "KeyA":
          resizeSelectedMonitor(-sizeStep, 0);
          break;
        case "KeyD":
          resizeSelectedMonitor(sizeStep, 0);
          break;
        case "KeyS":
          resizeSelectedMonitor(0, -sizeStep);
          break;
        case "KeyW":
          resizeSelectedMonitor(0, sizeStep);
          break;
        case "BracketLeft":
        case "NumpadSubtract":
          scaleSelectedMonitor(-scaleStep);
          break;
        case "BracketRight":
        case "NumpadAdd":
          scaleSelectedMonitor(scaleStep);
          break;
        case "KeyQ":
          tiltSelectedMonitor(-rotationStep);
          break;
        case "KeyE":
          tiltSelectedMonitor(rotationStep);
          break;
        case "PageUp":
          nudgeSelectedMonitorDepth(positionStep);
          break;
        case "PageDown":
          nudgeSelectedMonitorDepth(-positionStep);
          break;
        default:
          handled = false;
      }

      if (handled) event.preventDefault();
    };
    monitorCalibrationRuntimeRef.current = {
      setEnabled: setMonitorCalibrationEnabled,
      selectSeat: selectMonitorSeat,
      nudgeSelected: nudgeSelectedMonitor,
      nudgeDepthSelected: nudgeSelectedMonitorDepth,
      resizeSelected: resizeSelectedMonitor,
      scaleSelected: scaleSelectedMonitor,
      tiltSelected: tiltSelectedMonitor,
      resetSelected: resetSelectedMonitor,
      saveLayout: saveMonitorScreenLayout,
    };
    if (monitorAblationMode === "screen-mipmaps") {
      workstationInteractions.forEach(({ monitorScreenTexture }) => {
        monitorScreenTexture.generateMipmaps = true;
        monitorScreenTexture.minFilter = THREE.LinearMipmapLinearFilter;
        monitorScreenTexture.needsUpdate = true;
      });
    }
    const islandPropsWatercolorTexture = textureLoader.load(
      "/art/island-props-watercolor-grain-v1.png",
    );
    islandPropsWatercolorTexture.colorSpace = THREE.SRGBColorSpace;
    islandPropsWatercolorTexture.wrapS = THREE.RepeatWrapping;
    islandPropsWatercolorTexture.wrapT = THREE.RepeatWrapping;
    islandPropsWatercolorTexture.repeat.set(1.2, 1.2);
    islandPropsWatercolorTexture.anisotropy = maximumAnisotropy;

    ROCK_CLUSTER_PLACEMENTS.forEach((placement) => {
      const rockCluster = createRockCluster(
        islandPropsWatercolorTexture,
        placement,
      );
      const obstacle = ROCK_CLUSTER_OBSTACLES.find(
        (candidate) => candidate.id === placement.id,
      );
      registerEditableWorldObject({
        id: placement.id,
        label: `해변 바위 ${placement.id.split("-").at(-1) ?? ""}`,
        object: rockCluster,
        obstacle: obstacle ? runtimeObstacleFor(obstacle) : undefined,
      });
      scene.add(rockCluster);
    });
    const palmLeafSwayTargets: PalmLeafSwayTarget[] = [];

    const meshyPropLoader = new GLTFLoader();
    meshyPropLoader.setMeshoptDecoder(MeshoptDecoder);
    let collectibleShellTemplate: THREE.Group | null = null;
    type FoodBowlInstance = {
      id: string;
      group: THREE.Group;
      obstacle: SceneObstacle;
      approachPosition: THREE.Vector3;
      waitPosition: THREE.Vector3;
      emptyVisual: THREE.Object3D;
      fullVisual: THREE.Object3D;
      sparkles: Array<{
        sprite: THREE.Sprite;
        material: THREE.SpriteMaterial;
        phase: number;
      }>;
    };
    type LitterBoxInstance = {
      id: string;
      group: THREE.Group;
      obstacle: SceneObstacle;
      approachPosition: THREE.Vector3;
      usePosition: THREE.Vector3;
      waitPosition: THREE.Vector3;
      gauge: ReturnType<typeof createLitterLevelGauge>;
      odorParticles: Array<{
        sprite: THREE.Sprite;
        material: THREE.SpriteMaterial;
        phase: number;
        drift: number;
      }>;
    };
    const foodBowlInstances: FoodBowlInstance[] = [];
    const litterBoxInstances: LitterBoxInstance[] = [];

    const foodBowlGroup = new THREE.Group();
    foodBowlGroup.name = "cat-food-bowl-facility";
    foodBowlGroup.position.copy(FOOD_BOWL_POSITION);
    foodBowlGroup.rotation.y = -0.18;
    foodBowlGroup.userData.isNavigationObstacle = true;
    foodBowlGroup.userData.collisionBounds = { ...foodBowlObstacle };
    let emptyBowlVisual = createFallbackFoodBowl(false);
    let fullBowlVisual = createFallbackFoodBowl(true);
    emptyBowlVisual.name = "cat-food-bowl-empty-fallback";
    fullBowlVisual.name = "cat-food-bowl-full-fallback";
    emptyBowlVisual.scale.setScalar(0.6);
    fullBowlVisual.scale.setScalar(0.6);
    emptyBowlVisual.visible = !hasFoodAvailable();
    fullBowlVisual.visible = hasFoodAvailable();
    const foodBowlProxy = createInteractionProxy("food-bowl", 0.21);
    foodBowlProxy.position.y = 0.08;
    foodBowlGroup.add(
      emptyBowlVisual,
      fullBowlVisual,
      createMeshyPropShadow("cat-food-bowl", 0.19, 0.1),
      foodBowlProxy,
    );
    const foodSparkleCanvas = document.createElement("canvas");
    foodSparkleCanvas.width = 64;
    foodSparkleCanvas.height = 64;
    const foodSparkleContext = foodSparkleCanvas.getContext("2d");
    if (foodSparkleContext) {
      const gradient = foodSparkleContext.createRadialGradient(
        32,
        32,
        1,
        32,
        32,
        30,
      );
      gradient.addColorStop(0, "rgba(255,255,230,1)");
      gradient.addColorStop(0.2, "rgba(255,236,120,.95)");
      gradient.addColorStop(1, "rgba(255,220,80,0)");
      foodSparkleContext.fillStyle = gradient;
      foodSparkleContext.fillRect(0, 0, 64, 64);
    }
    const foodSparkleTexture = new THREE.CanvasTexture(foodSparkleCanvas);
    foodSparkleTexture.colorSpace = THREE.SRGBColorSpace;
    const premiumFoodSparkles = Array.from({ length: 4 }, (_, index) => {
      const material = new THREE.SpriteMaterial({
        map: foodSparkleTexture,
        color: 0xffef9d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      disableOutline(material);
      const sprite = new THREE.Sprite(material);
      sprite.name = `premium-food-sparkle-${index + 1}`;
      sprite.position.set(
        ((index % 2) * 2 - 1) * 0.12,
        0.16 + Math.floor(index / 2) * 0.12,
        index % 2 ? 0.05 : -0.04,
      );
      sprite.scale.setScalar(0.09);
      foodBowlGroup.add(sprite);
      return { sprite, material, phase: index * 1.7 };
    });
    let appliedFoodGrade: FoodGrade | null | undefined;
    const applyFoodGradeAppearance = () => {
      const nextGrade = foodGradeRef.current;
      if (nextGrade === appliedFoodGrade) return;
      appliedFoodGrade = nextGrade;
      const tint = new THREE.Color(
        FOOD_PROFILES[nextGrade ?? "Basic"].tint,
      );
      foodBowlInstances.forEach((instance) => {
        instance.fullVisual.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if (
              !(
                material instanceof THREE.MeshStandardMaterial ||
                material instanceof THREE.MeshPhysicalMaterial ||
                material instanceof THREE.MeshBasicMaterial ||
                material instanceof THREE.MeshToonMaterial
              )
            ) {
              return;
            }
            const storedBase = material.userData.foodBaseColor;
            if (typeof storedBase !== "number") {
              material.userData.foodBaseColor = material.color.getHex();
            }
            material.color
              .setHex(material.userData.foodBaseColor as number)
              .multiply(tint);
            material.needsUpdate = true;
          });
        });
      });
    };
    scene.add(foodBowlGroup);
    clickableObjects.push(foodBowlProxy);
    registerEditableWorldObject({
      id: FOOD_BOWL_OBSTACLE.id,
      label: "고양이 밥그릇",
      object: foodBowlGroup,
      obstacle: foodBowlObstacle,
      onTransform: (entry) => {
        updateAnchoredVector(
          entry,
          FOOD_BOWL_APPROACH_POSITION,
          foodBowlApproachPosition,
        );
        updateAnchoredVector(
          entry,
          FOOD_BOWL_WAIT_POSITION,
          foodBowlWaitPosition,
        );
      },
    });
    foodBowlInstances.push({
      id: FOOD_BOWL_OBSTACLE.id,
      group: foodBowlGroup,
      obstacle: foodBowlObstacle,
      approachPosition: foodBowlApproachPosition,
      waitPosition: foodBowlWaitPosition,
      emptyVisual: emptyBowlVisual,
      fullVisual: fullBowlVisual,
      sparkles: premiumFoodSparkles,
    });
    applyFoodGradeAppearance();

    const snackGroup = new THREE.Group();
    snackGroup.name = "placed-cat-snack";
    snackGroup.visible = false;
    const snackBase = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.07, 0.16, 3, 0.035),
      createIllustratedMaterial(0xeaa66f),
    );
    snackBase.position.y = 0.055;
    snackBase.rotation.y = 0.35;
    const snackTop = new THREE.Mesh(
      new RoundedBoxGeometry(0.15, 0.045, 0.11, 3, 0.028),
      createIllustratedMaterial(0xf7d89e),
    );
    snackTop.position.set(0.02, 0.105, 0);
    snackTop.rotation.y = -0.18;
    snackGroup.add(
      snackBase,
      snackTop,
      createMeshyPropShadow("placed-cat-snack", 0.2, 0.075),
    );
    scene.add(snackGroup);
    const snackTarget = new THREE.Vector3();
    let activeSnackId = 0;
    let activeSnackTimer = 0;
    let activeSnackEatingTimer = 0;
    let activeSnackCatId = "";
    let activeSnackPhase: "none" | "approaching" | "eating" = "none";
    const resolveActiveSnack = (consumed: boolean) => {
      if (activeSnackPhase === "none") return;
      const placementId = activeSnackId;
      const catId = activeSnackCatId;
      activeSnackPhase = "none";
      activeSnackTimer = 0;
      activeSnackEatingTimer = 0;
      snackGroup.visible = false;
      onSnackResolvedRef.current?.({ placementId, catId, consumed });
    };

    const laserPointerGroup = new THREE.Group();
    laserPointerGroup.name = "cat-laser-pointer";
    laserPointerGroup.visible = false;
    const laserGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5f66,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const laserCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2838,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
    });
    const laserGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 28),
      laserGlowMaterial,
    );
    laserGlow.rotation.x = -Math.PI / 2;
    laserGlow.position.y = 0.012;
    const laserCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 24),
      laserCoreMaterial,
    );
    laserCore.rotation.x = -Math.PI / 2;
    laserCore.position.y = 0.018;
    laserPointerGroup.add(laserGlow, laserCore);
    scene.add(laserPointerGroup);
    const laserTarget = new THREE.Vector3();
    let laserActive = false;
    let laserElapsed = 0;
    let laserCatId = "";
    const setLaserTargetFromPointer = (clientX: number, clientY: number) => {
      updatePointerRay(clientX, clientY);
      if (!raycaster.ray.intersectPlane(objectDragPlane, objectDragHit)) {
        return false;
      }
      const normalizedIslandDistance =
        (objectDragHit.x * objectDragHit.x) / (4.15 * 4.15) +
        (objectDragHit.z * objectDragHit.z) / (3.25 * 3.25);
      if (normalizedIslandDistance > 1) return false;
      laserTarget.set(objectDragHit.x, 0, objectDragHit.z);
      laserPointerGroup.position.copy(laserTarget);
      laserPointerGroup.position.y = 0.025;
      return true;
    };
    const resolveLaserPlay = (completed: boolean) => {
      if (!laserActive) return;
      const catId = laserCatId;
      laserActive = false;
      laserElapsed = 0;
      laserCatId = "";
      laserPointerGroup.visible = false;
      onLaserResolvedRef.current?.({ catId, completed });
    };

    const toyHuntGroup = new THREE.Group();
    toyHuntGroup.name = "cat-feather-lure";
    toyHuntGroup.visible = false;
    const toyFeatherMaterials = [
      new THREE.MeshToonMaterial({ color: 0x74aa91 }),
      new THREE.MeshToonMaterial({ color: 0xf0b585 }),
      new THREE.MeshToonMaterial({ color: 0xf5dfae }),
    ];
    const toyFeatherVeinMaterial = new THREE.MeshToonMaterial({
      color: 0x8b695b,
    });
    const toyFeatherKnotMaterial = new THREE.MeshToonMaterial({
      color: 0x9bc8b3,
    });
    for (const material of [
      ...toyFeatherMaterials,
      toyFeatherVeinMaterial,
      toyFeatherKnotMaterial,
    ]) {
      material.userData.outlineParameters = {
        thickness: ILLUSTRATION_OUTLINE_THICKNESS,
        color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
        alpha: ILLUSTRATION_OUTLINE_ALPHA,
      };
    }
    const toyFeatherKnot = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 16, 10),
      toyFeatherKnotMaterial,
    );
    toyFeatherKnot.position.y = 0.08;
    toyHuntGroup.add(toyFeatherKnot);
    for (let index = 0; index < 3; index += 1) {
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.32, 12),
        toyFeatherMaterials[index],
      );
      feather.position.set(
        (index - 1) * 0.072,
        0.25 + Math.abs(index - 1) * 0.025,
        0,
      );
      feather.rotation.z = (index - 1) * -0.42;
      const vein = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.25, 8),
        toyFeatherVeinMaterial,
      );
      vein.position.copy(feather.position);
      vein.position.y -= 0.01;
      vein.rotation.z = feather.rotation.z;
      toyHuntGroup.add(feather, vein);
    }
    scene.add(toyHuntGroup);
    const toyTarget = new THREE.Vector3();
    let toyActive = false;
    let toyChaseElapsed = 0;
    let toyAttackElapsed = 0;
    let toyCatId = "";
    const startToyHuntFromPointer = (clientX: number, clientY: number) => {
      updatePointerRay(clientX, clientY);
      if (!raycaster.ray.intersectPlane(objectDragPlane, objectDragHit)) {
        return false;
      }
      const normalizedIslandDistance =
        (objectDragHit.x * objectDragHit.x) / (4.15 * 4.15) +
        (objectDragHit.z * objectDragHit.z) / (3.25 * 3.25);
      if (normalizedIslandDistance > 1) return false;
      toyTarget.set(objectDragHit.x, 0, objectDragHit.z);
      toyHuntGroup.position.copy(toyTarget);
      toyHuntGroup.visible = true;
      toyActive = true;
      toyChaseElapsed = 0;
      toyAttackElapsed = 0;
      toyCatId =
        interactionCatIdRef.current ??
        (seatsRef.current[0] ?? DEFAULT_SEAT_VIEW).catId;
      avoidanceWaypoints.length = 0;
      setAmbientLabel("깃털 장난감을 발견했어요");
      return true;
    };
    const resolveToyHunt = (completed: boolean) => {
      if (!toyActive) return;
      const catId = toyCatId;
      toyActive = false;
      toyChaseElapsed = 0;
      toyAttackElapsed = 0;
      toyCatId = "";
      toyHuntGroup.visible = false;
      onToyResolvedRef.current?.({ catId, completed });
    };

    void Promise.all([
      meshyPropLoader.loadAsync(FOOD_BOWL_EMPTY_MODEL_URL),
      meshyPropLoader.loadAsync(FOOD_BOWL_FULL_MODEL_URL),
    ])
      .then(([emptyGltf, fullGltf]) => {
        if (disposed) return;
        const nextEmpty = createMeshyPropTemplate(
          emptyGltf.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
          0.0032,
          0.78,
          "unlit",
        );
        const nextFull = createMeshyPropTemplate(
          fullGltf.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
          0.0032,
          0.78,
          "unlit",
        );
        nextEmpty.name = "cat-food-bowl-empty-meshy6";
        nextFull.name = "cat-food-bowl-full-meshy6";
        nextEmpty.scale.setScalar(FOOD_BOWL_RENDER_HEIGHT);
        nextFull.scale.setScalar(FOOD_BOWL_RENDER_HEIGHT);
        foodBowlInstances.forEach((instance, index) => {
          const replacementEmpty =
            index === 0 ? nextEmpty : nextEmpty.clone(true);
          const replacementFull =
            index === 0 ? nextFull : nextFull.clone(true);
          instance.group.remove(instance.emptyVisual, instance.fullVisual);
          instance.emptyVisual = replacementEmpty;
          instance.fullVisual = replacementFull;
          replacementEmpty.visible = !hasFoodAvailable();
          replacementFull.visible = hasFoodAvailable();
          instance.group.add(replacementEmpty, replacementFull);
        });
        emptyBowlVisual = foodBowlInstances[0].emptyVisual;
        fullBowlVisual = foodBowlInstances[0].fullVisual;
        appliedFoodGrade = undefined;
        applyFoodGradeAppearance();
      })
      .catch((error) => {
        console.warn("Cat food bowl models failed to load.", error);
      });

    const litterBoxGroup = new THREE.Group();
    litterBoxGroup.name = "covered-cat-litter-box-facility";
    litterBoxGroup.position.copy(LITTER_BOX_POSITION);
    litterBoxGroup.rotation.y = -0.16;
    litterBoxGroup.userData.isNavigationObstacle = true;
    litterBoxGroup.userData.collisionBounds = { ...litterBoxObstacle };
    const litterBoxVisual = createCoveredCatLitterBox();
    litterBoxVisual.scale.setScalar(0.86);
    const litterBoxProxy = createInteractionProxy("litter-box", 0.62);
    litterBoxProxy.position.y = 0.31;
    const litterLevelGauge = createLitterLevelGauge(
      litterLevelRef.current,
      litterMaxLevelRef.current,
    );
    litterLevelGauge.label.position.set(
      litterBoxGroup.position.x,
      1.12,
      litterBoxGroup.position.z,
    );
    scene.add(litterLevelGauge.label);
    billboardObjects.push(litterLevelGauge.label);

    const litterOdorTexture = createLitterOdorTexture();
    const litterOdorParticles = Array.from({ length: 7 }, (_, index) => {
      const material = new THREE.SpriteMaterial({
        map: litterOdorTexture,
        color: index % 2 ? 0xb8a65d : 0x91a66f,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      disableOutline(material);
      const sprite = new THREE.Sprite(material);
      const phase = index / 7;
      sprite.name = `litter-odor-particle-${index + 1}`;
      sprite.position.set(
        ((index % 3) - 1) * 0.13,
        0.52 + phase * 0.45,
        -0.02 + (index % 2) * 0.08,
      );
      sprite.scale.setScalar(0.12);
      return {
        sprite,
        material,
        phase,
        drift: index % 2 ? 1 : -1,
      };
    });
    const litterOdorGroup = new THREE.Group();
    litterOdorGroup.name = "litter-box-odor-particles";
    litterOdorParticles.forEach(({ sprite }) => litterOdorGroup.add(sprite));
    litterBoxGroup.add(
      litterBoxVisual,
      createMeshyPropShadow("covered-cat-litter-box", 0.58, 0.1),
      litterOdorGroup,
      litterBoxProxy,
    );
    scene.add(litterBoxGroup);
    clickableObjects.push(litterBoxProxy);
    registerEditableWorldObject({
      id: LITTER_BOX_OBSTACLE.id,
      label: "고양이 화장실",
      object: litterBoxGroup,
      obstacle: litterBoxObstacle,
      onTransform: (entry) => {
        updateAnchoredVector(
          entry,
          LITTER_BOX_APPROACH_POSITION,
          litterBoxApproachPosition,
        );
        updateAnchoredVector(
          entry,
          LITTER_BOX_USE_POSITION,
          litterBoxUsePosition,
        );
        updateAnchoredVector(
          entry,
          LITTER_BOX_WAIT_POSITION,
          litterBoxWaitPosition,
        );
        litterLevelGauge.label.position.set(
          entry.object.position.x,
          1.12,
          entry.object.position.z,
        );
      },
    });
    litterBoxInstances.push({
      id: LITTER_BOX_OBSTACLE.id,
      group: litterBoxGroup,
      obstacle: litterBoxObstacle,
      approachPosition: litterBoxApproachPosition,
      usePosition: litterBoxUsePosition,
      waitPosition: litterBoxWaitPosition,
      gauge: litterLevelGauge,
      odorParticles: litterOdorParticles,
    });

    const syncFoodBowlVisuals = () => {
      const available = hasFoodAvailable();
      foodBowlInstances.forEach((instance) => {
        instance.fullVisual.visible = available;
        instance.emptyVisual.visible = !available;
      });
    };
    const syncLitterLevelGauges = () => {
      litterBoxInstances.forEach((instance) => {
        instance.gauge.update(
          litterLevelRef.current,
          litterMaxLevelRef.current,
        );
      });
    };
    const careFacilityCountsFromScene = () => ({
      food: foodBowlInstances.length,
      toilet: litterBoxInstances.length,
    });
    const publishCareFacilityCounts = () => {
      const counts = careFacilityCountsFromScene();
      host.dataset.careFacilityCounts = JSON.stringify(counts);
      setCareFacilityCounts(counts);
    };
    const addSecondFoodBowl = (persist: boolean) => {
      if (foodBowlInstances.length >= MAX_CARE_FACILITY_COUNT) return false;
      const source = foodBowlInstances[0];
      const id = CARE_FACILITY_LAYOUT_IDS.food[1];
      const group = source.group.clone(true);
      group.name = "cat-food-bowl-facility-2";
      group.position.set(1.18, 0, -3.6);
      group.rotation.y = 0.12;
      const obstacle: SceneObstacle = {
        id,
        minX: group.position.x - 0.17,
        maxX: group.position.x + 0.17,
        minZ: group.position.z - 0.15,
        maxZ: group.position.z + 0.15,
      };
      runtimeObstacleById.set(id, obstacle);
      dynamicCareObstacleIds.add(id);
      group.userData.isNavigationObstacle = true;
      group.userData.collisionBounds = { ...obstacle };
      const proxy = group.getObjectByProperty(
        "name",
        "food-bowl-click-proxy",
      );
      if (proxy) clickableObjects.push(proxy);
      const emptyVisual =
        group.getObjectByName(source.emptyVisual.name) ??
        group.getObjectByName("cat-food-bowl-empty-fallback");
      const fullVisual =
        group.getObjectByName(source.fullVisual.name) ??
        group.getObjectByName("cat-food-bowl-full-fallback");
      if (!emptyVisual || !fullVisual) return false;
      const sparkles: FoodBowlInstance["sparkles"] = [];
      group.traverse((object) => {
        if (
          object instanceof THREE.Sprite &&
          object.name.startsWith("premium-food-sparkle-")
        ) {
          object.material = object.material.clone();
          const index = Number(object.name.split("-").at(-1) ?? 1) - 1;
          sparkles.push({
            sprite: object,
            material: object.material,
            phase: Math.max(0, index) * 1.7,
          });
        }
      });
      const baseApproach = new THREE.Vector3(
        group.position.x + (FOOD_BOWL_APPROACH_POSITION.x - FOOD_BOWL_POSITION.x),
        0,
        group.position.z + (FOOD_BOWL_APPROACH_POSITION.z - FOOD_BOWL_POSITION.z),
      );
      const baseWait = new THREE.Vector3(
        group.position.x + (FOOD_BOWL_WAIT_POSITION.x - FOOD_BOWL_POSITION.x),
        0,
        group.position.z + (FOOD_BOWL_WAIT_POSITION.z - FOOD_BOWL_POSITION.z),
      );
      const approachPosition = baseApproach.clone();
      const waitPosition = baseWait.clone();
      scene.add(group);
      const entry = registerEditableWorldObject({
        id,
        label: "고양이 밥그릇 2",
        object: group,
        obstacle,
        onTransform: (editable) => {
          updateAnchoredVector(editable, baseApproach, approachPosition);
          updateAnchoredVector(editable, baseWait, waitPosition);
        },
      });
      foodBowlInstances.push({
        id,
        group,
        obstacle,
        approachPosition,
        waitPosition,
        emptyVisual,
        fullVisual,
        sparkles,
      });
      syncFoodBowlVisuals();
      appliedFoodGrade = undefined;
      applyFoodGradeAppearance();
      if (persist) {
        persistEditableObject(entry);
        selectEditableObject(entry);
      }
      publishCareFacilityCounts();
      return true;
    };
    const addSecondLitterBox = (persist: boolean) => {
      if (litterBoxInstances.length >= MAX_CARE_FACILITY_COUNT) return false;
      const source = litterBoxInstances[0];
      const id = CARE_FACILITY_LAYOUT_IDS.toilet[1];
      const group = source.group.clone(true);
      group.name = "covered-cat-litter-box-facility-2";
      group.position.set(3.45, 0, -3.62);
      group.rotation.y = 0.18;
      const obstacle: SceneObstacle = {
        id,
        minX: group.position.x - 0.55,
        maxX: group.position.x + 0.55,
        minZ: group.position.z - 0.5,
        maxZ: group.position.z + 0.5,
      };
      runtimeObstacleById.set(id, obstacle);
      dynamicCareObstacleIds.add(id);
      group.userData.isNavigationObstacle = true;
      group.userData.collisionBounds = { ...obstacle };
      const proxy = group.getObjectByProperty(
        "name",
        "litter-box-click-proxy",
      );
      if (proxy) clickableObjects.push(proxy);
      const gauge = createLitterLevelGauge(
        litterLevelRef.current,
        litterMaxLevelRef.current,
      );
      gauge.label.position.set(group.position.x, 1.12, group.position.z);
      scene.add(gauge.label);
      billboardObjects.push(gauge.label);
      const odorParticles: LitterBoxInstance["odorParticles"] = [];
      group.traverse((object) => {
        if (
          object instanceof THREE.Sprite &&
          object.name.startsWith("litter-odor-particle-")
        ) {
          object.material = object.material.clone();
          const index = Number(object.name.split("-").at(-1) ?? 1) - 1;
          odorParticles.push({
            sprite: object,
            material: object.material,
            phase: Math.max(0, index) / 7,
            drift: index % 2 ? 1 : -1,
          });
        }
      });
      const baseApproach = new THREE.Vector3(
        group.position.x + (LITTER_BOX_APPROACH_POSITION.x - LITTER_BOX_POSITION.x),
        0,
        group.position.z + (LITTER_BOX_APPROACH_POSITION.z - LITTER_BOX_POSITION.z),
      );
      const baseUse = new THREE.Vector3(group.position.x, 0, group.position.z + 0.08);
      const baseWait = new THREE.Vector3(
        group.position.x + (LITTER_BOX_WAIT_POSITION.x - LITTER_BOX_POSITION.x),
        0,
        group.position.z + (LITTER_BOX_WAIT_POSITION.z - LITTER_BOX_POSITION.z),
      );
      const approachPosition = baseApproach.clone();
      const usePosition = baseUse.clone();
      const waitPosition = baseWait.clone();
      scene.add(group);
      const entry = registerEditableWorldObject({
        id,
        label: "고양이 화장실 2",
        object: group,
        obstacle,
        onTransform: (editable) => {
          updateAnchoredVector(editable, baseApproach, approachPosition);
          updateAnchoredVector(editable, baseUse, usePosition);
          updateAnchoredVector(editable, baseWait, waitPosition);
          gauge.label.position.set(
            editable.object.position.x,
            1.12,
            editable.object.position.z,
          );
        },
      });
      litterBoxInstances.push({
        id,
        group,
        obstacle,
        approachPosition,
        usePosition,
        waitPosition,
        gauge,
        odorParticles,
      });
      syncLitterLevelGauges();
      if (persist) {
        persistEditableObject(entry);
        selectEditableObject(entry);
      }
      publishCareFacilityCounts();
      return true;
    };
    addCareFacilityInScene = (intent) =>
      intent === "food"
        ? addSecondFoodBowl(true)
        : addSecondLitterBox(true);
    if (
      initialFoodBowlCount ===
      MAX_CARE_FACILITY_COUNT
    ) {
      addSecondFoodBowl(false);
    }
    if (
      initialLitterBoxCount ===
      MAX_CARE_FACILITY_COUNT
    ) {
      addSecondLitterBox(false);
    }
    publishCareFacilityCounts();

    void Promise.allSettled([
      meshyPropLoader.loadAsync(PALM_TREE_MODEL_URL),
      ...MESHY_WORKSTATION_PLACEMENTS.map((placement) =>
        meshyPropLoader.loadAsync(placement.url),
      ),
      ...MESHY_DECORATION_ASSETS.map((asset) =>
        meshyPropLoader.loadAsync(asset.url),
      ),
    ]).then((propResults) => {
      if (disposed) return;

      const palmResult = propResults[0];
      const decorationStart = 1 + MESHY_WORKSTATION_PLACEMENTS.length;
      const decorationEnd =
        decorationStart + MESHY_DECORATION_ASSETS.length;
      const workstationResults = propResults.slice(
        1,
        decorationStart,
      );
      const decorationResults = propResults.slice(
        decorationStart,
        decorationEnd,
      );
      if (palmResult.status === "fulfilled") {
        const palmTemplate = createMeshyPropTemplate(
          palmResult.value.scene,
          new THREE.Color(0xa5ad8a),
          maximumAnisotropy,
        );
        PALM_TREE_PLACEMENTS.forEach((placement, index) => {
          const palm = new THREE.Group();
          palm.name = `${placement.id}-meshy6`;
          palm.position.copy(placement.position);
          palm.rotation.y = placement.rotationY;
          palm.userData.isNavigationObstacle = true;
          const sourceObstacle = PALM_TREE_OBSTACLES.find(
            (candidate) => candidate.id === placement.id,
          );
          const obstacle = sourceObstacle
            ? runtimeObstacleFor(sourceObstacle)
            : undefined;
          if (obstacle) {
            palm.userData.collisionBounds = { ...obstacle };
          }

          const visual = palmTemplate.clone(true);
          registerPalmLeafSway(
            visual,
            (index / PALM_TREE_PLACEMENTS.length) * Math.PI * 2,
            palmLeafSwayTargets,
          );
          visual.scale.setScalar(3.05 * placement.scale);
          visual.position.y = -0.24;
          palm.add(visual);
          const shadow = createMeshyPropShadow(
            placement.id,
            0.54 * placement.scale,
            0.12,
          );
          palm.add(shadow);
          registerEditableWorldObject({
            id: placement.id,
            label: `야자수 ${index + 1}`,
            object: palm,
            obstacle,
          });
          scene.add(palm);
        });
      } else {
        PALM_TREE_PLACEMENTS.forEach((placement, index) => {
          const palm = createPalmTree(
            islandPropsWatercolorTexture,
            placement,
          );
          const sourceObstacle = PALM_TREE_OBSTACLES.find(
            (candidate) => candidate.id === placement.id,
          );
          registerEditableWorldObject({
            id: placement.id,
            label: `야자수 ${index + 1}`,
            object: palm,
            obstacle: sourceObstacle
              ? runtimeObstacleFor(sourceObstacle)
              : undefined,
          });
          scene.add(palm);
        });
      }

      workstationResults.forEach((result, index) => {
        const placement = MESHY_WORKSTATION_PLACEMENTS[index];
        const seatId = WORKSTATION_PLACEMENT_SEATS[index];
        if (!placement || !seatId || result.status !== "fulfilled") return;

        const workstation = new THREE.Group();
        workstation.name = `${placement.id}-meshy6`;
        workstation.position.copy(placement.position);
        workstation.rotation.y = placement.rotationY;
        workstation.userData.isNavigationObstacle = true;
        const workstationObstacle = runtimeObstacleFor(placement.obstacle);
        workstation.userData.collisionBounds = { ...workstationObstacle };

        const visual = createMeshyPropTemplate(
          result.value.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
          ILLUSTRATION_OUTLINE_THICKNESS,
          ILLUSTRATION_OUTLINE_ALPHA,
        );
        visual.scale.setScalar(placement.height);
        workstation.add(
          visual,
          createMeshyPropShadow(
            workstation.name,
            placement.shadowRadius,
            0.1,
          ),
        );
        const decorOverlay = new THREE.Group();
        decorOverlay.name = `workstation-decor-overlay-${seatId}`;
        workstation.add(decorOverlay);
        workstationDecorGroups.set(seatId, decorOverlay);
        workstationDecorSignatures.delete(seatId);
        const workstationInteraction = workstationInteractions.get(seatId);
        if (workstationInteraction) {
          workstation.add(workstationInteraction.interactionGroup);
        }
        workstation.visible =
          layoutEditorEnabled ||
          monitorCalibrationEnabled ||
          forceMonitorDiagnosticScreen ||
          Number(seatId.slice(-1)) <= activeSeatCountRef.current;
        workstationGroups.set(seatId, workstation);
        registerEditableWorldObject({
          id: placement.id,
          label:
            placement.id === TENT_WORKSTATION_OBSTACLE.id
              ? "텐트 작업 자리"
              : placement.id === ROUND_LAPTOP_STATION_OBSTACLE.id
                ? "피크닉 작업 자리"
                : placement.id === FOLDING_LAPTOP_STATION_OBSTACLE.id
                  ? "라디오 작업 자리"
                  : "모니터 작업 자리",
          object: workstation,
          obstacle: workstationObstacle,
          onTransform: syncWorkstationAnchors,
        });
        scene.add(workstation);
      });
      syncWorkstationDecorGroups();

      decorationResults.forEach((result, index) => {
        const asset = MESHY_DECORATION_ASSETS[index];
        if (!asset) return;

        if (result.status !== "fulfilled") {
          if (asset.id === "camping-supplies") {
            const campingSupplies = createCampingSupplyCluster(
              islandPropsWatercolorTexture,
            );
            registerEditableWorldObject({
              id: CAMPING_SUPPLY_CLUSTER_OBSTACLE.id,
              label: "캠핑 소품",
              object: campingSupplies,
              obstacle: runtimeObstacleFor(
                CAMPING_SUPPLY_CLUSTER_OBSTACLE,
              ),
            });
            scene.add(campingSupplies);
          }
          return;
        }

        const template = createMeshyPropTemplate(
          result.value.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
          ILLUSTRATION_OUTLINE_THICKNESS,
          ILLUSTRATION_OUTLINE_ALPHA,
          asset.id === "cat-exercise-wheel" ? "unlit" : "source",
        );
        asset.placements.forEach((placement) => {
          const decoration = new THREE.Group();
          decoration.name = `${placement.id}-meshy6`;
          decoration.position.copy(placement.position);
          decoration.rotation.y = placement.rotationY;
          if (placement.id === CAT_EXERCISE_WHEEL_OBSTACLE.id) {
            catExerciseWheelGroup = decoration;
            decoration.visible =
              layoutEditorEnabled || exerciseWheelOwnedRef.current;
          }
          const decorationObstacle = placement.obstacle
            ? runtimeObstacleFor(placement.obstacle)
            : undefined;
          if (placement.obstacle) {
            decoration.userData.isNavigationObstacle = true;
            decoration.userData.collisionBounds = {
              ...decorationObstacle,
            };
          }

          const visual = template.clone(true);
          visual.scale.setScalar(placement.height);
          decoration.add(
            visual,
            createMeshyPropShadow(
              decoration.name,
              placement.shadowRadius,
              0.085,
            ),
          );
          registerEditableWorldObject({
            id: placement.id,
            label:
              asset.id === "camping-supplies"
                ? "캠핑 소품"
                : asset.id === "tropical-foliage"
                  ? "해변 식물"
                  : asset.id === "cat-exercise-wheel"
                    ? "고양이 러닝휠"
                    : "해변 장식",
            object: decoration,
            obstacle: decorationObstacle,
            onTransform:
              placement.id === CAT_EXERCISE_WHEEL_OBSTACLE.id
                ? (entry) => {
                    updateAnchoredVector(
                      entry,
                      CAT_EXERCISE_WHEEL_USE_POSITION,
                      catExerciseWheelUsePosition,
                    );
                    updateAnchoredVector(
                      entry,
                      CAT_EXERCISE_WHEEL_EXIT_POSITION,
                      catExerciseWheelExitPosition,
                    );
                    catExerciseWheelRunYaw =
                      entry.object.rotation.y + Math.PI / 2;
                  }
                : undefined,
          });
          scene.add(decoration);
        });
      });

      setLoadingProgress((value) => Math.max(value, 48));
    });
    void Promise.all([
      meshyPropLoader.loadAsync(COLLECTIBLE_SHELL_MODEL_URL),
      textureLoader.loadAsync(COLLECTIBLE_SHELL_SOFT_SEAM_TEXTURE_URL),
    ])
      .then(([collectibleShellGltf, softSeamTexture]) => {
        if (disposed) return;
        softSeamTexture.colorSpace = THREE.SRGBColorSpace;
        softSeamTexture.flipY = false;
        softSeamTexture.anisotropy = maximumAnisotropy;
        collectibleShellTemplate = createMeshyPropTemplate(
          collectibleShellGltf.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
          0.0028,
          0.72,
        );
        collectibleShellTemplate.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if (
              material instanceof THREE.MeshStandardMaterial ||
              material instanceof THREE.MeshPhysicalMaterial ||
              material instanceof THREE.MeshBasicMaterial ||
              material instanceof THREE.MeshToonMaterial
            ) {
              material.map = softSeamTexture;
              material.needsUpdate = true;
            }
          });
        });
        shellSpawnElapsed = nextShellSpawnSeconds;
      })
      .catch((error) => {
        console.warn("Collectible shell model failed to load.", error);
      });

    const characterRoot = new THREE.Group();
    const characterVisual = new THREE.Group();
    characterVisual.rotation.y = DEFAULT_CHARACTER_YAW;
    characterRoot.add(characterVisual);
    // 첫 로드가 유휴 상태라면 좌석이 아니라 해변 휴게 지점에서 시작한다.
    // 실제 명령이 들어온 뒤에만 아래 작업 분기가 컴퓨터 앞으로 이동시킨다.
    characterRoot.position.copy(AMBIENT_WANDER_POINTS[0]);
    const primarySeatId =
      seatsRef.current[0]?.seatId === "queue"
        ? "seat-1"
        : (seatsRef.current[0]?.seatId ?? "seat-1");
    const primaryClickProxy = createInteractionProxy(
      `cat-${primarySeatId}`,
      0.52,
    );
    const primaryMarker = createAgentMarker(
      seatsRef.current[0] ?? DEFAULT_SEAT_VIEW,
      replyReadyTexture,
    );
    const primaryMarkerAnchorTarget = new THREE.Vector3();
    characterRoot.add(primaryClickProxy, primaryMarker.marker);
    clickableObjects.push(primaryClickProxy);
    billboardObjects.push(primaryMarker.label, primaryMarker.beacon);
    scene.add(characterRoot);

    const radioClickProxy = createInteractionProxy("radio", 0.42);
    radioClickProxy.position
      .copy(FOLDING_LAPTOP_STATION_POSITION)
      .add(new THREE.Vector3(0.55, 0.54, 0.05));
    scene.add(radioClickProxy);
    clickableObjects.push(radioClickProxy);

    const completionParticleCount = 12;
    const completionParticleGeometry = new THREE.DodecahedronGeometry(0.055, 0);
    const completionParticleMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2b968,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
      depthWrite: false,
    });
    disableOutline(completionParticleMaterial);
    const completionParticles = new THREE.InstancedMesh(
      completionParticleGeometry,
      completionParticleMaterial,
      completionParticleCount,
    );
    completionParticles.name = "completion-spectacle-particles";
    completionParticles.visible = false;
    completionParticles.renderOrder = 25;
    scene.add(completionParticles);
    const completionParticleDummy = new THREE.Object3D();
    const completionParticleVelocities = Array.from(
      { length: completionParticleCount },
      (_, index) =>
        new THREE.Vector3(
          Math.cos((index / completionParticleCount) * Math.PI * 2) *
            (0.55 + (index % 3) * 0.17),
          0.72 + (index % 4) * 0.11,
          Math.sin((index / completionParticleCount) * Math.PI * 2) *
            (0.55 + ((index + 1) % 3) * 0.14),
        ),
    );
    let lastCompletionSignal = completionSignalRef.current;
    let completionElapsed = 2;

    // 조개는 하단 메뉴 뒤나 섬 안쪽에 놓지 않는다. 상단과 좌우 해안선만
    // 사용하고, 부채꼴 앞면은 항상 카메라 쪽을 향하도록 고정한다.
    const upperAndSideShellSpawnPoints = [
      {
        position: new THREE.Vector3(0, 0.065, -5.55),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(2.18, 0.065, -5.32),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(-2.2, 0.065, -5.34),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(-3.48, 0.065, -3.72),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(3.46, 0.065, -3.68),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(-3.58, 0.065, -1.55),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
      {
        position: new THREE.Vector3(3.56, 0.065, -1.48),
        rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW,
      },
    ];
    const collectibleShells = new Map<string, CollectibleShell>();
    const tutorialAnchorWorld = new THREE.Vector3();
    let shellSpawnSequence = 0;
    let shellSpawnElapsed = 0;
    let nextShellSpawnSeconds = 3.5;

    const createFourPointStarGeometry = (outer: number, inner: number) => {
      const shape = new THREE.Shape();
      for (let index = 0; index < 8; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (index / 8) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    };
    const shorelineSparkleGeometry = createFourPointStarGeometry(0.11, 0.026);
    const sparkleGlowCanvas = document.createElement("canvas");
    sparkleGlowCanvas.width = 128;
    sparkleGlowCanvas.height = 128;
    const sparkleGlowContext = sparkleGlowCanvas.getContext("2d");
    if (sparkleGlowContext) {
      sparkleGlowContext.clearRect(0, 0, 128, 128);
      sparkleGlowContext.save();
      sparkleGlowContext.translate(64, 64);
      sparkleGlowContext.globalCompositeOperation = "lighter";
      const drawSparkleRays = (
        length: number,
        halfWidth: number,
        centerColor: string,
        edgeColor: string,
      ) => {
        for (let index = 0; index < 4; index += 1) {
          sparkleGlowContext.save();
          sparkleGlowContext.rotate((Math.PI / 2) * index);
          const rayGradient = sparkleGlowContext.createLinearGradient(
            0,
            0,
            length,
            0,
          );
          rayGradient.addColorStop(0, centerColor);
          rayGradient.addColorStop(0.28, centerColor);
          rayGradient.addColorStop(1, edgeColor);
          sparkleGlowContext.fillStyle = rayGradient;
          sparkleGlowContext.beginPath();
          sparkleGlowContext.moveTo(-2, -halfWidth);
          sparkleGlowContext.lineTo(length, 0);
          sparkleGlowContext.lineTo(-2, halfWidth);
          sparkleGlowContext.closePath();
          sparkleGlowContext.fill();
          sparkleGlowContext.restore();
        }
      };
      // Four long tapered rays read as a sparkling glint instead of a round
      // bloom. A narrow white core keeps the center crisp on small screens.
      drawSparkleRays(
        58,
        5.5,
        "rgba(255, 224, 139, 0.72)",
        "rgba(255, 201, 100, 0)",
      );
      drawSparkleRays(
        39,
        2.6,
        "rgba(255, 255, 244, 1)",
        "rgba(255, 244, 202, 0)",
      );
      sparkleGlowContext.restore();
    }
    const shorelineSparkleGlowTexture = new THREE.CanvasTexture(
      sparkleGlowCanvas,
    );
    shorelineSparkleGlowTexture.colorSpace = THREE.SRGBColorSpace;
    shorelineSparkleGlowTexture.minFilter = THREE.LinearFilter;
    shorelineSparkleGlowTexture.magFilter = THREE.LinearFilter;
    shorelineSparkleGlowTexture.generateMipmaps = false;

    const shellBurstCount = 20;
    const shellBurstGeometry = createFourPointStarGeometry(0.11, 0.027);
    const shellBurstMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffd6,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    disableOutline(shellBurstMaterial);
    const shellBurst = new THREE.InstancedMesh(
      shellBurstGeometry,
      shellBurstMaterial,
      shellBurstCount,
    );
    shellBurst.name = "beach-shell-collection-particles";
    shellBurst.visible = false;
    shellBurst.renderOrder = 27;
    scene.add(shellBurst);
    const shellCollectFlashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffe7,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    disableOutline(shellCollectFlashMaterial);
    const shellCollectFlash = new THREE.Mesh(
      createFourPointStarGeometry(0.24, 0.038),
      shellCollectFlashMaterial,
    );
    shellCollectFlash.name = "beach-shell-collection-flash";
    shellCollectFlash.visible = false;
    shellCollectFlash.renderOrder = 29;
    scene.add(shellCollectFlash);
    const shellCollectRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4bf,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    disableOutline(shellCollectRingMaterial);
    const shellCollectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.205, 64),
      shellCollectRingMaterial,
    );
    shellCollectRing.name = "beach-shell-collection-water-ring";
    shellCollectRing.rotation.x = -Math.PI / 2;
    shellCollectRing.visible = false;
    shellCollectRing.renderOrder = 28;
    scene.add(shellCollectRing);
    const shellBurstDummy = new THREE.Object3D();
    const shellBurstOrigin = new THREE.Vector3();
    const shellBurstVelocities = Array.from(
      { length: shellBurstCount },
      (_, index) =>
        new THREE.Vector3(
          Math.cos((index / shellBurstCount) * Math.PI * 2) *
            (0.4 + (index % 3) * 0.1),
          0.38 + (index % 4) * 0.09,
          Math.sin((index / shellBurstCount) * Math.PI * 2) *
            (0.4 + ((index + 1) % 3) * 0.1),
        ),
    );
    let shellBurstElapsed = 2;

    const createCollectibleShell = (
      id: string,
      position: THREE.Vector3,
      baseRotationY: number,
    ) => {
      if (!collectibleShellTemplate) return null;
      const group = new THREE.Group();
      group.name = id;
      group.position.copy(position);
      group.rotation.y = baseRotationY;
      group.userData.shorelineOnly = true;
      const baseScale = 0.82;
      group.scale.setScalar(baseScale);
      const shellVisual = collectibleShellTemplate.clone(true);
      shellVisual.name = `${id}-camera-facing-shell`;
      shellVisual.position.y = -0.045;
      shellVisual.scale.setScalar(0.2);
      group.add(shellVisual);

      const rippleMaterial = new THREE.MeshBasicMaterial({
        color: 0xe9fff5,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      disableOutline(rippleMaterial);
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.22, 48),
        rippleMaterial,
      );
      ripple.name = `${id}-water-ripple`;
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = -0.06;
      ripple.scale.set(1.18, 0.76, 1);
      group.add(ripple);

      const sparkleSpecs = [
        {
          x: -0.19,
          y: 0.15,
          z: -0.02,
          scale: 1.12,
          phase: 0.1,
          color: 0xffffff,
        },
        {
          x: 0.17,
          y: 0.19,
          z: 0.02,
          scale: 0.96,
          phase: 1.35,
          color: 0xfff0a6,
        },
        {
          x: 0.02,
          y: 0.27,
          z: -0.11,
          scale: 0.82,
          phase: 2.65,
          color: 0xffffff,
        },
        {
          x: -0.08,
          y: 0.23,
          z: 0.06,
          scale: 0.7,
          phase: 4.05,
          color: 0xffd98e,
        },
        {
          x: 0.2,
          y: 0.12,
          z: -0.08,
          scale: 0.64,
          phase: 5.25,
          color: 0xfff8d6,
        },
      ];
      const sparkles = sparkleSpecs.map((spec, index) => {
        const material = new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        disableOutline(material);
        const star = new THREE.Mesh(shorelineSparkleGeometry, material);
        star.name = `${id}-shoreline-shimmer-${index + 1}`;
        star.position.set(spec.x, spec.y, spec.z);
        star.scale.setScalar(spec.scale);
        group.add(star);
        const haloMaterial = new THREE.SpriteMaterial({
          map: shorelineSparkleGlowTexture,
          color: spec.color,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        });
        disableOutline(haloMaterial);
        const halo = new THREE.Sprite(haloMaterial);
        const haloBaseScale = 0.27 * spec.scale;
        halo.name = `${id}-shoreline-glow-${index + 1}`;
        halo.position.copy(star.position);
        halo.scale.setScalar(haloBaseScale);
        halo.renderOrder = 26;
        group.add(halo);
        return {
          star,
          halo,
          baseScale: spec.scale,
          haloBaseScale,
          phase: spec.phase,
          baseY: spec.y,
          spin: index % 2 === 0 ? 1 : -1,
        };
      });

      const proxy = createInteractionProxy(id, 0.34);
      proxy.position.y = 0.07;
      group.add(proxy);
      scene.add(group);
      clickableObjects.push(proxy);
      return {
        id,
        group,
        proxy,
        ripple,
        sparkles,
        baseY: position.y,
        baseScale,
        baseRotationY,
        phase: Math.random() * Math.PI * 2,
        collecting: false,
        elapsed: 0,
      } satisfies CollectibleShell;
    };

    const spawnCollectibleShell = () => {
      if (
        !worldShellSpawningEnabledRef.current ||
        !collectibleShellTemplate ||
        collectibleShells.size >= 3
      ) {
        return false;
      }
      const occupiedPointIds = new Set(
        [...collectibleShells.values()].map(
          (entry) => entry.group.userData.spawnPointId as number,
        ),
      );
      const available = upperAndSideShellSpawnPoints
        .map((point, index) => ({ point, index }))
        .filter(({ index }) => !occupiedPointIds.has(index));
      if (!available.length) return false;
      const selected = available[shellSpawnSequence % available.length];
      const id = `beach-shell-${++shellSpawnSequence}`;
      const collectible = createCollectibleShell(
        id,
        selected.point.position,
        selected.point.rotationY,
      );
      if (!collectible) return false;
      collectible.group.userData.spawnPointId = selected.index;
      collectibleShells.set(id, collectible);
      return true;
    };

    const playCompletionChime = () => {
      try {
        const AudioContextConstructor =
          window.AudioContext ??
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextConstructor) return;
        const audio = new AudioContextConstructor();
        const startedAt = audio.currentTime;
        [523.25, 783.99].forEach((frequency, index) => {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, startedAt + index * 0.08);
          gain.gain.exponentialRampToValueAtTime(
            0.07,
            startedAt + index * 0.08 + 0.02,
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            startedAt + index * 0.08 + 0.2,
          );
          oscillator.connect(gain).connect(audio.destination);
          oscillator.start(startedAt + index * 0.08);
          oscillator.stop(startedAt + index * 0.08 + 0.21);
        });
        window.setTimeout(() => void audio.close(), 450);
      } catch {
        // Browsers may block autoplay; the visual sequence remains intact.
      }
    };

    const blobShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x786b55,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    disableOutline(blobShadowMaterial);
    const blobShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 40),
      blobShadowMaterial,
    );
    blobShadow.rotation.x = -Math.PI / 2;
    blobShadow.position.y = 0.012;
    characterRoot.add(blobShadow);

    let mixer: THREE.AnimationMixer | null = null;
    const animationActions = new Map<string, THREE.AnimationAction>();
    let currentAction: THREE.AnimationAction | null = null;
    let currentAnimationKey = "";
    let characterModel: THREE.Object3D | null = null;
    const characterModelsByStyle = new Map<string, THREE.Object3D>();
    let loadedAnimationClips: THREE.AnimationClip[] = [];
    const careFacilities: Record<CatCareIntent, CareFacilityState> = {
      food: {
        occupants: Array.from(
          { length: foodBowlInstances.length },
          () => null,
        ),
        queue: [],
      },
      toilet: {
        occupants: Array.from(
          { length: litterBoxInstances.length },
          () => null,
        ),
        queue: [],
      },
    };
    const careInstanceCount = (intent: CatCareIntent) =>
      intent === "food"
        ? foodBowlInstances.length
        : litterBoxInstances.length;
    const syncCareFacilityCapacity = (intent: CatCareIntent) => {
      const facility = careFacilities[intent];
      while (facility.occupants.length < careInstanceCount(intent)) {
        facility.occupants.push(null);
      }
      if (facility.occupants.length > careInstanceCount(intent)) {
        facility.occupants.length = careInstanceCount(intent);
      }
    };
    const litterIsFull = () =>
      carePreviewMode === "toilet"
        ? false
        : isLitterBoxFull(
            litterLevelRef.current,
            litterMaxLevelRef.current,
          );
    const claimableCareFacilityIndex = (
      intent: CatCareIntent,
      catId: string,
    ) => {
      syncCareFacilityCapacity(intent);
      const facility = careFacilities[intent];
      if (intent === "toilet" && litterIsFull()) return -1;
      const occupiedIndex = facility.occupants.indexOf(catId);
      if (occupiedIndex >= 0) return occupiedIndex;
      if (facility.queue[0] !== catId) return -1;
      return facility.occupants.findIndex((occupant) => occupant === null);
    };
    const careApproachPosition = (
      intent: CatCareIntent,
      facilityIndex: number,
    ) => {
      if (intent === "food") {
        return (
          foodBowlInstances[facilityIndex] ?? foodBowlInstances[0]
        ).approachPosition;
      }
      return (
        litterBoxInstances[facilityIndex] ?? litterBoxInstances[0]
      ).usePosition;
    };
    const careWaitPosition = (intent: CatCareIntent, catId: string) => {
      const facility = careFacilities[intent];
      const queueIndex = Math.max(0, facility.queue.indexOf(catId));
      const instances =
        intent === "food" ? foodBowlInstances : litterBoxInstances;
      const instance = instances[queueIndex % Math.max(1, instances.length)];
      const base = instance?.waitPosition ??
        (intent === "food" ? foodBowlWaitPosition : litterBoxWaitPosition);
      return base
        .clone()
        .add(
          new THREE.Vector3(
            -Math.floor(queueIndex / Math.max(1, instances.length)) * 0.34,
            0,
            Math.floor(queueIndex / Math.max(1, instances.length)) * 0.18,
          ),
        );
    };
    const foodBowlCenterPosition = (facilityIndex: number | null) =>
      (
        foodBowlInstances[facilityIndex ?? 0] ?? foodBowlInstances[0]
      ).group.position;
    const enqueueCare = (intent: CatCareIntent, catId: string) => {
      const facility = careFacilities[intent];
      if (
        !facility.occupants.includes(catId) &&
        !facility.queue.includes(catId)
      ) {
        facility.queue.push(catId);
      }
    };
    const leaveCareQueue = (intent: CatCareIntent, catId: string) => {
      const facility = careFacilities[intent];
      facility.queue = facility.queue.filter((queuedId) => queuedId !== catId);
      facility.occupants = facility.occupants.map((occupant) =>
        occupant === catId ? null : occupant,
      );
    };
    const claimCareFacility = (intent: CatCareIntent, catId: string) => {
      const facility = careFacilities[intent];
      const index = claimableCareFacilityIndex(intent, catId);
      if (index < 0) return null;
      if (facility.occupants[index] !== catId) {
        facility.queue.shift();
        facility.occupants[index] = catId;
      }
      return index;
    };
    const releaseCareFacility = (intent: CatCareIntent, catId: string) => {
      const facility = careFacilities[intent];
      facility.occupants = facility.occupants.map((occupant) =>
        occupant === catId ? null : occupant,
      );
    };

    type CatAvoidanceMotion = {
      direction: THREE.Vector3;
      turn: -1 | 1;
      holdSeconds: number;
      yieldSeconds: number;
      neighborId: string | null;
      paused: boolean;
      pauseAnimationKey: "idle-look" | "idle-relax" | "sit";
    };
    type SecondaryAgent = {
      root: THREE.Group;
      visual: THREE.Group;
      model: THREE.Object3D;
      shadow: THREE.Mesh;
      mixer: THREE.AnimationMixer;
      actions: Map<string, THREE.AnimationAction>;
      currentKey: string;
      marker: ReturnType<typeof createAgentMarker>;
      markerAnchorTarget: THREE.Vector3;
      clickProxy: THREE.Object3D | null;
      catId: string;
      seatId: SeatId;
      care: CatCareRuntime | null;
      careRetrySeconds: number;
      careWaypoints: THREE.Vector3[];
      careLastTarget: THREE.Vector3;
      yaw: number;
      ambientInitialized: boolean;
      ambientPhase: "resting" | "prewalking" | "walking" | "settling";
      ambientTimer: number;
      ambientPointIndex: number;
      ambientTarget: THREE.Vector3;
      ambientAnimationKey: string;
      crowdRedirectCooldown: number;
      personality: CatPersonalityProfile;
      avoidance: CatAvoidanceMotion;
      wasAutonomous: boolean;
    };
    type CatExerciseWheelSession = {
      catId: string;
      seatId: SeatId;
      secondaryKey: string | null;
      phase: "approaching" | "running" | "exiting";
      timer: number;
    };
    const secondaryAgents = new Map<string, SecondaryAgent>();
    let characterYaw = DEFAULT_CHARACTER_YAW;
    let ambientPhase:
      | "resting"
      | "prewalking"
      | "walking"
      | "settling" = "resting";
    let ambientTimer = 4;
    let ambientPointIndex = -1;
    let crowdRedirectCooldown = 0;
    let primaryAmbientAnimationKey = "idle-look";
    const primaryAvoidance: CatAvoidanceMotion = {
      direction: new THREE.Vector3(),
      turn: 1,
      holdSeconds: 0,
      yieldSeconds: 0,
      neighborId: null,
      paused: false,
      pauseAnimationKey: "idle-look",
    };
    let kneadingElapsed = 0;
    let kneadingBlend = 0;
    let wasKneadingLastFrame = false;
    let wasAutonomous = AUTONOMOUS_STATUSES.has(motionRef.current.status);
    let primaryCare: CatCareRuntime | null = null;
    let primaryCareCatId =
      (seatsRef.current[0] ?? DEFAULT_SEAT_VIEW).catId;
    let primaryCareRetrySeconds = 0;
    let catExerciseWheelSession: CatExerciseWheelSession | null = null;
    let catExerciseWheelCooldown = CAT_EXERCISE_WHEEL_FIRST_VISIT_SECONDS;
    let catExerciseWheelCandidateCursor = 0;
    let modelProgress = 0;
    let animationsProgress = 0;

    const playAnimation = (key: string, fadeSeconds = 0.45) => {
      const nextAction =
        animationActions.get(key) ?? animationActions.get("idle-look");
      if (!nextAction || nextAction === currentAction) return;

      const previousAction = currentAction;
      nextAction.reset();
      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);
      nextAction.fadeIn(fadeSeconds);
      nextAction.play();
      previousAction?.fadeOut(fadeSeconds);
      currentAction = nextAction;
      currentAnimationKey = key;
    };

    const cancelCatExerciseWheelSession = (retrySoon = false) => {
      const cancelled = catExerciseWheelSession;
      if (cancelled && cancelled.phase !== "approaching") {
        if (cancelled.secondaryKey) {
          const entry = secondaryAgents.get(cancelled.secondaryKey);
          if (entry) {
            entry.root.position.x = catExerciseWheelExitPosition.x;
            entry.root.position.z = catExerciseWheelExitPosition.z;
            entry.careWaypoints.length = 0;
            entry.careLastTarget.copy(entry.root.position);
            entry.ambientTarget.copy(entry.root.position);
            entry.ambientPhase = "prewalking";
            entry.ambientTimer = 0.65;
          }
        } else {
          currentPosition.copy(catExerciseWheelExitPosition);
          avoidanceWaypoints.length = 0;
          lastNavigationTarget.copy(currentPosition);
          ambientTarget.copy(currentPosition);
          ambientPhase = "prewalking";
          ambientTimer = 0.7;
        }
      }
      catExerciseWheelSession = null;
      catExerciseWheelCooldown = retrySoon
        ? randomBetween(15, 25)
        : randomBetween(
            CAT_EXERCISE_WHEEL_REVISIT_MIN_SECONDS,
            CAT_EXERCISE_WHEEL_REVISIT_MAX_SECONDS,
          );
    };

    const completeCatExerciseWheelSession = () => {
      const completed = catExerciseWheelSession;
      if (!completed) return;
      onCatWheelPlayRef.current?.({
        catId: completed.catId,
        seatId: completed.seatId,
      });
      cancelCatExerciseWheelSession();
    };

    const removeClickable = (object: THREE.Object3D | null) => {
      if (!object) return;
      const index = clickableObjects.indexOf(object);
      if (index >= 0) clickableObjects.splice(index, 1);
    };

    const createSecondaryAgent = (seat: SeatView) => {
      if (!characterModel || loadedAnimationClips.length === 0) return null;
      const root = new THREE.Group();
      root.name = `secondary-agent-${seat.seatId}`;
      const visual = new THREE.Group();
      visual.name = `secondary-agent-visual-${seat.seatId}`;
      visual.rotation.y = DEFAULT_CHARACTER_YAW;
      root.add(visual);
      const styleModel =
        characterModelsByStyle.get(seat.catStyle ?? catStyle) ?? characterModel;
      const personality = catPersonalityForStyle(seat.catStyle ?? catStyle);
      const model = cloneSkeleton(styleModel);
      visual.add(model);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 32),
        blobShadowMaterial.clone(),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.012;
      root.add(shadow);
      const marker = createAgentMarker(seat, replyReadyTexture);
      marker.updateBeacon(seat);
      root.add(marker.marker);
      billboardObjects.push(marker.label, marker.beacon);
      let clickProxy: THREE.Object3D | null = null;
      if (seat.seatId !== "queue") {
        clickProxy = createInteractionProxy(`cat-${seat.seatId}`, 0.52);
        root.add(clickProxy);
        clickableObjects.push(clickProxy);
      }
      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map<string, THREE.AnimationAction>();
      const clipEntries = [
        ["walk", "|Walk_F"],
        ["run", "|Run_F"],
        ["idle", "|Idle_1"],
        ["idle-look", "|Idle_1"],
        ["idle-relax", "|Idle_2"],
        ["sit", "|Sitting_Idle"],
        ["sit-play", "|Sitting_idle_2"],
        ["sit-groom", "|Sitting_idle_3"],
        ["lie", "|Lie_Idle"],
        ["eat", "|EatDrink"],
        ["work", DESK_KNEADING_ANIMATION_SUFFIX],
      ] as const;
      for (const [key, suffix] of clipEntries) {
        const clip = loadedAnimationClips.find((candidate) =>
          candidate.name.endsWith(suffix),
        );
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = key === "run" ? 0.92 : key === "walk" ? 0.62 : 0.82;
        actions.set(key, action);
      }
      const initial = actions.get("idle") ?? actions.values().next().value;
      initial?.play();
      const entry: SecondaryAgent = {
        root,
        visual,
        model,
        shadow,
        mixer,
        actions,
        currentKey: initial ? "idle" : "",
        marker,
        markerAnchorTarget: new THREE.Vector3(),
        clickProxy,
        catId: seat.catId,
        seatId:
          seat.seatId === "queue" ? "seat-1" : seat.seatId,
        care: null,
        careRetrySeconds: 0,
        careWaypoints: [],
        careLastTarget: root.position.clone(),
        yaw: DEFAULT_CHARACTER_YAW,
        ambientInitialized: false,
        ambientPhase: "resting",
        ambientTimer: randomBetween(3.5, 7.5),
        ambientPointIndex: -1,
        ambientTarget: root.position.clone(),
        ambientAnimationKey: pickPersonalityAmbientKey(personality),
        crowdRedirectCooldown: 0,
        personality,
        avoidance: {
          direction: new THREE.Vector3(),
          turn: 1,
          holdSeconds: 0,
          yieldSeconds: 0,
          neighborId: null,
          paused: false,
          pauseAnimationKey: "idle-look",
        },
        wasAutonomous:
          seat.seatId !== "queue" &&
          !seat.blocked &&
          AUTONOMOUS_STATUSES.has(seat.status),
      };
      scene.add(root);
      secondaryAgents.set(String(seat.seatId), entry);
      return entry;
    };

    const updateCatExerciseWheelScheduler = (
      delta: number,
      primaryView: SeatView,
    ) => {
      catExerciseWheelCooldown = Math.max(
        0,
        catExerciseWheelCooldown - delta,
      );
      const worldInteractionBusy =
        placementModeRef.current !== null ||
        activeSnackPhase !== "none" ||
        laserActive ||
        toyActive;

      if (
        !exerciseWheelOwnedRef.current ||
        !catExerciseWheelGroup ||
        layoutEditorEnabled
      ) {
        if (catExerciseWheelSession) cancelCatExerciseWheelSession(true);
        return;
      }

      if (catExerciseWheelSession) {
        const session = catExerciseWheelSession;
        const participant = seatsRef.current.find(
          (seat) => seat.catId === session.catId,
        );
        const secondary = session.secondaryKey
          ? secondaryAgents.get(session.secondaryKey)
          : null;
        const unavailable =
          !participant ||
          participant.blocked ||
          !AUTONOMOUS_STATUSES.has(participant.status) ||
          worldInteractionBusy ||
          (session.secondaryKey ? !secondary || Boolean(secondary.care) : Boolean(primaryCare));
        if (unavailable) cancelCatExerciseWheelSession(true);
        return;
      }

      if (catExerciseWheelCooldown > 0 || worldInteractionBusy || primaryCare) {
        return;
      }

      const candidates: Array<{
        catId: string;
        seatId: SeatId;
        secondaryKey: string | null;
      }> = [];
      if (
        mixer &&
        primaryView.seatId !== "queue" &&
        !primaryView.blocked &&
        AUTONOMOUS_STATUSES.has(primaryView.status) &&
        !selectCatCareIntent({
          hunger: primaryView.hunger ?? 0,
          toilet: primaryView.toilet ?? 0,
        })
      ) {
        candidates.push({
          catId: primaryView.catId,
          seatId: primaryView.seatId,
          secondaryKey: null,
        });
      }
      secondaryAgents.forEach((entry, key) => {
        const seat = seatsRef.current.find(
          (candidate) => candidate.catId === entry.catId,
        );
        if (
          !seat ||
          seat.seatId === "queue" ||
          seat.blocked ||
          entry.care ||
          !AUTONOMOUS_STATUSES.has(seat.status) ||
          selectCatCareIntent({
            hunger: seat.hunger ?? 0,
            toilet: seat.toilet ?? 0,
          })
        ) {
          return;
        }
        candidates.push({
          catId: entry.catId,
          seatId: entry.seatId,
          secondaryKey: key,
        });
      });
      if (candidates.length === 0) {
        catExerciseWheelCooldown = randomBetween(12, 20);
        return;
      }

      const previewCandidate = exerciseWheelSecondaryPreviewPending
        ? candidates.find((candidate) => candidate.secondaryKey !== null)
        : null;
      if (exerciseWheelSecondaryPreviewPending && !previewCandidate) {
        catExerciseWheelCooldown = 0.5;
        return;
      }
      const candidate =
        previewCandidate ??
        candidates[catExerciseWheelCandidateCursor % candidates.length];
      exerciseWheelSecondaryPreviewPending = false;
      catExerciseWheelCandidateCursor += 1;
      catExerciseWheelSession = {
        ...candidate,
        phase: "approaching",
        timer: CAT_EXERCISE_WHEEL_RUN_SECONDS,
      };
      if (candidate.secondaryKey) {
        const entry = secondaryAgents.get(candidate.secondaryKey);
        if (entry) {
          entry.careWaypoints.length = 0;
          entry.careLastTarget.copy(entry.root.position);
          entry.ambientPhase = "resting";
        }
      } else {
        avoidanceWaypoints.length = 0;
        lastNavigationTarget.copy(currentPosition);
        ambientPhase = "resting";
      }
    };

    const syncSecondaryAgents = (delta: number) => {
      const desiredSeats = seatsRef.current.slice(1, 5);
      const desiredKeys = new Set(desiredSeats.map((seat) => String(seat.seatId)));
      for (const [key, entry] of secondaryAgents) {
        if (desiredKeys.has(key)) continue;
        if (entry.care) leaveCareQueue(entry.care.intent, entry.catId);
        removeClickable(entry.clickProxy);
        entry.root.removeFromParent();
        secondaryAgents.delete(key);
      }

      const setSecondaryAnimation = (
        entry: SecondaryAgent,
        nextKey: string,
      ) => {
        if (nextKey === entry.currentKey) return;
        const previous = entry.actions.get(entry.currentKey);
        const next =
          entry.actions.get(nextKey) ??
          entry.actions.get("idle") ??
          entry.actions.values().next().value;
        previous?.fadeOut(0.3);
        next?.reset().fadeIn(0.3).play();
        entry.currentKey = nextKey;
      };

      const moveSecondaryTowards = (
        entry: SecondaryAgent,
        target: THREE.Vector3,
        obstacles: SceneObstacle[],
      ) => {
        if (entry.careLastTarget.distanceToSquared(target) > 0.01) {
          entry.careLastTarget.copy(target);
          entry.careWaypoints.length = 0;
        }
        while (
          entry.careWaypoints.length &&
          entry.root.position.distanceTo(entry.careWaypoints[0]) <=
            OBSTACLE_WAYPOINT_REACHED_DISTANCE
        ) {
          entry.careWaypoints.shift();
        }
        if (!entry.careWaypoints.length) {
          entry.careWaypoints.push(
            ...findAvoidancePath(entry.root.position, target, obstacles),
          );
        }
        const goal = entry.careWaypoints[0] ?? target;
        const distance = entry.root.position.distanceTo(goal);
        if (distance <= CARE_ARRIVAL_DISTANCE) {
          if (entry.careWaypoints.length) entry.careWaypoints.shift();
          if (entry.root.position.distanceTo(target) <= CARE_ARRIVAL_DISTANCE) {
            entry.root.position.copy(target);
            return true;
          }
          return false;
        }
        const steering = resolveNeighborSteering({
          motion: entry.avoidance,
          selfId: entry.catId,
          start: entry.root.position,
          destination: goal,
          neighbors: catNeighborPositions(entry.catId),
          delta,
        });
        const direction = steering.direction;
        const targetYaw = Math.atan2(direction.x, direction.z);
        const turnDelta = Math.abs(
          Math.atan2(
            Math.sin(targetYaw - entry.yaw),
            Math.cos(targetYaw - entry.yaw),
          ),
        );
        const forwardFactor = THREE.MathUtils.clamp(
          1 - turnDelta / (Math.PI * 0.7),
          0.24,
          1,
        );
        entry.yaw = lerpAngle(
          entry.yaw,
          targetYaw,
          1 - Math.exp(-delta * (steering.avoiding ? 4.2 : 7)),
        );
        entry.visual.rotation.y = entry.yaw;
        if (steering.paused) return false;
        const step = Math.min(
          distance,
          CARE_MOVE_SPEED * entry.personality.moveSpeedMultiplier *
            forwardFactor * delta,
        );
        entry.root.position.addScaledVector(direction.normalize(), step);
        return entry.root.position.distanceTo(target) <= CARE_ARRIVAL_DISTANCE;
      };

      desiredSeats.forEach((seat, index) => {
        const key = String(seat.seatId);
        const entry = secondaryAgents.get(key) ?? createSecondaryAgent(seat);
        if (!entry) return;
        const homeTarget =
          seat.seatId === "queue"
            ? worldTargets.queue
                .clone()
                .add(new THREE.Vector3(index * 0.52, 0, index * 0.18))
            : seatWorldPositions[seat.seatId];
        if (entry.catId !== seat.catId) {
          if (entry.care) leaveCareQueue(entry.care.intent, entry.catId);
          entry.catId = seat.catId;
          entry.care = null;
          entry.careRetrySeconds = 0;
          entry.careWaypoints.length = 0;
          entry.ambientInitialized = false;
        }
        if (seat.seatId !== "queue") entry.seatId = seat.seatId;
        entry.personality = catPersonalityForStyle(seat.catStyle ?? catStyle);
        advanceAvoidanceMotion(entry.avoidance, delta);
        const isSecondaryAutonomous =
          seat.seatId !== "queue" &&
          !seat.blocked &&
          AUTONOMOUS_STATUSES.has(seat.status);
        const becameSecondaryAutonomous =
          isSecondaryAutonomous && !entry.wasAutonomous;
        if (!isSecondaryAutonomous && entry.care) {
          leaveCareQueue(entry.care.intent, entry.catId);
          releaseCareFacility(entry.care.intent, entry.catId);
          entry.care = null;
          entry.careWaypoints.length = 0;
        }
        entry.careRetrySeconds = Math.max(
          0,
          entry.careRetrySeconds - delta,
        );
        entry.crowdRedirectCooldown = Math.max(
          0,
          entry.crowdRedirectCooldown - delta,
        );

        if (
          isSecondaryAutonomous &&
          !entry.care &&
          catExerciseWheelSession?.catId !== entry.catId &&
          seat.seatId !== "queue" &&
          !seat.blocked &&
          entry.careRetrySeconds <= 0
        ) {
          const intent = selectCatCareIntent({
            hunger: seat.hunger ?? 0,
            toilet: seat.toilet ?? 0,
          });
          if (intent) {
            entry.care = {
              intent,
              phase: "approaching",
              timer: 0,
              insideFacility: false,
              facilityIndex: null,
            };
            entry.ambientInitialized = false;
            entry.careWaypoints.length = 0;
            enqueueCare(intent, entry.catId);
          }
        }

        const ownPlacementIndex = WORKSTATION_PLACEMENT_SEATS.indexOf(
          entry.seatId,
        );
        const ownObstacle =
          ownPlacementIndex >= 0
            ? runtimeObstacleById.get(
                MESHY_WORKSTATION_PLACEMENTS[ownPlacementIndex]?.obstacle.id ??
                  "",
              )
            : undefined;
        let navigationObstacles = getRuntimeSceneObstacles(
          activeSeatCountRef.current,
        ).filter(
          (obstacle) => isSecondaryAutonomous || obstacle !== ownObstacle,
        );
        if (entry.care?.intent === "toilet") {
          navigationObstacles = navigationObstacles.filter(
            (obstacle) =>
              !litterBoxInstances.some(
                (instance) => instance.obstacle === obstacle,
              ),
          );
        }
        if (catExerciseWheelSession?.catId === entry.catId) {
          navigationObstacles = navigationObstacles.filter(
            (obstacle) => obstacle.id !== CAT_EXERCISE_WHEEL_OBSTACLE.id,
          );
        }

        let careAnimation: string | null = null;
        if (entry.care) {
          const care = entry.care;
          const litterUnavailable =
            care.intent === "toilet" &&
            litterIsFull() &&
            (care.phase === "approaching" || care.phase === "waiting");
          if (litterUnavailable) {
            const target = careWaitPosition("toilet", entry.catId);
            const arrived = moveSecondaryTowards(
              entry,
              target,
              navigationObstacles,
            );
            careAnimation = arrived ? "sit" : "walk";
            if (arrived) {
              leaveCareQueue("toilet", entry.catId);
              care.insideFacility = false;
              onCatCareEventRef.current?.({
                catId: entry.catId,
                seatId: entry.seatId,
                outcome: "toilet-blocked",
              });
              entry.careRetrySeconds = LITTER_FULL_RETRY_SECONDS;
              care.phase = "recovering";
              care.timer = CARE_RECOVERY_SECONDS * 1.8;
              careAnimation = "sit";
            }
          } else if (care.phase === "using") {
            care.timer -= delta;
            careAnimation = care.intent === "food" ? "eat" : "sit";
            if (care.intent === "food") {
              const bowlCenter = foodBowlCenterPosition(care.facilityIndex);
              const targetYaw = Math.atan2(
                bowlCenter.x - entry.root.position.x,
                bowlCenter.z - entry.root.position.z,
              );
              entry.yaw = lerpAngle(
                entry.yaw,
                targetYaw,
                1 - Math.exp(-delta * CARE_EATING_TURN_SPEED),
              );
              entry.visual.rotation.y = entry.yaw;
            }
            if (care.timer <= 0) {
              releaseCareFacility(care.intent, entry.catId);
              if (care.intent === "food") {
                foodAvailableRef.current = false;
                syncFoodBowlVisuals();
                onCatCareEventRef.current?.({
                  catId: entry.catId,
                  seatId: entry.seatId,
                  outcome: "meal-completed",
                });
              } else {
                litterLevelRef.current = addLitterWaste(
                  litterLevelRef.current,
                  undefined,
                  litterMaxLevelRef.current,
                );
                syncLitterLevelGauges();
                onCatCareEventRef.current?.({
                  catId: entry.catId,
                  seatId: entry.seatId,
                  outcome: "toilet-completed",
                });
              }
              care.phase = "recovering";
              care.timer = CARE_RECOVERY_SECONDS;
            }
          } else if (care.phase === "recovering") {
            care.timer -= delta;
            careAnimation = "idle";
            if (care.timer <= 0) care.phase = "returning";
          } else if (care.phase === "returning") {
            careAnimation = "walk";
            const restTarget = AMBIENT_WANDER_POINTS[
              (index + 2) % AMBIENT_WANDER_POINTS.length
            ];
            if (
              moveSecondaryTowards(
                entry,
                restTarget,
                navigationObstacles,
              )
            ) {
              entry.care = null;
              entry.careWaypoints.length = 0;
              entry.ambientTarget.copy(restTarget);
              entry.ambientPhase = "resting";
              entry.ambientTimer = randomBetween(3.5, 7.5);
              entry.ambientInitialized = true;
              careAnimation = "idle";
            }
          } else {
            const claimableIndex = claimableCareFacilityIndex(
              care.intent,
              entry.catId,
            );
            const mayClaim = claimableIndex >= 0;
            const target = mayClaim
              ? careApproachPosition(care.intent, claimableIndex)
              : careWaitPosition(care.intent, entry.catId);
            care.phase = mayClaim ? "approaching" : "waiting";
            const arrived = moveSecondaryTowards(
              entry,
              target,
              navigationObstacles,
            );
            careAnimation = arrived && !mayClaim ? "sit" : "walk";
            if (arrived && mayClaim) {
              if (
                care.intent === "food" &&
                !hasFoodAvailable()
              ) {
                leaveCareQueue(care.intent, entry.catId);
                onCatCareEventRef.current?.({
                  catId: entry.catId,
                  seatId: entry.seatId,
                  outcome: "meal-missed",
                });
                entry.careRetrySeconds = EMPTY_BOWL_RETRY_SECONDS;
                care.phase = "recovering";
                care.timer = CARE_RECOVERY_SECONDS * 1.8;
                careAnimation = "sit";
              } else {
                const claimedIndex = claimCareFacility(
                  care.intent,
                  entry.catId,
                );
                if (claimedIndex !== null) {
                  care.phase = "using";
                  care.insideFacility = true;
                  care.facilityIndex = claimedIndex;
                  if (care.intent === "food") {
                    const bowlCenter = foodBowlCenterPosition(claimedIndex);
                    entry.yaw = Math.atan2(
                      bowlCenter.x - entry.root.position.x,
                      bowlCenter.z - entry.root.position.z,
                    );
                    entry.visual.rotation.y = entry.yaw;
                  }
                  care.timer =
                    care.intent === "food"
                      ? FOOD_USE_SECONDS
                      : TOILET_USE_SECONDS;
                  careAnimation = care.intent === "food" ? "eat" : "sit";
                }
              }
            }
          }
        }

        const insideLitterBox =
          entry.care?.intent === "toilet" &&
          entry.care.insideFacility &&
          (entry.care.phase === "using" ||
            entry.care.phase === "recovering");
        entry.model.visible = !insideLitterBox;
        entry.shadow.visible = !insideLitterBox;
        if (entry.clickProxy) entry.clickProxy.visible = !insideLitterBox;
        let wheelAnimation: string | null = null;
        const secondaryWheelSession =
          catExerciseWheelSession?.catId === entry.catId
            ? catExerciseWheelSession
            : null;
        if (!entry.care && secondaryWheelSession) {
          if (secondaryWheelSession.phase === "approaching") {
            const arrived = moveSecondaryTowards(
              entry,
              catExerciseWheelUsePosition,
              navigationObstacles,
            );
            wheelAnimation = arrived ? "run" : "walk";
            if (arrived) {
              entry.root.position.x = catExerciseWheelUsePosition.x;
              entry.root.position.z = catExerciseWheelUsePosition.z;
              entry.careWaypoints.length = 0;
              entry.yaw = catExerciseWheelRunYaw;
              entry.visual.rotation.y = entry.yaw;
              secondaryWheelSession.phase = "running";
              secondaryWheelSession.timer = CAT_EXERCISE_WHEEL_RUN_SECONDS;
            }
          } else if (secondaryWheelSession.phase === "running") {
            entry.root.position.x = catExerciseWheelUsePosition.x;
            entry.root.position.z = catExerciseWheelUsePosition.z;
            entry.yaw = catExerciseWheelRunYaw;
            entry.visual.rotation.y = entry.yaw;
            secondaryWheelSession.timer -= delta;
            wheelAnimation = "run";
            if (secondaryWheelSession.timer <= 0) {
              secondaryWheelSession.phase = "exiting";
              entry.careWaypoints.length = 0;
              entry.careLastTarget.copy(entry.root.position);
              wheelAnimation = "walk";
            }
          } else {
            wheelAnimation = "walk";
            const exited = moveSecondaryTowards(
              entry,
              catExerciseWheelExitPosition,
              navigationObstacles,
            );
            if (exited) {
              entry.careWaypoints.length = 0;
              entry.careLastTarget.copy(entry.root.position);
              entry.ambientPhase = "prewalking";
              entry.ambientTimer = 0.65;
              entry.ambientTarget.copy(entry.root.position);
              completeCatExerciseWheelSession();
              wheelAnimation = "idle";
            }
          }
        }
        entry.root.position.y = THREE.MathUtils.damp(
          entry.root.position.y,
          secondaryWheelSession?.phase === "running"
            ? CAT_EXERCISE_WHEEL_CAT_LIFT
            : 0,
          10,
          delta,
        );
        entry.visual.position.y = THREE.MathUtils.damp(
          entry.visual.position.y,
          seat.status === "working" && entry.seatId !== "queue"
            ? SEAT_WORK_VISUAL_LIFTS[entry.seatId]
            : 0,
          10,
          delta,
        );
        let ambientAnimation: string | null = null;
        if (!entry.care && !wheelAnimation) {
          if (!entry.ambientInitialized) {
            const initialTarget = isSecondaryAutonomous
              ? AMBIENT_WANDER_POINTS[
                  (index + 1) % AMBIENT_WANDER_POINTS.length
                ]
              : homeTarget;
            entry.root.position.copy(initialTarget);
            entry.ambientTarget.copy(initialTarget);
            entry.careLastTarget.copy(initialTarget);
            entry.careWaypoints.length = 0;
            entry.ambientPhase = "resting";
            entry.ambientAnimationKey = pickPersonalityAmbientKey(
              entry.personality,
            );
            const initialAmbient =
              AMBIENT_ANIMATIONS.find(
                (animation) => animation.key === entry.ambientAnimationKey,
              ) ?? AMBIENT_ANIMATIONS[0];
            entry.ambientTimer =
              randomBetween(
                initialAmbient.minSeconds,
                initialAmbient.maxSeconds,
              ) * entry.personality.restDurationMultiplier +
              index * 0.8;
            entry.ambientInitialized = true;
          }

          if (becameSecondaryAutonomous) {
            // 작업이 끝난 고양이는 책상 앞에 머물지 않고 바로 휴게 공간으로 나온다.
            entry.ambientPhase = "prewalking";
            entry.ambientTimer = 0;
            entry.ambientTarget.copy(entry.root.position);
            entry.careWaypoints.length = 0;
          }

          if (!isSecondaryAutonomous) {
            entry.ambientTarget.copy(homeTarget);
            entry.careLastTarget.copy(homeTarget);
            entry.ambientPhase = "resting";
            entry.ambientTimer = randomBetween(3.5, 7.5);
            const arrivedHome = moveSecondaryTowards(
              entry,
              homeTarget,
              navigationObstacles,
            );
            ambientAnimation = arrivedHome
              ? seat.status === "working"
                ? "work"
                : "idle"
              : "walk";
          } else if (entry.ambientPhase === "resting") {
            entry.ambientTimer -= delta;
            ambientAnimation = entry.ambientAnimationKey;
            if (entry.ambientTimer <= 0) {
              entry.ambientPhase = "prewalking";
              entry.ambientTimer =
                randomBetween(0.65, 1.1) *
                entry.personality.preparationMultiplier;
              ambientAnimation = "idle";
            }
          } else if (entry.ambientPhase === "prewalking") {
            entry.ambientTimer -= delta;
            ambientAnimation = "idle";
            if (entry.ambientTimer <= 0) {
              let nextPointIndex = entry.ambientPointIndex;
              for (let attempt = 0; attempt < 8; attempt += 1) {
                const candidateIndex = Math.floor(
                  Math.random() * AMBIENT_WANDER_POINTS.length,
                );
                const candidate = AMBIENT_WANDER_POINTS[candidateIndex];
                if (
                  candidateIndex !== entry.ambientPointIndex &&
                  entry.root.position.distanceTo(candidate) > 0.9 &&
                  isWanderDestinationAvailable(candidate, entry.catId)
                ) {
                  nextPointIndex = candidateIndex;
                  break;
                }
              }
              if (nextPointIndex < 0) {
                nextPointIndex =
                  (index + 1) % AMBIENT_WANDER_POINTS.length;
              }
              entry.ambientPointIndex = nextPointIndex;
              const spreadAngle =
                (index / Math.max(1, desiredSeats.length)) * Math.PI * 2;
              entry.ambientTarget
                .copy(AMBIENT_WANDER_POINTS[nextPointIndex])
                .add(
                  new THREE.Vector3(
                    Math.sin(spreadAngle) * 0.22,
                    0,
                    Math.cos(spreadAngle) * 0.22,
                  ),
                );
              entry.careWaypoints.length = 0;
              entry.careLastTarget.copy(entry.root.position);
              entry.ambientPhase = "walking";
              ambientAnimation = "walk";
            }
          } else if (entry.ambientPhase === "walking") {
            ambientAnimation = "walk";
            const crowdRedirect =
              entry.crowdRedirectCooldown <= 0 &&
              entry.avoidance.holdSeconds <= 0
                ? chooseCrowdRedirect(
                    entry.root.position,
                    entry.catId,
                    entry.ambientPointIndex,
                  )
                : null;
            if (crowdRedirect) {
              entry.ambientPointIndex = crowdRedirect.pointIndex;
              entry.ambientTarget.copy(crowdRedirect.target);
              entry.careWaypoints.length = 0;
              entry.careLastTarget.copy(entry.root.position);
              entry.crowdRedirectCooldown = CAT_CROWD_REDIRECT_COOLDOWN;
            } else if (
              !isWanderDestinationAvailable(
                entry.ambientTarget,
                entry.catId,
              )
            ) {
              entry.careWaypoints.length = 0;
              entry.careLastTarget.copy(entry.root.position);
              entry.ambientPhase = "prewalking";
              entry.ambientTimer = randomBetween(0.18, 0.42);
              ambientAnimation = "idle";
            } else if (
              moveSecondaryTowards(
                entry,
                entry.ambientTarget,
                navigationObstacles,
              )
            ) {
              entry.careWaypoints.length = 0;
              entry.ambientPhase = "settling";
              entry.ambientTimer = randomBetween(0.8, 1.4);
              ambientAnimation = "idle";
            }
          } else {
            entry.ambientTimer -= delta;
            ambientAnimation = "idle";
            if (entry.ambientTimer <= 0) {
              entry.ambientPhase = "resting";
              entry.ambientAnimationKey = pickPersonalityAmbientKey(
                entry.personality,
              );
              const nextAmbient =
                AMBIENT_ANIMATIONS.find(
                  (animation) =>
                    animation.key === entry.ambientAnimationKey,
                ) ?? AMBIENT_ANIMATIONS[0];
              entry.ambientTimer =
                randomBetween(
                  nextAmbient.minSeconds,
                  nextAmbient.maxSeconds,
                ) * entry.personality.restDurationMultiplier;
              ambientAnimation = entry.ambientAnimationKey;
            }
          }
        }
        entry.wasAutonomous = isSecondaryAutonomous;
        const markerSeat = secondaryWheelSession
          ? {
              ...seat,
              statusLabel:
                secondaryWheelSession.phase === "running"
                  ? "러닝휠에서 달리는 중"
                  : secondaryWheelSession.phase === "exiting"
                    ? "러닝휠에서 나오는 중"
                    : "러닝휠로 가는 중",
            }
          : seat;
        entry.marker.update(markerSeat);
        entry.marker.updateBeacon(markerSeat);
        // 책상에서 일하는 동안에는 머리 위가 아니라 모니터 위쪽에 뜬다.
        entry.marker.marker.position.lerp(
          markerAnchorFor(
            entry.root,
            seat.seatId,
            seat.status === "working",
            entry.markerAnchorTarget,
            seatWorkingMarkerWorldPositions,
          ),
          1 - Math.exp(-delta * MARKER_MOVE_EASE),
        );
        const isYieldingWhileWalking =
          entry.avoidance.paused &&
          [careAnimation, wheelAnimation, ambientAnimation].includes("walk");
        const nextKey = isYieldingWhileWalking
          ? entry.avoidance.pauseAnimationKey
          : careAnimation ??
            wheelAnimation ??
            ambientAnimation ??
            (seat.blocked
              ? "sit"
              : seat.status === "working"
                  ? "work"
                  : "idle");
        setSecondaryAnimation(entry, nextKey);
        if (!entry.care && !wheelAnimation && ambientAnimation !== "walk") {
          if (nextKey === "work" && seat.seatId !== "queue") {
            const workLookTarget = seatWorkLookTargets[seat.seatId];
            const targetYaw = Math.atan2(
              workLookTarget.x - entry.root.position.x,
              workLookTarget.z - entry.root.position.z,
            );
            entry.yaw = lerpAngle(
              entry.yaw,
              targetYaw,
              1 - Math.exp(-delta * 7),
            );
            entry.visual.rotation.y = entry.yaw;
          } else {
            entry.visual.rotation.y = 0.25;
          }
        }
        entry.mixer.update(delta);
      });
    };

    const updateAssetProgress = () => {
      if (disposed) return;
      const combinedProgress = (modelProgress + animationsProgress) / 2;
      setLoadingProgress(
        Math.max(22, Math.min(94, 22 + Math.round(combinedProgress * 72))),
      );
    };
    const updateProgress = (
      event: ProgressEvent<EventTarget>,
      target: "model" | "animations",
    ) => {
      if (!event.total) return;
      const value = Math.min(1, event.loaded / event.total);
      if (target === "model") modelProgress = value;
      else animationsProgress = value;
      updateAssetProgress();
    };
    const fbxLoader = new FBXLoader();
    const requestedCatStyles = Array.from(
      new Set(
        (seats.length > 0 ? seats : [DEFAULT_SEAT_VIEW]).map(
          (seat) => seat.catStyle ?? catStyle,
        ),
      ),
    );
    Promise.all([
      Promise.all(
        requestedCatStyles.map((styleId) =>
          fbxLoader.loadAsync(catStyleModelUrl(styleId), (event) =>
            updateProgress(event, "model"),
          ),
        ),
      ),
      fbxLoader.loadAsync(CAT_ANIMATIONS_URL, (event) =>
        updateProgress(event, "animations"),
      ),
    ])
      .then(([styleModels, animationSource]) => {
        if (disposed) return;

        loadedAnimationClips = animationSource.animations;
        styleModels.forEach((model, styleIndex) => {
          const styleId = requestedCatStyles[styleIndex] ?? catStyle;
          // 체형 조정은 스키닝 전 바인드 포즈를 건드리므로 애니메이션을 물리기 전에 끝낸다.
          if (catShape) fattenCat(model, catShape);
          model.rotation.y = 0;
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;

            object.castShadow = false;
            object.receiveShadow = false;
            /* 고양이도 소품과 같은 unlit 로 맞춘다.
               전에는 고양이만 조명을 받는 재질이라 해가 기울면 혼자 어두워지고
               소품과 붙여 놓으면 톤이 어긋났다. 소품이 쓰는 변환기를 그대로 쓴다.
               (스키닝은 SkinnedMesh 면 렌더러가 알아서 붙여 준다) */
            const anisotropy = Math.min(
              4,
              renderer.capabilities.getMaxAnisotropy(),
            );
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            const styled = materials.map((material) => {
              const textured = material as THREE.Material & {
                map?: THREE.Texture | null;
                color?: THREE.Color;
              };
              // FBX 에 맵이 안 물린 파트는 공용 팔레트를 붙여야 색이 나온다.
              if ("map" in textured && !textured.map) {
                textured.map = catPaletteTexture;
              }
              // 원본 재질 색이 흰색이 아니면 텍스처가 물든다. 흰색으로 눌러 둔다.
              textured.color?.set(0xffffff);

              const unlit = isMeshyColorTextureMaterial(material)
                ? createUnlitMeshyMaterial(
                    material,
                    ILLUSTRATION_NEUTRAL_TINT,
                    anisotropy,
                  )
                : material;
              unlit.userData.outlineParameters = {
                thickness: ILLUSTRATION_OUTLINE_THICKNESS,
                color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
                alpha: ILLUSTRATION_OUTLINE_ALPHA,
                visible: true,
              };
              unlit.needsUpdate = true;
              return unlit;
            });
            object.material = Array.isArray(object.material)
              ? styled
              : styled[0];
          });

          model.updateMatrixWorld(true);
          const sourceBounds = new THREE.Box3().setFromObject(model);
          const sourceSize = sourceBounds.getSize(new THREE.Vector3());
          const scale = CHARACTER_HEIGHT / Math.max(sourceSize.y, 0.001);
          model.scale.setScalar(scale);
          model.updateMatrixWorld(true);

          const scaledBounds = new THREE.Box3().setFromObject(model);
          model.position.y = -scaledBounds.min.y;
          characterModelsByStyle.set(styleId, model);
        });

        const primaryStyle =
          (seatsRef.current[0] ?? DEFAULT_SEAT_VIEW).catStyle ?? catStyle;
        const model =
          characterModelsByStyle.get(primaryStyle) ?? styleModels[0];
        if (!model) throw new Error("Cat style model was not found.");
        characterModel = model;
        characterVisual.add(model);

        const walkClip = animationSource.animations.find((clip) =>
          clip.name.endsWith("|Walk_F"),
        );
        if (!walkClip) throw new Error("Cat Walk_F animation was not found.");
        mixer = new THREE.AnimationMixer(model);
        const walkAction = mixer.clipAction(walkClip);
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkAction.timeScale = 0.62;
        animationActions.set("walk", walkAction);

        for (const ambientAnimation of AMBIENT_ANIMATIONS) {
          const clip = animationSource.animations.find((candidate) =>
            candidate.name.endsWith(ambientAnimation.suffix),
          );
          if (!clip) {
            throw new Error(
              `Cat animation ${ambientAnimation.suffix} was not found.`,
            );
          }

          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.timeScale = ambientAnimation.timeScale;
          animationActions.set(ambientAnimation.key, action);
        }

        const kneadingClip = animationSource.animations.find((candidate) =>
          candidate.name.endsWith(DESK_KNEADING_ANIMATION_SUFFIX),
        );
        if (!kneadingClip) {
          throw new Error("Cat desk kneading animation was not found.");
        }
        const kneadingAction = mixer.clipAction(kneadingClip);
        kneadingAction.setLoop(THREE.LoopRepeat, Infinity);
        kneadingAction.timeScale = 0.92;
        animationActions.set(DESK_KNEADING_ANIMATION_KEY, kneadingAction);

        const toyAnimationClips = [
          ["toy-run", "|Run_F", 0.92],
          ["toy-crouch", "|Crouch_idle", 0.96],
          ["toy-pounce", "|Jump_run", 1.05],
          ["toy-grab", "|Attack_crouch", 1.48],
          ["toy-attack-left", "|Attack_Left", 1.08],
          ["toy-attack-right", "|Attack_Right", 1.08],
        ] as const;
        for (const [key, suffix, timeScale] of toyAnimationClips) {
          const clip = animationSource.animations.find((candidate) =>
            candidate.name.endsWith(suffix),
          );
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.timeScale = timeScale;
          animationActions.set(key, action);
        }

        playAnimation("idle-look", 0);

        animationSource.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach(disposeMaterial);
        });

        setLoadingProgress(100);
        setReady(true);
        worldReadyRef.current = true;
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    const currentPosition = characterRoot.position.clone();
    const desiredPosition = new THREE.Vector3();
    const ambientTarget = currentPosition.clone();
    const movementGoal = new THREE.Vector3();
    const movementDirection = new THREE.Vector3();
    const nextPosition = new THREE.Vector3();
    const frameMovementStart = new THREE.Vector3();
    const lastNavigationTarget = currentPosition.clone();
    const avoidanceWaypoints: THREE.Vector3[] = [];
    const separationDelta = new THREE.Vector3();
    const catNeighborPositions = (selfId: string) => {
      const neighbors: Array<{ id: string; x: number; z: number }> = [];
      const primaryCatId =
        (seatsRef.current[0] ?? DEFAULT_SEAT_VIEW).catId;
      if (primaryCatId !== selfId) {
        neighbors.push({
          id: primaryCatId,
          x: currentPosition.x,
          z: currentPosition.z,
        });
      }
      secondaryAgents.forEach((entry) => {
        if (entry.catId === selfId) return;
        neighbors.push({
          id: entry.catId,
          x: entry.root.position.x,
          z: entry.root.position.z,
        });
      });
      return neighbors;
    };
    type CatEncounterPlan = {
      turn: -1 | 1;
      yieldCatId: string;
      expiresAt: number;
    };
    const catEncounterPlans = new Map<string, CatEncounterPlan>();
    const personalityForCatId = (catId: string) => {
      const seat = seatsRef.current.find(
        (candidate) => candidate.catId === catId,
      );
      return catPersonalityForStyle(seat?.catStyle ?? catStyle);
    };
    const encounterPlanFor = (leftCatId: string, rightCatId: string) => {
      const pair = [String(leftCatId), String(rightCatId)].sort();
      const key = pair.join("|");
      const now = performance.now() / 1000;
      const current = catEncounterPlans.get(key);
      if (current && current.expiresAt > now) return current;

      const leftYieldBias = personalityForCatId(pair[0]).yieldBias;
      const rightYieldBias = personalityForCatId(pair[1]).yieldBias;
      const yieldCatId =
        Math.random() < leftYieldBias / (leftYieldBias + rightYieldBias)
          ? pair[0]
          : pair[1];
      const plan: CatEncounterPlan = {
        turn: Math.random() < 0.5 ? -1 : 1,
        yieldCatId,
        expiresAt:
          now +
          randomBetween(
            CAT_AVOIDANCE_HOLD_MIN_SECONDS,
            CAT_AVOIDANCE_HOLD_MAX_SECONDS,
          ),
      };
      catEncounterPlans.set(key, plan);
      return plan;
    };
    const advanceAvoidanceMotion = (
      motion: CatAvoidanceMotion,
      delta: number,
    ) => {
      motion.holdSeconds = Math.max(0, motion.holdSeconds - delta);
      motion.yieldSeconds = Math.max(0, motion.yieldSeconds - delta);
      motion.paused = false;
      if (motion.holdSeconds <= 0) motion.neighborId = null;
    };
    const resolveNeighborSteering = ({
      motion,
      selfId,
      start,
      destination,
      neighbors,
      delta,
    }: {
      motion: CatAvoidanceMotion;
      selfId: string;
      start: THREE.Vector3;
      destination: THREE.Vector3;
      neighbors: Array<{ id: string; x: number; z: number }>;
      delta: number;
    }) => {
      let steering = steerAroundNeighbors2D({
        selfId,
        start,
        destination,
        neighbors,
        clearance: CAT_MIN_SEPARATION,
        lookAhead: CAT_AVOIDANCE_LOOK_AHEAD,
        preferredTurn: motion.holdSeconds > 0 ? motion.turn : 0,
      });
      if (
        steering.avoiding &&
        steering.blockerId &&
        (motion.neighborId !== steering.blockerId || motion.holdSeconds <= 0)
      ) {
        const plan = encounterPlanFor(selfId, steering.blockerId);
        motion.turn = plan.turn;
        motion.neighborId = steering.blockerId;
        motion.holdSeconds = Math.max(
          0.1,
          plan.expiresAt - performance.now() / 1000,
        );
        motion.yieldSeconds =
          plan.yieldCatId === selfId
            ? randomBetween(
                CAT_AVOIDANCE_YIELD_MIN_SECONDS,
                CAT_AVOIDANCE_YIELD_MAX_SECONDS,
              )
            : 0;
        if (motion.yieldSeconds > 0) {
          motion.pauseAnimationKey = pickPersonalityYieldAnimation(
            personalityForCatId(selfId),
          );
        }
        steering = steerAroundNeighbors2D({
          selfId,
          start,
          destination,
          neighbors,
          clearance: CAT_MIN_SEPARATION,
          lookAhead: CAT_AVOIDANCE_LOOK_AHEAD,
          preferredTurn: motion.turn,
        });
      }

      motion.paused = steering.avoiding && motion.yieldSeconds > 0;
      const targetDirection = new THREE.Vector3(steering.x, 0, steering.z);
      if (motion.direction.lengthSq() < 1e-6) {
        motion.direction.copy(targetDirection);
      } else {
        motion.direction.lerp(
          targetDirection,
          1 - Math.exp(-delta * (steering.avoiding ? 3.6 : 9)),
        );
      }
      if (motion.direction.lengthSq() > 1e-6) motion.direction.normalize();
      return {
        direction: motion.direction,
        avoiding: steering.avoiding,
        paused: motion.paused,
      };
    };
    const isWanderDestinationAvailable = (
      candidate: THREE.Vector3,
      selfId: string,
    ) => {
      const minimumDistanceSquared =
        CAT_WANDER_RESERVATION_DISTANCE * CAT_WANDER_RESERVATION_DISTANCE;
      if (
        catNeighborPositions(selfId).some((neighbor) => {
          const deltaX = candidate.x - neighbor.x;
          const deltaZ = candidate.z - neighbor.z;
          return deltaX * deltaX + deltaZ * deltaZ < minimumDistanceSquared;
        })
      ) {
        return false;
      }

      const primaryCatId =
        (seatsRef.current[0] ?? DEFAULT_SEAT_VIEW).catId;
      if (
        primaryCatId !== selfId &&
        (ambientPhase === "walking" || ambientPhase === "settling") &&
        candidate.distanceToSquared(ambientTarget) < minimumDistanceSquared
      ) {
        return false;
      }
      for (const entry of secondaryAgents.values()) {
        if (
          entry.catId !== selfId &&
          (entry.ambientPhase === "walking" ||
            entry.ambientPhase === "settling") &&
          candidate.distanceToSquared(entry.ambientTarget) <
            minimumDistanceSquared
        ) {
          return false;
        }
      }
      return true;
    };
    const chooseCrowdRedirect = (
      position: THREE.Vector3,
      selfId: string,
      currentPointIndex: number,
    ) => {
      const neighbors = catNeighborPositions(selfId);
      const crowdingNeighbors = neighbors.filter((neighbor) =>
        Math.hypot(
          position.x - neighbor.x,
          position.z - neighbor.z,
        ) < CAT_CROWD_REDIRECT_DISTANCE,
      );
      // 둘만 마주쳤을 때는 공유 회피 계획이 한 마리를 쉬게 한다. 세 마리
      // 이상 뭉친 경우에만 목적지를 바꿔 모두 같은 방향으로 도는 현상을 막는다.
      if (crowdingNeighbors.length < 2) return null;

      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;
      AMBIENT_WANDER_POINTS.forEach((candidate, candidateIndex) => {
        if (
          candidateIndex === currentPointIndex ||
          position.distanceTo(candidate) < 1 ||
          !isWanderDestinationAvailable(candidate, selfId)
        ) {
          return;
        }

        const candidateX = candidate.x - position.x;
        const candidateZ = candidate.z - position.z;
        const candidateLength = Math.max(
          Math.hypot(candidateX, candidateZ),
          0.0001,
        );
        let nearestNeighborDistance = Number.POSITIVE_INFINITY;
        let awayScore = 0;
        neighbors.forEach((neighbor) => {
          nearestNeighborDistance = Math.min(
            nearestNeighborDistance,
            Math.hypot(candidate.x - neighbor.x, candidate.z - neighbor.z),
          );
          const awayX = position.x - neighbor.x;
          const awayZ = position.z - neighbor.z;
          const awayLength = Math.max(Math.hypot(awayX, awayZ), 0.0001);
          awayScore +=
            (candidateX * awayX + candidateZ * awayZ) /
            (candidateLength * awayLength);
        });
        const score =
          nearestNeighborDistance * 2.1 +
          awayScore * 0.72 +
          candidateLength * 0.08;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = candidateIndex;
        }
      });

      return bestIndex < 0
        ? null
        : {
            pointIndex: bestIndex,
            target: AMBIENT_WANDER_POINTS[bestIndex],
          };
    };
    const enforceCatSeparation = (delta: number) => {
      const participants = [
        { position: currentPosition, avoidance: primaryAvoidance },
        ...Array.from(secondaryAgents.values(), (entry) => ({
          position: entry.root.position,
          avoidance: entry.avoidance,
        })),
      ];
      // 두 번의 작은 보정으로 세 마리 이상이 모여도 서서히 간격을 되찾는다.
      for (let pass = 0; pass < 2; pass += 1) {
        for (let left = 0; left < participants.length; left += 1) {
          for (
            let right = left + 1;
            right < participants.length;
            right += 1
          ) {
            const leftParticipant = participants[left];
            const rightParticipant = participants[right];
            const leftPosition = leftParticipant.position;
            const rightPosition = rightParticipant.position;
            separationDelta.subVectors(rightPosition, leftPosition);
            separationDelta.y = 0;
            let distance = separationDelta.length();
            if (distance >= CAT_MIN_SEPARATION) continue;
            if (distance < 0.0001) {
              const angle = (left * 2.17 + right * 1.31) % (Math.PI * 2);
              separationDelta.set(Math.cos(angle), 0, Math.sin(angle));
              distance = 0;
            } else {
              separationDelta.multiplyScalar(1 / distance);
            }
            // 겹친 만큼을 한 프레임에 강제로 밀면 화면에서 덜덜 떨린다.
            // 아주 조금씩만 풀어 회피 애니메이션이 실제 분리를 담당하게 한다.
            const correction = Math.min(
              (CAT_MIN_SEPARATION - distance) * 0.11,
              CAT_SEPARATION_CORRECTION_SPEED * delta,
            );
            // 쉬기로 한 고양이는 제자리에서 미끄러지지 않고, 지나가는 쪽만
            // 천천히 간격을 회복한다.
            if (!leftParticipant.avoidance.paused) {
              leftPosition.addScaledVector(separationDelta, -correction);
            }
            if (!rightParticipant.avoidance.paused) {
              rightPosition.addScaledVector(separationDelta, correction);
            }
          }
        }
      }
    };
    const clock = new THREE.Clock();
    let palmLeafSwayTime = 0;
    let oceanTideTime = 0;
    let outlineGapVisibility = 1;

    const atmospherePalettes = {
      skyTop: [0x65cbd5, 0x78bdc8, 0x76688a, 0x172744, 0x56678a],
      horizon: [0xf8e7b8, 0xffd38f, 0xffab79, 0x48577b, 0xdba1a2],
      sea: [0x52bdc5, 0x4ba3ae, 0x4a7488, 0x294861, 0x427287],
      fog: [0x77cbbd, 0xd9b384, 0xc18483, 0x29445f, 0x73839c],
      ground: [0xffffff, 0xffeed4, 0xe9b9b0, 0x8292b1, 0xb8aec2],
      water: [0xffffff, 0xffdfbd, 0xd9a1aa, 0x879fba, 0xa6adbf],
      hemisphereSky: [0xfff6dd, 0xffddb0, 0xf3b1a2, 0xaec8ea, 0xc8bfda],
      hemisphereGround: [0x536c49, 0x806b4b, 0x725a59, 0x314660, 0x565b70],
      sunlight: [0xfff2d1, 0xffd18c, 0xffa778, 0xa9c8ed, 0xf2b79c],
    } as const;
    const atmosphereColors = Object.fromEntries(
      Object.entries(atmospherePalettes).map(([key, values]) => [
        key,
        values.map((value) => new THREE.Color(value)),
      ]),
    ) as Record<keyof typeof atmospherePalettes, THREE.Color[]>;
    const blendedAtmosphereColor = new THREE.Color();
    const blendAtmosphereColor = (
      target: THREE.Color,
      palette: THREE.Color[],
      sample: ReturnType<typeof sampleWorldDayNight>,
    ) => {
      const weights = [
        sample.daylight * 1.05,
        sample.golden,
        sample.sunset * 1.12,
        sample.night * 1.08,
        sample.dawn,
      ];
      const total = Math.max(
        0.0001,
        weights.reduce((sum, weight) => sum + weight, 0),
      );
      let red = 0;
      let green = 0;
      let blue = 0;
      palette.forEach((color, index) => {
        red += color.r * weights[index];
        green += color.g * weights[index];
        blue += color.b * weights[index];
      });
      target.setRGB(red / total, green / total, blue / total);
      return target;
    };
    const applyWorldDayNight = (
      sample: ReturnType<typeof sampleWorldDayNight>,
      animationTime: number,
    ) => {
      const { uniforms } = atmosphereBackdrop;
      uniforms.atmosphereTime.value = animationTime;
      blendAtmosphereColor(
        uniforms.skyTopColor.value,
        atmosphereColors.skyTop,
        sample,
      );
      blendAtmosphereColor(
        uniforms.skyHorizonColor.value,
        atmosphereColors.horizon,
        sample,
      );
      blendAtmosphereColor(
        uniforms.distantSeaColor.value,
        atmosphereColors.sea,
        sample,
      );
      blendAtmosphereColor(
        uniforms.sunlightColor.value,
        atmosphereColors.sunlight,
        sample,
      );
      uniforms.moonlightColor.value.set(0xc8ddff);
      uniforms.daylightAmount.value = sample.daylight;
      uniforms.goldenAmount.value = sample.golden;
      uniforms.sunsetAmount.value = sample.sunset;
      uniforms.nightAmount.value = sample.night;
      uniforms.dawnAmount.value = sample.dawn;
      uniforms.starAmount.value = sample.stars;
      uniforms.sunPosition.value.set(
        0.5 + sample.sunX * 0.39,
        0.715 + sample.sunHeight * 0.2 - sample.sunset * 0.023,
      );
      uniforms.moonPosition.value.set(
        0.5 + sample.moonX * 0.39,
        0.715 + sample.moonHeight * 0.19,
      );
      uniforms.sunVisibility.value = sample.sunVisibility;
      uniforms.moonVisibility.value = sample.moonVisibility;

      blendAtmosphereColor(
        blendedAtmosphereColor,
        atmosphereColors.fog,
        sample,
      );
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(blendedAtmosphereColor);
      }
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(blendedAtmosphereColor);
      }
      blendAtmosphereColor(
        groundMaterial.color,
        atmosphereColors.ground,
        sample,
      );
      blendAtmosphereColor(
        oceanMaterial.color,
        atmosphereColors.water,
        sample,
      );
      shoreWaterOverlayMaterial.color.copy(oceanMaterial.color);

      blendAtmosphereColor(
        hemisphereLight.color,
        atmosphereColors.hemisphereSky,
        sample,
      );
      blendAtmosphereColor(
        hemisphereLight.groundColor,
        atmosphereColors.hemisphereGround,
        sample,
      );
      hemisphereLight.intensity =
        0.82 + sample.daylight * 0.88 + sample.golden * 0.12;
      blendAtmosphereColor(
        keyLight.color,
        atmosphereColors.sunlight,
        sample,
      );
      keyLight.intensity =
        0.28 + sample.daylight * 1.72 + sample.golden * 0.32;
      keyLight.position.set(
        -4 + sample.sunX * 7.5,
        7.5 + sample.sunHeight * 4,
        7 - sample.sunX * 4,
      );
      fillLight.intensity =
        0.38 + sample.daylight * 0.22 + sample.night * 0.42;
      fillLight.color.set(sample.night > 0.45 ? 0xa9c9ed : 0x9fcbe0);
      moonLight.intensity = sample.night * sample.moonVisibility * 0.92;
      moonLight.position.set(
        sample.moonX * 8,
        6 + sample.moonHeight * 5,
        -5,
      );
      nightLanternLight.intensity = sample.warmLights * 1.2;
      nightWorkstationLight.intensity = sample.warmLights * 0.78;
      renderer.toneMappingExposure =
        0.9 + sample.daylight * 0.1 + sample.golden * 0.035;
    };

    const updateSize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const aspect = width / height;
      const viewHeight = aspect < 0.72 ? 11.4 : 10.8;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const activePointers = new Map<number, THREE.Vector2>();
    let dragPointerId: number | null = null;
    const dragStart = new THREE.Vector2();
    let dragStartYaw = worldYawTarget;
    let dragStartPitch = worldPitchTarget;
    let pinchStartDistance = 0;
    let pinchStartZoom = worldZoomTarget;
    const clickStart = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let clickStartedAt = 0;
    const updatePointerRay = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(
        ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
    };
    const editableEntryAt = (clientX: number, clientY: number) => {
      updatePointerRay(clientX, clientY);
      const candidates = Array.from(editableWorldObjects.values())
        .map((entry) => entry.object)
        .filter((object) => object.visible && object.parent);
      const hit = raycaster.intersectObjects(candidates, true)[0];
      let target: THREE.Object3D | null = hit?.object ?? null;
      while (target && !target.userData.editableWorldObjectId) {
        target = target.parent;
      }
      const id = String(target?.userData.editableWorldObjectId ?? "");
      return editableWorldObjects.get(id) ?? null;
    };

    const beginWorldDrag = (
      pointerId: number,
      position: THREE.Vector2,
    ) => {
      dragPointerId = pointerId;
      dragStart.copy(position);
      dragStartYaw = worldYawTarget;
      dragStartPitch = worldPitchTarget;
      pinchStartDistance = 0;
    };

    const beginPinchZoom = () => {
      const pointers = Array.from(activePointers.values());
      if (pointers.length < 2) return;

      pinchStartDistance = Math.max(
        pointers[0].distanceTo(pointers[1]),
        1,
      );
      pinchStartZoom = worldZoomTarget;
      dragPointerId = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      if (layoutEditorEnabled) {
        const entry = editableEntryAt(event.clientX, event.clientY);
        selectEditableObject(entry);
        objectDragMoved = false;
        if (!entry) return;

        updatePointerRay(event.clientX, event.clientY);
        if (!raycaster.ray.intersectPlane(objectDragPlane, objectDragHit)) return;
        objectDragPointerId = event.pointerId;
        objectDragOffset
          .copy(entry.object.position)
          .sub(objectDragHit);
        renderer.domElement.style.cursor = "grabbing";
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      const position = new THREE.Vector2(event.clientX, event.clientY);
      activePointers.set(event.pointerId, position);
      if (activePointers.size === 1) {
        clickStart.copy(position);
        clickStartedAt = performance.now();
      }
      renderer.domElement.style.cursor =
        placementModeRef.current === "laser" ||
        placementModeRef.current === "toy"
          ? "crosshair"
          : "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);

      if (placementModeRef.current === "laser") {
        setLaserTargetFromPointer(event.clientX, event.clientY);
        dragPointerId = null;
        return;
      }
      if (placementModeRef.current === "toy") {
        dragPointerId = null;
        return;
      }
      if (activePointers.size >= 2) {
        beginPinchZoom();
      } else {
        beginWorldDrag(event.pointerId, position);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (layoutEditorEnabled) {
        if (
          event.pointerId !== objectDragPointerId ||
          !selectedEditableObject
        ) {
          return;
        }

        event.preventDefault();
        updatePointerRay(event.clientX, event.clientY);
        if (!raycaster.ray.intersectPlane(objectDragPlane, objectDragHit)) return;
        const nextX = THREE.MathUtils.clamp(
          objectDragHit.x + objectDragOffset.x,
          WORLD_OBJECT_POSITION_LIMITS.minX,
          WORLD_OBJECT_POSITION_LIMITS.maxX,
        );
        const nextZ = THREE.MathUtils.clamp(
          objectDragHit.z + objectDragOffset.z,
          WORLD_OBJECT_POSITION_LIMITS.minZ,
          WORLD_OBJECT_POSITION_LIMITS.maxZ,
        );
        objectDragMoved ||=
          Math.abs(selectedEditableObject.object.position.x - nextX) > 0.001 ||
          Math.abs(selectedEditableObject.object.position.z - nextZ) > 0.001;
        selectedEditableObject.object.position.x = nextX;
        selectedEditableObject.object.position.z = nextZ;
        syncEditableObject(selectedEditableObject);
        updateSelectionRing();
        return;
      }

      if (!activePointers.has(event.pointerId)) return;

      event.preventDefault();
      const position = new THREE.Vector2(event.clientX, event.clientY);
      activePointers.set(event.pointerId, position);
      if (placementModeRef.current === "laser") {
        setLaserTargetFromPointer(event.clientX, event.clientY);
        return;
      }
      const rect = host.getBoundingClientRect();

      if (activePointers.size >= 2) {
        const pointers = Array.from(activePointers.values());
        const currentDistance = Math.max(
          pointers[0].distanceTo(pointers[1]),
          1,
        );
        if (pinchStartDistance <= 0) beginPinchZoom();
        worldZoomTarget = THREE.MathUtils.clamp(
          pinchStartZoom * (currentDistance / pinchStartDistance),
          WORLD_ZOOM_MIN,
          WORLD_ZOOM_MAX,
        );
        return;
      }

      if (event.pointerId !== dragPointerId) return;

      const horizontalMovement =
        (event.clientX - dragStart.x) / Math.max(rect.width, 1);
      const verticalMovement =
        (event.clientY - dragStart.y) / Math.max(rect.height, 1);
      worldYawTarget = THREE.MathUtils.clamp(
        dragStartYaw - horizontalMovement * WORLD_YAW_LIMIT * 2,
        -WORLD_YAW_LIMIT,
        WORLD_YAW_LIMIT,
      );
      worldPitchTarget = THREE.MathUtils.clamp(
        dragStartPitch + verticalMovement * worldPitchLimit * 2,
        -worldPitchLimit,
        worldPitchLimit,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (layoutEditorEnabled) {
        if (event.pointerId !== objectDragPointerId) return;
        event.preventDefault();
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        if (selectedEditableObject && objectDragMoved) {
          persistEditableObject(selectedEditableObject);
        }
        objectDragPointerId = null;
        objectDragMoved = false;
        renderer.domElement.style.cursor = "crosshair";
        return;
      }

      if (!activePointers.has(event.pointerId)) return;

      event.preventDefault();
      const pointerCountBeforeRelease = activePointers.size;
      const clickDistance = clickStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      );
      const clickThreshold = event.pointerType === "touch" ? 10 : 6;
      const shouldClick =
        pointerCountBeforeRelease === 1 &&
        clickDistance < clickThreshold &&
        performance.now() - clickStartedAt < 280;
      activePointers.delete(event.pointerId);
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }

      if (activePointers.size >= 2) {
        beginPinchZoom();
      } else if (activePointers.size === 1) {
        const [remainingPointer] = activePointers.entries();
        beginWorldDrag(remainingPointer[0], remainingPointer[1]);
      } else {
        dragPointerId = null;
        pinchStartDistance = 0;
        renderer.domElement.style.cursor =
          placementModeRef.current === "laser" ||
          placementModeRef.current === "toy"
            ? "crosshair"
            : "grab";
      }

      if (shouldClick) {
        updatePointerRay(event.clientX, event.clientY);
        if (placementModeRef.current === "laser") {
          setLaserTargetFromPointer(event.clientX, event.clientY);
          return;
        }
        if (placementModeRef.current === "toy") {
          startToyHuntFromPointer(event.clientX, event.clientY);
          return;
        }
        if (placementModeRef.current === "snack") {
          if (raycaster.ray.intersectPlane(objectDragPlane, objectDragHit)) {
            const normalizedIslandDistance =
              (objectDragHit.x * objectDragHit.x) / (4.15 * 4.15) +
              (objectDragHit.z * objectDragHit.z) / (3.25 * 3.25);
            if (normalizedIslandDistance <= 1) {
              onWorldPlacementRef.current?.({
                x: objectDragHit.x,
                z: objectDragHit.z,
              });
            }
          }
          return;
        }
        const hit = raycaster.intersectObjects(clickableObjects, true)[0];
        let target: THREE.Object3D | null = hit?.object ?? null;
        while (target && !target.userData.clickTargetId) target = target.parent;
        const targetId = String(target?.userData.clickTargetId ?? "");
        if (targetId === "radio") {
          if (activeSeatCountRef.current >= 4) {
            onRadioClickRef.current?.();
          }
        } else if (targetId === "food-bowl") {
          onFoodBowlClickRef.current?.();
        } else if (targetId === "litter-box") {
          litterLevelRef.current = 0;
          syncLitterLevelGauges();
          onLitterBoxClickRef.current?.();
        } else if (targetId.startsWith("cat-seat-")) {
          const seatId = targetId.slice(4) as SeatId;
          onSeatClickRef.current?.(seatId);
        } else if (targetId.startsWith("beach-shell-")) {
          const collectible = collectibleShells.get(targetId);
          if (!collectible || collectible.collecting) return;
          collectible.collecting = true;
          collectible.elapsed = 0;
          removeClickable(collectible.proxy);
          collectible.group.getWorldPosition(shellBurstOrigin);
          shellBurstElapsed = 0;
          shellBurst.visible = true;
          shellCollectFlash.position.copy(shellBurstOrigin);
          shellCollectFlash.position.y += 0.17;
          shellCollectFlash.scale.setScalar(0.2);
          shellCollectFlash.visible = true;
          shellCollectRing.position.copy(shellBurstOrigin);
          shellCollectRing.position.y += 0.018;
          shellCollectRing.scale.setScalar(0.42);
          shellCollectRing.visible = true;
          const projected = shellBurstOrigin.clone().project(camera);
          onShellCollectRef.current?.({
            amount: 1,
            x: THREE.MathUtils.clamp((projected.x + 1) / 2, 0, 1),
            y: THREE.MathUtils.clamp((1 - projected.y) / 2, 0, 1),
          });
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0012);
      worldZoomTarget = THREE.MathUtils.clamp(
        worldZoomTarget * zoomFactor,
        WORLD_ZOOM_MIN,
        WORLD_ZOOM_MAX,
      );
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, {
      passive: false,
    });
    window.addEventListener("keydown", handleMonitorCalibrationKeyDown);

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(host);
    updateSize();

    renderer.setAnimationLoop(() => {
      const measuredDelta = Math.min(clock.getDelta(), 0.05);
      const delta = suppressMonitorInteraction ? 0 : measuredDelta;
      const animationTime = suppressMonitorInteraction ? 0 : clock.elapsedTime;
      const worldDayNightPhase =
        forcedWorldDayNightPhaseRef.current ??
        worldDayNightPhaseAt(Date.now(), worldDayNightAnchor);
      applyWorldDayNight(
        sampleWorldDayNight(worldDayNightPhase),
        animationTime,
      );
      const primaryView = seatsRef.current[0] ?? DEFAULT_SEAT_VIEW;
      const isPrimaryBlocked = primaryView.blocked;
      const isPrimaryWorking = primaryView.status === "working";
      updateCatExerciseWheelScheduler(delta, primaryView);
      const primaryWheelSession =
        catExerciseWheelSession?.catId === primaryView.catId &&
        catExerciseWheelSession.secondaryKey === null
          ? catExerciseWheelSession
          : null;
      const primaryMarkerView = primaryWheelSession
        ? {
            ...primaryView,
            statusLabel:
              primaryWheelSession.phase === "running"
                ? "러닝휠에서 달리는 중"
                : primaryWheelSession.phase === "exiting"
                  ? "러닝휠에서 나오는 중"
                  : "러닝휠로 가는 중",
          }
        : primaryView;
      primaryMarker.update(primaryMarkerView);
      primaryMarker.updateBeacon(primaryMarkerView);
      workstationGroups.forEach((workstation, seatId) => {
        workstation.visible =
          layoutEditorEnabled ||
          monitorCalibrationEnabled ||
          forceMonitorDiagnosticScreen ||
          Number(seatId.slice(-1)) <= activeSeatCountRef.current;
      });
      if (catExerciseWheelGroup) {
        catExerciseWheelGroup.visible =
          layoutEditorEnabled || exerciseWheelOwnedRef.current;
      }
      syncWorkstationDecorGroups();
      syncFoodBowlVisuals();
      applyFoodGradeAppearance();
      foodBowlInstances
        .flatMap((instance) => instance.sparkles)
        .forEach(({ sprite, material, phase }) => {
        const premiumVisible =
          hasFoodAvailable() && foodGradeRef.current === "Premium";
        sprite.visible = premiumVisible;
        const pulse = Math.sin(animationTime * 3.2 + phase) * 0.5 + 0.5;
        sprite.scale.setScalar(0.055 + pulse * 0.085);
        material.opacity = premiumVisible ? 0.28 + pulse * 0.72 : 0;
        sprite.position.y =
          0.14 + Math.floor(phase / 3) * 0.08 + pulse * 0.07;
        });
      syncLitterLevelGauges();
      const litterRatio = THREE.MathUtils.clamp(
        litterLevelRef.current / litterMaxLevelRef.current,
        0,
        1,
      );
      const litterFull = litterIsFull();
      litterBoxInstances.forEach((instance) => {
        instance.odorParticles.forEach(
          ({ sprite, material, phase, drift }, index) => {
          const progress = (animationTime * 0.16 + phase) % 1;
          const visible = litterRatio > 0.01;
          sprite.visible = visible;
          sprite.position.set(
            Math.sin(animationTime * 1.15 + phase * 9) *
              (0.1 + index * 0.008) *
              drift,
            0.5 + progress * 0.92,
            -0.04 +
              Math.cos(animationTime * 0.9 + phase * 7) * 0.055,
          );
          const particleScale =
            0.09 + progress * 0.17 + litterRatio * 0.055;
          sprite.scale.setScalar(particleScale);
          material.opacity = visible
            ? litterRatio *
              Math.sin(progress * Math.PI) *
              (litterFull ? 0.78 : 0.5)
            : 0;
          material.rotation =
            Math.sin(animationTime * 0.75 + phase * 8) * 0.2;
          },
        );
      });
      radioClickProxy.visible =
        layoutEditorEnabled || activeSeatCountRef.current >= 4;
      syncSecondaryAgents(delta);

      shellSpawnElapsed += delta;
      if (
        shellSpawnElapsed >= nextShellSpawnSeconds &&
        spawnCollectibleShell()
      ) {
        shellSpawnElapsed = 0;
        nextShellSpawnSeconds = randomBetween(9, 16);
      }
      collectibleShells.forEach((collectible, id) => {
        if (collectible.collecting) {
          collectible.elapsed += delta;
          const progress = Math.min(1, collectible.elapsed / 0.58);
          const popWave = Math.sin(progress * Math.PI);
          collectible.group.position.y =
            collectible.baseY + popWave * 0.045;
          collectible.group.scale.setScalar(
            collectible.baseScale * (1 + popWave * 0.26),
          );
          if (progress >= 1) {
            scene.remove(collectible.group);
            collectibleShells.delete(id);
          }
          return;
        }
        const bob =
          Math.sin(animationTime * 1.65 + collectible.phase) * 0.018;
        collectible.group.position.y =
          collectible.baseY + bob;
        collectible.group.rotation.y =
          collectible.baseRotationY +
          Math.sin(animationTime * 0.72 + collectible.phase) * 0.065;
        const ripplePulse =
          1 + Math.sin(animationTime * 1.35 + collectible.phase) * 0.055;
        collectible.ripple.scale.set(1.18 * ripplePulse, 0.76 * ripplePulse, 1);
        collectible.ripple.material.opacity =
          0.2 +
          (Math.sin(animationTime * 1.35 + collectible.phase) * 0.5 + 0.5) *
            0.14;
        collectible.sparkles.forEach((sparkle) => {
          const shimmer =
            Math.sin(animationTime * 3.15 + sparkle.phase) * 0.5 + 0.5;
          const sharpShimmer = Math.pow(shimmer, 3.1);
          const glowShimmer = Math.pow(shimmer, 1.7);
          sparkle.star.material.opacity = 0.14 + sharpShimmer * 0.86;
          sparkle.star.scale.setScalar(
            sparkle.baseScale * (0.42 + sharpShimmer * 1.08),
          );
          sparkle.star.position.y =
            sparkle.baseY + Math.sin(animationTime * 1.8 + sparkle.phase) * 0.04;
          sparkle.star.quaternion.copy(camera.quaternion);
          sparkle.star.rotateZ(
            animationTime * 0.22 * sparkle.spin + sparkle.phase * 0.08,
          );
          sparkle.halo.material.opacity = 0.04 + glowShimmer * 0.68;
          sparkle.halo.scale.setScalar(
            sparkle.haloBaseScale * (0.54 + glowShimmer * 1.42),
          );
          sparkle.halo.position.copy(sparkle.star.position);
        });
      });
      if (shellBurstElapsed <= 0.78) {
        shellBurstElapsed += delta;
        const flashProgress = Math.min(1, shellBurstElapsed / 0.52);
        const flashPulse = Math.sin(flashProgress * Math.PI);
        shellCollectFlash.visible = flashProgress < 1;
        shellCollectFlash.material.opacity =
          Math.pow(1 - flashProgress, 1.25) * 0.96;
        shellCollectFlash.scale.setScalar(0.35 + flashPulse * 1.75);
        shellCollectFlash.quaternion.copy(camera.quaternion);
        shellCollectFlash.rotateZ(shellBurstElapsed * 0.42);
        const ringProgress = Math.min(1, shellBurstElapsed / 0.68);
        const ringEaseOut = 1 - Math.pow(1 - ringProgress, 3);
        shellCollectRing.visible = ringProgress < 1;
        shellCollectRing.material.opacity =
          Math.pow(1 - ringProgress, 1.7) * 0.82;
        shellCollectRing.scale.setScalar(0.42 + ringEaseOut * 2.35);
        shellBurstMaterial.opacity = Math.max(
          0,
          0.98 * (1 - shellBurstElapsed / 0.78),
        );
        shellBurstVelocities.forEach((velocity, index) => {
          shellBurstDummy.position
            .copy(shellBurstOrigin)
            .addScaledVector(velocity, shellBurstElapsed);
          shellBurstDummy.position.y -=
            0.52 * shellBurstElapsed * shellBurstElapsed;
          shellBurstDummy.quaternion.copy(camera.quaternion);
          shellBurstDummy.rotateZ(
            index * 0.73 + shellBurstElapsed * (index % 2 ? 5 : -5),
          );
          shellBurstDummy.scale.setScalar(
            Math.max(0, 1 - shellBurstElapsed / 0.78) *
              (0.72 + (index % 3) * 0.18),
          );
          shellBurstDummy.updateMatrix();
          shellBurst.setMatrixAt(index, shellBurstDummy.matrix);
        });
        shellBurst.instanceMatrix.needsUpdate = true;
        if (shellBurstElapsed >= 0.78) {
          shellBurst.visible = false;
          shellCollectFlash.visible = false;
          shellCollectRing.visible = false;
        }
      }

      if (completionSignalRef.current !== lastCompletionSignal) {
        lastCompletionSignal = completionSignalRef.current;
        completionElapsed = 0;
        completionParticles.visible = true;
        worldZoomTarget = WORLD_ZOOM_MAX;
        playCompletionChime();
      }
      if (completionElapsed <= 1.2) {
        completionElapsed += delta;
        const particleTime = Math.min(completionElapsed, 0.85);
        completionParticleVelocities.forEach((velocity, index) => {
          completionParticleDummy.position
            .copy(characterRoot.position)
            .addScaledVector(velocity, particleTime);
          completionParticleDummy.position.y +=
            0.48 - 0.7 * particleTime * particleTime;
          const particleScale = Math.max(0, 1 - particleTime / 0.9);
          completionParticleDummy.scale.setScalar(particleScale);
          completionParticleDummy.rotation.z =
            particleTime * (2.4 + index * 0.08);
          completionParticleDummy.updateMatrix();
          completionParticles.setMatrixAt(
            index,
            completionParticleDummy.matrix,
          );
        });
        completionParticles.instanceMatrix.needsUpdate = true;
        if (completionElapsed >= 0.85) worldZoomTarget = 1;
        if (completionElapsed >= 1.2) completionParticles.visible = false;
      }
      palmLeafSwayTime += delta;
      oceanTideTime += delta;
      oceanTideUniform.value = oceanTideTime;
      const shorelineBreath =
        Math.sin(oceanTideTime * 0.785) * 0.82 +
        Math.sin(oceanTideTime * 0.31 + 1.2) * 0.18;
      const shorelineScale = 1 - shorelineBreath * 0.032;
      shoreWaterOverlay.scale.set(
        shorelineScale,
        shorelineScale,
        1,
      );
      shoreWaterOverlayMaterial.opacity =
        0.9 + (shorelineBreath * 0.5 + 0.5) * 0.1;
      oceanTexture.offset.set(
        Math.sin(oceanTideTime * 0.13) * 0.011,
        Math.cos(oceanTideTime * 0.1) * 0.009,
      );
      palmLeafSwayTargets.forEach(({ mesh, phase }) => {
        if (!mesh.morphTargetInfluences) return;
        mesh.morphTargetInfluences[0] =
          Math.sin(palmLeafSwayTime * 0.9 + phase) * 0.78 +
          Math.sin(palmLeafSwayTime * 1.55 + phase * 1.7) * 0.2;
        mesh.morphTargetInfluences[1] =
          Math.sin(palmLeafSwayTime * 1.12 + phase * 1.35) * 0.68;
      });
      const isAutonomous =
        mixer !== null &&
        AUTONOMOUS_STATUSES.has(motionRef.current.status);
      const primaryPersonality = catPersonalityForStyle(
        primaryView.catStyle ?? catStyle,
      );
      advanceAvoidanceMotion(primaryAvoidance, delta);
      crowdRedirectCooldown = Math.max(0, crowdRedirectCooldown - delta);
      if (!isAutonomous && primaryCare) {
        leaveCareQueue(primaryCare.intent, primaryCareCatId);
        releaseCareFacility(primaryCare.intent, primaryCareCatId);
        primaryCare = null;
        primaryCareRetrySeconds = 0;
      }
      let isMoving = false;
      let isKneading = false;
      let isUsingExerciseWheel = false;
      let movementSpeed = TASK_MOVE_SPEED;
      let movementForwardFactor = 1;
      let isAvoidingOtherCat = false;
      let requestedWalkFadeSeconds: number | null = null;
      frameMovementStart.copy(currentPosition);

      if (
        placementModeRef.current === "laser" &&
        !laserActive &&
        isAutonomous
      ) {
        laserActive = true;
        laserElapsed = 0;
        laserCatId = interactionCatIdRef.current ?? primaryView.catId;
        laserTarget.copy(currentPosition);
        laserTarget.x = THREE.MathUtils.clamp(laserTarget.x + 0.65, -3.7, 3.7);
        laserPointerGroup.position.copy(laserTarget);
        laserPointerGroup.position.y = 0.025;
        laserPointerGroup.visible = true;
        avoidanceWaypoints.length = 0;
        setAmbientLabel("빨간 레이저 점을 발견했어요");
      }
      if (laserActive) {
        if (!isAutonomous || placementModeRef.current !== "laser") {
          resolveLaserPlay(false);
        } else {
          laserElapsed += delta;
          const pulse = Math.sin(animationTime * 8.5) * 0.5 + 0.5;
          laserCore.scale.setScalar(0.84 + pulse * 0.24);
          laserGlow.scale.setScalar(0.82 + pulse * 0.34);
          laserGlowMaterial.opacity = 0.18 + pulse * 0.24;
          if (laserElapsed >= LASER_CHASE_DURATION_SECONDS) {
            resolveLaserPlay(true);
            ambientPhase = "resting";
            ambientTimer = randomBetween(1.5, 2.4);
            playAnimation("sit-play", 0.22);
            setAmbientLabel("신나게 놀고 앉아서 쉬는 중");
          }
        }
      }
      if (toyActive) {
        if (!isAutonomous || placementModeRef.current !== "toy") {
          resolveToyHunt(false);
        } else {
          toyChaseElapsed += delta;
          const toyPulse = Math.sin(animationTime * 6.8) * 0.5 + 0.5;
          if (toyAttackElapsed <= 0) {
            toyHuntGroup.position.x =
              toyTarget.x + Math.sin(toyChaseElapsed * 3.1) * 0.16;
            toyHuntGroup.position.z =
              toyTarget.z + Math.cos(toyChaseElapsed * 2.55) * 0.11;
          } else {
            toyHuntGroup.position.x = toyTarget.x;
            toyHuntGroup.position.z = toyTarget.z;
          }
          toyHuntGroup.position.y = 0.035 + toyPulse * 0.055;
          toyHuntGroup.rotation.y = Math.sin(toyChaseElapsed * 4.2) * 0.32;
          toyHuntGroup.rotation.z = Math.sin(toyChaseElapsed * 5.4) * 0.12;
        }
      }

      const requestedSnack = snackPlacementRef.current;
      if (requestedSnack && requestedSnack.id !== activeSnackId) {
        activeSnackId = requestedSnack.id;
        activeSnackEatingTimer = 0;
        activeSnackCatId = interactionCatIdRef.current ?? primaryView.catId;
        activeSnackPhase = "approaching";
        snackTarget.set(requestedSnack.x, 0, requestedSnack.z);
        activeSnackTimer = snackApproachTimeoutSeconds(
          currentPosition.distanceTo(snackTarget),
          CARE_MOVE_SPEED,
        );
        snackGroup.position.copy(snackTarget);
        snackGroup.visible = true;
        if (primaryCare && activeSnackCatId === primaryCareCatId) {
          leaveCareQueue(primaryCare.intent, primaryCareCatId);
          releaseCareFacility(primaryCare.intent, primaryCareCatId);
          primaryCare.insideFacility = false;
          primaryCare.facilityIndex = null;
          primaryCare = null;
          primaryCareRetrySeconds = 0;
        }
        ambientPhase = "resting";
        ambientTarget.copy(currentPosition);
        avoidanceWaypoints.length = 0;
        setAmbientLabel("간식을 발견하고 걸어가는 중");
      }
      if (!isAutonomous && activeSnackPhase !== "none") {
        resolveActiveSnack(false);
      }
      if (activeSnackPhase !== "none") {
        snackGroup.position.y =
          0.012 + Math.sin(animationTime * 3.5) * 0.018;
        if (
          activeSnackPhase === "approaching" &&
          isAutonomous &&
          !isPrimaryBlocked
        ) {
          activeSnackTimer -= delta;
          if (activeSnackTimer <= 0) resolveActiveSnack(false);
        }
      }

      if (isAutonomous && !wasAutonomous) {
        // 작업 종료 직후 컴퓨터 앞에 앉아 있지 않고 곧바로 해변 휴게 공간으로 나온다.
        ambientPhase = "prewalking";
        ambientTimer = 0;
        ambientTarget.copy(currentPosition);
        playAnimation("idle-look", 0.24);
        setAmbientLabel(
          motionRef.current.status === "completed"
            ? "일을 마치고 해변으로 쉬러 나가는 중"
            : motionRef.current.status === "failed"
              ? "기분 전환을 위해 해변으로 나가는 중"
              : "해변을 산책하러 나가는 중",
        );
      } else if (!isAutonomous && wasAutonomous) {
        ambientPhase = "resting";
        ambientTimer = 4;
        ambientTarget.copy(currentPosition);
      }
      wasAutonomous = isAutonomous;

      if (primaryCareCatId !== primaryView.catId) {
        if (primaryCare) {
          leaveCareQueue(primaryCare.intent, primaryCareCatId);
        }
        primaryCare = null;
        primaryCareCatId = primaryView.catId;
        primaryCareRetrySeconds = 0;
      }
      primaryCareRetrySeconds = Math.max(
        0,
        primaryCareRetrySeconds - delta,
      );
      if (isPrimaryBlocked && primaryCare) {
        leaveCareQueue(primaryCare.intent, primaryCareCatId);
        primaryCare = null;
      }
      if (
        !primaryCare &&
        catExerciseWheelSession?.catId !== primaryView.catId &&
        activeSnackPhase === "none" &&
        !isPrimaryBlocked &&
        primaryCareRetrySeconds <= 0
      ) {
        const intent = selectCatCareIntent({
          hunger:
            !carePreviewConsumed &&
            (carePreviewMode === "food" ||
              carePreviewMode === "empty-food")
              ? 100
              : !carePreviewConsumed && carePreviewMode === "toilet"
                ? 0
              : (primaryView.hunger ?? 0),
          toilet:
            !carePreviewConsumed && carePreviewMode === "toilet"
              ? 100
              : !carePreviewConsumed &&
                  (carePreviewMode === "food" ||
                    carePreviewMode === "empty-food")
                ? 0
              : (primaryView.toilet ?? 0),
        });
        if (intent) {
          primaryCare = {
            intent,
            phase: "approaching",
            timer: 0,
            insideFacility: false,
            facilityIndex: null,
          };
          enqueueCare(intent, primaryCareCatId);
          ambientPhase = "resting";
          avoidanceWaypoints.length = 0;
          setAmbientLabel(
            intent === "food"
              ? "배가 고파 밥그릇으로 가는 중"
              : "화장실로 가는 중",
          );
        }
      }

      if (isPrimaryBlocked) {
        desiredPosition.copy(currentPosition);
        isMoving = false;
        playAnimation("sit", 0.2);
      } else if (laserActive && isAutonomous) {
        desiredPosition.copy(laserTarget);
        movementSpeed = LASER_CHASE_MOVE_SPEED;
        const distance = currentPosition.distanceTo(laserTarget);
        if (distance > CARE_ARRIVAL_DISTANCE * 1.6) {
          isMoving = true;
          requestedWalkFadeSeconds = 0.18;
          setAmbientLabel("레이저 점을 신나게 쫓는 중");
        } else {
          desiredPosition.copy(currentPosition);
          isMoving = false;
          playAnimation("sit-play", 0.18);
          setAmbientLabel("레이저 점을 앞발로 잡아보는 중");
        }
      } else if (toyActive && isAutonomous) {
        desiredPosition.copy(toyHuntGroup.position);
        desiredPosition.y = 0;
        movementSpeed = LASER_CHASE_MOVE_SPEED * 1.24;
        const distance = currentPosition.distanceTo(desiredPosition);
        if (distance > CARE_ARRIVAL_DISTANCE * 1.7) {
          isMoving = true;
          requestedWalkFadeSeconds = null;
          playAnimation("toy-run", 0.12);
          setAmbientLabel("움직이는 깃털을 보고 신나게 뛰어가는 중");
        } else {
          desiredPosition.copy(currentPosition);
          isMoving = false;
          toyAttackElapsed += delta;
          if (toyAttackElapsed < 0.35) {
            playAnimation("toy-crouch", 0.14);
            setAmbientLabel("깃털을 노리며 몸을 낮추는 중");
          } else if (toyAttackElapsed < 1.7) {
            playAnimation("toy-pounce", 0.12);
            setAmbientLabel("달리던 힘으로 깃털에 폴짝 뛰어드는 중");
          } else if (toyAttackElapsed < 2.95) {
            playAnimation("toy-grab", 0.1);
            setAmbientLabel("두 앞발로 깃털을 붙잡는 중");
          } else if (toyAttackElapsed < 3.75) {
            playAnimation("toy-attack-left", 0.1);
            setAmbientLabel("왼발로 깃털을 잡으며 노는 중");
          } else if (toyAttackElapsed < 4.55) {
            playAnimation("toy-attack-right", 0.1);
            setAmbientLabel("오른발로 깃털을 잡으며 노는 중");
          } else {
            playAnimation("sit-play", 0.18);
            setAmbientLabel("깃털 장난감이 마음에 들어 골골거리는 중");
          }
          if (toyAttackElapsed >= 5.05) {
            completionElapsed = 0;
            completionParticles.visible = true;
            playCompletionChime();
            resolveToyHunt(true);
            ambientPhase = "resting";
            ambientTimer = randomBetween(1.8, 2.8);
            playAnimation("sit-play", 0.22);
            setAmbientLabel("신나게 놀고 만족해서 골골거리는 중");
          }
        }
      } else if (activeSnackPhase !== "none" && isAutonomous) {
        movementSpeed = CARE_MOVE_SPEED;
        if (activeSnackPhase === "approaching") {
          desiredPosition.copy(snackTarget);
          const distance = currentPosition.distanceTo(snackTarget);
          if (distance > CARE_ARRIVAL_DISTANCE) {
            isMoving = true;
            requestedWalkFadeSeconds = 0.28;
            setAmbientLabel("놓아둔 간식으로 걸어가는 중");
          } else {
            currentPosition.copy(snackTarget);
            desiredPosition.copy(currentPosition);
            activeSnackPhase = "eating";
            activeSnackTimer = 0;
            activeSnackEatingTimer = SNACK_EATING_SECONDS;
            isMoving = false;
            requestedWalkFadeSeconds = null;
            avoidanceWaypoints.length = 0;
            lastNavigationTarget.copy(currentPosition);
            playAnimation("eat-drink", 0.2);
            setAmbientLabel("간식을 맛있게 먹는 중");
          }
        } else {
          desiredPosition.copy(currentPosition);
          isMoving = false;
          requestedWalkFadeSeconds = null;
          avoidanceWaypoints.length = 0;
          lastNavigationTarget.copy(currentPosition);
          activeSnackEatingTimer -= delta;
          playAnimation("eat-drink", 0.2);
          if (activeSnackEatingTimer <= 0) {
            resolveActiveSnack(true);
            ambientPhase = "resting";
            ambientTimer = randomBetween(1.2, 2);
            setAmbientLabel("간식을 먹고 골골거리는 중");
          }
        }
      } else if (primaryWheelSession && isAutonomous) {
        movementSpeed = CARE_MOVE_SPEED;
        if (primaryWheelSession.phase === "approaching") {
          desiredPosition.copy(catExerciseWheelUsePosition);
          const distance = currentPosition.distanceTo(
            catExerciseWheelUsePosition,
          );
          if (distance > CARE_ARRIVAL_DISTANCE) {
            isMoving = true;
            requestedWalkFadeSeconds = 0.28;
            setAmbientLabel("러닝휠로 신나게 걸어가는 중");
          } else {
            currentPosition.copy(catExerciseWheelUsePosition);
            desiredPosition.copy(currentPosition);
            avoidanceWaypoints.length = 0;
            primaryWheelSession.phase = "running";
            primaryWheelSession.timer = CAT_EXERCISE_WHEEL_RUN_SECONDS;
            isUsingExerciseWheel = true;
            playAnimation("toy-run", 0.18);
            setAmbientLabel("러닝휠에서 씩씩하게 달리는 중");
          }
        } else if (primaryWheelSession.phase === "running") {
          currentPosition.copy(catExerciseWheelUsePosition);
          desiredPosition.copy(currentPosition);
          avoidanceWaypoints.length = 0;
          isUsingExerciseWheel = true;
          primaryWheelSession.timer -= delta;
          playAnimation("toy-run", 0.18);
          setAmbientLabel("러닝휠에서 씩씩하게 달리는 중");
          if (primaryWheelSession.timer <= 0) {
            primaryWheelSession.phase = "exiting";
            avoidanceWaypoints.length = 0;
            lastNavigationTarget.copy(currentPosition);
            isUsingExerciseWheel = false;
            setAmbientLabel("운동을 마치고 휠에서 내려오는 중");
          }
        } else {
          desiredPosition.copy(catExerciseWheelExitPosition);
          const distance = currentPosition.distanceTo(
            catExerciseWheelExitPosition,
          );
          if (distance > CARE_ARRIVAL_DISTANCE) {
            isMoving = true;
            requestedWalkFadeSeconds = 0.28;
            setAmbientLabel("러닝휠에서 천천히 나오는 중");
          } else {
            currentPosition.copy(catExerciseWheelExitPosition);
            desiredPosition.copy(currentPosition);
            avoidanceWaypoints.length = 0;
            lastNavigationTarget.copy(currentPosition);
            ambientPhase = "prewalking";
            ambientTimer = 0.7;
            ambientTarget.copy(currentPosition);
            completeCatExerciseWheelSession();
            playAnimation("idle-look", 0.24);
            setAmbientLabel("운동을 마치고 해변에서 숨을 고르는 중");
          }
        }
      } else if (primaryCare) {
        movementSpeed = carePreviewMode
          ? CARE_MOVE_SPEED * 4
          : CARE_MOVE_SPEED;
        const care = primaryCare;
        const primaryCareSeatId =
          primaryView.seatId === "queue" ? "seat-1" : primaryView.seatId;

        const litterUnavailable =
          care.intent === "toilet" &&
          litterIsFull() &&
          (care.phase === "approaching" || care.phase === "waiting");
        if (litterUnavailable) {
          const target = careWaitPosition("toilet", primaryCareCatId);
          desiredPosition.copy(target);
          const distance = currentPosition.distanceTo(target);
          if (distance > CARE_ARRIVAL_DISTANCE) {
            isMoving = true;
            requestedWalkFadeSeconds = 0.3;
            setAmbientLabel("가득 찬 화장실 앞까지 가는 중");
          } else {
            currentPosition.copy(target);
            desiredPosition.copy(currentPosition);
            carePreviewConsumed = true;
            leaveCareQueue("toilet", primaryCareCatId);
            care.insideFacility = false;
            onCatCareEventRef.current?.({
              catId: primaryCareCatId,
              seatId: primaryCareSeatId,
              outcome: "toilet-blocked",
            });
            primaryCareRetrySeconds = LITTER_FULL_RETRY_SECONDS;
            care.phase = "recovering";
            care.timer = CARE_RECOVERY_SECONDS * 1.8;
            playAnimation("sit", 0.24);
            setAmbientLabel("화장실이 가득 차서 야옹하는 중");
          }
        } else if (care.phase === "using") {
          desiredPosition.copy(currentPosition);
          care.timer -= delta;
          if (care.intent === "food") {
            const bowlCenter = foodBowlCenterPosition(care.facilityIndex);
            const targetYaw = Math.atan2(
              bowlCenter.x - currentPosition.x,
              bowlCenter.z - currentPosition.z,
            );
            characterYaw = lerpAngle(
              characterYaw,
              targetYaw,
              1 - Math.exp(-delta * CARE_EATING_TURN_SPEED),
            );
            characterVisual.rotation.y = characterYaw;
            playAnimation("eat-drink", 0.24);
            setAmbientLabel("밥을 먹는 중");
          } else {
            playAnimation("sit", 0.24);
            setAmbientLabel("화장실을 사용하는 중");
          }
          if (care.timer <= 0) {
            releaseCareFacility(care.intent, primaryCareCatId);
            if (care.intent === "food") {
              carePreviewConsumed = true;
              foodAvailableRef.current = false;
              syncFoodBowlVisuals();
              onCatCareEventRef.current?.({
                catId: primaryCareCatId,
                seatId: primaryCareSeatId,
                outcome: "meal-completed",
              });
              setAmbientLabel("배부르게 먹고 쉬는 중");
            } else {
              carePreviewConsumed = true;
              litterLevelRef.current = addLitterWaste(
                litterLevelRef.current,
                undefined,
                litterMaxLevelRef.current,
              );
              syncLitterLevelGauges();
              onCatCareEventRef.current?.({
                catId: primaryCareCatId,
                seatId: primaryCareSeatId,
                outcome: "toilet-completed",
              });
              setAmbientLabel("화장실을 다녀와 쉬는 중");
            }
            care.phase = "recovering";
            care.timer = CARE_RECOVERY_SECONDS;
          }
        } else if (care.phase === "recovering") {
          desiredPosition.copy(currentPosition);
          care.timer -= delta;
          playAnimation("idle-look", 0.3);
          if (care.timer <= 0) {
            primaryCare = null;
            ambientPhase = "prewalking";
            ambientTimer = randomBetween(0.65, 1);
            ambientTarget.copy(currentPosition);
            setAmbientLabel("다시 해변을 돌아다닐 준비를 하는 중");
          }
        } else {
          const claimableIndex = claimableCareFacilityIndex(
            care.intent,
            primaryCareCatId,
          );
          const mayClaim = claimableIndex >= 0;
          const target = mayClaim
            ? careApproachPosition(care.intent, claimableIndex)
            : careWaitPosition(care.intent, primaryCareCatId);
          care.phase = mayClaim ? "approaching" : "waiting";
          desiredPosition.copy(target);
          const distance = currentPosition.distanceTo(target);
          if (distance > CARE_ARRIVAL_DISTANCE) {
            isMoving = true;
            requestedWalkFadeSeconds = 0.3;
            setAmbientLabel(
              mayClaim
                ? care.intent === "food"
                  ? "밥그릇으로 가는 중"
                  : "화장실로 가는 중"
                : care.intent === "food"
                  ? "다른 고양이가 식사를 마칠 때까지 기다리는 중"
                  : "다른 고양이가 나오기를 기다리는 중",
            );
          } else {
            currentPosition.copy(target);
            desiredPosition.copy(currentPosition);
            if (!mayClaim) {
              playAnimation("sit", 0.3);
              setAmbientLabel(
                care.intent === "food"
                  ? "밥그릇 앞에서 차례를 기다리는 중"
                  : "화장실 앞에서 차례를 기다리는 중",
              );
            } else if (
              care.intent === "food" &&
              !hasFoodAvailable()
            ) {
              carePreviewConsumed = true;
              leaveCareQueue(care.intent, primaryCareCatId);
              onCatCareEventRef.current?.({
                catId: primaryCareCatId,
                seatId: primaryCareSeatId,
                outcome: "meal-missed",
              });
              primaryCareRetrySeconds = EMPTY_BOWL_RETRY_SECONDS;
              care.phase = "recovering";
              care.timer = CARE_RECOVERY_SECONDS * 1.8;
              playAnimation("sit", 0.24);
              setAmbientLabel("빈 밥그릇을 보고 야옹하는 중");
            } else {
              const claimedIndex = claimCareFacility(
                care.intent,
                primaryCareCatId,
              );
              if (claimedIndex !== null) {
                care.phase = "using";
                care.insideFacility = true;
                care.facilityIndex = claimedIndex;
                if (care.intent === "food") {
                  const bowlCenter = foodBowlCenterPosition(claimedIndex);
                  characterYaw = Math.atan2(
                    bowlCenter.x - currentPosition.x,
                    bowlCenter.z - currentPosition.z,
                  );
                  characterVisual.rotation.y = characterYaw;
                }
                care.timer =
                  carePreviewMode === care.intent &&
                  interactionDebugMode
                    ? 300
                    : care.intent === "food"
                    ? FOOD_USE_SECONDS
                    : TOILET_USE_SECONDS;
                playAnimation(
                  care.intent === "food" ? "eat-drink" : "sit",
                  0.24,
                );
              }
            }
          }
        }
      } else if (isAutonomous) {
        movementSpeed =
          AMBIENT_MOVE_SPEED * primaryPersonality.moveSpeedMultiplier;

        if (ambientPhase === "resting") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            ambientPhase = "prewalking";
            ambientTimer =
              randomBetween(0.8, 1.25) *
              primaryPersonality.preparationMultiplier;
            playAnimation("idle-look", 0.5);
            setAmbientLabel("몸을 일으키고 산책을 준비하는 중");
          }
        } else if (ambientPhase === "prewalking") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            let nextPointIndex = ambientPointIndex;
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const candidateIndex = Math.floor(
                Math.random() * AMBIENT_WANDER_POINTS.length,
              );
              const candidate = AMBIENT_WANDER_POINTS[candidateIndex];
              if (
                candidateIndex !== ambientPointIndex &&
                currentPosition.distanceTo(candidate) > 1.1 &&
                isWanderDestinationAvailable(candidate, primaryView.catId)
              ) {
                nextPointIndex = candidateIndex;
                break;
              }
            }

            if (nextPointIndex < 0) nextPointIndex = 0;
            ambientPointIndex = nextPointIndex;
            ambientTarget.copy(AMBIENT_WANDER_POINTS[ambientPointIndex]);
            setAmbientLabel("해변을 천천히 산책하는 중");

            ambientPhase = "walking";
            desiredPosition.copy(ambientTarget);
            isMoving = true;
            requestedWalkFadeSeconds = 0.32;
          }
        } else if (ambientPhase === "settling") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            primaryAmbientAnimationKey = pickPersonalityAmbientKey(
              primaryPersonality,
            );
            const nextAmbient =
              AMBIENT_ANIMATIONS.find(
                (animation) => animation.key === primaryAmbientAnimationKey,
              ) ?? AMBIENT_ANIMATIONS[0];
            ambientTimer =
              randomBetween(
                nextAmbient.minSeconds,
                nextAmbient.maxSeconds,
              ) * primaryPersonality.restDurationMultiplier;
            ambientPhase = "resting";
            playAnimation(nextAmbient.key, 0.5);
            setAmbientLabel(nextAmbient.label);
          }
        } else {
          desiredPosition.copy(ambientTarget);
          let ambientDistance =
            currentPosition.distanceTo(desiredPosition);
          const crowdRedirect =
            crowdRedirectCooldown <= 0 &&
            primaryAvoidance.holdSeconds <= 0
              ? chooseCrowdRedirect(
                  currentPosition,
                  primaryView.catId,
                  ambientPointIndex,
                )
              : null;
          if (crowdRedirect) {
            ambientPointIndex = crowdRedirect.pointIndex;
            ambientTarget.copy(crowdRedirect.target);
            desiredPosition.copy(ambientTarget);
            ambientDistance = currentPosition.distanceTo(desiredPosition);
            avoidanceWaypoints.length = 0;
            lastNavigationTarget.copy(currentPosition);
            crowdRedirectCooldown = CAT_CROWD_REDIRECT_COOLDOWN;
            setAmbientLabel("다른 고양이를 피해 새 길로 산책하는 중");
          }

          if (
            !isWanderDestinationAvailable(
              ambientTarget,
              primaryView.catId,
            )
          ) {
            avoidanceWaypoints.length = 0;
            lastNavigationTarget.copy(currentPosition);
            ambientPhase = "prewalking";
            ambientTimer = randomBetween(0.18, 0.42);
            desiredPosition.copy(currentPosition);
            isMoving = false;
            playAnimation("idle-look", 0.22);
          } else if (ambientDistance <= AMBIENT_ARRIVAL_DISTANCE) {
            currentPosition.copy(ambientTarget);
            desiredPosition.copy(currentPosition);
            ambientPhase = "settling";
            ambientTimer = randomBetween(1.1, 1.8);
            playAnimation("idle-look", 0.36);
            setAmbientLabel("걸음을 멈추고 주변을 살피는 중");
          } else {
            isMoving = true;
            requestedWalkFadeSeconds = 0.32;
          }
        }
      } else {
        desiredPosition.copy(
          isPrimaryWorking
            ? codingDeskTarget
            : worldTargets[motionRef.current.location],
        );
        const taskDistance = currentPosition.distanceTo(desiredPosition);
        isMoving = taskDistance > TASK_ARRIVAL_DISTANCE;
        if (isMoving) {
          requestedWalkFadeSeconds = 0.28;
        } else {
          currentPosition.copy(desiredPosition);
          if (isPrimaryWorking) {
            isKneading = true;
            playAnimation(DESK_KNEADING_ANIMATION_KEY, 0.24);
          } else {
            playAnimation("idle-look", 0.34);
          }
        }
      }

      if (
        !isKneading &&
        wasKneadingLastFrame &&
        isInsideObstacle(currentPosition, deskObstacle)
      ) {
        currentPosition.copy(deskKneadingExitPosition);
        avoidanceWaypoints.length = 0;
        lastNavigationTarget.copy(currentPosition);
      }
      const wantsDeskInteraction = !isAutonomous && isPrimaryWorking;
      const wantsLitterInteraction = primaryCare?.intent === "toilet";
      const wantsExerciseWheelInteraction =
        primaryWheelSession !== null && isAutonomous;
      const activeSceneObstacles = getRuntimeSceneObstacles(
        activeSeatCountRef.current,
      );
      const ignoredInteractionObstacles = new Set<SceneObstacle>();
      if (wantsDeskInteraction) ignoredInteractionObstacles.add(deskObstacle);
      if (wantsLitterInteraction) {
        litterBoxInstances.forEach((instance) => {
          ignoredInteractionObstacles.add(instance.obstacle);
        });
      }
      if (wantsExerciseWheelInteraction) {
        ignoredInteractionObstacles.add(
          runtimeObstacleFor(CAT_EXERCISE_WHEEL_OBSTACLE),
        );
      }
      const navigationObstacles =
        ignoredInteractionObstacles.size > 0
          ? activeSceneObstacles.filter(
              (obstacle) => !ignoredInteractionObstacles.has(obstacle),
            )
          : activeSceneObstacles;
      const collisionResolvedFrom = currentPosition.clone();
      resolvePositionOutsideObstacles(currentPosition, navigationObstacles);
      if (currentPosition.distanceToSquared(collisionResolvedFrom) > 1e-8) {
        avoidanceWaypoints.length = 0;
        lastNavigationTarget.copy(currentPosition);
      }

      const walkAction = animationActions.get("walk");

      movementGoal.copy(desiredPosition);
      if (isMoving) {
        if (lastNavigationTarget.distanceToSquared(desiredPosition) > 0.01) {
          lastNavigationTarget.copy(desiredPosition);
          avoidanceWaypoints.length = 0;
        }
        while (
          avoidanceWaypoints.length > 0 &&
          currentPosition.distanceTo(avoidanceWaypoints[0]) <=
            OBSTACLE_WAYPOINT_REACHED_DISTANCE
        ) {
          avoidanceWaypoints.shift();
        }
        if (avoidanceWaypoints.length === 0) {
          avoidanceWaypoints.push(
            ...findAvoidancePath(
              currentPosition,
              desiredPosition,
              navigationObstacles,
            ),
          );
        }
        if (avoidanceWaypoints[0]) {
          movementGoal.copy(avoidanceWaypoints[0]);
        }
      } else {
        avoidanceWaypoints.length = 0;
        lastNavigationTarget.copy(desiredPosition);
      }

      movementDirection.subVectors(movementGoal, currentPosition);
      if (isMoving && movementDirection.lengthSq() > 1e-6) {
        const steering = resolveNeighborSteering({
          motion: primaryAvoidance,
          selfId: primaryView.catId,
          start: currentPosition,
          destination: movementGoal,
          neighbors: catNeighborPositions(primaryView.catId),
          delta,
        });
        movementDirection.copy(steering.direction);
        isAvoidingOtherCat = steering.avoiding;
        if (steering.paused) {
          movementForwardFactor = 0;
          setAmbientLabel("다른 고양이에게 길을 양보하며 잠시 쉬는 중");
        }
      }
      if (isUsingExerciseWheel && characterModel) {
        characterYaw = lerpAngle(
          characterYaw,
          catExerciseWheelRunYaw,
          1 - Math.exp(-delta * 9),
        );
        characterVisual.rotation.y = characterYaw;
      } else if (isKneading && characterModel) {
        movementDirection.subVectors(
          deskKneadingLookTarget,
          currentPosition,
        );
        const targetYaw = Math.atan2(
          movementDirection.x,
          movementDirection.z,
        );
        characterYaw = lerpAngle(
          characterYaw,
          targetYaw,
          1 - Math.exp(-delta * 7),
        );
        characterVisual.rotation.y = characterYaw;
      } else if (
        isMoving &&
        !primaryAvoidance.paused &&
        characterModel &&
        movementDirection.lengthSq() > 0.001
      ) {
        const targetYaw = Math.atan2(
          movementDirection.x,
          movementDirection.z,
        );
        const turnDelta = Math.abs(
          Math.atan2(
            Math.sin(targetYaw - characterYaw),
            Math.cos(targetYaw - characterYaw),
          ),
        );
        movementForwardFactor = THREE.MathUtils.clamp(
          1 - turnDelta / (Math.PI * 0.58),
          primaryAvoidance.paused ? 0 : 0.24,
          1,
        );
        characterYaw = lerpAngle(
          characterYaw,
          targetYaw,
          1 - Math.exp(-delta * (isAvoidingOtherCat ? 4.2 : 7)),
        );
        characterVisual.rotation.y = characterYaw;
      }
      if (walkAction && isMoving) {
        const baseTimeScale = isAutonomous ? 0.62 : 0.92;
        walkAction.timeScale =
          baseTimeScale * (0.58 + movementForwardFactor * 0.42);
      }

      mixer?.update(delta);
      kneadingBlend = THREE.MathUtils.damp(
        kneadingBlend,
        isKneading ? 1 : 0,
        12,
        delta,
      );
      if (isKneading) {
        kneadingElapsed += delta;
      } else if (kneadingBlend < 0.001) {
        kneadingElapsed = 0;
      }
      workstationInteractions.forEach((interaction, seatId) => {
        const secondaryEntry = secondaryAgents.get(seatId);
        const workstationIsCoding =
          !suppressMonitorInteraction &&
          (monitorCalibrationEnabled ||
            (seatId === "seat-1"
            ? isKneading || forceMonitorDiagnosticScreen
            : forceMonitorDiagnosticScreen ||
              (secondaryEntry?.currentKey === "work" &&
                seatsRef.current.some(
                  (seat) =>
                    seat.seatId === seatId && seat.status === "working",
                ))));
        interaction.blend = THREE.MathUtils.damp(
          interaction.blend,
          workstationIsCoding ? 1 : 0,
          12,
          delta,
        );
        if (workstationIsCoding) {
          interaction.elapsed += delta;
        } else if (interaction.blend < 0.001) {
          interaction.elapsed = 0;
        }

        const showWorkstationInteraction = interaction.blend > 0.01;
        interaction.monitorScreen.visible = showWorkstationInteraction;
        interaction.animatedDeskKeycaps.forEach((parts, index) => {
          parts.forEach(({ object }) => {
            object.visible = showWorkstationInteraction;
          });
          const phaseOffset =
            index < 2 ? index * 0.16 : Math.PI + (index - 2) * 0.16;
          const pressWave = Math.max(
            0,
            Math.sin(
              interaction.elapsed * Math.PI * 2 * DESK_KEYCAP_PRESS_HZ +
                phaseOffset,
            ),
          );
          const pressDepth =
            Math.pow(pressWave, 2.4) *
            DESK_KEYCAP_PRESS_DEPTH *
            interaction.blend;
          parts.forEach(({ object, restingY }) => {
            object.position.y = restingY - pressDepth;
          });
        });

        const nextMonitorScreenFrame = workstationIsCoding
          ? Math.floor(interaction.elapsed * MONITOR_CODE_FRAME_RATE)
          : -1;
        if (nextMonitorScreenFrame !== interaction.screenFrame) {
          interaction.screenFrame = nextMonitorScreenFrame;
          drawMonitorScreen(
            interaction.monitorScreenTexture,
            workstationIsCoding,
            interaction.elapsed,
          );
        }
      });

      if (isMoving) {
        const remainingDistance =
          currentPosition.distanceTo(movementGoal);
        const stepDistance =
          movementSpeed * movementForwardFactor * delta;
        if (remainingDistance <= stepDistance && !isAvoidingOtherCat) {
          nextPosition.copy(movementGoal);
        } else {
          nextPosition
            .copy(currentPosition)
            .addScaledVector(
              movementDirection,
              Math.min(stepDistance, remainingDistance),
            );
        }
        const touchesDesk =
          wantsDeskInteraction &&
          isTouchingObstacle(
            nextPosition,
            deskObstacle,
            DESK_CONTACT_MARGIN,
          );
        if (touchesDesk) {
          currentPosition.copy(codingDeskTarget);
          desiredPosition.copy(currentPosition);
          movementGoal.copy(currentPosition);
          avoidanceWaypoints.length = 0;
          isMoving = false;
          isKneading = true;
          kneadingElapsed = 0;
          playAnimation(DESK_KNEADING_ANIMATION_KEY, 0.24);
        } else {
          const wouldCollide = navigationObstacles.some((obstacle) =>
            isInsideObstacle(nextPosition, obstacle),
          );
          if (!wouldCollide) {
            currentPosition.copy(nextPosition);
          } else {
            avoidanceWaypoints.length = 0;
            avoidanceWaypoints.push(
              ...findAvoidancePath(
                currentPosition,
                desiredPosition,
                navigationObstacles,
                OBSTACLE_WAYPOINT_MARGIN * 1.35,
              ),
            );
            if (avoidanceWaypoints[0]) {
              movementGoal.copy(avoidanceWaypoints[0]);
            }
          }
        }
      }
      if (
        isKneading &&
        !isInsideObstacle(currentPosition, deskObstacle)
      ) {
        currentPosition.copy(codingDeskTarget);
        avoidanceWaypoints.length = 0;
      }
      if (requestedWalkFadeSeconds !== null && !isKneading) {
        if (primaryAvoidance.paused) {
          isMoving = false;
          playAnimation(primaryAvoidance.pauseAnimationKey, 0.3);
        } else if (
          currentPosition.distanceToSquared(frameMovementStart) > 1e-8
        ) {
          playAnimation("walk", requestedWalkFadeSeconds);
        } else {
          isMoving = false;
          playAnimation("idle-look", 0.2);
        }
      }
      const primaryInsideLitterBox =
        primaryCare?.intent === "toilet" &&
        primaryCare.insideFacility &&
        (primaryCare.phase === "using" ||
          primaryCare.phase === "recovering");
      characterVisual.visible = !primaryInsideLitterBox;
      blobShadow.visible = !primaryInsideLitterBox;
      primaryClickProxy.visible = !primaryInsideLitterBox;
      wasKneadingLastFrame = isKneading;
      enforceCatSeparation(delta);
      characterRoot.position.x = currentPosition.x;
      characterRoot.position.z = currentPosition.z;
      characterRoot.position.y = THREE.MathUtils.damp(
        characterRoot.position.y,
        isUsingExerciseWheel ? CAT_EXERCISE_WHEEL_CAT_LIFT : 0,
        10,
        delta,
      );
      if (carePreviewMode) {
        host.dataset.carePreviewState = JSON.stringify({
          phase: primaryCare?.phase ?? "complete",
          intent: primaryCare?.intent ?? null,
          timer: Number((primaryCare?.timer ?? 0).toFixed(2)),
          litterLevel: litterLevelRef.current,
          insideFacility: primaryCare?.insideFacility ?? false,
          x: Number(currentPosition.x.toFixed(3)),
          z: Number(currentPosition.z.toFixed(3)),
        });
      }
      if (interactionDebugMode) {
        host.dataset.interactionDebugState = JSON.stringify({
          feedingAlignmentVersion: 2,
          snackPhase: activeSnackPhase,
          animation: currentAnimationKey,
          characterVisible: characterVisual.visible,
          careIntent: primaryCare?.intent ?? null,
          carePhase: primaryCare?.phase ?? null,
          careTimer: Number((primaryCare?.timer ?? 0).toFixed(2)),
          carePreviewMode,
          interactionDebugMode,
          insideFacility: primaryCare?.insideFacility ?? false,
          exerciseWheelOwned: exerciseWheelOwnedRef.current,
          exerciseWheelSession: catExerciseWheelSession
            ? {
                catId: catExerciseWheelSession.catId,
                seatId: catExerciseWheelSession.seatId,
                secondary: catExerciseWheelSession.secondaryKey !== null,
                phase: catExerciseWheelSession.phase,
                timer: Number(catExerciseWheelSession.timer.toFixed(2)),
              }
            : null,
          exerciseWheelCooldown: Number(
            catExerciseWheelCooldown.toFixed(2),
          ),
          primaryPosition: {
            x: Number(currentPosition.x.toFixed(3)),
            y: Number(characterRoot.position.y.toFixed(3)),
            z: Number(currentPosition.z.toFixed(3)),
          },
          primaryYaw: Number(characterYaw.toFixed(3)),
          foodBowlPositions: foodBowlInstances.map((instance) => ({
            x: Number(instance.group.position.x.toFixed(3)),
            z: Number(instance.group.position.z.toFixed(3)),
          })),
          secondaryAgents: Array.from(secondaryAgents.values()).map(
            (entry) => ({
              catId: entry.catId,
              seatId: entry.seatId,
              animation: entry.currentKey,
              ambientPhase: entry.ambientPhase,
              yaw: Number(entry.yaw.toFixed(3)),
              x: Number(entry.root.position.x.toFixed(3)),
              y: Number(entry.root.position.y.toFixed(3)),
              z: Number(entry.root.position.z.toFixed(3)),
            }),
          ),
        });
      }
      // 실제 키캡 애니메이션이 재생되는 동안만 이름표를 모니터 위에 고정한다.
      // 컴퓨터 타건은 실제 명령을 수행하는 작업 상태에서만 켠다.
      primaryMarker.marker.position.lerp(
        typingMonitorAnchorFor(
          characterRoot,
          isKneading,
          primaryMarkerAnchorTarget,
          lowMonitorWorkingMarkerWorldPosition,
        ),
        1 - Math.exp(-delta * MARKER_MOVE_EASE),
      );
      characterVisual.position.y = 0;
      characterVisual.rotation.z = 0;
      blobShadow.scale.setScalar(1);

      const cameraEase = 1 - Math.exp(-delta * 8);
      worldYawCurrent = THREE.MathUtils.lerp(
        worldYawCurrent,
        worldYawTarget,
        cameraEase,
      );
      worldPitchCurrent = THREE.MathUtils.lerp(
        worldPitchCurrent,
        worldPitchTarget,
        cameraEase,
      );
      worldZoomCurrent = THREE.MathUtils.lerp(
        worldZoomCurrent,
        worldZoomTarget,
        cameraEase,
      );
      cameraOrbitSpherical.theta =
        cameraBaseSpherical.theta + worldYawCurrent;
      cameraOrbitSpherical.phi =
        cameraBaseSpherical.phi + worldPitchCurrent;
      cameraOrbitOffset.setFromSpherical(cameraOrbitSpherical);
      camera.position.copy(cameraLookAt).add(cameraOrbitOffset);
      camera.zoom = worldZoomCurrent;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraLookAt);
      const worldViewIsMoving =
        activePointers.size > 0 ||
        Math.abs(worldYawTarget - worldYawCurrent) > 0.0005 ||
        Math.abs(worldPitchTarget - worldPitchCurrent) > 0.0005 ||
        Math.abs(worldZoomTarget - worldZoomCurrent) > 0.0005;
      outlineGapVisibility = THREE.MathUtils.damp(
        outlineGapVisibility,
        worldViewIsMoving ? 0 : 1,
        worldViewIsMoving ? 24 : 4,
        delta,
      );
      outlineEffect.setGapStrength(outlineGapVisibility);
      // React prop/ref 갱신과 WebGL 렌더 루프의 타이밍이 어긋나도 태그가
      // 남지 않도록 실제 HUD의 휴면 클래스를 단일 기준으로 사용한다.
      const worldHudTagsVisible = !host.closest(".hud-dormant");
      primaryMarker.marker.visible = worldHudTagsVisible;
      secondaryAgents.forEach((entry) => {
        entry.marker.marker.visible = worldHudTagsVisible;
      });
      litterBoxInstances.forEach((instance) => {
        instance.gauge.label.visible = worldHudTagsVisible;
      });
      billboardObjects.forEach((object) => {
        object.quaternion.copy(camera.quaternion);
      });
      const beaconPulse = 1 + Math.sin(animationTime * 5.5) * 0.08;
      primaryMarker.beacon.scale.setScalar(beaconPulse);
      secondaryAgents.forEach((entry) => {
        entry.marker.beacon.scale.setScalar(beaconPulse);
      });
      camera.layers.set(WORLD_LAYER);
      outlineEffect.render(scene, camera);
      // 마커 오버레이 패스 — 외곽선까지 끝난 화면 위에 깊이를 비우고 이름표·비콘만 그린다.
      // 배경을 null 로 두지 않으면 두 번째 render 가 화면 전체를 다시 지운다.
      const previousBackground = scene.background;
      const previousAutoClear = renderer.autoClear;
      camera.layers.set(MARKER_OVERLAY_LAYER);
      scene.background = null;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      scene.background = previousBackground;
      renderer.autoClear = previousAutoClear;
      camera.layers.set(WORLD_LAYER);

      // 손가락 가이드가 따라올 지점. 고양이도 조개도 계속 움직이므로 매 프레임 다시 투영한다.
      const anchorTarget = tutorialAnchorRef.current;
      if (anchorTarget && onTutorialAnchorRef.current && worldReadyRef.current) {
        let anchorSource: THREE.Object3D | null = null;
        if (anchorTarget === "shell") {
          anchorSource = collectibleShells.values().next().value?.group ?? null;
        } else {
          // 1번 자리 고양이는 secondaryAgents 가 아니라 characterRoot 다.
          // 자리가 하나뿐인 첫 방문자는 이 맵이 비어 있어서 여기가 유일한 대상이다.
          anchorSource = characterRoot;
          const wanted = interactionCatIdRef.current;
          if (wanted) {
            for (const entry of secondaryAgents.values()) {
              if (entry.catId === wanted) {
                anchorSource = entry.root;
                break;
              }
            }
          }
        }
        if (anchorSource) {
          tutorialAnchorWorld.setFromMatrixPosition(anchorSource.matrixWorld);
          tutorialAnchorWorld.y += anchorTarget === "shell" ? 0.34 : 0.62;
          tutorialAnchorWorld.project(camera);
          const x = (tutorialAnchorWorld.x + 1) / 2;
          const y = (1 - tutorialAnchorWorld.y) / 2;
          onTutorialAnchorRef.current({
            target: anchorTarget,
            x,
            y,
            // z>1 은 카메라 뒤. 화면 밖이면 손가락을 숨겨 엉뚱한 데를 짚지 않게 한다.
            visible:
              tutorialAnchorWorld.z < 1 &&
              x > 0.02 &&
              x < 0.98 &&
              y > 0.02 &&
              y < 0.98,
          });
        } else {
          onTutorialAnchorRef.current({
            target: anchorTarget,
            x: 0.5,
            y: 0.5,
            visible: false,
          });
        }
      }
    });

    return () => {
      disposed = true;
      layoutEditorRuntimeRef.current = null;
      monitorCalibrationRuntimeRef.current = null;
      worldStage?.classList.remove("monitor-ablation-no-vignette");
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      renderer.domElement.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener(
        "pointercancel",
        handlePointerUp,
      );
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleMonitorCalibrationKeyDown);
      mixer?.stopAllAction();

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) {
          return;
        }
        if (object instanceof THREE.Mesh) object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach(disposeMaterial);
      });
      renderer.dispose();
      outlineEffect.dispose();
      renderer.domElement.remove();
    };
    // catStyle·catShape 는 마운트 시점 값만 쓴다 — 바뀌면 상위에서 key 로 씬을 새로 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectWorldTimeTestMode = (mode: WorldTimeTestMode) => {
    forcedWorldDayNightPhaseRef.current = worldDayNightDebugPhase(
      mode === "auto" ? null : mode,
    );
    setWorldTimeTestMode(mode);

    const url = new URL(window.location.href);
    if (mode === "auto") {
      url.searchParams.delete("worldTime");
    } else {
      url.searchParams.set("worldTime", mode);
    }
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <>
      <div
        ref={hostRef}
        className={`world-3d-host ${
          placementMode ? "is-placement-mode" : ""
        }`}
        aria-label={`${primarySeat.agentName} 외 ${Math.max(
          0,
          seats.length - 1,
        )}마리 고양이가 있는 2.5D 해변 사무실`}
      />

      {layoutAdminEnabled && ready && !failed && (
        <div
          className="world-time-test-toolbar"
          role="group"
          aria-label="임시 밤낮 시간 테스트"
        >
          {WORLD_TIME_TEST_OPTIONS.map(({ mode, label }) => (
            <button
              type="button"
              key={mode}
              className={worldTimeTestMode === mode ? "is-active" : ""}
              aria-pressed={worldTimeTestMode === mode}
              onClick={() => selectWorldTimeTestMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {layoutAdminEnabled && ready && !failed && (
        <button
          type="button"
          className={`world-layout-edit-toggle world-monitor-calibration-toggle ${
            monitorCalibrationMode ? "is-active" : ""
          }`}
          aria-pressed={monitorCalibrationMode}
          aria-label={
            monitorCalibrationMode
              ? "모니터 화면 맞춤 완료"
              : "모니터 화면 맞춤 시작"
          }
          onClick={() => {
            if (layoutEditMode) {
              layoutEditorRuntimeRef.current?.setEnabled(false);
            }
            monitorCalibrationRuntimeRef.current?.setEnabled(
              !monitorCalibrationMode,
            );
          }}
        >
          <span aria-hidden="true">{monitorCalibrationMode ? "✓" : "▣"}</span>
          {monitorCalibrationMode ? "완료" : "화면"}
        </button>
      )}

      {layoutAdminEnabled && ready && !failed && (
        <button
          type="button"
          className={`world-layout-edit-toggle ${
            layoutEditMode ? "is-active" : ""
          }`}
          aria-pressed={layoutEditMode}
          aria-label={
            layoutEditMode ? "객체 배치 편집 완료" : "객체 배치 편집 시작"
          }
          onClick={() => {
            if (monitorCalibrationMode) {
              monitorCalibrationRuntimeRef.current?.setEnabled(false);
            }
            layoutEditorRuntimeRef.current?.setEnabled(!layoutEditMode);
          }}
        >
          <span aria-hidden="true">{layoutEditMode ? "✓" : "✥"}</span>
          {layoutEditMode ? "완료" : "배치"}
        </button>
      )}

      {monitorCalibrationMode && (
        <div
          className={`world-layout-edit-toolbar world-monitor-calibration-toolbar is-${selectedMonitorScreenSeatId}`}
          role="group"
          aria-label="자리별 모니터 화면 맞춤 도구"
        >
          <div className="world-layout-edit-selection">
            <span>모니터 화면 맞춤</span>
            <strong>{selectedMonitorScreenSeatId.slice(-1)}번 자리 코딩 화면</strong>
            {monitorScreenCalibrationMetrics && (
              <em className="world-monitor-calibration-metrics">
                X {monitorScreenCalibrationMetrics.x.toFixed(3)} · Y{" "}
                {monitorScreenCalibrationMetrics.y.toFixed(3)} · W{" "}
                {monitorScreenCalibrationMetrics.width.toFixed(3)} · H{" "}
                {monitorScreenCalibrationMetrics.height.toFixed(3)}
              </em>
            )}
          </div>

          <div className="world-monitor-seat-tabs" role="tablist">
            {(["seat-1", "seat-2", "seat-3", "seat-4"] as SeatId[]).map(
              (seatId) => (
                <button
                  type="button"
                  role="tab"
                  key={seatId}
                  aria-selected={selectedMonitorScreenSeatId === seatId}
                  className={
                    selectedMonitorScreenSeatId === seatId ? "is-active" : ""
                  }
                  onClick={() =>
                    monitorCalibrationRuntimeRef.current?.selectSeat(seatId)
                  }
                >
                  {seatId.slice(-1)}번
                </button>
              ),
            )}
          </div>

          <div className="world-monitor-calibration-controls">
            <div className="world-monitor-nudge-controls" aria-label="화면 위치">
              <button
                type="button"
                aria-label="모니터 화면 왼쪽 이동"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.nudgeSelected(-0.005, 0)
                }
              >
                ←
              </button>
              <button
                type="button"
                aria-label="모니터 화면 위 이동"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.nudgeSelected(0, 0.005)
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="모니터 화면 아래 이동"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.nudgeSelected(0, -0.005)
                }
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="모니터 화면 오른쪽 이동"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.nudgeSelected(0.005, 0)
                }
              >
                →
              </button>
            </div>

            <div className="world-monitor-size-controls" aria-label="화면 크기">
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.resizeSelected(-0.005, 0)
                }
              >
                가로−
              </button>
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.resizeSelected(0.005, 0)
                }
              >
                가로＋
              </button>
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.resizeSelected(0, -0.005)
                }
              >
                세로−
              </button>
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.resizeSelected(0, 0.005)
                }
              >
                세로＋
              </button>
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.scaleSelected(-0.01)
                }
              >
                전체−
              </button>
              <button
                type="button"
                onClick={() =>
                  monitorCalibrationRuntimeRef.current?.scaleSelected(0.01)
                }
              >
                전체＋
              </button>
            </div>
          </div>

          <div className="world-monitor-secondary-controls">
            <button
              type="button"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.tiltSelected(
                  THREE.MathUtils.degToRad(-0.5),
                )
              }
            >
              기울기−
            </button>
            <button
              type="button"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.tiltSelected(
                  THREE.MathUtils.degToRad(0.5),
                )
              }
            >
              기울기＋
            </button>
            <button
              type="button"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.nudgeDepthSelected(-0.005)
              }
            >
              화면 뒤로
            </button>
            <button
              type="button"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.nudgeDepthSelected(0.005)
              }
            >
              화면 앞으로
            </button>
          </div>

          <div className="world-monitor-calibration-footer">
            <button
              type="button"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.resetSelected()
              }
            >
              선택 초기화
            </button>
            <button
              type="button"
              className="is-save"
              onClick={() =>
                monitorCalibrationRuntimeRef.current?.saveLayout()
              }
            >
              화면 배치 저장
            </button>
          </div>

          <div className="world-monitor-keyboard-hint">
            <span><kbd>← ↑ ↓ →</kbd> 위치</span>
            <span><kbd>A / D</kbd> 가로</span>
            <span><kbd>S / W</kbd> 세로</span>
            <span><kbd>[ / ]</kbd> 전체 크기</span>
            <span><kbd>Q / E</kbd> 기울기</span>
            <span><kbd>PgUp / PgDn</kbd> 앞뒤</span>
            <small><kbd>Shift</kbd> 크게 · <kbd>Alt</kbd> 0.001 정밀 조정</small>
          </div>
          <small>
            {monitorCalibrationSaveRevision > 0
              ? "모니터 화면 배치를 저장했습니다."
              : "자리별 화면을 모니터 프레임 안쪽에 맞춘 뒤 저장하세요."}
          </small>
        </div>
      )}

      {layoutEditMode && (
        <div
          className="world-layout-edit-toolbar"
          role="group"
          aria-label="선택한 객체 배치 도구"
        >
          <div className="world-layout-edit-selection">
            <span>선택한 객체</span>
            <strong>
              {selectedLayoutObjectLabel ?? "월드의 객체를 눌러주세요"}
            </strong>
          </div>
          <div
            className="world-layout-care-actions"
            role="group"
            aria-label="고양이 생활 시설 추가"
          >
            <button
              type="button"
              disabled={
                careFacilityCounts.food >= MAX_CARE_FACILITY_COUNT
              }
              onClick={() =>
                layoutEditorRuntimeRef.current?.addCareFacility("food")
              }
            >
              밥그릇 추가
              <small>
                {careFacilityCounts.food}/{MAX_CARE_FACILITY_COUNT}
              </small>
            </button>
            <button
              type="button"
              disabled={
                careFacilityCounts.toilet >= MAX_CARE_FACILITY_COUNT
              }
              onClick={() =>
                layoutEditorRuntimeRef.current?.addCareFacility("toilet")
              }
            >
              화장실 추가
              <small>
                {careFacilityCounts.toilet}/{MAX_CARE_FACILITY_COUNT}
              </small>
            </button>
          </div>
          <div className="world-layout-edit-actions">
            <button
              type="button"
              disabled={!selectedLayoutObjectLabel}
              aria-label="선택한 객체를 왼쪽으로 15도 회전"
              title="왼쪽으로 회전"
              onClick={() =>
                layoutEditorRuntimeRef.current?.rotateSelected(
                  -WORLD_OBJECT_ROTATION_STEP,
                )
              }
            >
              ↶
            </button>
            <button
              type="button"
              disabled={!selectedLayoutObjectLabel}
              aria-label="선택한 객체를 오른쪽으로 15도 회전"
              title="오른쪽으로 회전"
              onClick={() =>
                layoutEditorRuntimeRef.current?.rotateSelected(
                  WORLD_OBJECT_ROTATION_STEP,
                )
              }
            >
              ↷
            </button>
            <button
              type="button"
              className="world-layout-edit-reset"
              disabled={!selectedLayoutObjectLabel}
              aria-label="선택한 객체를 초기 위치와 방향으로 되돌리기"
              title="초기 위치"
              onClick={() =>
                layoutEditorRuntimeRef.current?.resetSelected()
              }
            >
              초기화
            </button>
            <button
              type="button"
              className="world-layout-edit-save"
              aria-label="현재 관리자 배치 저장"
              title="배치 저장"
              onClick={() =>
                layoutEditorRuntimeRef.current?.saveLayout()
              }
            >
              저장
            </button>
          </div>
          <small>
            {layoutSaveRevision > 0
              ? "관리자 배치를 저장했습니다. 저에게 알려주시면 공통 기본 배치로 하드코딩합니다."
              : "모든 객체를 배치한 뒤 저장하세요. 저장 후 저에게 알려주시면 공통 기본 배치로 하드코딩합니다."}
          </small>
        </div>
      )}

      {failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="world-3d-fallback"
          src="/art/beach-island-ocean-v4-style-locked.png"
          alt="동물 에이전트가 일하는 해변 사무실 배경"
          width="1024"
          height="1536"
        />
      )}

      {!ready && !failed && (
        <div className="world-3d-loading" role="status" aria-live="polite">
          <span className="world-3d-loader" />
          <strong>2.5D 해변 사무실 준비 중</strong>
          <small>{loadingProgress}% · 고양이 자율 행동 불러오기</small>
        </div>
      )}

      <div className="world-3d-location" aria-live="polite">
        <span>{LOCATION_LABELS[primarySeat.location]}</span>
        <strong>
          {AUTONOMOUS_STATUSES.has(primarySeat.status) && ready
            ? ambientLabel
            : primarySeat.statusLabel}
        </strong>
      </div>
    </>
  );
}
