export const POPUP_UI_ASSETS: readonly string[];

export type PopupAssetPreloadResult = {
  loaded: string[];
  failed: string[];
};

export function preloadPopupAssets(
  ImageConstructor?: typeof Image,
): Promise<PopupAssetPreloadResult>;
