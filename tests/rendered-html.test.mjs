import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the Agent Forest integration UI", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="ko"/i);
  assert.match(html, /<title>Agent Forest/);
  assert.match(html, /고양이 에이전트에게 업무 맡기기/);
  assert.match(html, /Codex로 실제 실행/);
  assert.match(html, /비용 없는 화면 시연/);
  assert.match(html, /class="world-stage world-stage-3d"/);
  assert.match(html, /2\.5D 해변 사무실 준비 중/);
  assert.match(html, /고양이 자율 행동 · 책상 객체 충돌 회피/);
  assert.match(html, /AUTONOMOUS CAT MOTION ACTIVE/);
  assert.doesNotMatch(html, /\/_vinext\/image/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships local bridge hooks, responsive styles, and 2.5D assets", async () => {
  const [page, world3d, navigation, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/agent-world-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/navigation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /new EventSource/);
  assert.match(page, /127\.0\.0\.1:4317/);
  assert.match(page, /approval\.required/);
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
  assert.match(world3d, /Lowpoly_Cat_Blue\.fbx/);
  assert.match(world3d, /Lowpoly_Cat_Animations_IP\.fbx/);
  assert.match(world3d, /tent-workstation-meshy6-web-v1\.glb/);
  assert.match(world3d, /round-laptop-station-meshy6-web-v1\.glb/);
  assert.match(world3d, /folding-laptop-radio-station-meshy6-web-v1\.glb/);
  assert.match(world3d, /low-monitor-station-meshy6-web-v1\.glb/);
  assert.match(world3d, /palm-tree-meshy6-web-v1\.glb/);
  assert.match(world3d, /camping-supplies-cluster-meshy6-web-v1\.glb/);
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
  assert.match(world3d, /createCodingStationInteractionOverlay/);
  assert.match(world3d, /low-monitor-workstation-live-code-screen/);
  assert.match(world3d, /desk-keycap-1-top-v1\.png/);
  assert.match(world3d, /desk-keycap-2-top-v1\.png/);
  assert.match(world3d, /desk-keycap-3-top-v1\.png/);
  assert.match(world3d, /desk-keycap-4-top-v1\.png/);
  assert.match(world3d, /LOW_MONITOR_STATION_ROTATION_Y = -0\.06/);
  assert.match(world3d, /low-monitor-workstation-interaction-overlay/);
  assert.match(world3d, /createMonitorScreenTexture/);
  assert.match(world3d, /drawMonitorScreen/);
  assert.match(world3d, /kneading\.ts/);
  assert.match(world3d, /CATCODE   UTF-8   RUNNING/);
  assert.match(world3d, /MONITOR_CODE_FRAME_RATE = 8/);
  assert.match(world3d, /nextMonitorScreenFrame/);
  assert.match(world3d, /coding-desk-keycap-\$\{index \+ 1\}-top-texture/);
  assert.doesNotMatch(world3d, /new THREE\.Sprite/);
  assert.doesNotMatch(world3d, /SpriteMaterial/);
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
  assert.match(world3d, /DESK_KNEADING_DURATION_SECONDS = 7/);
  assert.match(world3d, /CODING_DESK_TARGET.*4\.12/);
  assert.match(world3d, /DESK_KNEADING_EXIT_POSITION/);
  assert.match(world3d, /DESK_CONTACT_MARGIN = 0\.2/);
  assert.match(world3d, /isTouchingObstacle/);
  assert.match(world3d, /DESK_KEYCAP_PRESS_DEPTH = 0\.052/);
  assert.match(world3d, /ambientPhase === "kneading"/);
  assert.match(world3d, /animatedDeskKeycaps/);
  assert.match(world3d, /책상 안쪽에 앉아 키캡 꾹꾹이 중/);
  assert.match(world3d, /\|Sitting_Idle/);
  assert.match(world3d, /\|Sitting_idle_2/);
  assert.match(world3d, /\|Sitting_idle_3/);
  assert.match(world3d, /\|Lie_Idle/);
  assert.match(world3d, /\|EatDrink/);
  assert.match(world3d, /AMBIENT_WANDER_POINTS/);
  assert.match(world3d, /AUTONOMOUS_STATUSES/);
  assert.match(world3d, /ambientPhase/);
  assert.match(world3d, /"settling"/);
  assert.match(world3d, /"prewalking"/);
  assert.match(world3d, /AMBIENT_MOVE_SPEED = 0\.46/);
  assert.match(world3d, /TASK_MOVE_SPEED = 1\.35/);
  assert.match(world3d, /const remainingDistance/);
  assert.match(world3d, /stepDistance \/ remainingDistance/);
  assert.doesNotMatch(world3d, /\.moveTowards\(/);
  assert.match(world3d, /걸음을 멈추고 주변을 살피는 중/);
  assert.match(world3d, /몸을 일으키고 산책을 준비하는 중/);
  assert.match(world3d, /해변을 천천히 산책하는 중/);
  assert.match(world3d, /간식을 먹고 우유를 마시는 중/);
  assert.match(world3d, /beach-island-ocean-v4-style-locked\.png/);
  assert.match(world3d, /ocean-water-tile-v1\.png/);
  assert.match(world3d, /extended-ocean-floor/);
  assert.match(world3d, /new THREE\.PlaneGeometry\(42, 42\)/);
  assert.match(world3d, /shore-tide-breathing-v4/);
  assert.match(world3d, /uniform float oceanTideTime/);
  assert.match(world3d, /shoreWaterSignal/);
  assert.match(world3d, /tideBreath/);
  assert.match(world3d, /tideScale = tideBreath \* 0\.014/);
  assert.match(world3d, /surfaceRipple/);
  assert.match(world3d, /shore-water-overlay-v2/);
  assert.match(world3d, /animated-shore-water-overlay/);
  assert.match(world3d, /shoreOverlayWaterSignal/);
  assert.match(world3d, /shorelineScale/);
  assert.match(world3d, /shoreWaterOverlay\.scale\.set/);
  assert.match(world3d, /oceanTexture\.offset\.set/);
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
  assert.match(world3d, /office: new THREE\.Vector3\(-2\.05, 0, -2\.48\)/);
  assert.match(world3d, /createPalmFrondGeometry/);
  assert.match(world3d, /createPalmTree/);
  assert.match(world3d, /createRockCluster/);
  assert.match(world3d, /createCampingSupplyCluster/);
  assert.match(world3d, /createCampingLantern/);
  assert.doesNotMatch(world3d, /createBeachOfficeBench/);
  assert.match(world3d, /createMeshyPropTemplate/);
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
  assert.match(world3d, /specularIntensity = 0\.12/);
  assert.match(world3d, /OutlineEffect/);
  assert.match(world3d, /0x6f5040/);
  assert.match(world3d, /ILLUSTRATION_OUTLINE_THICKNESS = 0\.005/);
  assert.match(world3d, /ILLUSTRATION_OUTLINE_ALPHA = 0\.8/);
  assert.match(world3d, /CHARACTER_HEIGHT = 0\.86/);
  assert.match(world3d, /outlineEffect\.render/);
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
    access(new URL("../public/concept-approval.jpg", import.meta.url)),
    access(new URL("../bridge/server.mjs", import.meta.url)),
  ]);
});
