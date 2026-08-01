# Agent Forest · PM Worker 최신 웹 조회 인수인계

작성일: 2026-08-01 (Asia/Seoul)  
주 작업 저장소: `D:\soccerstarWebSource\GameCreator\catAgentGame`  
연동 저장소: `D:\soccerstarWebSource\projectManager`

이 문서는 다른 AI가 이번 작업을 그대로 이어받기 위한 실행 가능한 인수인계 문서다.
비밀번호, API 키, SFTP 토큰 같은 비밀값은 의도적으로 적지 않았다.

---

## 1. 최종 목표와 현재 결론

### 사용자 목표

Agent Forest의 `PM Worker AI`가 다음과 같은 시의성 높은 질문에도 최신 인터넷 자료를 조회해서 답하도록 만드는 것.

- 오늘의 뉴스와 시장 브리핑
- 삼성전자·SK하이닉스 같은 최신 주가
- 환율·금리·날씨·행사·나들이·맛집·경기 일정
- 답변에 조회 기준 시각과 실제 출처 URL 포함

### 현재 상태

운영 배포와 실제 공개 경로 검증까지 완료됐다.

- 공개 주소: `https://agent-forest-raccoon.sminia82.chatgpt.site`
- 실제 공개 API: `POST /api/pm-worker/chat`
- 최신 정보 질문은 웹 검색 중계로 자동 분기된다.
- 한국어 검색어가 손상되지 않도록 UTF-8 Base64로 운반한다.
- 답변은 줄바꿈, 조회 시각, 출처 URL을 유지한다.
- 웹 검색 중계 프로세스가 꺼져 있으면 공개 Agent Forest 중계가 부트스트랩을 호출하고 1회 재시도한다.
- 공개 사이트에서 중계 프로세스를 의도적으로 종료한 뒤에도 첫 질문으로 자동 복구되는 것을 검증했다.

최종 운영 검증 질문에서는 삼성전자와 SK하이닉스가 모두 인식됐고, 두 종목의 최근 거래 값·조회 기준일·네이버 금융 URL·줄바꿈이 반환됐다.

> 주의: 증권 거래소급 실시간 틱 데이터가 아니다. 각 공개 출처가 제공하는 최근 거래 시각 기준 데이터다.

---

## 2. 최초 장애 원인

### 2.1 기존 Worker에 웹 도구가 허용되지 않음

운영 5201 Worker는 `claude -p`를 사용하지만 기존 명령에는 `WebSearch`와 `WebFetch`가 허용되지 않았다.
그래서 모델은 최신 자료를 직접 확인하지 못하고 “실시간 조회 불가”라고 답했다.

### 2.2 직접 Anthropic API 경로 사용 불가

직접 Anthropic Worker도 점검했지만 현재 서버에 설정된 API 키가 401 `invalid key`를 반환했다.
따라서 유료 API 검색 도구에 의존하지 않고, 공개 웹 자료를 수집해서 기존 인증된 5201 Worker에 근거 자료로 전달하는 방식을 채택했다.

### 2.3 Classic ASP에서 한국어 폼 입력이 `?`로 손상됨

`application/x-www-form-urlencoded`로 한국어를 직접 전송하면 운영 Classic ASP에서 다음처럼 손상됐다.

```text
오늘 삼성전자와 SK하이닉스 → ?? ????? SK?????
```

ASP의 `CodePage=65001`, `Response.CodePage=65001`, UTF-8 헤더만으로 해결되지 않았다.
최종 해결은 다음과 같다.

1. Agent Forest Worker가 원문을 UTF-8 바이트로 만든다.
2. Base64 문자열인 `message_b64`로 전송한다.
3. Classic ASP는 Base64를 변형하지 않고 JSON에 그대로 실어 5202로 전달한다.
4. Python 웹 중계가 Base64를 UTF-8 원문으로 복원한다.

### 2.4 `/api` IIS 권한에서는 프로세스 실행이 불안정함

`/ProjectManager/api/hikami.asp`가 직접 Python 프로세스를 시작하는 방식은 운영 IIS 권한 경계에서 실패했다.
반면 ProjectManager 루트 ASP에서는 같은 시작 명령이 정상 작동했다.

최종 복구 흐름은 다음과 같다.

```text
공개 Agent Forest Worker
  → PM API 호출
  → 응답 body.code === 503 감지
  → 인증 헤더로 /ProjectManager/relay-bootstrap.asp 호출
  → 루트 ASP가 5202 웹 중계 시작
  → 원래 PM 질문 1회 재시도
```

---

## 3. 최종 아키텍처

```text
브라우저의 고양이 대화창
  ↓ JSON { prompt, sessionId }
Agent Forest Sites Worker
  /api/pm-worker/chat
  - 최신 정보 질문 판별
  - message_b64 생성
  - web_search=1 추가
  ↓
ProjectManager Classic ASP
  /api/hikami.asp?action=chat
  - 인증 확인
  - 신규/기존 세션 처리
  - 웹 질문이면 5202로 전달
  ↓
Hi Kami Web Relay :5202
  - message_b64 → UTF-8 복원
  - 네이버 금융 종목 스냅샷
  - Google News RSS
  - Bing RSS
  - 수집 결과를 증거 프롬프트로 구성
  ↓
기존 Hi Kami Worker :5201
  - 제공된 증거만 요약
  ↓
5202가 출처 제목과 전체 URL을 최종 답변에 강제 추가
  ↓
ASP → Sites Worker → 브라우저
```

### 포트

| 포트 | 역할 | 상태 |
|---|---|---|
| 5201 | 기존 Hi Kami / ProjectManager 작업 Worker | 기존 운영 유지 |
| 5202 | 최신 공개 웹 자료 수집 중계 | 신규, 필요 시 자동 복구 |

---

## 4. 변경 파일

### Agent Forest 저장소

#### `worker/pm-worker-relay.ts`

- `needsCurrentWeb(prompt)` 추가
- 뉴스·주가·환율·날씨·행사·추천 등 현재 정보 키워드 판별
- `utf8Base64()`로 한국어 원문 보호
- `message_b64`와 `web_search=1` 전송
- PM API가 body의 `code: 503`을 반환하면 `relay-bootstrap.asp` 호출
- 부트스트랩 성공 후 원래 질문을 1회 재시도

#### `tests/pm-worker-companion.test.mjs`

- 최신 웹 질문 분기 검증
- Base64 한국어 운반 검증
- 503 부트스트랩 및 재시도 검증

### ProjectManager 저장소

#### `api/hikami.asp`

- `web_search=1` 또는 최신 정보 키워드로 5202 분기
- `message_b64` 전달
- 5201 일반 요청에는 기존 메시지·히스토리 유지
- Worker JSON 요청의 UTF-8 바이트 전송 지원
- JSON의 `\n`, `\r`, `\t`를 실제 줄바꿈으로 복원
- 최신 답변 시스템 지침에 조회 시각과 전체 URL 요구

#### `worker/hikami_web_relay.py`

- 공개 웹 수집 중계의 핵심 구현
- `message_b64`를 UTF-8로 복원
- 네이버 모바일 증권 JSON API에서 종목 값 수집
- Google News RSS와 Bing RSS 수집
- 기존 5201 Worker에 증거 기반 요약 요청
- 5201이 ProjectManager 작업으로 잘못 분류하면 자체 폴백 답변 사용
- 최종 답변 뒤에 최대 4개 출처 URL 강제 추가
- 현재 버전 문자열: `2026.08.01-web-b64`

#### `relay-bootstrap.asp`

- 인증된 요청만 허용
- 5202 상태 확인
- 중계가 없으면 시작 스크립트 실행
- 시작 후 `{"ready":true}` 반환

#### `worker/start_hikami_web_relay.cmd`

- Windows Python 3.12로 5202 중계 시작
- UTF-8 실행 환경 지정
- 로그는 서버의 `hikami_web_relay.log`에 기록

#### `hikami_worker.py`

- 향후 5201 재시작 시 사용할 Claude CLI `WebSearch,WebFetch` 허용 경로 추가
- 현재 운영의 핵심 경로는 5202 공개 검색 중계이므로 5201 재시작은 필요하지 않다.

#### `worker/hikami_worker.py`

- 직접 Anthropic API의 서버 웹 검색 도구 경로 추가
- 현재 API 키가 유효하지 않아 운영 기본 경로로 사용하지 않는다.

#### `tests/test_hikami_web_search.py`

- 웹 질문 감지
- Claude 도구 권한
- 출처 보존
- Base64 전달·복원
- UTF-8 JSON 전송
- 부트스트랩 구성 검증

---

## 5. 배포 상태

### Agent Forest

- GitHub 저장소: `watercastlegames/catAgentGame`
- 브랜치: `main`
- 배포 소스 커밋: `f343310431dcfad7bb205866131b2256e305e091`
- 커밋 제목: `feat: add current web search to PM worker`
- Sites 프로젝트 ID: `appgprj_6a633d2841748191a10bedb1f7a603a1`
- Sites 버전: `71`
- 운영 주소: `https://agent-forest-raccoon.sminia82.chatgpt.site`

기존 `docs/cat-agent-meta-design-20260728.html`에는 사용자 미커밋 변경이 남아 있다.
이 파일을 되돌리거나 현재 작업과 함께 커밋하지 말 것.

### ProjectManager

- 로컬 커밋: `7cceea9 feat: add sourced current web answers`
- 운영 ASP/Python/CMD는 SFTP 업로드 및 해시 검증 완료
- 운영 물리 루트: `C:\Service\soccerstar\web\autodev\ProjectManager`
- ProjectManager 저장소는 기존부터 매우 많은 사용자 변경과 미추적 파일이 있다.
- 로컬 `main`은 `origin/main`보다 여러 커밋 앞서 있다.
- `git reset --hard`, 강제 푸시, 전체 변경 스테이징을 절대 하지 말 것.
- 위 변경 파일만 별도로 다뤄야 한다.

---

## 6. 검증 결과

### Agent Forest 전체 검증

```powershell
cd D:\soccerstarWebSource\GameCreator\catAgentGame
npm test
```

결과:

- vinext 운영 빌드 성공
- 테스트 `111/111` 통과
- PM Worker 관련 테스트 `6/6` 통과

### ProjectManager 검증

```powershell
cd D:\soccerstarWebSource\projectManager
python -m py_compile hikami_worker.py worker\hikami_worker.py worker\hikami_web_relay.py
python -m unittest tests.test_hikami_web_search -v
```

결과:

- Python 구문 검사 성공
- 웹 검색 테스트 `13/13` 통과

### 공개 운영 경로 검증

다음 공개 경로를 실제 호출했다.

```text
POST https://agent-forest-raccoon.sminia82.chatgpt.site/api/pm-worker/chat
```

검증 항목:

- `provider === "project-manager-worker"`
- 삼성전자 인식
- SK하이닉스 인식
- 최근 거래 값 포함
- 네이버 금융 출처 URL 포함
- URL 4개 반환
- 실제 줄바꿈 포함
- 세션 ID 반환

5202를 의도적으로 종료한 뒤 같은 공개 API를 다시 호출했을 때도 약 40초 안에 중계가 자동 복구되고 답변이 반환됐다.

---

## 7. 테스트할 때 반드시 주의할 점

### PowerShell Here-String을 Python 표준입력으로 넘길 때 한국어가 `?`로 바뀔 수 있음

이번 진단 중 아래 형태는 콘솔 코드페이지 때문에 Python 문자열의 한국어가 이미 `?`가 된 상태로 실행됐다.

```powershell
@'
q = '오늘 삼성전자'
'@ | python -
```

이 경우 구현이 실패한 것처럼 보이지만 테스트 입력 자체가 손상된 것이다.

안전한 방법:

1. UTF-8 파일에 테스트 코드를 저장해서 실행한다.
2. Python 문자열에 `\uXXXX` 이스케이프를 사용한다.
3. 브라우저나 공개 JSON API 경로로 검증한다.

### 비밀값 출력 금지

- `X-HiKami-Key` 값
- SFTP 호스트 계정과 비밀번호
- Sites 소스 저장소 임시 토큰
- Anthropic API 키

기존 배포 도구에서 설정을 읽더라도 값 자체를 터미널이나 문서에 출력하지 말 것.

---

## 8. 현재 한계

1. 네이버 금융의 구조화된 종목 스냅샷은 현재 `삼성전자`, `SK하이닉스` 별칭부터 적용했다.
2. 그 밖의 종목은 Google News·Bing 검색 결과 위주로 답할 수 있다.
3. 공개 RSS 검색 결과에는 질문과 관련성이 낮은 문서가 일부 섞일 수 있다.
4. Google News URL은 원문 URL이 아니라 RSS 리디렉션 URL일 수 있다.
5. 5202는 현재 Flask 개발 서버로 실행된다. 트래픽 증가 시 Waitress 같은 Windows용 WSGI 서버로 교체하는 것이 좋다.
6. 현재 정보 질문은 일반 대화보다 오래 걸린다. 보통 20~70초, 중계 자동 복구가 포함되면 더 걸릴 수 있다.
7. 데이터는 출처가 표시한 시각 기준이며 금융 거래를 위한 실시간 시세 보증이 아니다.

---

## 9. 권장 후속 작업 순서

### 우선순위 1 · 구조화된 국내 종목 확대

- 사용자 질문에서 종목명이나 6자리 종목 코드를 추출
- 종목명 → 코드 검색 경로 추가
- 네이버 금융 구조화 데이터 결과를 뉴스 결과보다 항상 먼저 배치
- 종목별 조회 시각과 장 상태를 명확하게 표시

### 우선순위 2 · 검색 관련성 개선

- 질문에서 불필요한 조사와 요청 문구 제거
- 뉴스, 날씨, 여행, 경기, 환율 등 도메인별 검색어 생성
- 날짜를 무조건 붙이는 대신 질문 유형에 따라 기간을 조정
- 중복 기사와 무관한 결과 제거

### 우선순위 3 · 출처 품질 개선

- Google News 리디렉션 URL을 가능하면 원문 기사 URL로 해석
- 공식 기관·거래소·기상청·기업 IR 등 1차 출처 우선
- 답변 본문의 사실마다 대응 출처 번호를 붙이는 방식 검토

### 우선순위 4 · 서비스 운영 안정화

- Flask 개발 서버를 Waitress 서비스로 교체
- 서버 부팅 시 5202를 자동 시작하는 작업 스케줄러 또는 Windows 서비스 검토
- `/health`에 검색 공급자별 상태와 마지막 성공 시각 추가
- 타임아웃 및 재시도 횟수 관측 지표 추가

### 우선순위 5 · UI 개선

- 최신 정보 검색 중에는 고양이 작업 상태에 `자료 찾는 중` 단계를 이미지로 표현
- 출처 URL을 대화창에서 누를 수 있는 링크 카드로 표현
- 답변이 오래 걸릴 때 중간 상태 문구를 순환 표시

---

## 10. 다음 AI의 시작 체크리스트

1. 이 문서와 두 저장소의 `AGENTS.md`를 먼저 읽는다.
2. 두 저장소에서 `git status --short`를 실행하고 사용자 변경을 보존한다.
3. 공개 사이트에서 일반 대화와 최신 정보 질문을 각각 한 번 검증한다.
4. 5202 상태 이상이면 공개 Agent Forest 경로로 최신 질문을 보내 자동 복구부터 확인한다.
5. 변경 전 Agent Forest `npm test`와 ProjectManager 웹 검색 테스트를 실행한다.
6. 변경 파일만 선택적으로 스테이징한다.
7. 운영 배포 후에는 공개 주소의 실제 `/api/pm-worker/chat`까지 검증한다.
8. 최종 보고에는 내부 로그·테스트 파일·배포 패키지를 나열하지 않고 공개 주소와 사용자 결과만 우선 전달한다.

---

## 11-A. 2026-08-01 오후 후속 작업 기록 (v2)

이 문서의 9절 권장 후속 작업을 이어받아 처리한 결과다. ProjectManager 로컬 커밋 `7dfa416`.

### 완료된 것 (전부 운영 배포·검증 완료)

1. **우선순위 1 — 종목 확대**: 네이버 증권 자동완성(`m.stock.naver.com/front-api/search/autoComplete`)으로
   임의 종목명·6자리 코드를 해석한다. 에코프로·두산에너빌리티 등 하드코딩에 없던 종목 실측 확인.
   구조화 스냅샷은 항상 뉴스보다 먼저 배치되고 장 상태(장중/장마감)를 한국어로 표시한다.
2. **우선순위 2 — 관련성**: 요청 문구·조사 제거(`clean_query`), 도메인 감지(주가/날씨/환율/스포츠/나들이),
   Google News `when:1d`/`when:7d` 연산자, 제목 중복 제거, 토큰 겹침 관련성 필터.
   실측: 삼성전자 질문에 ESPN 대학농구가 출처로 섞이던 문제 제거 확인.
3. **우선순위 3 — 출처 품질**: 구형 Google News URL은 base64 디코드로 원문 복원(신형 `AU_yqL` ID는
   JS 전용 페이지라 복원 불가 — 리디렉션 URL 그대로 두되 브라우저에서는 정상 이동).
   본문 사실마다 `[n]` 인용을 지시하고, 출처 목록 번호를 증거 번호와 1:1로 맞췄다(결과 자체를 4건으로 상한).
   1차 출처 도메인(krx/kma/bok/dart 등) 우선 배치.
4. **우선순위 4 — 안정화**: `/health`에 공급자별 성공/실패/최근시각 통계, waitress 지원(requirements에 고정,
   미설치 시 Flask 폴백+경고 로그), 루프백 전용 바인딩, 인증된 `/admin/restart`,
   **`relay-restart.asp`(신규)** — 배포 후 구버전 프로세스를 강제 교체한다.
   `EnsureWebRelay`는 대기 없는 헬스 6연타(무의미)에서 부트스트랩 3회 재시도로 교체,
   `hikami.asp`에 `Server.ScriptTimeout = 300` 추가(IIS 기본 90초로는 콜드스타트 예산 부족).
   부팅 자동시작은 `worker/register_hikami_web_relay_task.cmd`를 **서버에서 사장님이 직접 1회 실행**해야
   한다(원격 실행 불가). 파이썬을 직접 띄우지 않고 부트스트랩 ASP를 찔러 프로세스 소유 계정을 IIS와 맞춘다.
5. **한국어 인코딩 근본 보강**: `hikami.asp`가 `Request.Form` 대신 원시 바이트(`Request.BinaryRead`)를
   직접 UTF-8로 복원한다(`RawFormDict`/`UrlDecodeUtf8`, CodePage 65001에서 `Chr()` 금지·`ChrW()` 사용).
   **`message_b64` 없이 `message`만 보내는 구형 클라이언트도 한국어가 깨지지 않는다** — 직접 호출 실측 확인.
6. 테스트 13 → **40개** 전부 통과. 적대적 검증에서 나온 blocker(ScriptTimeout)·major 5건 반영 완료.

### ⚠ 검증 도구 함정 — `curl`로 한국어를 테스트하면 거짓 실패가 난다 (중요)

2026-08-01 오후, 공개 API가 한국어 질문에 "메시지가 깨져서…"로 답해 **Sites 배포가 구버전으로 롤백됐다고
오진했다. 사실이 아니었다.** 배포는 정상이고 전 구간이 제대로 동작한다.

진짜 원인은 **테스트에 쓴 `curl` 자체**였다. Windows Git Bash에서

```bash
curl -d '{"prompt":"오늘 삼성전자 주가 알려줘"}'   # ← 셸이 한국어를 U+FFFD로 파괴한 뒤 전송
```

인자의 한국어가 콘솔 코드페이지를 거치며 치환 문자(U+FFFD)로 바뀐 채 나간다.
서버는 받은 그대로(이미 깨진 값) 처리했을 뿐이다. 7절이 경고한 PowerShell Here-String 함정과 같은 계열이다.

**증거** — ASP에 임시 진단을 넣어 Worker가 실제로 보낸 본문을 확인한 결과:

| 보낸 방법 | ASP가 받은 본문 |
|---|---|
| `curl -d '…한국어…'` | `message=DIAGPROBE+%EF%BF%BD%EF%BF%BD%EF%BF%BD…` ← 이미 U+FFFD |
| Python `requests(json=…)` | `message=DIAGPROBE+%EA%B3%A0%EC%96%91…&message_b64=RElBR1BST0JF…` ← 정상 |

Python 경로에서는 **`message_b64`와 `web_search`가 정상적으로 함께 전송된다** —
즉 배포된 Worker는 `f343310`(v71) 최신 빌드가 맞다. 재배포는 필요 없었다.

**한국어 검증은 반드시 UTF-8이 보장되는 방법으로 할 것.** 브라우저, 또는:

```python
requests.post(URL, json={"prompt": "오늘 삼성전자 주가 알려줘", "sessionId": ""}, timeout=200)
```

이 방법으로 11절 판정 기준을 재실행해 **전 항목 통과**를 확인했다(2026-08-01):
한국어 온전 / 삼성전자·SK하이닉스 구분 / 조회 기준 16:10 KST 명시 / 실제 출처 URL 4개 /
문단 줄바꿈 / 사실별 `[n]` 인용. 원달러 환율 질문도 출처 4개와 함께 정상.

### 참고 — `https://sidak.kr/autodev/GameCreator/catAgentGame/`

이 주소도 배포돼 있다(2026-07-31). 다만 게임 본체가 아니라 **`index.html` 한 장짜리 리다이렉트 문패**로,
meta refresh와 `location.replace`로 `agent-forest-raccoon.sminia82.chatgpt.site`로 넘긴다.
서버 전체를 훑어도 `catAgent`/`agent-forest` 산출물은 이 문패와 5202 PID 메모 파일뿐이다.
게임은 Cloudflare Worker + D1 위에서 돌기 때문에 IIS 정적 호스팅으로 대체할 수 없다.

### 이번에 겪은 운영 사고 기록 (재발 방지 장치 포함)

- **구버전 좀비 5202**: 배포된 파일은 최신인데 며칠 전 뜬 구버전 프로세스가 계속 응답하고 있었다.
  `relay-bootstrap.asp`는 "없으면 시작"만 해서 교체가 불가능했다 → `relay-restart.asp`가 이를 해결한다
  (정상종료 → wmic 강제종료 → 시작 → **버전 문자열까지 확인** 후 응답, 구버전 잔존 시 409).
- 5202가 죽어 있으면 웹 질문이 5201로 새서 "웹 검색 권한이 필요한데…" 거절이 그대로 나갔다
  → 중계의 `is_project_manager_detour`가 권한 거절 문구도 잡아 폴백하도록 보강했다.

## 11. 정상 동작 판정 기준

다음 질문에 모두 만족하면 정상이다.

```text
오늘 삼성전자와 SK하이닉스의 최신 주가와 관련 뉴스를 검색하고,
조회 시각과 출처 URL을 함께 알려줘.
```

필수 조건:

- 질문의 한국어가 손상되지 않는다.
- 두 종목을 모두 구분한다.
- 값의 기준 날짜 또는 시간을 말한다.
- 확인되지 않은 현재 값을 추측하지 않는다.
- 최소 1개 이상의 실제 HTTP 출처 URL이 있다.
- `nn` 문자열이 아니라 실제 문단 줄바꿈으로 표시된다.
- 응답 완료 후 고양이가 다시 자유 행동 상태로 돌아간다.

