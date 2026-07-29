import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { POPUP_UI_ASSETS } from "../app/popup-assets.mjs";

test("popup image manifest is unique and every asset exists", async () => {
  assert.equal(new Set(POPUP_UI_ASSETS).size, POPUP_UI_ASSETS.length);
  assert.ok(POPUP_UI_ASSETS.length >= 25);

  await Promise.all(
    POPUP_UI_ASSETS.map((source) =>
      access(new URL(`../public${source}`, import.meta.url)),
    ),
  );
});

test("popup waits for preloaded images and slides up from below", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /preloadPopupAssets\(\)/);
  assert.match(
    page,
    /data-popup-assets=\{popupAssetsReady \? "ready" : "loading"\}/,
  );
  assert.match(page, /\{radioOpen && popupAssetsReady && \(/);
  assert.match(page, /\{pendingCatStyle && popupAssetsReady && \(/);
  assert.match(page, /\{visibleApprovalEvent && popupAssetsReady && \(/);
  assert.match(layout, /POPUP_UI_ASSETS\.map/);
  assert.match(
    css,
    /@keyframes gamePopupIn[\s\S]*?translate\(-50%, min\(58vh, 460px\)\)/,
  );
  assert.match(
    css,
    /@keyframes modalIn[\s\S]*?translateY\(min\(52vh, 420px\)\)/,
  );
});

test("popup quality pass uses clean slices and real cat appearance captures", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.ok(
    POPUP_UI_ASSETS.includes("/art/ui/slices/close-button-round-v3.png"),
  );
  assert.ok(
    POPUP_UI_ASSETS.includes(
      "/art/ui/slices/cat-list-card-selected-v3.png",
    ),
  );
  assert.equal(
    POPUP_UI_ASSETS.filter((source) =>
      source.startsWith("/art/ui/cat-styles/cat-style-"),
    ).length,
    15,
  );
  assert.match(page, /className="cat-style-preview"/);
  assert.match(page, /catStylePreviewUrl\(style\.id\)/);
  assert.match(
    css,
    /border-image:\s*url\("\/art\/ui\/popup-frame-v1\.png"\)\s*58 fill/,
  );
  assert.match(css, /close-button-round-v3\.png/);
  assert.match(css, /\.need-track b\s*\{[\s\S]*?position:\s*absolute/);
});
