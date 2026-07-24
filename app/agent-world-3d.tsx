"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { findAvoidancePath2D } from "./navigation.mjs";

export type AgentWorldLocation =
  | "entrance"
  | "general"
  | "coding"
  | "design"
  | "music"
  | "queue"
  | "office";

type AgentWorld3DProps = {
  agentName: string;
  location: AgentWorldLocation;
  status: string;
  statusLabel: string;
};

const TENT_WORKSTATION_POSITION = new THREE.Vector3(-2.05, 0, -3.65);
const ROUND_LAPTOP_STATION_POSITION = new THREE.Vector3(-2.2, 0, -0.42);
const FOLDING_LAPTOP_STATION_POSITION = new THREE.Vector3(2.18, 0, -0.18);
const LOW_MONITOR_STATION_POSITION = new THREE.Vector3(2.12, 0, 3.42);
const LOW_MONITOR_STATION_ROTATION_Y = -0.06;
const CAMPING_SUPPLY_CLUSTER_POSITION = new THREE.Vector3(-2.72, 0, 3.42);
const CAMPING_LANTERN_POSITION = new THREE.Vector3(-3.42, 0, -1.82);
const CODING_DESK_TARGET = new THREE.Vector3(2.12, 0, 4.12);
const DESK_KNEADING_EXIT_POSITION = new THREE.Vector3(2.12, 0, 4.62);
const WORLD_TARGETS: Record<AgentWorldLocation, THREE.Vector3> = {
  entrance: new THREE.Vector3(-1.65, 0, 5.05),
  general: new THREE.Vector3(-2.05, 0, -2.48),
  coding: CODING_DESK_TARGET,
  design: new THREE.Vector3(-2.2, 0, 0.78),
  music: new THREE.Vector3(2.18, 0, 1.18),
  queue: new THREE.Vector3(-0.25, 0, 2.45),
  office: new THREE.Vector3(-2.05, 0, -2.48),
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

const ILLUSTRATION_OUTLINE_COLOR = new THREE.Color(0x6f5040);
const ILLUSTRATION_OUTLINE_THICKNESS = 0.005;
const ILLUSTRATION_OUTLINE_ALPHA = 0.8;
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
const DESK_KNEADING_ANIMATION_KEY = "desk-knead";
const DESK_KNEADING_ANIMATION_SUFFIX = "|Caress_sitting";
const DESK_KNEADING_DURATION_SECONDS = 7;
const DESK_CONTACT_MARGIN = 0.2;
const DESK_KEYCAP_PRESS_DEPTH = 0.052;
const DESK_KEYCAP_PRESS_HZ = 1.05;
const MONITOR_CODE_FRAME_RATE = 8;
const CAT_MODEL_URL =
  "/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Blue.fbx";
const CAT_ANIMATIONS_URL =
  "/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Animations_IP.fbx";
const PALM_TREE_MODEL_URL =
  "/models/palm-tree-meshy6-web-v1.glb";
const TENT_WORKSTATION_MODEL_URL =
  "/models/camping-v5/tent-workstation-meshy6-web-v1.glb";
const ROUND_LAPTOP_STATION_MODEL_URL =
  "/models/camping-v5/round-laptop-station-meshy6-web-v1.glb";
const FOLDING_LAPTOP_STATION_MODEL_URL =
  "/models/camping-v5/folding-laptop-radio-station-meshy6-web-v1.glb";
const LOW_MONITOR_STATION_MODEL_URL =
  "/models/camping-v5/low-monitor-station-meshy6-web-v1.glb";
const DESK_KEYCAP_TEXTURE_URLS = [
  "/art/desk-keycap-1-top-v1.png",
  "/art/desk-keycap-2-top-v1.png",
  "/art/desk-keycap-3-top-v1.png",
  "/art/desk-keycap-4-top-v1.png",
];
const AUTONOMOUS_STATUSES = new Set(["idle", "completed", "failed"]);

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
const SCENE_OBSTACLES = [
  DESK_OBSTACLE,
  ...PALM_TREE_OBSTACLES,
  ...ROCK_CLUSTER_OBSTACLES,
  TENT_WORKSTATION_OBSTACLE,
  ROUND_LAPTOP_STATION_OBSTACLE,
  FOLDING_LAPTOP_STATION_OBSTACLE,
  CAMPING_SUPPLY_CLUSTER_OBSTACLE,
  CAMPING_LANTERN_OBSTACLE,
];
const NON_DESK_OBSTACLES = SCENE_OBSTACLES.filter(
  (obstacle) => obstacle !== DESK_OBSTACLE,
);
const OBSTACLE_WAYPOINT_MARGIN = 0.28;
const OBSTACLE_WAYPOINT_REACHED_DISTANCE = 0.055;

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

function disableOutline(material: THREE.Material) {
  material.userData.outlineParameters = { visible: false };
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
  context.fillStyle = "#0f766e";
  context.fillRect(0, canvas.height - 18, canvas.width, 18);
  context.fillStyle = "#ccfbf1";
  context.font = "600 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.fillText("CATCODE   UTF-8   RUNNING", 14, canvas.height - 5);
  texture.needsUpdate = true;
}

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
  keycapTopTextures: THREE.Texture[],
) {
  const interactionGroup = new THREE.Group();
  interactionGroup.name = "low-monitor-workstation-interaction-overlay";
  interactionGroup.position.copy(LOW_MONITOR_STATION_POSITION);
  interactionGroup.rotation.y = LOW_MONITOR_STATION_ROTATION_Y;

  const monitorScreenTexture = createMonitorScreenTexture();
  drawMonitorScreen(monitorScreenTexture, false, 0);
  const monitorScreenMaterial = new THREE.MeshBasicMaterial({
    map: monitorScreenTexture,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  disableOutline(monitorScreenMaterial);
  const monitorScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.61, 0.34),
    monitorScreenMaterial,
  );
  monitorScreen.name = "low-monitor-workstation-live-code-screen";
  monitorScreen.position.set(0.17, 0.84, 0.195);
  monitorScreen.renderOrder = 5;
  interactionGroup.add(monitorScreen);

  const keyColors = [0xf2a160, 0x9d8c9f, 0xef858a, 0xf0c175];
  const animatedDeskKeycaps = keyColors.map((color, index) => {
    const keycapName = `coding-desk-keycap-${index + 1}`;
    const keycapMaterial = new THREE.MeshToonMaterial({ color });
    const keycap = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 0.065, 0.15, 3, 0.025),
      keycapMaterial,
    );
    keycap.name = keycapName;
    keycap.position.set(-0.28 + index * 0.17, 0.49, 0.39);
    interactionGroup.add(keycap);

    const keycapTopMaterial = new THREE.MeshBasicMaterial({
      map: keycapTopTextures[index],
      transparent: true,
      alphaTest: 0.02,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    disableOutline(keycapTopMaterial);
    const keycapTop = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.13),
      keycapTopMaterial,
    );
    keycapTop.name = `${keycapName}-top-texture`;
    keycapTop.rotation.x = -Math.PI / 2;
    keycapTop.position.set(keycap.position.x, 0.524, keycap.position.z);
    keycapTop.renderOrder = 6;
    interactionGroup.add(keycapTop);

    return [
      { object: keycap as THREE.Object3D, restingY: keycap.position.y },
      {
        object: keycapTop as THREE.Object3D,
        restingY: keycapTop.position.y,
      },
    ];
  });

  return {
    interactionGroup,
    monitorScreenTexture,
    animatedDeskKeycaps,
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

function createMeshyPropTemplate(
  source: THREE.Object3D,
  tint: THREE.Color,
  anisotropy: number,
) {
  const template = new THREE.Group();
  const visual = source.clone(true);

  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const styledMaterials = materials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
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
        material.color.multiply(tint);
        material.side = THREE.DoubleSide;
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = anisotropy;
        }
      }
      material.userData.outlineParameters = {
        thickness: ILLUSTRATION_OUTLINE_THICKNESS,
        color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
        alpha: ILLUSTRATION_OUTLINE_ALPHA,
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

export default function AgentWorld3D({
  agentName,
  location,
  status,
  statusLabel,
}: AgentWorld3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef({ location, status });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [ambientLabel, setAmbientLabel] = useState("주변을 구경하는 중");

  useEffect(() => {
    motionRef.current = { location, status };
  }, [location, status]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "world-3d-canvas";
    renderer.domElement.setAttribute(
      "aria-label",
      "드래그하면 월드가 회전하고, 마우스 휠이나 두 손가락으로 확대하고 축소할 수 있습니다.",
    );
    renderer.domElement.title =
      "드래그: 월드 회전 · 휠/두 손가락: 확대 및 축소";
    host.appendChild(renderer.domElement);

    const outlineEffect = new OutlineEffect(renderer, {
      defaultThickness: ILLUSTRATION_OUTLINE_THICKNESS,
      defaultColor: ILLUSTRATION_OUTLINE_COLOR.toArray(),
      defaultAlpha: ILLUSTRATION_OUTLINE_ALPHA,
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x19b2cf);
    scene.fog = new THREE.Fog(0x29b8cf, 15, 27);

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
    let worldYawTarget = 0;
    let worldYawCurrent = 0;
    let worldPitchTarget = 0;
    let worldPitchCurrent = 0;
    let worldZoomTarget = 1;
    let worldZoomCurrent = 1;
    camera.position.copy(cameraBase);
    camera.lookAt(cameraLookAt);

    scene.add(new THREE.HemisphereLight(0xfff6dd, 0x536c49, 1.7));

    const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.1);
    keyLight.position.set(-4, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fcbe0, 0.65);
    fillLight.position.set(8, 5, -4);
    scene.add(fillLight);

    const textureLoader = new THREE.TextureLoader();
    const oceanTexture = textureLoader.load(
      "/art/ocean-water-tile-v1.png",
    );
    oceanTexture.colorSpace = THREE.SRGBColorSpace;
    oceanTexture.wrapS = THREE.RepeatWrapping;
    oceanTexture.wrapT = THREE.RepeatWrapping;
    oceanTexture.repeat.set(6, 6);
    oceanTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const oceanMaterial = new THREE.MeshBasicMaterial({
      map: oceanTexture,
      toneMapped: false,
    });
    disableOutline(oceanMaterial);
    const outerOcean = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      oceanMaterial,
    );
    outerOcean.name = "extended-ocean-floor";
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

  #ifdef DECODE_VIDEO_TEXTURE

    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );

  #endif

  diffuseColor *= sampledDiffuseColor;

#endif`,
      );
    };
    groundMaterial.customProgramCacheKey = () =>
      "shore-tide-breathing-v4";
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

  #ifdef DECODE_VIDEO_TEXTURE

    shoreColor = sRGBTransferEOTF( shoreColor );

  #endif

  diffuseColor *= shoreColor;

#endif`,
      );
    };
    shoreWaterOverlayMaterial.customProgramCacheKey = () =>
      "shore-water-overlay-v2";
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

    const {
      interactionGroup,
      monitorScreenTexture,
      animatedDeskKeycaps,
    } = createCodingStationInteractionOverlay(
      deskKeycapTopTextures,
    );
    scene.add(interactionGroup);
    interactionGroup.updateMatrixWorld(true);
    const deskKneadingLookTarget = interactionGroup.localToWorld(
      new THREE.Vector3(-0.02, 0.49, 0.39),
    );

    const islandPropsWatercolorTexture = textureLoader.load(
      "/art/island-props-watercolor-grain-v1.png",
    );
    islandPropsWatercolorTexture.colorSpace = THREE.SRGBColorSpace;
    islandPropsWatercolorTexture.wrapS = THREE.RepeatWrapping;
    islandPropsWatercolorTexture.wrapT = THREE.RepeatWrapping;
    islandPropsWatercolorTexture.repeat.set(1.2, 1.2);
    islandPropsWatercolorTexture.anisotropy = maximumAnisotropy;

    ROCK_CLUSTER_PLACEMENTS.forEach((placement) => {
      scene.add(
        createRockCluster(islandPropsWatercolorTexture, placement),
      );
    });
    scene.add(
      createCampingSupplyCluster(islandPropsWatercolorTexture),
      createCampingLantern(islandPropsWatercolorTexture),
    );
    const palmLeafSwayTargets: PalmLeafSwayTarget[] = [];

    const meshyPropLoader = new GLTFLoader();
    meshyPropLoader.setMeshoptDecoder(MeshoptDecoder);
    void Promise.allSettled([
      meshyPropLoader.loadAsync(PALM_TREE_MODEL_URL),
      ...MESHY_WORKSTATION_PLACEMENTS.map((placement) =>
        meshyPropLoader.loadAsync(placement.url),
      ),
    ]).then(([palmResult, ...workstationResults]) => {
      if (disposed) return;

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
          const obstacle = PALM_TREE_OBSTACLES.find(
            (candidate) => candidate.id === placement.id,
          );
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
          scene.add(palm);
        });
      } else {
        PALM_TREE_PLACEMENTS.forEach((placement) => {
          scene.add(createPalmTree(islandPropsWatercolorTexture, placement));
        });
      }

      workstationResults.forEach((result, index) => {
        const placement = MESHY_WORKSTATION_PLACEMENTS[index];
        if (!placement || result.status !== "fulfilled") return;

        const workstation = new THREE.Group();
        workstation.name = `${placement.id}-meshy6`;
        workstation.position.copy(placement.position);
        workstation.rotation.y = placement.rotationY;
        workstation.userData.isNavigationObstacle = true;
        workstation.userData.collisionBounds = { ...placement.obstacle };

        const visual = createMeshyPropTemplate(
          result.value.scene,
          new THREE.Color(0xffffff),
          maximumAnisotropy,
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
        scene.add(workstation);
      });

      setLoadingProgress((value) => Math.max(value, 48));
    });

    const characterRoot = new THREE.Group();
    const characterVisual = new THREE.Group();
    characterRoot.add(characterVisual);
    characterRoot.position.copy(WORLD_TARGETS.general);
    scene.add(characterRoot);

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
    let characterModel: THREE.Object3D | null = null;
    let characterYaw = DEFAULT_CHARACTER_YAW;
    let ambientPhase:
      | "resting"
      | "prewalking"
      | "walking"
      | "settling"
      | "kneading" = "resting";
    let ambientDestination: "wander" | "desk" = "wander";
    let shouldKneadAtDeskNext = true;
    let wanderStopsSinceKneading = 0;
    let ambientTimer = 4;
    let ambientAnimationIndex = 0;
    let ambientPointIndex = -1;
    let kneadingElapsed = 0;
    let kneadingBlend = 0;
    let monitorScreenFrame = -1;
    let wasKneadingLastFrame = false;
    let wasAutonomous = AUTONOMOUS_STATUSES.has(motionRef.current.status);
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
    Promise.all([
      fbxLoader.loadAsync(CAT_MODEL_URL, (event) =>
        updateProgress(event, "model"),
      ),
      fbxLoader.loadAsync(CAT_ANIMATIONS_URL, (event) =>
        updateProgress(event, "animations"),
      ),
    ])
      .then(([model, animationSource]) => {
        if (disposed) return;

        model.rotation.y = characterYaw;
        characterModel = model;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;

          object.castShadow = false;
          object.receiveShadow = false;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.color.set(0xffffff);
              material.roughness = 0.95;
              material.metalness = 0;
              material.emissive.set(0x000000);
              material.emissiveMap = null;
              material.emissiveIntensity = 0;
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.anisotropy = Math.min(
                  4,
                  renderer.capabilities.getMaxAnisotropy(),
                );
              }
              if (material instanceof THREE.MeshPhysicalMaterial) {
                material.specularIntensity = 0.12;
                material.specularColor.set(0xffffff);
                material.clearcoat = 0;
                material.ior = 1.3;
              }
            } else if (material instanceof THREE.MeshPhongMaterial) {
              material.color.set(0xffffff);
              material.emissive.set(0x000000);
              material.shininess = 4;
              material.specular.set(0x2f2926);
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.anisotropy = Math.min(
                  4,
                  renderer.capabilities.getMaxAnisotropy(),
                );
              }
            }
            material.userData.outlineParameters = {
              thickness: ILLUSTRATION_OUTLINE_THICKNESS,
              color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
              alpha: ILLUSTRATION_OUTLINE_ALPHA,
            };
            material.needsUpdate = true;
          }
        });

        model.updateMatrixWorld(true);
        const sourceBounds = new THREE.Box3().setFromObject(model);
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        const scale = CHARACTER_HEIGHT / Math.max(sourceSize.y, 0.001);
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(model);
        model.position.y = -scaledBounds.min.y;
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
    const lastNavigationTarget = currentPosition.clone();
    const avoidanceWaypoints: THREE.Vector3[] = [];
    const clock = new THREE.Clock();
    let palmLeafSwayTime = 0;
    let oceanTideTime = 0;

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
      const position = new THREE.Vector2(event.clientX, event.clientY);
      activePointers.set(event.pointerId, position);
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);

      if (activePointers.size >= 2) {
        beginPinchZoom();
      } else {
        beginWorldDrag(event.pointerId, position);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return;

      event.preventDefault();
      const position = new THREE.Vector2(event.clientX, event.clientY);
      activePointers.set(event.pointerId, position);
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
      if (!activePointers.has(event.pointerId)) return;

      event.preventDefault();
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
        renderer.domElement.style.cursor = "grab";
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

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(host);
    updateSize();

    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
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
      let isMoving = false;
      let isKneading = false;
      let movementSpeed = TASK_MOVE_SPEED;
      let movementForwardFactor = 1;

      if (isAutonomous && !wasAutonomous) {
        ambientPhase = "resting";
        ambientTimer = randomBetween(2.5, 4.5);
        ambientTarget.copy(currentPosition);
        playAnimation("idle-look");
        setAmbientLabel(
          motionRef.current.status === "completed"
            ? "일을 마치고 잠시 쉬는 중"
            : motionRef.current.status === "failed"
              ? "기분 전환을 위해 쉬는 중"
              : "주변을 구경하는 중",
        );
      } else if (!isAutonomous && wasAutonomous) {
        ambientPhase = "resting";
        ambientTimer = 4;
        ambientTarget.copy(currentPosition);
      }
      wasAutonomous = isAutonomous;

      if (isAutonomous) {
        movementSpeed = AMBIENT_MOVE_SPEED;

        if (ambientPhase === "resting") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            ambientPhase = "prewalking";
            ambientTimer = randomBetween(0.8, 1.25);
            playAnimation("idle-look", 0.5);
            setAmbientLabel("몸을 일으키고 산책을 준비하는 중");
          }
        } else if (ambientPhase === "prewalking") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            if (shouldKneadAtDeskNext) {
              ambientDestination = "desk";
              ambientTarget.copy(CODING_DESK_TARGET);
              shouldKneadAtDeskNext = false;
              wanderStopsSinceKneading = 0;
              setAmbientLabel("책상으로 꾹꾹이를 하러 가는 중");
            } else {
              ambientDestination = "wander";
              let nextPointIndex = ambientPointIndex;
              for (let attempt = 0; attempt < 8; attempt += 1) {
                const candidateIndex = Math.floor(
                  Math.random() * AMBIENT_WANDER_POINTS.length,
                );
                const candidate = AMBIENT_WANDER_POINTS[candidateIndex];
                if (
                  candidateIndex !== ambientPointIndex &&
                  currentPosition.distanceTo(candidate) > 1.1
                ) {
                  nextPointIndex = candidateIndex;
                  break;
                }
              }

              if (nextPointIndex < 0) nextPointIndex = 0;
              ambientPointIndex = nextPointIndex;
              ambientTarget.copy(AMBIENT_WANDER_POINTS[ambientPointIndex]);
              wanderStopsSinceKneading += 1;
              shouldKneadAtDeskNext = wanderStopsSinceKneading >= 2;
              setAmbientLabel("해변을 천천히 산책하는 중");
            }

            ambientPhase = "walking";
            desiredPosition.copy(ambientTarget);
            isMoving = true;
            playAnimation("walk", 0.32);
          }
        } else if (ambientPhase === "kneading") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;
          isKneading = true;
          playAnimation(DESK_KNEADING_ANIMATION_KEY, 0.24);

          if (ambientTimer <= 0) {
            ambientPhase = "prewalking";
            ambientDestination = "wander";
            ambientTimer = randomBetween(0.8, 1.1);
            playAnimation("idle-look", 0.36);
            setAmbientLabel("꾹꾹이를 마치고 산책을 준비하는 중");
          }
        } else if (ambientPhase === "settling") {
          desiredPosition.copy(currentPosition);
          ambientTimer -= delta;

          if (ambientTimer <= 0) {
            ambientAnimationIndex =
              (ambientAnimationIndex +
                1 +
                Math.floor(
                  Math.random() * (AMBIENT_ANIMATIONS.length - 1),
                )) %
              AMBIENT_ANIMATIONS.length;
            const nextAmbient =
              AMBIENT_ANIMATIONS[ambientAnimationIndex];
            ambientTimer = randomBetween(
              nextAmbient.minSeconds,
              nextAmbient.maxSeconds,
            );
            ambientPhase = "resting";
            playAnimation(nextAmbient.key, 0.5);
            setAmbientLabel(nextAmbient.label);
          }
        } else {
          desiredPosition.copy(ambientTarget);
          const ambientDistance =
            currentPosition.distanceTo(desiredPosition);

          if (ambientDistance <= AMBIENT_ARRIVAL_DISTANCE) {
            currentPosition.copy(ambientTarget);
            desiredPosition.copy(currentPosition);
            if (ambientDestination === "desk") {
              ambientPhase = "kneading";
              ambientTimer = DESK_KNEADING_DURATION_SECONDS;
              kneadingElapsed = 0;
              isKneading = true;
              playAnimation(DESK_KNEADING_ANIMATION_KEY, 0.24);
              setAmbientLabel("책상 키캡을 번갈아 꾹꾹 누르는 중");
            } else {
              ambientPhase = "settling";
              ambientTimer = randomBetween(1.1, 1.8);
              playAnimation("idle-look", 0.36);
              setAmbientLabel("걸음을 멈추고 주변을 살피는 중");
            }
          } else {
            isMoving = true;
            playAnimation("walk", 0.32);
          }
        }
      } else {
        desiredPosition.copy(WORLD_TARGETS[motionRef.current.location]);
        const taskDistance = currentPosition.distanceTo(desiredPosition);
        isMoving = taskDistance > TASK_ARRIVAL_DISTANCE;
        if (isMoving) {
          playAnimation("walk", 0.28);
        } else {
          currentPosition.copy(desiredPosition);
          if (motionRef.current.location === "coding") {
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
        isInsideObstacle(currentPosition, DESK_OBSTACLE)
      ) {
        currentPosition.copy(DESK_KNEADING_EXIT_POSITION);
        avoidanceWaypoints.length = 0;
        lastNavigationTarget.copy(currentPosition);
      }
      const wantsDeskInteraction =
        (isAutonomous &&
          ambientDestination === "desk" &&
          ambientPhase === "walking") ||
        (!isAutonomous && motionRef.current.location === "coding");
      const navigationObstacles = wantsDeskInteraction
        ? NON_DESK_OBSTACLES
        : SCENE_OBSTACLES;

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
      if (isKneading && characterModel) {
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
        characterModel.rotation.y = characterYaw;
      } else if (
        isMoving &&
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
          0.08,
          1,
        );
        characterYaw = lerpAngle(
          characterYaw,
          targetYaw,
          1 - Math.exp(-delta * 7),
        );
        characterModel.rotation.y = characterYaw;
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
      animatedDeskKeycaps.forEach((parts, index) => {
        const phaseOffset =
          index < 2 ? index * 0.16 : Math.PI + (index - 2) * 0.16;
        const pressWave = Math.max(
          0,
          Math.sin(
            kneadingElapsed * Math.PI * 2 * DESK_KEYCAP_PRESS_HZ +
              phaseOffset,
          ),
        );
        const pressDepth =
          Math.pow(pressWave, 2.4) *
          DESK_KEYCAP_PRESS_DEPTH *
          kneadingBlend;
        parts.forEach(({ object, restingY }) => {
          object.position.y = restingY - pressDepth;
        });
      });
      const nextMonitorScreenFrame = isKneading
        ? Math.floor(kneadingElapsed * MONITOR_CODE_FRAME_RATE)
        : -1;
      if (nextMonitorScreenFrame !== monitorScreenFrame) {
        monitorScreenFrame = nextMonitorScreenFrame;
        drawMonitorScreen(
          monitorScreenTexture,
          isKneading,
          kneadingElapsed,
        );
      }

      if (isMoving) {
        const remainingDistance =
          currentPosition.distanceTo(movementGoal);
        const stepDistance =
          movementSpeed * movementForwardFactor * delta;
        if (remainingDistance <= stepDistance) {
          nextPosition.copy(movementGoal);
        } else {
          nextPosition.copy(currentPosition).lerp(
            movementGoal,
            stepDistance / remainingDistance,
          );
        }
        const touchesDesk =
          wantsDeskInteraction &&
          isTouchingObstacle(
            nextPosition,
            DESK_OBSTACLE,
            DESK_CONTACT_MARGIN,
          );
        if (touchesDesk) {
          currentPosition.copy(CODING_DESK_TARGET);
          desiredPosition.copy(currentPosition);
          movementGoal.copy(currentPosition);
          avoidanceWaypoints.length = 0;
          isMoving = false;
          isKneading = true;
          kneadingElapsed = 0;
          playAnimation(DESK_KNEADING_ANIMATION_KEY, 0.24);
          if (isAutonomous) {
            ambientPhase = "kneading";
            ambientTimer = DESK_KNEADING_DURATION_SECONDS;
            setAmbientLabel("책상 안쪽에 앉아 키캡 꾹꾹이 중");
          }
        } else {
          const wouldCollide = SCENE_OBSTACLES.some((obstacle) =>
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
        !isInsideObstacle(currentPosition, DESK_OBSTACLE)
      ) {
        currentPosition.copy(CODING_DESK_TARGET);
        avoidanceWaypoints.length = 0;
      }
      wasKneadingLastFrame = isKneading;
      characterRoot.position.x = currentPosition.x;
      characterRoot.position.z = currentPosition.z;
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
      outlineEffect.render(scene, camera);
    });

    return () => {
      disposed = true;
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
      renderer.domElement.remove();
    };
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        className="world-3d-host"
        aria-label={`${agentName}가 있는 2.5D 해변 사무실`}
      />

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
        <span>{LOCATION_LABELS[location]}</span>
        <strong>
          {AUTONOMOUS_STATUSES.has(status) && ready
            ? ambientLabel
            : statusLabel}
        </strong>
      </div>
    </>
  );
}
