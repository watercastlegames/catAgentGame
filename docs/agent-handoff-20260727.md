# Agent Forest 작업 인계 — 2026-07-27

대상: 이 저장소(`D:\soccerstarWebSource\GameCreator\catAgentGame`)를 이어받는 다른 에이전트.
현재 브랜치 `main`, 마지막 커밋 `58d98ba Use linear switch sounds and shrink keycap menu`.
**아래 내용은 전부 미커밋 상태**(working tree)다. 커밋은 사용자가 지시할 때만 한다.

---

## 0. 한 줄 요약

이름표가 외곽선에 갉히던 문제를 렌더 패스 분리로 고쳤고, SonFootballerTycoon 저장소에서 만든
ElevenLabs 효과음 8종 + Suno 배경음악 1곡을 이 웹앱에 실제로 연결했고,
고양이 스타일 15종을 한 화면에 세우는 `/cats` 진열대를 새로 만들었다.
`npx tsc --noEmit` · `npm run lint` · `npm test` 18/18 통과, 개발서버 `http://localhost:3001/` 기동 확인.
`/cats` 는 헤드리스 크로미움 스크린샷으로 실제 렌더까지 눈으로 확인했다(사운드는 청감 확인 못 함).

---

## 1. 미커밋 변경 목록

```
 M app/agent-world-3d.tsx        마커(이름표·비콘) 렌더 분리 + 책상 위 이동 오프셋
 M app/globals.css               키캡 메뉴 캔버스 내부 고정 + .sound-toggle + 진열대 스타일
 M app/page.tsx                  레거시 HUD 차단 플래그 + 사운드 디렉터 + /cats 링크
 M package.json                  test 스크립트 탐색 범위 축소
 M public/audio/ATTRIBUTION.txt  신규 사운드 출처 기록
 M tests/rendered-html.test.mjs  위 전부에 대한 소스 검증 추가
?? app/world-audio.ts            신규 — Web Audio 사운드 디렉터
?? app/cat-styles.ts             신규 — 고양이 스타일 15종 목록
?? app/cat-style-gallery.tsx     신규 — 스타일 진열대 (three.js)
?? app/cats/page.tsx             신규 — /cats 라우트
?? app/cat-shot/page.tsx         신규 — 스틸 촬영 페이지(style/url/tex/fat/anim/half 파라미터)
?? app/cat-inspect/page.tsx      신규 — FBX 실측 페이지(정점·뼈·트랙·바운딩박스)
?? app/cat-body.ts               신규 — fattenCat(), 몸통만 부풀리는 체형 조정
?? scripts/build-cat-style-doc.mjs  신규 — 스틸 15장을 박아 스타일 검수 HTML 생성
?? scripts/build-cat-body-doc.mjs   신규 — 체형 검수 HTML 생성
?? cat-styles-review-20260727.html  신규 — 스타일 검수 문서 881KB
?? cat-body-review-20260727.html    신규 — 체형 검수 문서 813KB
?? public/audio/*.mp3            신규 9개 (아래 2장 표)
?? public/models/PolyArt/.../Lowpoly_Cat_{15종}.fbx        신규 스타일 모델 2.6MB
?? docs/  문서 전부 이 폴더로 옮김(2026-07-27)
```

---

## 2. 사운드 — 무엇을 어디서 가져왔나

원본은 **전부 SonFootballerTycoon 저장소**에 있던 것을 그대로 복사했다(재생성·재인코딩 없음).
검수 문서: `D:\UnityProjects\testSimulation\SonFootballerTycoon\Docs\ElevenLabs_키보드_바닷가_고양이_검수_20260727.html`

| public/audio 파일명 (원본명 유지) | 원본 경로 | 쓰임 |
|---|---|---|
| `AMB_Beach_LowKey_Gull_Loop_01.mp3` | `Docs\ElevenLabsSfx_Beach_20260727\` | 해변 앰비언스 레이어 1 |
| `AMB_Beach_LowKey_Gull_Loop_02.mp3` | `Docs\ElevenLabsSfx_Beach_20260727\` | 해변 앰비언스 레이어 2 |
| `AMB_Island_Deserted_Loop_01.mp3` | `Docs\ElevenLabsSfx_Beach_20260727\` | 해변 앰비언스 레이어 3 |
| `KBD_Thock_Type_Loop_01.mp3` | `Docs\ElevenLabsSfx_20260727\` | 작업 중 타건 루프 |
| `CAT_Meow_Short_Greet_01.mp3` | `Docs\ElevenLabsSfx_20260727\` | 업무 접수·분석, 고양이 클릭 |
| `CAT_Meow_Normal_01.mp3` | `Docs\ElevenLabsSfx_20260727\` | 보고·완료 |
| `CAT_Meow_Demand_01.mp3` | `Docs\ElevenLabsSfx_20260727\` | 승인 대기(조르는 울음) |
| `CAT_Purr_Loop_01.mp3` | `Docs\ElevenLabsSfx_20260727\` | 고양이 클릭 후 5.5초 골골 |
| `TY_Dusk_alt01.mp3` | `Assets\09.Sounds\SunoCandidates_20260720\` | 배경음악 루프 |

**`CAT_Hiss_Angry_01.mp3` 는 사용자 지시로 제외** — 복사하지 않았고 코드에서도 참조하지 않는다.
테스트가 이걸 강제한다(`assert.doesNotMatch(worldAudio, /CAT_Hiss_Angry_01\.mp3/)`).
파일명을 원본 그대로 둔 이유는 검수 문서와 1:1 대조를 위해서다. **이름을 바꾸지 말 것.**

---

## 3. `app/world-audio.ts` — 사운드 디렉터

HTMLAudioElement 가 아니라 **Web Audio(AudioContext + AudioBufferSourceNode)** 로 짰다.
이유는 셋: 루프 이음새가 안 생김, 게인 램프로 페이드가 됨, 여러 층을 한 마스터로 묶을 수 있음.

```
master(0.9) ─┬─ ambience ×3   loop, gain 0.34 / 0.26 / 0.22, 시작 offset 0 / 5.1 / 9.7초
             ├─ music         loop, gain 0.26   (TY_Dusk_alt01)
             ├─ keyboard      loop, gain 0.34 + 0.05×(작업중-1), 최대 0.5, 페이드 0.25/0.45초
             ├─ purr          loop, gain 0.32, 5.5초 뒤 페이드 아웃
             └─ cat one-shot  gain 0.62
```

- 해변 3종은 **동시에 겹쳐 깐다.** 시작 offset 을 다르게 준 건 세 파일 모두 15초 루프라
  같은 지점에서 시작하면 갈매기가 한꺼번에 우는 게 티 나기 때문이다.
- 노출 API: `unlock()` `setEnabled(bool)` `setTypingCount(n)` `playCat(cue)` `setSuspended(bool)` `getContext()` `dispose()`
- `getContext()` 는 기존 `playBlockedChime`(승인 대기 차임, 오실레이터 합성)이 쓰던
  AudioContext 를 대체한다. **AudioContext 는 앱 전체에 하나뿐**이다. 새로 만들지 말 것.
- 자동재생 정책: `unlock()` 이 불리기 전에는 아무 소리도 나지 않는다.
  `page.tsx` 가 `pointerdown` `keydown` `touchstart` 최초 1회에 호출한다.
- 탭이 가려지면 `visibilitychange` → `setSuspended(true)` 로 컨텍스트째 정지한다.

## 4. `app/page.tsx` — 트리거 배선

| 트리거 | 소리 |
|---|---|
| 런타임 상태 → `queued` / `briefing` | greet (짧은 인사) |
| 런타임 상태 → `reporting` / `completed` | report (기본 야옹) |
| 런타임 상태 → `waiting_approval` | demand (조르는 울음) |
| `status === "working"` 인 고양이 수 | 타건 루프 볼륨 (0이면 정지) |
| 3D 월드에서 고양이 클릭(`onSeatClick`) | greet + purr |

- 매핑 상수는 `CAT_CUE_BY_STATUS`. **상태 전이 순간에만** 운다 —
  `catCueStatusRef`(threadId → 직전 상태)로 비교하고, `catCuePrimedRef` 가 첫 렌더를 막아
  복원된 상태 때문에 페이지 열자마자 울어대는 일이 없게 했다.
- `moving` `idle` `failed` 는 의도적으로 무음이다. 실패음은 하악질밖에 없었는데 그건 금지됐다.
- 무료 데모(`runFreeDemo`)가 queued→moving→working→reporting→completed 를 돌리므로
  브리지 연결 없이도 전체 사운드를 다 들어볼 수 있다.

## 5. 사운드 토글

`.sound-toggle` — 월드 캔버스 우상단 원형 버튼. 인라인 SVG 스피커, `aria-pressed` 로 상태 표시,
`hud-fade` 를 물려 유휴 4초 뒤 HUD와 같이 사라진다. 선택은 `localStorage["agent-forest-audio-v1"]`
(`"on"` / `"off"`)에 남는다. 기본값 켜짐(단 첫 제스처 전까지는 어차피 무음).

---

## 5.5 고양이 스타일 진열대 `/cats` (신규)

월드는 `Lowpoly_Cat_Blue.fbx` **하나만** 쓰고 있었다. 같은 팩에 스타일이 15종 더 있는데
아무 데서도 볼 수 없어서, **월드는 그대로 두고** 전부 세워 두는 페이지만 새로 만들었다
(사용자 결정: "갤러리만" — 월드 고양이 배정은 하지 않음).

```
app/cat-styles.ts          목록 15종 + 경로 헬퍼. "use client" 없음 (이유는 아래)
app/cat-style-gallery.tsx  three.js 진열대 (클라이언트)
app/cats/page.tsx          /cats 라우트 (서버 컴포넌트)
public/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_{15종}.fbx   총 2.6MB
```

원본: `D:\UnityProjects\testSimulation\agentForest\Assets\PolyArt\Animals\Cats\FBX\`
팩의 `Lowpoly_Cat_All`(데모 씬 통짜)과 `Animations_IP/RM`(애니메이션 전용)은 스타일이 아니라 제외.
텍스처는 이미 있던 `PolyArt_Cats_color.png` 와 **바이트 단위로 동일**(MD5 확인)해서 새로 넣지 않았다.
팔레트 아틀라스 한 장을 15종이 UV 위치만 달리해 공유한다.

함정 두 개 — 둘 다 실제로 밟고 고쳤다:

1. **`"use client"` 모듈의 export 를 서버 컴포넌트에서 세면 0이 나온다.**
   처음엔 `CAT_STYLES` 를 갤러리 컴포넌트에 두고 `app/cats/page.tsx` 에서 `.length` 를 찍었더니
   제목이 "고양이 스타일 **0종**"으로 렌더됐다. 클라이언트 모듈의 export 는 서버에서 실제 값이
   아니라 참조로 바뀐다. → 목록을 `app/cat-styles.ts`(클라이언트 지시자 없음)로 분리.
   테스트가 이걸 지킨다(`assert.doesNotMatch(catStyles, /^"use client"/m)`).
2. **줄 간격은 화면에서 `sin(카메라 고도)` 만큼만 벌어진다.** 처음 고도 34.5°·간격 1.75 로 놨더니
   `1.75 × sin34.5° = 0.99` 인데 고양이+이름표 높이는 `1.35 × cos34.5° = 1.11` 이라 뒷줄이
   앞줄을 덮었다. → 고도 약 45°(`camera.position (0, 8.6, 8.6)`), `CELL_DEPTH 2.2`, `CELL_WIDTH 1.8`.

카메라 프레이밍은 상수로 때려박지 않고 **씬 바운딩박스 8개 꼭짓점을 카메라 공간으로 넣어** 직교
프러스텀을 계산한다(`frameCamera()`). 모델이 하나씩 도착할 때마다 다시 재므로 로딩 중에도 안 잘린다.
이름표는 6장의 오버레이 패스 기법을 그대로 쓴다(전용 레이어 + `clearDepth`).
카메라가 고정이라 빌보드는 매 프레임 돌릴 필요 없이 생성 시 `label.quaternion.copy(camera.quaternion)` 한 번.

애니메이션은 안 붙였다 — `Lowpoly_Cat_Animations_IP.fbx` 가 14MB라 진열대 하나 때문에 받게 하긴 아깝다.
대신 각자 제자리에서 천천히 돈다(`TURNTABLE_SPEED`, 시작 각도는 인덱스마다 어긋나게).

진입: 메인 화면 활동 기록 하단 링크(`고양이 스타일 전체 보기`) 또는 직접 `/cats`.

**검수 문서도 따로 있다** — `docs/cat-styles-review-20260727.html` (880KB, 저장소 루트).
개발서버 없이 더블클릭으로 열리는 자체 완결 문서다. 스타일 15종을 실제로 렌더한 스틸이
base64 로 박혀 있고, 카드마다 한글 이름·웹 경로·원본 절대경로(복사 버튼)·파일 크기가 붙어 있다.
팔레트 아틀라스 한 장을 15종이 공유한다는 설명과, 팩에서 뺀 3개(All/Animations_IP/RM) 표도 들어 있다.

다시 만들려면:

```powershell
npm run dev                                        # 3001
# 스타일마다 한 장씩 (app/cat-shot/page.tsx 가 촬영 페이지)
chrome.exe --headless=new --disable-gpu --use-gl=swiftshader --enable-unsafe-swiftshader `
  --hide-scrollbars --default-background-color=00000000 --window-size=520,520 `
  --virtual-time-budget=20000 --screenshot=tmp\cat-shots\Sphynx.png `
  "http://localhost:3001/cat-shot?style=Sphynx"
node scripts/build-cat-style-doc.mjs               # 기본 입력 tmp/cat-shots
```

크로미움은 `%LOCALAPPDATA%\ms-playwright\chromium-1200\chrome-win64\chrome.exe` 에 캐시돼 있다
(playwright 패키지는 없고 브라우저 바이너리만 있음 — 직접 실행하면 스크린샷이 찍힌다).
`--user-data-dir` 을 임시 폴더로 지정하지 않으면 두 번째 실행부터 스크린샷이 안 나오는 경우가 있다.

촬영 페이지에서 밟은 함정: `renderer.setSize(w, h, false)` 로 두면 캔버스에 CSS 크기가 안 붙어
픽셀비율(2배)만큼 커진 채 창을 넘친다 — 스크린샷에 고양이 머리만 잡힌다. 세 번째 인자를 빼야 한다.
또 **FBX 안에 적힌 텍스처 경로는 브라우저에서 풀리지 않는다.** `material.map` 이 비면
`PolyArt_Cats_color.png` 를 직접 물려 줘야 스타일별 색이 나온다(진열대·촬영 페이지 둘 다 그렇게 한다).

## 5.6 체형 조사 — 통통한 고양이 (조사·프로토타입만, 미적용)

"고양이가 너무 날씬하다, 도톰한 건 없나"에 대한 답. 문서: `docs/cat-body-review-20260727.html` (813KB).
조사용 페이지 `app/cat-inspect/page.tsx`(`/cat-inspect`)에서 FBX를 직접 열어 실측했다.

**실측 결과 (전부 숫자로 확인한 것)**

| 항목 | 값 |
|---|---|
| PolyArt 15종 몸통 폭 | 0.130~0.149 — 최대 차이 **15%**, 사실상 같은 체형 |
| 폭 ÷ 길이 | 0.227 (날씬) |
| 모프 타깃 | **0개** — 체형 슬라이더 없음 |
| 메시 동일 여부 | **다르다.** 정점 8,844~9,528, 좌표 해시 기준 14종이 서로 다름(Red=Simple만 동일) |
| 뼈 | 36개 (`Spine_base`, `spine_02`, `spine_03`, `hip_*`, `leg_*`, `foot_*`, `claw_*`, `Helper_*` …) |
| 애니메이션 클립 | 68개, 트랙 종류별 position 2,516 / quaternion 2,516 / **scale 2,516** |

**→ 먼저 만든 스타일 문서의 "메시는 15종이 모두 동일" 서술은 틀렸다. 실측으로 바로잡아 재생성했다.**
`app/cat-styles.ts`·`app/cats/page.tsx` 문구도 같이 고쳤다.

**체형을 바꾸는 세 가지 중 채택안**

1. 모델 전체 비균등 스케일 — 기각. 다리·머리까지 굵어져 "가로로 눌린 고양이"가 된다.
2. 몸통 뼈 스케일 — **기각**. 클립 68개가 전부 `.scale` 트랙을 갖고 있어 믹서가 매 프레임 1로 덮어쓴다.
   쓰려면 클립 68개의 스케일 트랙을 직접 고쳐야 한다.
3. **바인드 포즈 정점을 몸통 가중치만큼 부풀리기 — 채택.** `app/cat-body.ts` 의 `fattenCat(model, 1.45)`.
   스키닝 전 정점을 건드리므로 애니메이션과 충돌하지 않는다. 각 정점이 몸통 뼈에서 받는
   스킨 가중치만큼만 부풀고(다리·머리·꼬리는 그대로), 가로로 퍼진 만큼 세로로는 0.45배만 퍼진다.
   `Walk_F`·`Caress_sitting` 포즈로 렌더해 스키닝이 안 깨지는 것까지 확인했다.

**아직 월드에 적용하지 않았다.** 사용자가 배율(1.25/1.45/1.7)을 고르면
`app/agent-world-3d.tsx` 의 고양이 로딩 직후 한 줄 넣으면 된다. 테스트가 미적용 상태를 지킨다
(`assert.doesNotMatch(world3d, /fattenCat/)`) — 적용할 때 이 단언도 같이 지워야 한다.

**다른 팩의 통통한 고양이** — `D:\UnityProjects\testSimulation\SonFootballerTycoon\Assets\Project Data\Game\Models\Animals\Cat_1~5.fbx`
(텍스처는 같은 프로젝트 `Textures\Animals_Atlas.png`). 폭÷길이 0.377로 확실히 둥글지만:
정점 2,262 · **뼈 15개** · 내장 클립 0개(애니는 `Animations\Animals\A_Cat_Idle.fbx`·`A_Cat_Walk.fbx` 둘뿐) ·
FBX 안 텍스처 경로가 남의 PC 바탕화면 psd로 깨져 있어 아틀라스를 직접 물려야 한다 ·
5종은 메시 완전 동일(색만 다름). **리그가 달라 지금 68클립을 못 쓴다** — 꾹꾹이·타이핑 연출이 전부 날아간다.
그래서 채택하지 않았다. 조사할 때 `public/models/_probe/` 로 임시 복사했다가 지웠으니, 다시 보려면 위 경로에서 복사하면 된다.

## 6. 이름표가 외곽선에 갉히던 문제 (고침)

증상: 고양이 이름표 위로 외곽선이 지나가 지저분함. `renderOrder` 를 240까지 올리고
`depthTest:false` 를 줬는데도 안 고쳐졌다.

원인: `three/addons/effects/OutlineEffect.js` 는 **패스가 2번**이다.

```js
renderer.render(scene, camera);      // 1패스: 본편 — 여기서 이름표가 그려짐
this.renderOutline(scene, camera);   // 2패스: autoClear=false 로 외곽선을 덧칠
```

외곽선은 이름표가 이미 칠해진 화면 **위에 나중에** 그려진다. 1패스 내부 정렬을 아무리 만져도
2패스를 막을 수 없다. → 마커만 전용 레이어로 빼고, 외곽선까지 끝난 뒤 깊이를 비우고 따로 그린다.

```js
// agent-world-3d.tsx
const WORLD_LAYER = 0;
const MARKER_OVERLAY_LAYER = 1;

marker.traverse((object) => { object.layers.set(MARKER_OVERLAY_LAYER); });  // createAgentMarker 끝

camera.layers.set(WORLD_LAYER);
outlineEffect.render(scene, camera);        // 마커는 두 패스에서 아예 빠짐
camera.layers.set(MARKER_OVERLAY_LAYER);
scene.background = null;                     // ★ 없으면 두 번째 render 가 화면 전체를 지운다
renderer.autoClear = false;
renderer.clearDepth();
renderer.render(scene, camera);              // 이름표·비콘만 최상단
scene.background = previousBackground;
renderer.autoClear = previousAutoClear;
camera.layers.set(WORLD_LAYER);
```

- `scene.background = null` 이 필수인 이유: `WebGLBackground` 는 배경이 Color 면
  `forceClear = true` 로 색버퍼를 다시 지운다. OutlineEffect 도 같은 이유로 이렇게 한다.
- 이 프로젝트는 그림자 맵을 안 쓴다(`renderer.shadowMap.enabled` 기본 false)므로
  패스가 하나 늘어도 그림자 재계산 비용은 없다.
- **덤**: 이전 기록에 남아 있던 "뒤쪽 고양이 이름표가 앞쪽 고양이를 덮는다" 트레이드오프는
  사라졌다. 이름표는 `transparent:true` 라 오버레이 패스에서 먼→가까운 순으로 정렬돼 그려진다.
  카메라 거리순 `renderOrder` 재계산은 이제 필요 없다.
- 새로 씬에 추가하는 오브젝트는 기본 레이어 0에 있으므로 신경 쓸 게 없다.
  **최상단에 띄우고 싶은 게 생기면** 레이어 1로 보내면 된다(단 그 오브젝트는 외곽선을 못 받는다).

## 7. 같은 파일의 다른 미커밋 변경 (이전 세션 산출물)

- `SEAT_DESK_MARKER_OFFSETS` — 작업 중이면 이름표가 머리 위에서 **모니터 위로** lerp 이동.
  z 값은 `SEAT_WORLD_POSITIONS` 에서 계산했다(seat-1 −1.17 / seat-2 −0.70 / seat-3 −1.20 / seat-4 −1.36).
  좌석 배치를 바꾸면 이 4개도 다시 계산해야 한다. 계산식은 `워크스테이션 좌표 − 대기지점 좌표`.
- `.keycap-menu` 를 `position: fixed` → `absolute`, `80vw` → `80%` 로 바꿔 3D 캔버스 안에 가뒀고
  `.world-stage { min-height: calc(100svh - 16px) }` 로 맞췄다.
- `page.tsx` 의 `SHOW_LEGACY_OVERLAYS = false` — 옛 헤더·툴바·데모쉘을 숨긴다.
  키캡 메뉴 4키만 남기는 방향이고, 지우지 않고 플래그로 묶어뒀다.

## 8. 테스트 스크립트 함정 (고침)

`npm test` 가 `node --test` 를 인자 없이 돌려서 **빌드가 `tmp/deploy-<hash>/` 에 떨군 옛 스냅샷의
테스트까지 같이 실행**하고 있었다. 스냅샷이 쌓일수록 같은 테스트가 2배·4배로 실행되고,
편집 도중 찍힌 스냅샷이 섞이면 지금 코드와 무관하게 빨간불이 났다.

```diff
-"test": "npm run build && node --test",
+"test": "npm run build && node --test \"tests/*.test.mjs\""
```

진짜 테스트는 `tests/*.test.mjs` 8개 파일 **18개**다. 36이나 72가 나오면 스냅샷을 같이 돌린 것이다.
`tmp/` 는 gitignore 대상이라 지워도 되지만 이번엔 건드리지 않았다.

---

## 9. 검증 방법

```powershell
npx tsc --noEmit -p tsconfig.json   # 통과
npm run lint                        # 통과 (react-hooks/set-state-in-effect 규칙 엄격 — 주의)
npm test                            # 18/18 통과 (빌드 포함)
npm run dev                         # 3000 사용 중이면 3001 로 뜬다
```

`tests/rendered-html.test.mjs` 는 **소스 문자열 검사**가 대부분이다.
`app/world-audio.ts` 의 상수명·파일명·`source.loop = true`·`decodeAudioData`,
`page.tsx` 의 `CAT_CUE_BY_STATUS` `setTypingCount` `playCat("greet")` `playCat("purr")`,
`globals.css` 의 `.sound-toggle`, 오버레이 패스 순서 정규식까지 잡고 있으니
리팩터링하면 테스트도 같이 고쳐야 한다.

## 10. 남은 일 / 확인 못 한 것

1. **실제 청감 확인을 못 했다.** 코드·네트워크(9개 mp3 전부 200 audio/mpeg)·빌드는 확인했지만
   브라우저에서 직접 들어보지 않았다. 볼륨 밸런스(특히 타건음 0.34가 앰비언스에 묻히는지),
   해변 3중 레이어가 과한지는 사람이 들어봐야 한다. 상수는 `world-audio.ts` 상단에 모아뒀다.
1.5 **월드 고양이는 여전히 Blue 하나다.** 진열대만 만들라는 결정이었다. 나중에 좌석·부서별로
   다른 스타일을 쓰려면 `CAT_MODEL_URL` 대신 `catStyleModelUrl(styleId)` 로 좌석마다 로드하면 된다
   (애니메이션 FBX는 지금처럼 한 번만 받아 `SkeletonUtils.clone` 대상에 공유).
2. 타건음이 "작업 중" 전체에 대해 **한 트랙**이다. 좌석별 위치에서 나게 하려면 PannerNode 로
   좌석 좌표를 물려야 하는데, 카메라가 직교 + 궤도라 팬 계산을 따로 해야 한다.
3. 완료 파티클·라디오 램프 같은 기존 연출에는 아직 소리가 없다.
4. `docs/canvas-agent-change-log.html` 은 6장 내용과 어긋난다(`depthTest:false` 로 해결했다고 적혀 있고,
   해소된 트레이드오프가 남아 있음). 사용자에게 갱신 여부를 물어둔 상태.
5. `docs/canvas-agent-design-spec.html` 과 실제 코드 차이 3건(좌석 매핑 seat-2가 로우 모니터,
   중앙 배치안 미적용, 이미 구현된 티켓들)은 그대로 남아 있다.
