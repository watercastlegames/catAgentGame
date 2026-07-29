import type { SeatId } from "./agent-world-3d";

export type WorkstationSlot = {
  seatId: SeatId;
  title: string;
  description: string;
  price: number;
  preview: string;
  modelUrl: string;
};

export const ACTIVE_SEAT_KEY = "agent-forest-active-seat-count-v1";
export const MAX_SEAT_COUNT = 4;
export const SEAT_ORDER: SeatId[] = [
  "seat-1",
  "seat-2",
  "seat-3",
  "seat-4",
];

export const WORKSTATION_SLOTS: WorkstationSlot[] = [
  {
    seatId: "seat-1",
    title: "모니터 업무 자리",
    description: "책상 · 모니터 · 4키 키보드",
    price: 0,
    preview: "/art/ui/workstations/workstation-seat-1-v1.png",
    modelUrl:
      "/models/camping-style-hybrid-v1/low-monitor-cat-keycap-workstation-smooth-cartoon-v1.glb",
  },
  {
    seatId: "seat-2",
    title: "텐트 업무 자리",
    description: "텐트 · 노트북 · 랜턴",
    price: 250,
    preview: "/art/ui/workstations/workstation-seat-2-v1.png",
    modelUrl:
      "/models/camping-style-hybrid-v1/tent-workstation-smooth-cartoon-v1.glb",
  },
  {
    seatId: "seat-3",
    title: "둥근 피크닉 자리",
    description: "낮은 원형 책상 · 노트북 · 방석",
    price: 600,
    preview: "/art/ui/workstations/workstation-seat-3-v1.png",
    modelUrl:
      "/models/camping-style-hybrid-v1/round-laptop-workstation-smooth-cartoon-v1.glb",
  },
  {
    seatId: "seat-4",
    title: "라디오 업무 자리",
    description: "접이식 책상 · 노트북 · 라디오",
    price: 1250,
    preview: "/art/ui/workstations/workstation-seat-4-v1.png",
    modelUrl:
      "/models/camping-style-hybrid-v1/folding-laptop-radio-workstation-smooth-cartoon-v1.glb",
  },
];

export function parseActiveSeatCount(raw: string | null) {
  const count = Number(raw);
  if (!Number.isFinite(count)) return 1;
  return Math.min(MAX_SEAT_COUNT, Math.max(1, Math.floor(count)));
}

export function activeSeatIds(count: number) {
  return SEAT_ORDER.slice(0, parseActiveSeatCount(String(count)));
}

export function nextWorkstationSlot(count: number) {
  return WORKSTATION_SLOTS[parseActiveSeatCount(String(count))] ?? null;
}
