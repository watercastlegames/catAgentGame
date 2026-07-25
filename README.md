# Agent Forest

내 PC에서 사용하는 Codex 세션을 해변의 고양이 에이전트 이동, 작업, 승인,
완료 상태로 보여주는 웹 인터페이스입니다.

## 현재 구현된 연결 기능

- Codex CLI와 App Server 자동 감지
- 내 PC의 최근 저장 세션 목록 불러오기
- 선택한 세션 읽기·재개
- 선택 세션에서 새 작업 시작
- 진행 중인 작업에 추가 지시 보내기
- 현재 작업 중단
- 명령 실행·파일 변경·추가 권한 승인 요청 처리
- Codex 이벤트를 고양이 이동·작업·보고 상태로 변환
- 브라우저와 PC Companion의 6자리 보안 페어링
- 휴대폰·외부 네트워크용 암호화 클라우드 중계
- 비용 없는 화면 시연

## 사용 방법

Node.js 22 이상과 로그인된 Codex CLI가 필요합니다.

```powershell
npm install
npm run dev:local
```

터미널에 다음과 같이 6자리 연결 코드가 표시됩니다.

```text
[agent-companion] 연결 코드: 123456
```

Agent Forest의 `내 PC 세션 연결` 영역에 코드를 입력하면 최근 Codex 세션이
표시됩니다. 로컬 개발 주소는 기본적으로 `http://localhost:3000`, PC
Companion 주소는 `http://127.0.0.1:4317`입니다.

배포 사이트에서는 같은 6자리 코드를 사용할 수 있습니다. 같은 PC에서는
로컬 연결을 우선 사용하고, 휴대폰이나 외부 네트워크에서는 자동으로 보안
클라우드 중계로 전환합니다. PC Companion은 계속 실행 중이어야 하지만
공유기 포트 포워딩이나 공인 IP 설정은 필요하지 않습니다.

웹 화면과 Companion을 따로 실행할 수도 있습니다.

```powershell
npm run dev
npm run bridge
```

## 연결 설정

다른 프로젝트를 새 세션의 기본 작업 폴더로 사용하려면 Companion 실행 전에
다음을 지정합니다.

```powershell
$env:CODEX_BRIDGE_WORKSPACE = "D:\원하는\프로젝트"
npm run bridge
```

추가 웹 Origin을 허용해야 한다면 쉼표로 구분해 지정합니다.

```powershell
$env:AGENT_BRIDGE_ALLOWED_ORIGINS = "https://example.com,https://another.example.com"
npm run bridge
```

연결 코드를 고정해야 하는 테스트 환경에서는 다음 값을 사용할 수 있습니다.

```powershell
$env:AGENT_BRIDGE_PAIRING_CODE = "123456"
npm run bridge
```

## 구조

```text
Agent Forest Web
        ↕ 로컬 HTTP + SSE 또는 HTTPS 클라우드 중계
bridge/server.mjs (PC Companion)
        ↕ newline JSON-RPC over stdio
Codex App Server
        ↕
내 PC의 저장 세션과 실행 중인 작업
```

- `bridge/codex-app-server-client.mjs`: App Server 프로세스와 JSON-RPC 연결
- `bridge/session-view.mjs`: 민감 경로를 제외한 세션 표시 데이터 생성
- `bridge/server.mjs`: 페어링, 세션 API, SSE, 승인 라우팅
- `bridge/cloud-relay.mjs`: PC의 아웃바운드 HTTPS 동기화와 명령 처리
- `worker/relay.ts`: D1 기반 외부 페어링·명령·이벤트 중계 API
- `bridge/event-mapper.mjs`: Codex 이벤트를 캐릭터 행동으로 변환
- `app/page.tsx`: 세션 선택, 작업 전송, 승인 UI
- `tests/`: 프로토콜, 세션 정보, 이벤트, 렌더링 회귀 테스트

## 검증

```powershell
npm test
```
