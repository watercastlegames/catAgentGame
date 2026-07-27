"use client";

/**
 * 해변 사무실 사운드 — 원본은 SonFootballerTycoon 저장소에서 그대로 가져왔다.
 *
 *   검수 문서  D:\UnityProjects\testSimulation\SonFootballerTycoon\Docs\
 *              ElevenLabs_키보드_바닷가_고양이_검수_20260727.html
 *   해변 3종   Docs\ElevenLabsSfx_Beach_20260727\
 *   키보드·고양이 Docs\ElevenLabsSfx_20260727\
 *   배경음악   Assets\09.Sounds\SunoCandidates_20260720\TY_Dusk_alt01.mp3
 *
 * 파일명은 원본 그대로 두어 검수 문서와 1:1로 대조된다.
 * CAT_Hiss_Angry_01 은 요청에 따라 쓰지 않는다(복사도 하지 않음).
 */

export const WORLD_AUDIO_SOURCES = {
  music: "/audio/TY_Dusk_alt01.mp3",
  ambience: [
    "/audio/AMB_Beach_LowKey_Gull_Loop_01.mp3",
    "/audio/AMB_Beach_LowKey_Gull_Loop_02.mp3",
    "/audio/AMB_Island_Deserted_Loop_01.mp3",
  ],
  keyboard: "/audio/KBD_Thock_Type_Loop_01.mp3",
  catGreet: "/audio/CAT_Meow_Short_Greet_01.mp3",
  catReport: "/audio/CAT_Meow_Normal_01.mp3",
  catDemand: "/audio/CAT_Meow_Demand_01.mp3",
  catPurr: "/audio/CAT_Purr_Loop_01.mp3",
} as const;

// 해변 3종은 동시에 겹쳐 깔되, 서로 다른 지점에서 시작해야 갈매기가 한꺼번에 울지 않는다.
// (세 파일 모두 15초 루프)
const AMBIENCE_LAYERS = [
  { volume: 0.34, offset: 0 },
  { volume: 0.26, offset: 5.1 },
  { volume: 0.22, offset: 9.7 },
];
const MUSIC_VOLUME = 0.26;
const KEYBOARD_BASE_VOLUME = 0.34;
const KEYBOARD_PER_AGENT_VOLUME = 0.05;
const KEYBOARD_MAX_VOLUME = 0.5;
const KEYBOARD_FADE_IN = 0.25;
const KEYBOARD_FADE_OUT = 0.45;
const PURR_VOLUME = 0.32;
const PURR_DURATION = 5.5;
const PURR_FADE = 0.6;
const CAT_ONE_SHOT_VOLUME = 0.62;
const MASTER_VOLUME = 0.9;
const MASTER_FADE = 0.35;

export type CatCue = "greet" | "report" | "demand" | "purr";

const CAT_CUE_SOURCE: Record<Exclude<CatCue, "purr">, string> = {
  greet: WORLD_AUDIO_SOURCES.catGreet,
  report: WORLD_AUDIO_SOURCES.catReport,
  demand: WORLD_AUDIO_SOURCES.catDemand,
};

type LoopHandle = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export type WorldAudio = ReturnType<typeof createWorldAudio>;

export function createWorldAudio() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let unlocked = false;
  let disposed = false;
  let backgroundStarted = false;
  let typingCount = 0;
  let keyboardLoop: LoopHandle | null = null;
  let purrLoop: LoopHandle | null = null;
  let purrStopTimer: number | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const pending = new Map<string, Promise<AudioBuffer | null>>();

  function ensureContext() {
    if (disposed) return null;
    if (context) return context;
    const Ctor =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = enabled ? MASTER_VOLUME : 0;
    master.connect(context.destination);
    return context;
  }

  function loadBuffer(url: string) {
    const cached = buffers.get(url);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(url);
    if (inFlight) return inFlight;
    const ctx = ensureContext();
    if (!ctx) return Promise.resolve(null);
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`audio ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(url, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        pending.delete(url);
      });
    pending.set(url, request);
    return request;
  }

  function startLoop(buffer: AudioBuffer, volume: number, offset = 0) {
    const ctx = ensureContext();
    if (!ctx || !master) return null;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(master);
    source.start(0, offset % buffer.duration);
    return { source, gain } satisfies LoopHandle;
  }

  function stopLoop(loop: LoopHandle | null, fade: number) {
    if (!loop || !context) return;
    const now = context.currentTime;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
    loop.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    loop.source.stop(now + fade + 0.05);
  }

  function keyboardTargetVolume() {
    if (typingCount <= 0) return 0;
    return Math.min(
      KEYBOARD_MAX_VOLUME,
      KEYBOARD_BASE_VOLUME + (typingCount - 1) * KEYBOARD_PER_AGENT_VOLUME,
    );
  }

  function syncKeyboardLoop() {
    if (!unlocked || !enabled) return;
    const target = keyboardTargetVolume();
    if (target <= 0) {
      if (keyboardLoop) {
        stopLoop(keyboardLoop, KEYBOARD_FADE_OUT);
        keyboardLoop = null;
      }
      return;
    }
    if (!keyboardLoop) {
      void loadBuffer(WORLD_AUDIO_SOURCES.keyboard).then((buffer) => {
        if (!buffer || keyboardLoop || !unlocked || !enabled) return;
        if (keyboardTargetVolume() <= 0) return;
        const loop = startLoop(buffer, 0.0001);
        if (!loop || !context) return;
        keyboardLoop = loop;
        const now = context.currentTime;
        loop.gain.gain.setValueAtTime(0.0001, now);
        loop.gain.gain.linearRampToValueAtTime(
          keyboardTargetVolume(),
          now + KEYBOARD_FADE_IN,
        );
      });
      return;
    }
    if (!context) return;
    const now = context.currentTime;
    keyboardLoop.gain.gain.cancelScheduledValues(now);
    keyboardLoop.gain.gain.setValueAtTime(keyboardLoop.gain.gain.value, now);
    keyboardLoop.gain.gain.linearRampToValueAtTime(target, now + 0.3);
  }

  function startBackgroundLoops() {
    if (backgroundStarted || disposed) return;
    backgroundStarted = true;
    WORLD_AUDIO_SOURCES.ambience.forEach((url, index) => {
      const layer = AMBIENCE_LAYERS[index] ?? AMBIENCE_LAYERS[0];
      void loadBuffer(url).then((buffer) => {
        if (!buffer || !unlocked || disposed) return;
        startLoop(buffer, layer.volume, layer.offset);
      });
    });
    void loadBuffer(WORLD_AUDIO_SOURCES.music).then((buffer) => {
      if (!buffer || !unlocked || disposed) return;
      startLoop(buffer, MUSIC_VOLUME);
    });
  }

  function playPurr() {
    if (purrStopTimer) {
      window.clearTimeout(purrStopTimer);
      purrStopTimer = null;
    }
    const schedule = () => {
      purrStopTimer = window.setTimeout(() => {
        purrStopTimer = null;
        stopLoop(purrLoop, PURR_FADE);
        purrLoop = null;
      }, PURR_DURATION * 1000);
    };
    if (purrLoop) {
      schedule();
      return;
    }
    void loadBuffer(WORLD_AUDIO_SOURCES.catPurr).then((buffer) => {
      if (!buffer || !unlocked || !enabled || purrLoop) return;
      const loop = startLoop(buffer, 0.0001);
      if (!loop || !context) return;
      purrLoop = loop;
      const now = context.currentTime;
      loop.gain.gain.setValueAtTime(0.0001, now);
      loop.gain.gain.linearRampToValueAtTime(PURR_VOLUME, now + PURR_FADE);
      schedule();
    });
  }

  return {
    /** 브라우저 자동재생 정책 때문에 첫 사용자 제스처에서만 실제로 소리가 시작된다. */
    unlock() {
      const ctx = ensureContext();
      if (!ctx) return;
      void ctx.resume();
      if (unlocked) return;
      unlocked = true;
      if (!enabled) return;
      startBackgroundLoops();
      syncKeyboardLoop();
    },
    setEnabled(next: boolean) {
      enabled = next;
      const ctx = ensureContext();
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(
        next ? MASTER_VOLUME : 0.0001,
        now + MASTER_FADE,
      );
      if (next) {
        void ctx.resume();
        if (unlocked) {
          startBackgroundLoops();
          syncKeyboardLoop();
        }
      }
    },
    /** 작업 중인 고양이 수 — 0이면 타건음이 멎고, 여럿이면 조금 두꺼워진다. */
    setTypingCount(count: number) {
      const next = Math.max(0, count);
      if (next === typingCount) return;
      typingCount = next;
      syncKeyboardLoop();
    },
    playCat(cue: CatCue) {
      if (!enabled || !unlocked) return;
      if (cue === "purr") {
        playPurr();
        return;
      }
      const url = CAT_CUE_SOURCE[cue];
      void loadBuffer(url).then((buffer) => {
        const ctx = context;
        if (!buffer || !ctx || !master || !enabled || !unlocked) return;
        const gain = ctx.createGain();
        gain.gain.value = CAT_ONE_SHOT_VOLUME;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain).connect(master);
        source.start();
      });
    },
    /** 탭이 가려지면 배경음까지 멎게 한다. */
    setSuspended(suspended: boolean) {
      const ctx = context;
      if (!ctx) return;
      if (suspended) {
        void ctx.suspend();
        return;
      }
      if (enabled) void ctx.resume();
    },
    /** 승인 대기 차임 등 기존 코드가 쓰던 AudioContext 를 함께 나눠 쓴다. */
    getContext() {
      return ensureContext();
    },
    dispose() {
      disposed = true;
      if (purrStopTimer) window.clearTimeout(purrStopTimer);
      purrStopTimer = null;
      keyboardLoop = null;
      purrLoop = null;
      buffers.clear();
      pending.clear();
      void context?.close().catch(() => undefined);
      context = null;
      master = null;
    },
  };
}
