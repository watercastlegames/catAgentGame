export type WorkstationScreenPose = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationX: number;
};

export type WorkstationScreenLayout = Partial<
  Record<"seat-1" | "seat-2" | "seat-3" | "seat-4", WorkstationScreenPose>
>;

export const WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY: string;

export function parseWorkstationScreenLayout(
  raw: string | null | undefined,
): WorkstationScreenLayout;
