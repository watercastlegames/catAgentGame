import type { SeatId } from "./agent-world-3d";

export type ResidentCatProfile = Readonly<{
  id: string;
  name: string;
}>;

export const RESIDENT_CAT_NAME_POOL: readonly string[];
export function createRandomResidentCatName(
  existingNames?: readonly string[],
  random?: () => number,
): string;
export function residentCatProfile(seatId: SeatId): ResidentCatProfile;
export function residentCatIdForSeat(seatId: SeatId): string;
export function residentCatNameForSeat(seatId: SeatId): string;
