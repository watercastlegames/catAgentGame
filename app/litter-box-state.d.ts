export const LITTER_BOX_STORAGE_KEY: string;
export const LITTER_BOX_MAX_LEVEL: number;
export const LITTER_BOX_WASTE_PER_USE: number;

export function clampLitterLevel(value: unknown): number;
export function parseLitterLevel(raw: string | null | undefined): number;
export function addLitterWaste(level: number, amount?: number): number;
export function isLitterBoxFull(level: number): boolean;
export function cleanLitterBox(): 0;
