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
