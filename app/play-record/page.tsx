"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 배포 전에 플레이 영상만 먼저 공개하려고 만든 녹화 페이지.
 *
 * 게임을 430×932 팝업으로 띄우고, 그 창만 골라 녹화해서
 * 세로 1080×1920 영상으로 저장한다. 다른 창이 섞이지 않게 하려고
 * 팝업을 따로 여는 것이고, 크기를 고정하는 건 SNS 세로 규격에 맞추기 위해서다.
 *
 * MP4 를 지원하는 브라우저(요즘 Chrome·Edge)는 바로 MP4 로 받고,
 * 안 되는 브라우저는 WebM 으로 받은 뒤 변환 명령을 복사해 쓰면 된다.
 */

const STAGE_WIDTH = 430;
const STAGE_HEIGHT = 932;
const OUT_WIDTH = 1080;
const OUT_HEIGHT = 1920;
const COUNTDOWN_SECONDS = 3;

type Phase = "idle" | "arming" | "countdown" | "recording" | "done";

const LENGTHS = [
  { value: 15, label: "15초" },
  { value: 30, label: "30초" },
  { value: 60, label: "60초" },
  { value: 0, label: "직접 중지" },
];

function mimeCandidates(hasAudio: boolean) {
  const mp4 = hasAudio
    ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc3.42E01E,mp4a.40.2"]
    : ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc3.42E01E"];
  mp4.push("video/mp4");
  const webm = hasAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8"];
  webm.push("video/webm");
  return [...mp4, ...webm];
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export default function PlayRecordPage() {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const resultRef = useRef<HTMLVideoElement | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const frameRef = useRef(0);
  const chunksRef = useRef<BlobPart[]>([]);
  const gameWindowRef = useRef<Window | null>(null);
  const resultUrlRef = useRef("");
  const autoStopRef = useRef(0);
  const tickRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState(
    "게임 창을 열고 화면 선택에서 그 창만 고르면 녹화가 시작돼요.",
  );
  const [failed, setFailed] = useState(false);
  const [withAudio, setWithAudio] = useState(false);
  const [length, setLength] = useState(30);
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [resultUrl, setResultUrl] = useState("");
  const [resultType, setResultType] = useState("");
  const [copied, setCopied] = useState(false);

  const say = useCallback((message: string, isError = false) => {
    setStatus(message);
    setFailed(isError);
  }, []);

  const gameUrl = useCallback(() => {
    // /play-record 에서 게임 뿌리로 올라간다. 하위 폴더 배포(미러)에서도 맞게 잡힌다.
    const path = window.location.pathname.replace(/play-record\/?$/, "");
    return new URL(path || "/", window.location.origin).href;
  }, []);

  const stopEverything = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = 0;
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    autoStopRef.current = 0;
    canvasStreamRef.current?.getTracks().forEach((track) => track.stop());
    canvasStreamRef.current = null;
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopEverything();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [stopEverything]);

  function openGameWindow() {
    const existing = gameWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return existing;
    }
    const opened = window.open(
      gameUrl(),
      "agent-forest-capture",
      `width=${STAGE_WIDTH},height=${STAGE_HEIGHT},menubar=no,toolbar=no,location=no,status=no`,
    );
    if (!opened) {
      say("팝업이 막혔어요. 이 페이지의 팝업을 허용한 뒤 다시 눌러 주세요.", true);
      return null;
    }
    gameWindowRef.current = opened;
    return opened;
  }

  /** 고른 화면을 세로 1080×1920 한가운데에 맞춰 다시 그린다. SNS 세로 규격이라 고정한다. */
  function buildFixedStream(source: MediaStream) {
    const preview = previewRef.current;
    if (!preview) return null;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_WIDTH;
    canvas.height = OUT_HEIGHT;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);
      context.fillStyle = "#0d1512";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (!preview.videoWidth || !preview.videoHeight) return;
      const scale = Math.min(
        canvas.width / preview.videoWidth,
        canvas.height / preview.videoHeight,
      );
      const width = Math.round(preview.videoWidth * scale);
      const height = Math.round(preview.videoHeight * scale);
      context.drawImage(
        preview,
        Math.round((canvas.width - width) / 2),
        Math.round((canvas.height - height) / 2),
        width,
        height,
      );
    };

    const stream = canvas.captureStream(30);
    source.getAudioTracks().forEach((track) => stream.addTrack(track));
    draw();
    canvasStreamRef.current = stream;
    return stream;
  }

  function buildRecorder(stream: MediaStream, hasAudio: boolean) {
    for (const type of mimeCandidates(hasAudio)) {
      if (!MediaRecorder.isTypeSupported(type)) continue;
      try {
        return new MediaRecorder(stream, {
          mimeType: type,
          videoBitsPerSecond: 12_000_000,
        });
      } catch {
        /* 다음 후보로 */
      }
    }
    return new MediaRecorder(stream, { videoBitsPerSecond: 12_000_000 });
  }

  function finish() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function start() {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      say(
        "이 브라우저는 화면 녹화를 지원하지 않아요. 최신 Chrome 이나 Edge 에서 열어 주세요.",
        true,
      );
      return;
    }

    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = "";
      setResultUrl("");
    }

    const opened = openGameWindow();
    if (!opened) return;

    setPhase("arming");
    say("화면 선택 창에서 방금 열린 게임 창을 골라 주세요.");

    let capture: MediaStream;
    try {
      capture = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 } },
        audio: withAudio,
      });
    } catch {
      setPhase("idle");
      say("화면 선택을 취소했어요. 다시 시작할 수 있어요.");
      return;
    }

    captureStreamRef.current = capture;
    const preview = previewRef.current;
    if (preview) {
      preview.srcObject = capture;
      await preview.play().catch(() => undefined);
    }

    capture.getVideoTracks()[0]?.addEventListener(
      "ended",
      () => finish(),
      { once: true },
    );

    // 시작 버튼을 누르고 게임 창으로 손이 옮겨갈 시간을 준다.
    setPhase("countdown");
    for (let remain = COUNTDOWN_SECONDS; remain > 0; remain -= 1) {
      setCountdown(remain);
      say(`${remain}초 뒤에 시작해요. 게임 창을 앞으로 옮겨 두세요.`);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (capture.getVideoTracks()[0]?.readyState === "ended") {
        setPhase("idle");
        say("녹화가 시작되기 전에 화면 공유가 끊겼어요.", true);
        stopEverything();
        return;
      }
    }
    setCountdown(0);

    const fixed = buildFixedStream(capture);
    if (!fixed) {
      setPhase("idle");
      say("녹화 화면을 만들지 못했어요.", true);
      stopEverything();
      return;
    }

    const hasAudio = fixed.getAudioTracks().length > 0;
    const recorder = buildRecorder(fixed, hasAudio);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setResultType(type);
      setPhase("done");
      stopEverything();
      const seconds = Math.round(blob.size / 1024 / 1024);
      say(
        type.includes("mp4")
          ? `녹화를 마쳤어요. MP4 로 바로 내려받을 수 있어요. (약 ${seconds}MB)`
          : `녹화를 마쳤어요. 이 브라우저는 WebM 으로 저장돼요. 아래 변환 명령을 쓰면 MP4 가 돼요. (약 ${seconds}MB)`,
      );
    };

    recorder.start(1000);
    setPhase("recording");
    setElapsed(0);
    const startedAt = performance.now();
    tickRef.current = window.setInterval(() => {
      setElapsed((performance.now() - startedAt) / 1000);
    }, 250);
    if (length > 0) {
      autoStopRef.current = window.setTimeout(() => finish(), length * 1000);
      say(`녹화 중이에요. ${length}초 뒤에 저절로 멈춰요.`);
    } else {
      say("녹화 중이에요. 다 찍으면 아래 중지를 눌러 주세요.");
    }
  }

  const isMp4 = resultType.includes("mp4");
  const fileName = isMp4 ? "agent-forest-play.mp4" : "agent-forest-play.webm";
  const ffmpeg =
    "ffmpeg -i agent-forest-play.webm -c:v libx264 -preset slow -crf 20 " +
    "-pix_fmt yuv420p -vf scale=1080:1920 -c:a aac -b:a 128k agent-forest-play.mp4";

  return (
    <>
      <style>{`
        :root { color-scheme: dark; }
        body { margin: 0; background: #101a16; }
        .rec {
          min-height: 100vh;
          padding: 28px 20px 56px;
          box-sizing: border-box;
          color: #eaf3ec;
          font-family: Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif;
        }
        .rec-inner { margin: 0 auto; max-width: 860px; display: grid; gap: 18px; }
        .rec h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
        .rec .lead { margin: 0; color: #9fb6a8; font-size: 14px; line-height: 1.6; }
        .rec-card {
          padding: 18px;
          border: 1px solid rgba(160, 200, 175, 0.22);
          border-radius: 16px;
          background: rgba(20, 34, 28, 0.72);
          display: grid;
          gap: 14px;
        }
        .rec-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .rec-row > label { color: #9fb6a8; font-size: 13px; font-weight: 700; }
        .rec-len { display: flex; gap: 6px; flex-wrap: wrap; }
        .rec-len button {
          padding: 7px 13px; border-radius: 999px; cursor: pointer;
          border: 1px solid rgba(160, 200, 175, 0.3);
          background: transparent; color: #cfe3d6; font-size: 13px; font-weight: 700;
        }
        .rec-len button[aria-pressed="true"] { border-color: #7fd6a4; background: rgba(127, 214, 164, 0.18); color: #eaf3ec; }
        .rec button.primary {
          padding: 11px 20px; border: 0; border-radius: 12px; cursor: pointer;
          background: #7fd6a4; color: #0e1c15; font-size: 15px; font-weight: 900;
        }
        .rec button.ghost {
          padding: 11px 18px; border-radius: 12px; cursor: pointer;
          border: 1px solid rgba(160, 200, 175, 0.32);
          background: transparent; color: #cfe3d6; font-size: 14px; font-weight: 800;
        }
        .rec button:disabled { opacity: 0.45; cursor: not-allowed; }
        .rec-status { margin: 0; font-size: 14px; font-weight: 700; color: #b9d6c4; }
        .rec-status.error { color: #ff9a9a; }
        .rec-stage {
          position: relative; display: grid; place-items: center;
          aspect-ratio: 9 / 16; max-height: 62vh; margin: 0 auto;
          border: 1px solid rgba(160, 200, 175, 0.2); border-radius: 14px;
          background: #0d1512; overflow: hidden;
        }
        .rec-stage video { width: 100%; height: 100%; object-fit: contain; display: block; }
        .rec-stage .hint { color: #6f8a7c; font-size: 13px; padding: 0 20px; text-align: center; }
        .rec-badge {
          position: absolute; top: 10px; left: 10px; padding: 5px 10px; border-radius: 999px;
          background: rgba(255, 90, 90, 0.9); color: #fff; font-size: 12px; font-weight: 900;
        }
        .rec-count {
          position: absolute; inset: 0; display: grid; place-items: center;
          background: rgba(8, 16, 12, 0.62); font-size: 78px; font-weight: 900; color: #eaf3ec;
        }
        .rec pre {
          margin: 0; padding: 12px; border-radius: 10px; overflow-x: auto;
          background: #0a120e; color: #b9d6c4; font-size: 12px; line-height: 1.5;
        }
        .rec ol { margin: 0; padding-left: 18px; color: #9fb6a8; font-size: 13px; line-height: 1.8; }
      `}</style>

      <main className="rec">
        <div className="rec-inner">
          <header>
            <h1>플레이 영상 녹화</h1>
            <p className="lead">
              게임을 세로 창으로 띄우고 그 창만 녹화해 1080×1920 영상으로
              저장해요. 배포 전에 플레이 장면만 먼저 보여줄 때 씁니다.
            </p>
          </header>

          <section className="rec-card">
            <ol>
              <li>아래 <b>녹화 시작</b>을 누르면 게임 창이 새로 열려요.</li>
              <li>화면 선택 창이 뜨면 <b>방금 열린 게임 창</b>만 골라 주세요. 다른 화면을 고르면 그게 그대로 찍혀요.</li>
              <li>3초 뒤에 시작해요. 그 사이에 게임 창을 앞으로 옮겨 두세요.</li>
              <li>다 찍으면 저절로 멈추거나(길이 선택) 중지를 누르면 돼요.</li>
            </ol>

            <div className="rec-row">
              <label htmlFor="rec-length">길이</label>
              <div className="rec-len" id="rec-length">
                {LENGTHS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={length === option.value}
                    disabled={phase === "recording" || phase === "countdown"}
                    onClick={() => setLength(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rec-row">
              <label htmlFor="rec-audio">
                <input
                  id="rec-audio"
                  type="checkbox"
                  checked={withAudio}
                  disabled={phase === "recording" || phase === "countdown"}
                  onChange={(event) => setWithAudio(event.target.checked)}
                />{" "}
                소리도 같이 담기 (화면 선택 창에서 &quot;시스템 오디오&quot;를 켜야 해요)
              </label>
            </div>

            <div className="rec-row">
              <button
                type="button"
                className="primary"
                disabled={phase === "arming" || phase === "countdown" || phase === "recording"}
                onClick={() => void start()}
              >
                {phase === "done" ? "다시 녹화" : "녹화 시작"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={phase !== "recording"}
                onClick={() => finish()}
              >
                중지
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => openGameWindow()}
              >
                게임 창만 열기
              </button>
              {phase === "recording" && <span>{formatClock(elapsed)}</span>}
            </div>

            <p className={failed ? "rec-status error" : "rec-status"} role="status">
              {status}
            </p>
          </section>

          <div className="rec-stage">
            <video
              ref={previewRef}
              muted
              playsInline
              style={{ display: resultUrl ? "none" : "block" }}
            />
            <video
              ref={resultRef}
              controls
              playsInline
              src={resultUrl || undefined}
              style={{ display: resultUrl ? "block" : "none" }}
            />
            {!resultUrl && phase === "idle" && (
              <span className="hint">
                아직 녹화 전이에요. 시작하면 여기에서 지금 찍히는 화면이 보여요.
              </span>
            )}
            {phase === "recording" && <span className="rec-badge">● REC</span>}
            {countdown > 0 && <span className="rec-count">{countdown}</span>}
          </div>

          {resultUrl && (
            <section className="rec-card">
              <div className="rec-row">
                <a className="primary" href={resultUrl} download={fileName}
                   style={{ textDecoration: "none", display: "inline-block" }}>
                  {isMp4 ? "MP4 내려받기" : "WebM 내려받기"}
                </a>
                {!isMp4 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(ffmpeg).then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                  >
                    {copied ? "복사했어요" : "MP4 변환 명령 복사"}
                  </button>
                )}
              </div>
              {!isMp4 && <pre>{ffmpeg}</pre>}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
