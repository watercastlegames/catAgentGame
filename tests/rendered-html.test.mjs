import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("serves the other-PC install guide as a standalone HTML page", async () => {
  const response = await render("/install-guide");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-disposition") ?? "", /^inline;/i);

  const html = await response.text();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /다른 PC에도[\s\S]*같은 숲을 열기/);
  assert.match(html, /Claude Code 설치와 로그인/);
  assert.match(html, /AgentForestWorkspace/);
});

test("server-renders the Agent Forest integration UI", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="ko"/i);
  assert.match(html, /<title>Agent Forest/);
  assert.match(html, /aria-label="AI 에이전트 숲"/);
  assert.match(html, /class="world-stage world-stage-3d(?:\s|")/);
  assert.match(html, /class="keycap-menu keycap-menu-pressed-0"/);
  assert.match(html, /2\.5D 해변 사무실 준비 중/);
  assert.doesNotMatch(html, /캠핑 라디오 열기/);
  assert.doesNotMatch(html, /무료 시연 예시/);
  assert.doesNotMatch(html, /AUTONOMOUS CAT MOTION ACTIVE/);
  assert.doesNotMatch(html, /\/_vinext\/image/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships local bridge hooks, responsive styles, and 2.5D assets", async () => {
  const [
    page,
    world3d,
    navigation,
    css,
    layout,
    packageJson,
    worldAudio,
    sketchOutline,
    catNeeds,
  ] =
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/agent-world-3d.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/navigation.mjs", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../app/world-audio.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/sketch-outline-effect.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/cat-needs.ts", import.meta.url), "utf8"),
    ]);

  const [catGallery, catGalleryPage, catStyles, catBody] = await Promise.all([
    readFile(new URL("../app/cat-style-gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cats/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cat-styles.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/cat-body.ts", import.meta.url), "utf8"),
  ]);
  const seatProgression = await readFile(
    new URL("../app/seat-progression.ts", import.meta.url),
    "utf8",
  );
  assert.match(seatProgression, /seatId: "seat-2"[\s\S]*?price: 250/);
  assert.match(seatProgression, /seatId: "seat-3"[\s\S]*?price: 600/);
  assert.match(seatProgression, /seatId: "seat-4"[\s\S]*?price: 1250/);
  // 자리를 열면 외부 세션 유무와 관계없이 좌석별 기본 고양이가 즉시 생긴다.
  assert.match(page, /return unlockedSeatIds\.map\(\(seatId\) =>/);
  assert.match(
    page,
    /const catId = residentCatIdForSeat\(seatId\)/,
  );
  assert.match(
    page,
    /const boundThreadId = catSessionBindings\[seatId\] \?\? runtime\?\.threadId \?\? null/,
  );
  assert.match(
    page,
    /aria-label={`고양이별 \$\{selectedLocalProviderLabel\} 세션 연결`}/,
  );
  assert.match(page, /CAT_SESSION_BINDINGS_STORAGE_KEY/);
  assert.match(page, /href="\/install-guide"/);
  assert.match(page, /가이드 HTML 열기/);
  assert.match(css, /\.connection-guide-banner/);
  assert.match(page, /residentCatNameForSeat\(seatId\)/);

  // 체형 살찌우기는 몸통 뼈 가중치를 쓰는 바인드 포즈 정점 조작이어야 한다.
  // (뼈 스케일은 클립 68개가 전부 .scale 트랙을 갖고 있어 매 프레임 덮어쓴다)
  assert.match(catBody, /export function fattenCat/);
  assert.match(catBody, /skinWeight/);
  assert.match(catBody, /TORSO_BONE_PATTERN/);
  assert.match(catBody, /computeVertexNormals/);
  // 이제 월드에 붙었다 — 1번 키캡의 고양이 메뉴에서 고른 체형이 적용된다.
  assert.match(world3d, /fattenCat/);

  // 진열대는 팩의 스타일 15종을 전부 세운다. All/Animations 는 스타일이 아니라 제외.
  for (const style of [
    "Abyssian",
    "Black",
    "BlackWhite",
    "Blue",
    "Bobtail",
    "British",
    "Cream",
    "Maine",
    "Persian",
    "Red",
    "RedWhite",
    "Siamese",
    "Simple",
    "Sphynx",
    "White",
  ]) {
    assert.match(catStyles, new RegExp(`id: "${style}"`));
  }
  assert.doesNotMatch(catStyles, /id: "All"/);
  assert.doesNotMatch(catStyles, /id: "Animations/);
  assert.match(catStyles, /Lowpoly_Cat_\$\{styleId\}\.fbx/);
  // 목록은 "use client" 없는 모듈에 둬야 서버 컴포넌트가 개수를 셀 수 있다.
  assert.doesNotMatch(catStyles, /^"use client"/m);
  assert.match(catGallery, /catStyleModelUrl/);
  assert.match(catGallery, /LABEL_OVERLAY_LAYER/);
  assert.match(catGallery, /outlineEffect\.render/);
  assert.match(catGalleryPage, /CatStyleGallery/);
  assert.match(catGalleryPage, /from "\.\.\/cat-styles"/);
  assert.match(css, /\.cat-gallery-stage \{/);
  // 월드의 고양이는 그대로 Blue 하나다.
  // 1번 키캡이 고양이 관리 메뉴다 — 스타일을 고르면 월드에 반영되고 체형은 slim 고정이다.
  assert.match(page, /type RadioPage = "cats"/);
  assert.match(page, /key: "cats", ariaLabel: "고양이 관리"/);
  assert.match(page, /key: "desk", ariaLabel: "자리 꾸미기"/);
  assert.match(page, /key: "work", ariaLabel: "PC 연결과 업무 지시"/);
  assert.match(page, /key: "status-log", ariaLabel: "진행 상태와 활동 기록"/);
  assert.match(page, /CAT_SHAPE_PRESETS/);
  assert.doesNotMatch(page, /aria-label="고양이 체형"/);
  assert.match(page, /CAT_LOOK_KEY/);
  assert.match(page, /agent-forest-shell-v1/);
  assert.match(page, /NEEDS_KEY/);
  assert.match(page, /type CatPage = "list" \| "detail"/);
  assert.match(page, /className="cat-list-grid"/);
  assert.match(page, /className="panel-section cat-detail-panel"/);
  assert.match(page, /className="desk-item-grid"/);
  assert.match(page, /role="group" aria-label="자리 객체"/);
  assert.match(page, /purchaseLockedRef/);
  assert.match(page, /className="ui-empty-state state-error"/);
  assert.match(page, /className="style-purchase-modal onboarding-modal"/);
  assert.match(page, /ui-preview/);
  assert.match(catNeeds, /agent-forest-cat-needs-v1/);
  assert.match(catNeeds, /NEEDS_OFFLINE_CAP_MS = 12 \* 60 \* 60/);
  assert.match(page, /LEGACY_ACORN_KEY/);
  assert.match(page, /claimTaskReward/);
  assert.match(page, /event\.mode !== "simulation"/);
  assert.match(page, /새 업무 객체와 고양이 자리를 함께 열어요/);
  assert.match(page, /activeSeatCount=\{activeSeatCount\}/);
  assert.match(page, /onShellCollect=\{collectBeachShell\}/);
  assert.match(page, /hud-shell-v2\.png/);
  assert.match(page, /hud-sound-on-v2\.png/);
  assert.match(page, /hud-sound-off-v2\.png/);
  assert.match(page, /className=\{`world-currency-hud \$\{/);
  assert.match(page, /grantAdministratorShells/);
  // 개발자 도구용 지급량은 한 번에 500개 — 5개씩이면 시험할 때 수십 번 눌러야 했다.
  assert.match(page, /const ADMIN_SHELL_GRANT = 500/);
  assert.match(page, /grantShellReward\(ADMIN_SHELL_GRANT, "관리자 조개 보상"\)/);
  assert.match(page, /disabled=\{!layoutAdminEnabled\}/);
  assert.match(seatProgression, /agent-forest-active-seat-count-v1/);
  assert.match(seatProgression, /MAX_SEAT_COUNT = 4/);
  assert.match(seatProgression, /workstation-seat-1-v1\.png/);
  assert.match(seatProgression, /workstation-seat-4-v1\.png/);
  assert.match(world3d, /WORKSTATION_PLACEMENT_SEATS/);
  assert.doesNotMatch(page, /workstationDecor=\{/);
  assert.doesNotMatch(page, /WORKSTATION_DECOR_CATALOG\.map/);
  assert.doesNotMatch(page, /chooseWorkstationDecor/);
  assert.match(
    world3d,
    /ambientPhase: "resting" \| "prewalking" \| "walking" \| "settling"/,
  );
  assert.match(world3d, /const isSecondaryAutonomous =/);
  assert.match(
    world3d,
    /if \(!entry\.care && !wheelAnimation && ambientAnimation !== "walk"\)/,
  );
  assert.match(world3d, /interactionCatIdRef/);
  assert.match(world3d, /snackApproachTimeoutSeconds/);
  assert.match(world3d, /activeSnackEatingTimer = SNACK_EATING_SECONDS/);
  assert.match(
    world3d,
    /releaseCareFacility\(primaryCare\.intent, primaryCareCatId\)/,
  );
  assert.match(world3d, /primaryCare\.insideFacility = false/);
  assert.match(world3d, /activeSnackTimer = 0/);
  assert.match(
    world3d,
    /!primaryCare &&\s*catExerciseWheelSession\?\.catId !== primaryView\.catId &&\s*activeSnackPhase === "none"/,
  );
  assert.match(world3d, /interactionDebugState/);
  assert.match(world3d, /characterVisible: characterVisual\.visible/);
  assert.match(world3d, /"toy-run", "\|Run_F"/);
  assert.match(world3d, /"toy-crouch", "\|Crouch_idle"/);
  assert.match(world3d, /"toy-pounce", "\|Jump_run"/);
  assert.match(world3d, /"toy-grab", "\|Attack_crouch"/);
  assert.match(world3d, /"toy-attack-left", "\|Attack_Left"/);
  assert.match(world3d, /"toy-attack-right", "\|Attack_Right"/);
  assert.match(world3d, /toyHuntGroup\.name = "cat-feather-lure"/);
  assert.doesNotMatch(world3d, /const toyBall/);
  assert.match(world3d, /desiredPosition\.copy\(toyHuntGroup\.position\)/);
  assert.match(page, /interactionCatId=\{focusedCatId\}/);
  assert.match(world3d, /spawnCollectibleShell/);
  assert.match(world3d, /amount: 1/);
  assert.doesNotMatch(world3d, /amount: 5/);
  assert.match(world3d, /beach-shell-collection-particles/);
  assert.match(world3d, /beach-shell-collection-flash/);
  assert.match(world3d, /beach-shell-collection-water-ring/);
  assert.match(world3d, /const popWave = Math\.sin\(progress \* Math\.PI\)/);
  assert.doesNotMatch(world3d, /collectible\.group\.rotation\.y \+= delta \* 8/);
  assert.doesNotMatch(
    world3d,
    /collectible\.baseY \+ progress \* 0\.82/,
  );
  assert.match(world3d, /plump-closed-scallop-meshy6-v1\.glb/);
  assert.match(
    world3d,
    /COLLECTIBLE_SHELL_REFERENCE_YAW = THREE\.MathUtils\.degToRad\(-10\)/,
  );
  assert.match(
    world3d,
    /rotationY: COLLECTIBLE_SHELL_REFERENCE_YAW/,
  );
  assert.doesNotMatch(world3d, /shellVisual\.rotation\.x/);
  assert.match(world3d, /shellVisual\.scale\.setScalar\(0\.2\)/);
  assert.match(world3d, /upperAndSideShellSpawnPoints/);
  assert.match(world3d, /shorelineOnly = true/);
  assert.match(world3d, /camera-facing-shell/);
  assert.match(world3d, /collectibleShellGltf\.scene/);
  assert.match(world3d, /shellSpawnElapsed = nextShellSpawnSeconds/);
  assert.match(world3d, /0\.0028,\s*0\.72/);
  assert.match(
    world3d,
    /plump-closed-scallop-meshy6-v1_base_color-soft-seam-v2\.png/,
  );
  assert.match(world3d, /material\.map = softSeamTexture/);
  assert.match(world3d, /new THREE\.RingGeometry\(0\.18, 0\.22, 48\)/);
  assert.match(
    world3d,
    /shorelineSparkleGeometry = createFourPointStarGeometry\(0\.11, 0\.026\)/,
  );
  assert.match(world3d, /const shellBurstCount = 20/);
  assert.match(world3d, /new THREE\.CanvasTexture/);
  assert.match(world3d, /drawSparkleRays/);
  assert.match(world3d, /foodSparkleContext\.createRadialGradient/);
  assert.doesNotMatch(world3d, /shell\w*Context\.createRadialGradient/);
  assert.match(world3d, /shoreline-glow/);
  assert.match(world3d, /glowShimmer/);
  assert.doesNotMatch(world3d, /createScallopSurfaceGeometry/);
  assert.match(world3d, /shoreline-shimmer/);
  assert.match(world3d, /water-ripple/);
  assert.match(page, /catStyle:\s*catStyles\[catId\]/);
  assert.doesNotMatch(page, /catStyles\[runtime\?\.threadId\]/);
  assert.match(page, /catShape=\{catShape\}/);
  assert.doesNotMatch(page, /radioPage === "mission"/);
  assert.match(world3d, /catStyleModelUrl\(styleId\)/);
  assert.match(world3d, /characterModelsByStyle\.get\(seat\.catStyle/);
  assert.match(world3d, /PolyArt_Cats_color\.png/);
  // 맵이 없는 파트에 공용 팔레트를 붙이는 폴백은 유지돼야 한다.
  assert.match(world3d, /textured\.map = catPaletteTexture/);
  // 고양이도 소품과 같은 unlit 로 그린다 — 혼자 조명을 받아 톤이 어긋나던 회귀 방지.
  assert.match(world3d, /createUnlitMeshyMaterial\(\s*material,/);
  assert.match(world3d, /fattenCat\(model, catShape\)/);
  // 후처리 비교 캡처는 꾹꾹이용 코딩 화면·눌림 키캡을 강제로 띄우지 않는다.
  // monitorAblation 존재만으로 실시간 화면을 켰던 이전 회귀를 막는다.
  assert.match(world3d, /get\("monitorCapture"\) === "static"/);
  assert.match(world3d, /suppressMonitorInteraction/);
  assert.match(world3d, /get\("monitorScreen"\) === "coding"/);
  assert.match(world3d, /get\("renderScale"\)/);
  assert.match(world3d, /THREE\.MathUtils\.clamp\(requestedRenderScale, 0\.75, 4\)/);
  assert.match(world3d, /const DEFAULT_WORLD_RENDER_SCALE = 4/);
  assert.match(
    world3d,
    /diagnosticRenderScale \?\?[\s\S]*DEFAULT_WORLD_RENDER_SCALE/,
  );
  assert.match(world3d, /dataset\.renderScale/);
  assert.doesNotMatch(
    world3d,
    /monitorAblationMode\s*&&\s*monitorAblationMode\s*!==\s*"no-live-screen"/,
  );
  assert.match(css, /\.cat-style-grid button\.selected/);
  // 메인 팝업은 월드(Canvas) 너비·높이의 약 80%를 점유한다.
  assert.match(
    css,
    /\.radio-panel\.game-popup\s*\{[\s\S]*?width:\s*min\(80vw,[\s\S]*?height:\s*80%/m,
  );
  assert.match(css, /\.cat-list-grid\s*\{[\s\S]*?repeat\(2,/m);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?width:\s*calc\(100% - 28px\)/m);
  // 모든 눌림 상태는 깨끗한 키 형상을 유지하고 아이콘 픽셀만 교체한다.
  assert.match(css, /menu-keycaps-base-v7\.png/);
  assert.match(css, /menu-keycaps-pressed-1-v4\.png/);
  assert.match(css, /menu-keycaps-pressed-2-v4\.png/);
  // 해변 앰비언스 3종 + 타건 루프 + 고양이 4종 + 배경음악, 하악질은 제외.
  assert.match(worldAudio, /AMB_Beach_LowKey_Gull_Loop_01\.mp3/);
  assert.match(worldAudio, /AMB_Beach_LowKey_Gull_Loop_02\.mp3/);
  assert.match(worldAudio, /AMB_Island_Deserted_Loop_01\.mp3/);
  assert.match(worldAudio, /KBD_Thock_Type_Loop_01\.mp3/);
  assert.match(worldAudio, /CAT_Meow_Short_Greet_01\.mp3/);
  assert.match(worldAudio, /CAT_Meow_Normal_01\.mp3/);
  assert.match(worldAudio, /CAT_Meow_Demand_01\.mp3/);
  assert.match(worldAudio, /CAT_Purr_Loop_01\.mp3/);
  assert.match(worldAudio, /TY_Dusk_alt01\.mp3/);
  assert.doesNotMatch(worldAudio, /CAT_Hiss_Angry_01\.mp3/);
  assert.doesNotMatch(page, /CAT_Hiss_Angry_01/);
  assert.match(worldAudio, /source\.loop = true/);
  assert.match(worldAudio, /decodeAudioData/);
  assert.match(worldAudio, /backgroundStarted/);
  assert.match(page, /createWorldAudio/);
  assert.match(page, /CAT_CUE_BY_STATUS/);
  assert.match(page, /setTypingCount/);
  assert.match(page, /playCat\("greet"\)/);
  assert.match(page, /playCat\("purr"\)/);
  assert.match(page, /AUDIO_ENABLED_KEY/);
  assert.match(page, /audioPreferenceHydratedRef/);
  assert.match(page, /className="sound-toggle"/);
  assert.match(css, /\.sound-toggle \{/);
  assert.match(css, /\.world-currency-hud \{/);
  assert.match(css, /@keyframes shellCollectPop/);
  assert.match(css, /\.shell-collect-token::before/);
  assert.doesNotMatch(css, /@keyframes shellFlyToHud/);
  assert.doesNotMatch(page, /shellFlyTokens/);

  assert.match(page, /new EventSource/);
  assert.match(page, /127\.0\.0\.1:4317/);
  assert.match(page, /COMPANION_TOKEN_KEY/);
  assert.match(page, /\/v2\/sessions/);
  assert.match(page, /\/v2\/approvals/);
  assert.match(page, /approval\.required/);
  assert.match(page, /approvalQueue/);
  assert.match(page, /session\.usage/);
  assert.match(page, /pendingApprovals/);
  assert.match(page, /Notification\.requestPermission/);
  assert.match(page, /SEAT_ASSIGNMENTS_KEY/);
  assert.match(page, /runFreeDemo/);
  assert.match(page, /hudDormant/);
  assert.match(page, /setHudDormant\(true\), 3_000/);
  assert.match(css, /\.hud-dormant \.keycap-menu/);
  assert.match(css, /\.hud-dormant \.world-currency-hud/);
  assert.match(css, /\.hud-dormant \.sound-toggle/);
  assert.match(worldAudio, /export type UiCue/);
  assert.match(worldAudio, /playUi\(cue: UiCue\)/);
  assert.match(worldAudio, /UI_RETRIGGER_FLOOR = 0\.04/);
  assert.match(worldAudio, /keycapClick: WORLD_AUDIO_SOURCES\.keycapClicks/);
  assert.match(page, /playUi\("keycapClick"\)/);
  assert.doesNotMatch(page, /keycapAudioPoolRef/);
  assert.match(page, /pressRadioMenuKey/);
  assert.match(page, /activateRadioMenu/);
  assert.match(page, /keycap-menu-button/);
  assert.match(page, /keycap-menu-layer-normal/);
  assert.match(page, /keycap-menu-layer-pressed-/);
  assert.match(page, /world-stage[\s\S]*keycap-menu/);
  assert.doesNotMatch(page, /keycap-menu-pressed-\$\{pressedRadioIndex\} hud-fade/);
  assert.match(page, /const SHOW_LEGACY_OVERLAYS = false/);
  assert.match(page, /\{radioOpen && popupAssetsReady && \(/);
  assert.doesNotMatch(page, /SHOW_LEGACY_OVERLAYS && radioOpen/);
  assert.doesNotMatch(page, /className="radio-dials"/);
  assert.match(page, /비용 없는 화면 시연/);
  assert.match(page, /이 고양이에게 업무 맡기기/);
  assert.match(page, /내 PC Codex 세션/);
  assert.match(
    page,
    /선택한 \$\{selectedLocalProviderLabel\} 세션에서 실행/,
  );
  assert.match(page, /AUTONOMOUS CAT MOTION ACTIVE/);
  assert.match(page, /고양이 자율 행동 · 책상 객체 충돌 회피/);
  assert.match(world3d, /new THREE\.OrthographicCamera/);
  assert.match(world3d, /new THREE\.Vector3\(0, 9\.2, 12\.9\)/);
  assert.match(world3d, /WORLD_INTERACTION_LIMIT_RATIO = 0\.2/);
  assert.match(world3d, /WORLD_YAW_LIMIT/);
  assert.match(world3d, /WORLD_ZOOM_MIN/);
  assert.match(world3d, /WORLD_ZOOM_MAX/);
  assert.match(world3d, /activePointers/);
  assert.match(world3d, /beginWorldDrag/);
  assert.match(world3d, /beginPinchZoom/);
  assert.match(world3d, /handleWheel/);
  assert.match(world3d, /cameraOrbitSpherical/);
  assert.match(world3d, /setFromSpherical/);
  assert.doesNotMatch(world3d, /isDraggingCharacter/);
  assert.doesNotMatch(world3d, /FULL_DRAG_ROTATION/);
  assert.match(world3d, /FBXLoader/);
  assert.match(world3d, /GLTFLoader/);
  assert.match(world3d, /MeshoptDecoder/);
  assert.match(world3d, /catStyleModelUrl/);
  assert.match(world3d, /Lowpoly_Cat_Animations_IP\.fbx/);
  assert.match(world3d, /tent-workstation-smooth-cartoon-v1\.glb/);
  assert.match(world3d, /round-laptop-workstation-smooth-cartoon-v1\.glb/);
  assert.match(
    world3d,
    /folding-laptop-radio-workstation-smooth-cartoon-v1\.glb/,
  );
  assert.match(
    world3d,
    /low-monitor-cat-keycap-workstation-smooth-cartoon-v1\.glb/,
  );
  assert.doesNotMatch(
    world3d,
    /low-monitor-cat-keycap-workstation-flat-source-v4\.glb/,
  );
  assert.doesNotMatch(
    world3d,
    /low-monitor-cat-keycap-workstation-meshy6-web-v3\.glb/,
  );
  assert.doesNotMatch(world3d, /monitor-meshy6-web-v2\.glb/);
  assert.doesNotMatch(world3d, /low-monitor-workstation-separated-monitor/);
  assert.match(world3d, /palm-tree-meshy6-web-v1\.glb/);
  assert.match(
    world3d,
    /camping-supplies-cluster-smooth-cartoon-v1\.glb/,
  );
  assert.match(world3d, /camping-lantern-meshy6-web-v1\.glb/);
  assert.match(
    world3d,
    /tropical-foliage-flowers-cluster-meshy6-web-v1\.glb/,
  );
  assert.match(
    world3d,
    /shoreline-rock-starfish-shell-cluster-meshy6-web-v1\.glb/,
  );
  assert.match(world3d, /RoundedBoxGeometry/);
  assert.match(world3d, /MESHY_WORKSTATION_PLACEMENTS/);
  assert.match(world3d, /MESHY_DECORATION_ASSETS/);
  assert.match(
    world3d,
    /cat-exercise-wheel-meshy6-web-v1\.glb/,
  );
  assert.match(world3d, /exerciseWheelOwnedRef/);
  assert.match(page, /CAT_EXERCISE_WHEEL_PREVIEW_URL/);
  assert.match(page, /onClick=\{buyCatExerciseWheel\}/);
  assert.doesNotMatch(
    world3d,
    /id: "camping-lantern",\s*url: CAMPING_LANTERN_MODEL_URL/,
  );
  assert.doesNotMatch(
    world3d,
    /else if \(asset\.id === "camping-lantern"\)/,
  );
  assert.match(world3d, /createCodingStationInteractionOverlay/);
  assert.match(
    world3d,
    /workstation-live-code-screen-\$\{layout\.seatId\}/,
  );
  assert.match(world3d, /WORKSTATION_INTERACTION_LAYOUTS/);
  assert.match(world3d, /workstationInteractions/);
  assert.match(
    world3d,
    /workstationInteractions\.get\(seatId\)/,
  );
  assert.match(
    world3d,
    /"seat-2": \{[\s\S]*?stationPosition: TENT_WORKSTATION_POSITION[\s\S]*?animatedKeycaps: false/,
  );
  assert.match(
    world3d,
    /"seat-3": \{[\s\S]*?stationPosition: ROUND_LAPTOP_STATION_POSITION[\s\S]*?animatedKeycaps: false/,
  );
  assert.match(
    world3d,
    /"seat-4": \{[\s\S]*?stationPosition: FOLDING_LAPTOP_STATION_POSITION[\s\S]*?animatedKeycaps: false/,
  );
  assert.match(world3d, /desk-keycap-1-top-flat-v1\.png/);
  assert.match(world3d, /desk-keycap-2-top-flat-v1\.png/);
  assert.match(world3d, /desk-keycap-3-top-flat-v1\.png/);
  assert.match(world3d, /desk-keycap-4-top-flat-v1\.png/);
  assert.match(world3d, /camping-style-hybrid-v1/);
  assert.doesNotMatch(world3d, /camping-style-locked-v4/);
  assert.doesNotMatch(world3d, /flat-source-v4\.glb/);
  assert.doesNotMatch(world3d, /createWorkstationKeyboardCleanup/);
  assert.match(world3d, /LOW_MONITOR_STATION_ROTATION_Y = -0\.06/);
  assert.match(
    world3d,
    /LOW_MONITOR_SCREEN_LOCAL_POSITION = new THREE\.Vector3\(\s*0\.048,\s*0\.853,\s*-0\.481/,
  );
  assert.match(
    world3d,
    /LOW_MONITOR_SCREEN_SIZE = new THREE\.Vector2\(0\.71, 0\.465\)/,
  );
  assert.match(
    world3d,
    /"seat-2": \{[\s\S]*?screenPosition: new THREE\.Vector3\(-0\.035, 0\.66, -0\.078\)[\s\S]*?screenSize: new THREE\.Vector2\(0\.615, 0\.37\)/,
  );
  assert.match(
    world3d,
    /"seat-3": \{[\s\S]*?screenPosition: new THREE\.Vector3\(-0\.075, 0\.747, -0\.755\)[\s\S]*?screenSize: new THREE\.Vector2\(0\.6846, 0\.5025\)/,
  );
  assert.match(
    world3d,
    /"seat-4": \{[\s\S]*?screenPosition: new THREE\.Vector3\(-0\.477, 0\.86, -0\.46\)[\s\S]*?screenSize: new THREE\.Vector2\(0\.586, 0\.3794\)/,
  );
  assert.match(world3d, /LOW_MONITOR_KEYCAP_START_X = -0\.23/);
  assert.match(world3d, /LOW_MONITOR_KEYCAP_SPACING = 0\.2/);
  assert.match(world3d, /LOW_MONITOR_KEYCAP_Y = 0\.579/);
  assert.match(world3d, /LOW_MONITOR_KEYCAP_Z = -0\.17/);
  assert.match(
    world3d,
    /workstation-interaction-overlay-\$\{layout\.seatId\}/,
  );
  assert.match(
    world3d,
    /secondaryEntry\?\.currentKey === "work"/,
  );
  assert.match(
    world3d,
    /case TENT_WORKSTATION_OBSTACLE\.id:[\s\S]*?SEAT_WORLD_POSITIONS\["seat-2"\]/,
  );
  assert.match(
    world3d,
    /case DESK_OBSTACLE\.id:[\s\S]*?SEAT_WORLD_POSITIONS\["seat-1"\]/,
  );
  assert.match(world3d, /createMonitorScreenTexture/);
  assert.match(world3d, /drawMonitorScreen/);
  assert.match(world3d, /kneading\.ts/);
  assert.match(world3d, /CATCODE   UTF-8   RUNNING/);
  assert.doesNotMatch(world3d, /context\.fillStyle = "#0f766e"/);
  assert.match(world3d, /MONITOR_CODE_FRAME_RATE = 8/);
  assert.match(world3d, /nextMonitorScreenFrame/);
  assert.match(world3d, /coding-desk-keycap-\$\{index \+ 1\}-top-texture/);
  assert.match(world3d, /const halo = new THREE\.Sprite\(haloMaterial\)/);
  assert.match(world3d, /const haloMaterial = new THREE\.SpriteMaterial/);
  assert.doesNotMatch(world3d, /coding-desk-keycap[\s\S]{0,320}new THREE\.Sprite/);
  assert.match(world3d, /isNavigationObstacle/);
  assert.match(world3d, /SCENE_OBSTACLES/);
  assert.match(world3d, /findAvoidancePath2D/);
  assert.match(world3d, /findAvoidancePath/);
  assert.match(world3d, /avoidanceWaypoints/);
  assert.match(navigation, /candidateRoutes/);
  assert.match(navigation, /segmentIntersectsObstacle2D/);
  assert.match(world3d, /OBSTACLE_WAYPOINT_MARGIN = 0\.28/);
  assert.match(world3d, /OBSTACLE_WAYPOINT_REACHED_DISTANCE/);
  assert.match(world3d, /movementForwardFactor/);
  assert.match(world3d, /turnDelta/);
  assert.match(world3d, /wouldCollide/);
  assert.match(world3d, /\|Idle_1/);
  assert.match(world3d, /\|Walk_F/);
  assert.match(world3d, /\|Idle_2/);
  assert.match(world3d, /\|Caress_sitting/);
  assert.match(world3d, /DESK_KNEADING_ANIMATION_KEY/);
  assert.match(world3d, /CODING_DESK_TARGET.*4\.12/);
  assert.match(world3d, /DESK_KNEADING_EXIT_POSITION/);
  assert.match(world3d, /DESK_CONTACT_MARGIN = 0\.2/);
  assert.match(world3d, /isTouchingObstacle/);
  assert.match(world3d, /DESK_KEYCAP_PRESS_DEPTH = 0\.052/);
  assert.doesNotMatch(world3d, /ambientPhase === "kneading"/);
  assert.doesNotMatch(world3d, /ambientDestination.*"desk"/);
  assert.match(
    world3d,
    /const wantsDeskInteraction = !isAutonomous && isPrimaryWorking/,
  );
  assert.match(
    world3d,
    /characterRoot\.position\.copy\(AMBIENT_WANDER_POINTS\[0\]\)/,
  );
  assert.match(world3d, /becameSecondaryAutonomous/);
  assert.match(world3d, /animatedDeskKeycaps/);
  assert.match(
    world3d,
    /workstation\.add\(workstationInteraction\.interactionGroup\)/,
  );
  assert.match(
    world3d,
    /interaction\.monitorScreen\.visible = showWorkstationInteraction/,
  );
  assert.match(world3d, /\|Sitting_Idle/);
  assert.match(world3d, /\|Sitting_idle_2/);
  assert.match(world3d, /\|Sitting_idle_3/);
  assert.match(world3d, /\|Lie_Idle/);
  assert.match(world3d, /\|EatDrink/);
  assert.match(world3d, /AMBIENT_WANDER_POINTS/);
  assert.match(world3d, /AUTONOMOUS_STATUSES/);
  assert.match(world3d, /ambientPhase/);
  assert.match(world3d, /"settling"/);
  assert.match(css, /menu-keycaps-base-v7\.png/);
  assert.match(css, /menu-keycaps-pressed-1-v4\.png/);
  assert.match(css, /menu-keycaps-pressed-2-v4\.png/);
  assert.match(css, /menu-keycaps-pressed-3-v4\.png/);
  assert.match(css, /menu-keycaps-pressed-4-v4\.png/);
  assert.match(css, /\.keycap-menu-layer-normal[\s\S]*opacity:\s*1/);
  assert.match(
    css,
    /\.keycap-menu-pressed-1 \.keycap-menu-layer-normal[\s\S]*opacity:\s*0/,
  );
  assert.match(css, /\.keycap-menu-pressed-1 \.keycap-menu-layer-pressed-1/);
  assert.match(css, /\.keycap-menu-button\.selected::after[\s\S]*box-shadow:\s*none/);
  assert.doesNotMatch(css, /--keycap-art/);
  assert.match(css, /\.keycap-menu\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /width:\s*min\(448px,\s*calc\(80% - 14px\)\)/);
  assert.match(css, /width:\s*min\(400px,\s*calc\(80% - 6px\)\)/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.world-stage\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(css, /translateY\(7px\)/);
  assert.match(world3d, /"prewalking"/);
  assert.match(world3d, /AMBIENT_MOVE_SPEED = 0\.46/);
  assert.match(world3d, /TASK_MOVE_SPEED = 1\.35/);
  assert.match(world3d, /const remainingDistance/);
  assert.match(world3d, /\.addScaledVector\(/);
  assert.match(world3d, /Math\.min\(stepDistance, remainingDistance\)/);
  assert.doesNotMatch(world3d, /\.moveTowards\(/);
  assert.match(world3d, /걸음을 멈추고 주변을 살피는 중/);
  assert.match(world3d, /몸을 일으키고 산책을 준비하는 중/);
  assert.match(world3d, /해변을 천천히 산책하는 중/);
  assert.match(world3d, /간식을 먹고 우유를 마시는 중/);
  assert.match(world3d, /beach-island-ocean-v4-style-locked\.png/);
  assert.match(world3d, /ocean-water-tile-v1\.png/);
  assert.match(world3d, /infinite-ocean-floor/);
  assert.match(world3d, /new THREE\.PlaneGeometry\(120, 120\)/);
  assert.match(world3d, /shore-tide-infinite-ocean-v1/);
  assert.match(world3d, /uniform float oceanTideTime/);
  assert.match(world3d, /shoreWaterSignal/);
  assert.match(world3d, /tideBreath/);
  assert.match(world3d, /tideScale = tideBreath \* 0\.014/);
  assert.match(world3d, /surfaceRipple/);
  assert.match(world3d, /shore-water-infinite-ocean-v1/);
  assert.match(world3d, /animated-shore-water-overlay/);
  assert.match(world3d, /shoreOverlayWaterSignal/);
  assert.match(world3d, /shorelineScale/);
  assert.match(world3d, /shoreWaterOverlay\.scale\.set/);
  assert.match(world3d, /oceanTexture\.offset\.set/);
  assert.match(world3d, /world-atmosphere-horizon-backdrop/);
  assert.match(world3d, /atmosphereBackdrop\.mesh\.visible = false/);
  assert.match(world3d, /unifiedOceanColor/);
  assert.match(world3d, /edgeBlend/);
  assert.doesNotMatch(world3d, /horizonReveal/);
  assert.match(world3d, /WORLD_DAY_NIGHT_STORAGE_KEY/);
  assert.match(world3d, /worldDayNightPhaseAt\(Date\.now\(\), worldDayNightAnchor\)/);
  assert.match(world3d, /uniform float sunsetAmount/);
  assert.match(world3d, /sunReflectionBand/);
  assert.match(world3d, /moonReflectionBand/);
  assert.doesNotMatch(world3d, /dioramaBase/);
  assert.match(world3d, /island-props-watercolor-grain-v1\.png/);
  assert.match(world3d, /PALM_TREE_PLACEMENTS/);
  assert.match(world3d, /ROCK_CLUSTER_PLACEMENTS/);
  assert.match(world3d, /PALM_TREE_OBSTACLES/);
  assert.match(world3d, /ROCK_CLUSTER_OBSTACLES/);
  assert.match(world3d, /TENT_WORKSTATION_OBSTACLE/);
  assert.match(world3d, /ROUND_LAPTOP_STATION_OBSTACLE/);
  assert.match(world3d, /FOLDING_LAPTOP_STATION_OBSTACLE/);
  assert.match(world3d, /CAMPING_SUPPLY_CLUSTER_OBSTACLE/);
  assert.match(world3d, /CAMPING_LANTERN_OBSTACLE/);
  assert.doesNotMatch(world3d, /BEACH_BENCH_OBSTACLE/);
  assert.match(world3d, /office: new THREE\.Vector3\(-2\.08, 0, -2\.82\)/);
  assert.match(world3d, /createPalmFrondGeometry/);
  assert.match(world3d, /createPalmTree/);
  assert.match(world3d, /createRockCluster/);
  assert.match(world3d, /createCampingSupplyCluster/);
  assert.match(world3d, /createCampingLantern/);
  assert.doesNotMatch(world3d, /createBeachOfficeBench/);
  assert.match(world3d, /createMeshyPropTemplate/);
  assert.match(world3d, /type MeshyPropMaterialStyle = "source" \| "unlit"/);
  assert.match(world3d, /createUnlitMeshyMaterial/);
  assert.match(world3d, /renderingStyle: "illustrated-unlit"/);
  assert.match(
    world3d,
    /createCoveredCatLitterBox[\s\S]*createUnlitIllustratedMaterial/,
  );
  assert.match(world3d, /0\.78,\s*"unlit",/);
  assert.match(world3d, /ensurePalmLeafSwayMorphTargets/);
  assert.match(world3d, /registerPalmLeafSway/);
  assert.match(world3d, /palm-leaf-sway-morph-v2/);
  assert.doesNotMatch(
    world3d,
    /position instanceof THREE\.BufferAttribute/,
  );
  assert.match(world3d, /geometry\.morphTargetsRelative = true/);
  assert.match(world3d, /palmLeafSwayTargets/);
  assert.match(world3d, /palmLeafSwayTime \* 0\.9/);
  assert.match(world3d, /tipFactor \* 0\.024/);
  assert.match(
    world3d,
    /id: "palm-tree-northwest"[\s\S]*rotationY: 0\.78,[\s\S]*scale: 1\.12/,
  );
  assert.match(
    world3d,
    /id: "palm-tree-northeast"[\s\S]*rotationY: -0\.78,[\s\S]*scale: 1\.12/,
  );
  assert.match(world3d, /createMeshyPropShadow/);
  assert.match(world3d, /meshyPropLoader\.setMeshoptDecoder/);
  assert.doesNotMatch(world3d, /campingRadioTableBillboard/);
  assert.match(world3d, /workstationResults\.forEach/);
  assert.match(world3d, /visual\.scale\.setScalar\(placement\.height\)/);
  assert.match(world3d, /workstation\.userData\.collisionBounds/);
  assert.match(world3d, /3\.05 \* placement\.scale/);
  assert.doesNotMatch(world3d, /officeVisual\.scale\.setScalar/);
  assert.match(world3d, /visual\.position\.y = -0\.24/);
  assert.match(world3d, /DodecahedronGeometry/);
  assert.match(world3d, /-coconut-/);
  assert.match(world3d, /emissive\.set\(0x000000\)/);
  // 고양이 재질에 있던 specular 보정은 unlit 전환으로 사라졌다.
  // 대신 소품과 같은 외곽선 값을 쓰는지 확인한다(두께·색·알파 공용 상수).
  assert.match(world3d, /thickness: ILLUSTRATION_OUTLINE_THICKNESS/);
  assert.match(world3d, /color: ILLUSTRATION_OUTLINE_COLOR\.toArray\(\)/);
  assert.match(world3d, /alpha: ILLUSTRATION_OUTLINE_ALPHA/);
  assert.match(world3d, /SketchOutlineEffect/);
  assert.match(sketchOutline, /paperGap/);
  assert.match(sketchOutline, /outlineGapStrength/);
  assert.match(sketchOutline, /outlinePixelRatio/);
  assert.match(
    sketchOutline,
    /gl_FragCoord\.xy\s*\/\s*max\(outlinePixelRatio,\s*1\.0\)/,
  );
  assert.match(sketchOutline, /smoothstep\(gapThreshold - 0\.045/);
  assert.match(sketchOutline, /setPixelRatio/);
  assert.match(sketchOutline, /gapThreshold = mix\(1\.05, 0\.79/);
  assert.match(sketchOutline, /setGapStrength/);
  assert.match(world3d, /worldViewIsMoving/);
  assert.match(world3d, /outlineEffect\.setGapStrength/);
  assert.match(world3d, /outlineEffect\.setPixelRatio\(renderPixelRatio\)/);
  assert.doesNotMatch(world3d, /disableWorldOutline/);
  assert.match(world3d, /SkeletonUtils/);
  assert.match(world3d, /SeatView/);
  assert.match(
    world3d,
    /function createAgentMarker\(\s*initialSeat: SeatView,\s*replyReadyTexture: THREE\.Texture,/,
  );
  assert.match(world3d, /seat\.hunger/);
  assert.match(world3d, /seat\.toilet/);
  assert.match(world3d, /seat\.happiness/);
  assert.match(page, /className="cat-need-row cat-happiness-row"/);
  assert.match(page, /className=\{`need-track happiness-track band-\$\{/);
  assert.match(page, /aria-label="고양이 행복도"/);
  assert.match(page, /aria-valuenow=\{Math\.round\(focusedCatNeeds\.happiness\)\}/);
  assert.match(page, /\{profile\.buttonLabel\}/);
  assert.match(page, /FOOD_BOWL_COUNT_STORAGE_KEY/);
  assert.match(page, /purchaseSecondFoodBowl/);
  assert.match(page, /foodBowlCount=\{foodBowlCount\}/);
  assert.match(page, /litterBoxCount=\{litterBoxCount\}/);
  assert.match(page, /className="world-facility-shop"/);
  assert.match(page, /aria-label="월드 생활 및 놀이 시설 구매"/);
  assert.match(page, /onClick=\{buySecondFoodBowl\}/);
  assert.match(page, /onClick=\{upgradeLitterFacility\}/);
  const deskPanelIndex = page.indexOf(
    'className="panel-section desk-panel"',
  );
  const deskSeatGridIndex = page.indexOf(
    'className="desk-item-grid" role="group" aria-label="자리 객체"',
  );
  const facilityShopIndex = page.indexOf(
    'className="world-facility-shop"',
  );
  assert.ok(deskPanelIndex >= 0);
  assert.ok(deskSeatGridIndex > deskPanelIndex);
  assert.ok(facilityShopIndex > deskSeatGridIndex);
  assert.equal(page.includes("자리 꾸미기 소품 12종"), false);
  assert.equal(
    page.slice(0, deskPanelIndex).includes("onClick={buySecondFoodBowl}"),
    false,
  );
  assert.equal(
    page
      .slice(0, deskPanelIndex)
      .includes("onClick={upgradeLitterFacility}"),
    false,
  );
  assert.match(
    css,
    /\.world-facility-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/,
  );
  assert.match(
    css,
    /\.world-facility-card\s*\{[\s\S]*?border-image:\s*url\("\/art\/ui\/slices\/card-default-v2\.png"\)/,
  );
  assert.match(page, /litterLevel=\{litterLevel\}/);
  assert.match(page, /onLitterBoxClick=\{cleanLitterFacility\}/);
  assert.match(world3d, /outcome: "toilet-blocked"/);
  assert.match(world3d, /litter-box-level-gauge/);
  assert.match(world3d, /litter-box-odor-particles/);
  assert.match(world3d, /litterLevelRef\.current = addLitterWaste/);
  assert.match(world3d, /targetId === "litter-box"/);
  assert.match(world3d, /primaryInsideLitterBox/);
  assert.match(world3d, /marker\.update\(/);
  assert.match(world3d, /SEAT_WORLD_POSITIONS/);
  assert.match(world3d, /new THREE\.Raycaster/);
  assert.match(world3d, /completion-spectacle-particles/);
  assert.match(world3d, /blocked-beacon/);
  assert.doesNotMatch(world3d, /camping-radio-connection-lamp/);
  assert.match(world3d, /0x6f5040/);
  assert.match(world3d, /ILLUSTRATION_OUTLINE_THICKNESS = 0\.0038/);
  assert.match(world3d, /ILLUSTRATION_OUTLINE_ALPHA = 0\.72/);
  assert.doesNotMatch(world3d, /WORKSTATION_OUTLINE_THICKNESS/);
  assert.doesNotMatch(world3d, /WORKSTATION_OUTLINE_ALPHA/);
  assert.match(world3d, /FAR_OCEAN_STYLE_COLOR = 0x77cbbd/);
  assert.match(world3d, /infinite-ocean-no-horizon-v1/);
  assert.match(world3d, /diagnosticParams\.get\("worldYaw"\)/);
  assert.match(world3d, /diagnosticParams\.get\("worldPitch"\)/);
  assert.match(world3d, /diagnosticParams\.get\("worldZoom"\)/);
  assert.match(world3d, /THREE\.MathUtils\.degToRad\(requestedWorldYawDegrees\)/);
  assert.match(world3d, /let worldYawTarget = initialWorldYaw/);
  assert.match(world3d, /world-time-test-toolbar/);
  assert.match(world3d, /임시 밤낮 시간 테스트/);
  assert.match(world3d, /forcedWorldDayNightPhaseRef\.current/);
  assert.match(world3d, /url\.searchParams\.set\("worldTime", mode\)/);
  assert.match(css, /\.world-time-test-toolbar/);
  assert.match(
    world3d,
    /new THREE\.Fog\(FAR_OCEAN_STYLE_COLOR, 15, 27\)/,
  );
  assert.match(world3d, /CHARACTER_HEIGHT = 0\.86/);
  assert.match(world3d, /outlineEffect\.render/);
  // 이름표·비콘은 외곽선 패스가 끝난 뒤 별도 오버레이 패스에서만 그려져야 한다.
  assert.match(world3d, /MARKER_OVERLAY_LAYER = 1/);
  assert.match(world3d, /object\.layers\.set\(MARKER_OVERLAY_LAYER\)/);
  assert.match(world3d, /LOW_MONITOR_WORKING_MARKER_WORLD_POSITION/);
  assert.match(world3d, /typingMonitorAnchorFor/);
  assert.match(
    world3d,
    /typingMonitorAnchorFor\([\s\S]{0,160}characterRoot,[\s\S]{0,80}isKneading/,
  );
  assert.doesNotMatch(
    world3d,
    /markerAnchorFor\(primarySeatId,\s*primaryView\.status === "working"\)/,
  );
  assert.match(
    world3d,
    /outlineEffect\.render\(scene, camera\);[\s\S]{0,600}camera\.layers\.set\(MARKER_OVERLAY_LAYER\);[\s\S]{0,200}renderer\.clearDepth\(\);[\s\S]{0,120}renderer\.render\(scene, camera\)/,
  );
  assert.match(world3d, /scene\.background = null;/);
  assert.match(world3d, /playAnimation/);
  assert.doesNotMatch(
    world3d,
    /status === "moving"\s*\|\|\s*motionRef\.current\.status === "reporting"/,
  );
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /lang="ko"/);
  assert.match(packageJson, /"bridge": "node bridge\/server\.mjs"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await Promise.all([
    access(
      new URL(
        "../public/art/beach-island-ocean-v4-style-locked.png",
        import.meta.url,
      ),
    ),
    access(
      new URL("../public/art/ocean-water-tile-v1.png", import.meta.url),
    ),
    access(
      new URL(
        "../public/art/island-props-watercolor-grain-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-wood-watercolor-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-watercolor-grain-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-1-top-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-2-top-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-3-top-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-4-top-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-1-top-flat-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-2-top-flat-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-3-top-flat-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/desk-keycap-4-top-flat-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4/tent-workstation-flat-source-v4.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4/round-laptop-workstation-flat-source-v4.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4/folding-laptop-radio-workstation-flat-source-v4.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4/low-monitor-cat-keycap-workstation-flat-source-v4.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4-clean/low-monitor-cat-keycap-workstation-noise-clean-v3.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4-clean/selective-cleanup-manifest-v3.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v4/source-rebuild-manifest.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/coding-desk-ground-illustration-v2.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/art/camping-radio-table-v1.png",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/beach-office-hut-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/palm-tree-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/beach-office-palm-meshy6-tasks.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v1/camping-supplies-cluster-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/tent-workstation-smooth-cartoon-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/round-laptop-workstation-smooth-cartoon-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/folding-laptop-radio-workstation-smooth-cartoon-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/low-monitor-cat-keycap-workstation-smooth-cartoon-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/camping-supplies-cluster-smooth-cartoon-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-hybrid-v1/manifest.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v1/camping-lantern-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v1/tropical-foliage-flowers-cluster-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v1/shoreline-rock-starfish-shell-cluster-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v1/meshy6-tasks.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v3/tent-workstation-meshy6-web-v3.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v3/round-laptop-workstation-meshy6-web-v3.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v3/folding-laptop-radio-workstation-meshy6-web-v3.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v3/low-monitor-cat-keycap-workstation-meshy6-web-v3.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/camping-style-locked-v3/meshy6-tasks.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/cats-soup-v1/low-monitor-raised-four-key-workstation-meshy6-web-v1.glb",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/cats-soup-v1/meshy6-tasks.json",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Blue.fbx",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Animations_IP.fbx",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/models/PolyArt/Animals/Cats/Texture/PolyArt_Cats_color.png",
        import.meta.url,
      ),
    ),
    ...[
      "Abyssian",
      "Black",
      "BlackWhite",
      "Blue",
      "Bobtail",
      "British",
      "Cream",
      "Maine",
      "Persian",
      "Red",
      "RedWhite",
      "Siamese",
      "Simple",
      "Sphynx",
      "White",
    ].map((style) =>
      access(
        new URL(
          `../public/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_${style}.fbx`,
          import.meta.url,
        ),
      ),
    ),
    access(
      new URL("../public/art/menu-keycaps-base-v4.png", import.meta.url),
    ),
    access(
      new URL("../public/art/menu-keycaps-pressed-1-v4.png", import.meta.url),
    ),
    access(
      new URL("../public/art/menu-keycaps-pressed-2-v4.png", import.meta.url),
    ),
    access(
      new URL("../public/art/menu-keycaps-pressed-3-v4.png", import.meta.url),
    ),
    access(
      new URL("../public/art/menu-keycaps-pressed-4-v4.png", import.meta.url),
    ),
    access(new URL("../public/audio/keycap-click-1.mp3", import.meta.url)),
    access(new URL("../public/audio/keycap-click-2.mp3", import.meta.url)),
    access(new URL("../public/audio/ATTRIBUTION.txt", import.meta.url)),
    access(
      new URL(
        "../public/audio/AMB_Beach_LowKey_Gull_Loop_01.mp3",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/audio/AMB_Beach_LowKey_Gull_Loop_02.mp3",
        import.meta.url,
      ),
    ),
    access(
      new URL(
        "../public/audio/AMB_Island_Deserted_Loop_01.mp3",
        import.meta.url,
      ),
    ),
    access(
      new URL("../public/audio/KBD_Thock_Type_Loop_01.mp3", import.meta.url),
    ),
    access(new URL("../public/audio/CAT_Meow_Normal_01.mp3", import.meta.url)),
    access(
      new URL("../public/audio/CAT_Meow_Short_Greet_01.mp3", import.meta.url),
    ),
    access(new URL("../public/audio/CAT_Meow_Demand_01.mp3", import.meta.url)),
    access(new URL("../public/audio/CAT_Purr_Loop_01.mp3", import.meta.url)),
    access(new URL("../public/audio/TY_Dusk_alt01.mp3", import.meta.url)),
    access(new URL("../public/art/menu-keycaps-base-v7.png", import.meta.url)),
    access(
      new URL("../public/art/menu-keycaps-pressed-1-v4.png", import.meta.url),
    ),
    access(new URL("../public/concept-approval.jpg", import.meta.url)),
    ...[
      "desk-basic-v1.png",
      "desk-tent-v1.png",
      "desk-radio-v1.png",
      "desk-cushion-v1.png",
      "desk-planter-v1.png",
      "desk-lantern-v1.png",
    ].map((file) =>
      access(new URL(`../public/art/ui/desk-items/${file}`, import.meta.url)),
    ),
    ...[
      "hud-shell-v2.png",
      "hud-sound-on-v2.png",
      "hud-sound-off-v2.png",
    ].map((file) =>
      access(new URL(`../public/art/ui/${file}`, import.meta.url)),
    ),
    ...[
      "workstation-seat-1-v1.png",
      "workstation-seat-2-v1.png",
      "workstation-seat-3-v1.png",
      "workstation-seat-4-v1.png",
    ].map((file) =>
      access(
        new URL(`../public/art/ui/workstations/${file}`, import.meta.url),
      ),
    ),
    access(new URL("../bridge/server.mjs", import.meta.url)),
  ]);
});
