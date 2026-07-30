export const POPUP_UI_ASSETS = Object.freeze([
  "/art/ui/popup-frame-v1.png",
  "/art/ui/popup-title-ribbon-v1.png",
  "/art/ui/slices/badge-pill-v2.png",
  "/art/ui/slices/close-button-round-v3.png",
  "/art/ui/slices/icon-close-v2.png",
  "/art/ui/slices/button-danger-v2.png",
  "/art/ui/slices/tab-idle-v2.png",
  "/art/ui/slices/tab-active-v2.png",
  "/art/ui/slices/panel-card-v2.png",
  "/art/ui/slices/panel-strip-v2.png",
  "/art/ui/slices/progress-track-v2.png",
  "/art/ui/slices/button-disabled-v2.png",
  "/art/ui/slices/button-primary-v2.png",
  "/art/ui/slices/button-secondary-v2.png",
  "/art/ui/slices/card-default-v2.png",
  "/art/ui/slices/card-selected-v2.png",
  "/art/ui/slices/cat-list-card-default-v3.png",
  "/art/ui/slices/cat-list-card-selected-v3.png",
  "/art/ui/slices/card-thumbnail-v2.png",
  "/art/ui/slices/icon-paw-v2.png",
  "/art/ui/slices/icon-plus-v2.png",
  "/art/ui/slices/icon-refresh-v2.png",
  "/art/ui/slices/icon-warning-v2.png",
  "/art/ui/slices/icon-check-v2.png",
  "/art/ui/care-v1/care-food-bowl-v1.png",
  "/art/ui/care-v1/care-litter-box-v1.png",
  "/art/ui/care-v1/care-snack-v1.png",
  "/art/ui/care-v1/care-laser-v1.png",
  "/art/ui/care-v1/care-feather-v1.png",
  "/art/ui/workstations/workstation-seat-1-v1.png",
  "/art/ui/workstations/workstation-seat-2-v1.png",
  "/art/ui/workstations/workstation-seat-3-v1.png",
  "/art/ui/workstations/workstation-seat-4-v1.png",
  ...[
    "abyssian",
    "black",
    "blackwhite",
    "blue",
    "bobtail",
    "british",
    "cream",
    "maine",
    "persian",
    "red",
    "redwhite",
    "siamese",
    "simple",
    "sphynx",
    "white",
  ].map((style) => `/art/ui/cat-styles/cat-style-${style}-v1.png`),
]);

let popupAssetPreloadPromise = null;

function preloadImage(source, ImageConstructor) {
  return new Promise((resolve) => {
    const image = new ImageConstructor();
    let settled = false;

    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve({ source, loaded });
    };

    const decodeAndFinish = async () => {
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch {
          // A loaded image can reject decode() on older WebKit builds while
          // still remaining paintable. onload is the authoritative fallback.
        }
      }
      finish(true);
    };

    const timeout = window.setTimeout(() => finish(false), 15_000);
    image.decoding = "async";
    image.onload = () => {
      void decodeAndFinish();
    };
    image.onerror = () => finish(false);
    image.src = source;
  });
}

export function preloadPopupAssets(ImageConstructor = globalThis.Image) {
  if (popupAssetPreloadPromise) return popupAssetPreloadPromise;

  if (typeof ImageConstructor !== "function" || typeof window === "undefined") {
    return Promise.resolve({
      loaded: [],
      failed: [...POPUP_UI_ASSETS],
    });
  }

  popupAssetPreloadPromise = Promise.all(
    POPUP_UI_ASSETS.map((source) => preloadImage(source, ImageConstructor)),
  ).then((results) => ({
    loaded: results.filter((result) => result.loaded).map((result) => result.source),
    failed: results.filter((result) => !result.loaded).map((result) => result.source),
  }));

  return popupAssetPreloadPromise;
}
