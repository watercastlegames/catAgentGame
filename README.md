# Agent Forest

현재 PC에 로그인된 Codex 작업을 숲속 고양이 캐릭터의 이동, 작업, 보고,
승인 상태로 보여주는 로컬 연동 프로토타입입니다.

## 현재 확인된 기능

- Codex CLI 자동 탐지 및 버전 표시
- `codex exec --json` JSONL 이벤트 수신
- Codex 이벤트를 `General → 담당 부서 → 보고 대기열 → 개인 사무실` 흐름으로 변환
- 브라우저에 실시간 SSE 이벤트 전송
- General, Coding, Design, Music 부서 선택
- 비용 없는 화면 시연
- 실제 Codex 작업 실행
- 결과 보고와 확인·재검토·반려 UI
- 모바일 반응형 화면
- 모델의 비공개 추론을 화면에 노출하지 않는 이벤트 필터

## 로컬 실행

Node.js 22 이상과 로그인된 Codex CLI가 필요합니다.

```powershell
npm install
npm run dev:local
```

기본 주소:

- 웹 화면: `http://localhost:3000`
- Codex 브리지: `http://127.0.0.1:4317`

3000번 포트가 사용 중이면 화면 서버가 3001번 등 다음 빈 포트를 사용합니다.

웹 화면과 브리지를 따로 실행할 수도 있습니다.

```powershell
npm run dev
npm run bridge
```

## 안전 설정

실제 Codex 실행은 기본적으로 `read-only` 샌드박스를 사용합니다. 이 단계에서는
연동 검증이 목적이므로 브라우저에서 파일 수정 권한을 주지 않습니다.

다른 작업 폴더를 읽기 전용으로 연결하려면 브리지를 시작하기 전에 다음 값을
지정할 수 있습니다.

```powershell
$env:CODEX_BRIDGE_WORKSPACE = "D:\원하는\프로젝트"
npm run bridge
```

`CODEX_BRIDGE_SANDBOX`를 변경하면 권한 범위가 달라지므로 제품화 전 별도 승인
정책을 구현해야 합니다.

## 구조

```text
현재 로그인된 Codex
        ↓ JSONL
bridge/server.mjs
        ↓ 정규화된 SSE 이벤트
React Agent Forest 화면
        ↓
캐릭터 이동 · 작업 · 보고 · 승인
```

- `app/page.tsx`: Agent Forest 화면과 상호작용
- `app/globals.css`: 원화 기반 반응형 시각 디자인
- `bridge/server.mjs`: 로컬 HTTP/SSE 서버와 Codex 실행기
- `bridge/event-mapper.mjs`: Codex 이벤트를 캐릭터 행동으로 변환
- `tests/`: 렌더링과 이벤트 변환 테스트

## 테스트

```powershell
npm test
```

현재 원화는 캐릭터와 배경이 합쳐진 이미지이므로 이 프로토타입에서는 원화를
배경으로 사용하고 활성 에이전트 마커를 위에 움직입니다. 다음 제작 단계에서 빈
배경, 부서 가구, 개별 고양이 스프라이트를 분리하면 원화 스타일 그대로 걷기와
작업 애니메이션을 구현할 수 있습니다.
