import Link from "next/link";

export const metadata = {
  title: "이용약관·개인정보·라이선스 — Agent Forest",
  description: "Agent Forest 1단계 무료 배포판의 이용 조건과 데이터 처리 안내",
};

export default function LegalPage() {
  return (
    <main className="legal-page">
      <header>
        <span>AGENT FOREST · PHASE 1</span>
        <h1>무료 배포판 안내</h1>
        <p>시행일 2026년 7월 26일 · 이 페이지에는 결제나 가격 정보가 없습니다.</p>
        <Link href="/">해변 사무실로 돌아가기</Link>
      </header>

      <article id="terms">
        <span className="section-kicker">TERMS</span>
        <h2>이용약관</h2>
        <p>
          Agent Forest는 개인 PC에서 실행되는 Codex 세션의 상태를 웹의 2.5D
          사무실로 보여주고, 사용자가 원격으로 작업·승인·중단 결정을 전달하도록
          돕는 무료 1단계 소프트웨어입니다.
        </p>
        <ul>
          <li>실제 명령은 사용자가 선택한 PC와 Codex 세션의 권한·샌드박스 설정을 따릅니다.</li>
          <li>승인 화면의 내용과 대상 파일을 확인한 뒤 사용자가 직접 결정해야 합니다.</li>
          <li>서비스는 현 상태로 제공되며, 중요한 작업은 별도 백업 후 사용해야 합니다.</li>
          <li>불법 행위, 타인의 시스템에 대한 무단 접근, 안전장치 우회에 사용할 수 없습니다.</li>
          <li>이 버전에는 유료 상품, 결제 버튼, 가격 표시, 확률형 콘텐츠가 없습니다.</li>
        </ul>
      </article>

      <article id="privacy">
        <span className="section-kicker">PRIVACY</span>
        <h2>개인정보 및 작업 데이터 처리</h2>
        <p>
          계정 가입, 이름, 이메일, 결제정보를 요구하지 않습니다. 무료 화면 시연은
          브라우저 안에서만 실행되며 AI API를 호출하지 않습니다.
        </p>
        <dl>
          <div>
            <dt>로컬 연결</dt>
            <dd>
              브라우저는 연결 토큰과 선택한 세션·좌석·꾸미기 값을 localStorage에
              저장합니다. 최근 활동 40건도 같은 브라우저에 저장되며 라디오의
              “기록 지우기”로 삭제할 수 있습니다. PC Companion은 토큰 원문이 아니라 SHA-256 해시만
              <code>.agent-forest-pairing.json</code>에 저장합니다.
            </dd>
          </div>
          <div>
            <dt>외부 네트워크 중계</dt>
            <dd>
              사용자가 외부 연결을 선택하면 세션 요약, 작업 이벤트, 승인 정보와
              명령이 암호화된 HTTPS 중계를 통과합니다. 브라우저 세션은 최대
              30일이고 이벤트·완료 명령은 24시간 초과분을 정리하도록 설계되어
              있습니다.
            </dd>
          </div>
          <div>
            <dt>알림</dt>
            <dd>
              승인 알림은 사용자가 허용한 경우에만 브라우저 또는 운영체제 표준
              알림으로 표시됩니다. 알림 권한을 거부해도 기본 기능은 사용할 수
              있습니다.
            </dd>
          </div>
          <div>
            <dt>삭제</dt>
            <dd>
              브라우저 사이트 데이터를 지우고 PC의 로컬 페어링 파일을 삭제하면
              저장된 연결 정보가 제거됩니다. 외부 중계를 중지하려면 Companion을
              종료하거나 환경설정에서 중계를 끌 수 있습니다.
            </dd>
          </div>
        </dl>
      </article>

      <article id="license">
        <span className="section-kicker">LICENSE</span>
        <h2>PolyForm Noncommercial 1.0.0</h2>
        <p>
          Agent Forest 자체 코드는 개인 연구·실험·학습·취미와 비영리 조직의
          비상업적 목적에 사용할 수 있습니다. 상업적 이용이나 재판매에는 별도
          허락이 필요합니다. 정확한 조건은 저장소의 <code>LICENSE.md</code> 원문이
          우선합니다.
        </p>
        <p>
          React, Next.js, Three.js 등 제3자 구성요소는 각각의 라이선스를 따릅니다.
          자세한 목록은 <code>THIRD-PARTY-NOTICES.md</code>에 있습니다.
        </p>
        <a
          href="https://polyformproject.org/licenses/noncommercial/1.0.0"
          target="_blank"
          rel="noreferrer"
        >
          공식 라이선스 원문 확인
        </a>
      </article>

      <footer>
        <Link href="/">Agent Forest로 돌아가기</Link>
      </footer>
    </main>
  );
}
