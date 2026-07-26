# Project communication preferences

- PNG, JPG, HTML, PDF, source code, and other files must always be reported and delivered using a Windows absolute path that includes the drive letter, such as `D:\project\file.png`.
- Never give the user only a relative path when reporting or delivering a file.

# Agent Forest 설치·연결 절차 (AI가 읽고 그대로 실행)

사용자가 이 저장소를 받아 "내 것도 똑같이 세팅해줘"라고 요청하면, 아래 1~8번을 순서대로 실행한다.
사용자에게 터미널 창을 보여주지 않는다 — 명령은 항상 백그라운드로 실행하고 로그 파일로 리다이렉트한다.
각 단계의 성공 판정 기준을 통과하지 못하면 다음 단계로 넘어가지 말고 원인을 스스로 진단·수정한다.

## 1. 선행 조건 확인

1. **Node 버전**
   ```powershell
   $nodeVersion = [version]((node --version) -replace '^v', '')
   $nodeVersion -ge [version]"22.13.0"
   ```
   (`package.json` `engines.node` 기준). `node` 명령 자체가 없거나 22.13.0 미만이면 설치/업그레이드는 시스템 변경이라 자동 실행하지 않는다. 사용자에게 "Node.js 22 이상 설치가 필요합니다 (https://nodejs.org LTS). 설치 후 다시 요청해주세요."라고 알리고 이 항목에서 중단한다.

2. **Codex CLI**
   ```powershell
   Get-Command codex -ErrorAction SilentlyContinue
   ```
   있으면 `codex --version`으로 버전 확인 후 통과. 없으면 전역 설치가 필요하다(7번 금지 사항 참조) — 자동 실행하지 말고 사용자에게 정확한 명령을 제시하고 승인을 구한다: `npm install -g @openai/codex`. 승인 후 실행하고 다시 `Get-Command codex`로 재확인. 승인 없으면 중단.

3. **Codex 로그인**
   ```powershell
   codex login status
   ```
   출력에 `Logged in`이 있으면 통과. 아니면 `codex login`을 실행한다(디바이스 인증 브라우저 창이 뜬다). 이건 시스템 변경이 아니라 사용자 본인 인증이라 AI가 바로 실행해도 되지만, 브라우저 창이 뜨는 유일한 단계이므로 실행 전 "브라우저 창이 열리면 로그인만 해주세요"라고 미리 알린다. 완료 후 `codex login status`로 재확인.

## 2. 설치·빌드·실행 순서

`package.json` 스크립트 기준. 전부 백그라운드 프로세스로 띄우고 로그는 파일로 리다이렉트한다.

1. **의존성 설치**
   ```powershell
   npm install
   ```
   성공 판정: 종료 코드 0, `node_modules` 생성, 출력에 `npm error`/`ERESOLVE` 없음.

2. **PC Companion(bridge) 백그라운드 실행** — 3번(작업 폴더)·4번(연결 코드)에서 만든 값을 이 호출에만 inline env로 넘긴다(영구 등록 금지):
   ```powershell
   $env:CODEX_BRIDGE_WORKSPACE = $workspace        # 3번에서 만든 경로
   $env:AGENT_BRIDGE_PAIRING_CODE = $code           # 4번에서 만든 6자리 코드
   $p = Start-Process -FilePath "npm.cmd" -ArgumentList "run","bridge" `
     -RedirectStandardOutput ".bridge.out.log" -RedirectStandardError ".bridge.err.log" `
     -WindowStyle Hidden -PassThru
   $p.Id | Set-Content ".bridge.pid" -Encoding utf8
   ```
   성공 판정: `.bridge.out.log`에 `[agent-bridge] http://127.0.0.1:4317`로 시작하는 줄이 생기고, `.bridge.err.log`에 `EADDRINUSE`가 없고, `GET http://127.0.0.1:4317/health`가 200을 반환한다.

3. **웹 화면(dev) 백그라운드 실행** — `npm run dev:local`(bridge+dev를 한 프로세스로 묶어 stdio를 그대로 상속함) 대신, 로그와 재시작을 독립적으로 다루기 위해 `npm run dev`를 별도로 띄운다:
   ```powershell
   $p = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" `
     -RedirectStandardOutput ".devserver.out.log" -RedirectStandardError ".devserver.err.log" `
     -WindowStyle Hidden -PassThru
   $p.Id | Set-Content ".devserver.pid" -Encoding utf8
   ```
   성공 판정: `http://localhost:3000`이 최대 20초 폴링 안에 200을 반환한다(첫 vinext/wrangler 콜드스타트는 수 초 걸릴 수 있다).

두 로그·PID 파일(`.bridge.*.log`, `.bridge.pid`, `.devserver.*.log`, `.devserver.pid`)은 이미 `.gitignore`에 등록돼 있다.

## 3. 작업 폴더 (CODEX_BRIDGE_WORKSPACE)

사용자에게 환경변수를 직접 설정하라고 시키지 않는다. AI가 사용자 홈 아래 기본 폴더를 만들고 그 경로를 2번 단계에서 bridge 실행 시 넘긴다.

```powershell
$workspace = Join-Path $env:USERPROFILE "AgentForestWorkspace"
if (-not (Test-Path $workspace)) { New-Item -ItemType Directory -Path $workspace | Out-Null }
```

이 값을 항상 명시적으로 넘긴다 — 아무것도 지정하지 않으면 bridge는 이 저장소 자체(`projectRoot`)를 기본 작업 폴더로 쓰기 때문에(`bridge/server.mjs`의 workspace 기본값), Codex 세션이 Agent Forest 소스코드를 건드릴 위험이 있다. 사용자가 나중에 다른 프로젝트를 지정하고 싶다고 말하면 그때만 `$workspace` 값을 그 경로로 바꿔 다시 2-2번을 실행한다.

## 4. 연결 (페어링, 6자리 코드 재입력 최소화)

목표: 실행할 때마다 새 무작위 코드를 로그에서 찾아 사용자에게 되묻는 일을 없앤다. 코드를 로컬 파일에 고정해두고, AI가 먼저 스스로 페어링 경로를 검증한다.

1. **고정 코드 준비**
   ```powershell
   $pairingFile = ".agent-forest-pairing.json"
   if (Test-Path $pairingFile) {
     $code = (Get-Content $pairingFile -Raw | ConvertFrom-Json).code
   } else {
     $code = "{0:D6}" -f (Get-Random -Minimum 0 -Maximum 999999)
     @{ code = $code } | ConvertTo-Json | Set-Content $pairingFile -Encoding utf8
   }
   ```
   `.agent-forest-pairing.json`은 이미 `.gitignore`에 등록돼 있다(코드는 커밋하지 않는다).

2. 이 `$code`를 2-2번의 `AGENT_BRIDGE_PAIRING_CODE`에 그대로 넣어 bridge를 실행한다.

3. **AI 자체 검증** (사용자 개입 없이, bridge가 health 통과한 뒤):
   ```powershell
   Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4317/v2/pair" `
     -ContentType "application/json" -Body (@{ code = $code } | ConvertTo-Json)
   ```
   응답에 `paired: true`와 `token`이 있으면 페어링 경로 자체가 정상 동작함이 증명된 것이다. 이 token은 이후 `/health`, `/v2/sessions` 같은 자동 점검에만 쓰고 버린다 — bridge는 토큰을 메모리에만 들고 있고(재시작 시 소멸), 브라우저 localStorage에는 AI가 대신 값을 넣어줄 방법이 없으므로 사용자가 딱 한 번 브라우저에서 코드를 입력해야 한다. 코드가 고정돼 있으므로 이후 재실행부터는 매번 새 코드를 찾아 다시 물어볼 필요가 없다(브라우저에 한 번 저장되면 그 이후는 재입력조차 필요 없다).

## 5. 검증

```powershell
npm test
```
`npm run build && node --test`를 실행한다(`tests/*.test.mjs` 전부). 성공 판정: 종료 코드 0.

실패하면 출력에서 실패한 테스트 파일과 원인을 읽고 관련 소스를 고쳐 재실행한다 — 실패를 그대로 보고만 하고 멈추지 않는다. 다만 이번 설치 작업과 무관해 보이는 기존 실패(예: 손대지 않은 기능의 회귀)라면 억지로 고치려 하지 말고 사용자에게 사실대로 알린다.

`npm test`는 bridge/dev 서버를 직접 띄우지 않으므로, 2번에서 이미 띄운 두 프로세스도 함께 확인한다:
- `GET http://127.0.0.1:4317/health` → 200
- `GET http://localhost:3000` → 200

## 6. 흔한 실패 3종과 대처

**1) 포트 충돌 (bridge 4317 / dev 3000)**
증상: `.bridge.err.log`나 `.devserver.err.log`에 `Error: listen EADDRINUSE: address already in use`.
확인: `.bridge.pid` / `.devserver.pid`에 이전 실행 PID가 남아있는지 먼저 본다.
```powershell
Get-Process -Id (Get-Content .bridge.pid) -ErrorAction SilentlyContinue
```
이미 이 프로젝트의 이전 bridge/dev가 살아있고 `/health`(또는 `http://localhost:3000`)가 정상 응답하면 재시작할 필요 없이 그대로 쓴다. 좀비 프로세스라면 그 PID만 정확히 종료 후 재실행한다(관련 없는 프로세스를 추측으로 죽이지 않는다):
```powershell
Stop-Process -Id (Get-Content .bridge.pid) -Force
```

**2) Node 버전 미달**
증상: `npm install`/`npm run build`가 `EBADENGINE` 경고 또는 실패로 `>=22.13.0` 요구를 출력.
대처: 1번 선행 조건 확인으로 되돌아간다. 자동 업그레이드하지 않고 사용자에게 설치를 요청한 뒤 중단.

**3) Codex 미로그인**
증상: `.bridge.out.log`의 시작 줄이 `Codex unavailable`로 끝남 / `/health` 응답의 `available`이 false / `.bridge.out.log`에 `App Server 연결 실패` 줄이 있음.
대처: `codex login status`로 재확인 → 로그아웃 상태면 `codex login` 실행해 브라우저 인증 완료를 요청 → 성공 후 bridge 재실행(2-2번).

## 7. 금지 사항

- 사용자 홈(`%USERPROFILE%`) 밖 파일 생성·수정 금지. 이 저장소 안, 그리고 3번에서 만든 `%USERPROFILE%\AgentForestWorkspace` 같은 사용자 홈 하위 폴더 외에는 손대지 않는다.
- 전역 npm 패키지 설치 금지. Codex CLI 최초 설치(`npm install -g @openai/codex`)를 포함해 전역 설치는 항상 사용자에게 정확한 명령을 보여주고 승인받은 뒤에만 실행한다.
- 시스템 설정 영구 변경 금지. 환경변수는 `setx`나 Windows 시스템 속성으로 영구 등록하지 않고, 매 실행 시 그 프로세스 호출에만 `$env:X = ...`로 넘긴다. PATH·레지스트리·Windows 설정 변경 금지.
- 승인 없는 위험한 명령 실행 금지. `git reset --hard`, 프로젝트 밖 대상의 `Remove-Item -Recurse -Force`, 확인 안 된 PID의 강제 종료(`Stop-Process -Force`) 같은 되돌릴 수 없는 명령은 실행 전 사용자 승인을 받는다.

## 8. 완료 보고 형식

작업이 끝나면 터미널 로그를 그대로 붙여넣지 말고, 다음처럼 짧게 말한다.

성공 예:
> 설치 끝났어요. http://localhost:3000 여기 열어주세요. 처음 연결이면 코드 482913 을 "내 PC 세션 연결"란에 한 번만 입력하면 됩니다.

사용자 개입이 필요해 중단한 경우 예:
> Codex CLI가 없어서 `npm install -g @openai/codex` 를 실행해야 해요. 진행해도 될까요?
> Node가 v18이라 22 이상이 필요해요. https://nodejs.org 에서 LTS 설치 후 다시 말씀해주세요.

파일·로그 경로를 언급할 때는 이 문서 최상단 규칙대로 항상 Windows 절대경로로 알려준다(예: `D:\project\catAgentGame\.bridge.out.log`).
