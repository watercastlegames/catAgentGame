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
  assert.match(page, /className="style-purchase-cat-preview"/);
  assert.match(page, /catStylePreviewUrl\(pendingCatStyle\)/);
  assert.match(page, /uiPreview === "s12"/);
  assert.match(page, /setConfirmDialog\(\{ kind: "disconnect" \}\)/);
  assert.match(
    css,
    /border-image:\s*url\("\/art\/ui\/popup-frame-v1\.png"\)\s*58 fill/,
  );
  assert.match(css, /close-button-round-v3\.png/);
  assert.match(css, /\.need-track b\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(
    css,
    /\.cat-list-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    css,
    /\.task-composer textarea\s*\{[\s\S]*?height:\s*92px;[\s\S]*?min-height:\s*92px;/,
  );
  assert.match(
    css,
    /\.style-purchase-title,[\s\S]*?width:\s*65%;[\s\S]*?font-size:\s*20px;/,
  );
});

test("popup scrolling stays inside a clipped viewport and tabs use nine-slice art", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /radioPage === "desk" && \(\s*<div className="desk-seat-tabs"/,
  );
  assert.match(
    css,
    /\.radio-screen\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.radio-screen:not\(\.has-tabs\) > \.panel-section\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/,
  );
  assert.match(
    css,
    /\.radio-screen\.has-tabs > \.desk-seat-tabs \+ \.panel-section/,
  );
  assert.match(
    css,
    /\.radio-subtabs button,\s*\.desk-seat-tabs button\s*\{[\s\S]*?border-image-source:\s*url\("\/art\/ui\/slices\/tab-idle-v2\.png"\);[\s\S]*?border-image-slice:\s*42 54 28 54 fill;/,
  );
  assert.match(
    css,
    /\.radio-subtabs button\.selected,\s*\.desk-seat-tabs button\.selected\s*\{[\s\S]*?border-image-source:\s*url\("\/art\/ui\/slices\/tab-active-v2\.png"\);/,
  );
  assert.match(
    css,
    /\.style-purchase-copy,\s*\.onboarding-copy,\s*\.approval-copy\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/,
  );
});

test("buttons provide persistent pointer, keyboard, and reduced-motion feedback", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function triggerUiButtonPress\(target: EventTarget \| null\)/);
  assert.match(page, /button\.classList\.add\("ui-button-pressed"\)/);
  assert.match(
    page,
    /onPointerDownCapture=\{\(event\) => triggerUiButtonPress\(event\.target\)\}/,
  );
  assert.match(
    page,
    /onKeyDownCapture=\{\(event\) => \{[\s\S]*?event\.key === "Enter"[\s\S]*?event\.key === " "/,
  );
  assert.match(
    css,
    /\.app-shell button:not\(:disabled\):not\(\.keycap-menu-button\):active\s*\{[\s\S]*?translateY\(3px\) scale\(0\.975\)/,
  );
  assert.match(
    css,
    /\.app-shell button\.ui-button-pressed:not\(:disabled\):not\(\.keycap-menu-button\)\s*\{[\s\S]*?ui-button-press 190ms/,
  );
  assert.match(css, /@keyframes ui-close-button-press/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("popup secondary text keeps a readable minimum size", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /Popup readability pass v5/);
  assert.match(
    css,
    /\.radio-panel\.game-popup \.radio-hardware > span:nth-of-type\(2\)\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /\.radio-panel\.game-popup \.cat-need-row em\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /\.radio-panel\.game-popup \.desk-item-card small\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /\.radio-panel\.game-popup \.companion-backend-card small\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /\.radio-panel\.game-popup \.composer-meta\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /\.radio-panel\.game-popup \.activity-log li small\s*\{[\s\S]*?font-size:\s*14px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*420px\)\s*\{[\s\S]*?\.radio-panel\.game-popup \.food-grade-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
});
