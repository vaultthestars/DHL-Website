import { ensureAudioReady } from "./audioPlayback";

type MespeakCallback = (success: boolean, id?: number, stream?: ArrayBuffer) => void;

declare global {
  interface Window {
    meSpeak?: {
      loadVoice: (voice: string, callback?: (success: boolean, message?: string) => void) => void;
      speak: (
        text: string,
        options?: Record<string, unknown>,
        callback?: MespeakCallback
      ) => number;
      stop: (id?: number) => number;
      resetQueue: () => void;
      setVolume: (volume: number) => number;
      setDefaultVoice: (voice: string) => void;
      isVoiceLoaded: (voice: string) => boolean;
      canPlay: () => boolean;
      unlockAudio: (event?: Event) => void;
      getRunMode: () => string;
      restartWithInstance: () => void;
    };
  }
}

const MESPEAK_BASE = `${import.meta.env.BASE_URL}mespeak/`;
const MESPEAK_SCRIPT = `${MESPEAK_BASE}mespeak.js`;
const MESPEAK_VOICE = "en/en-us";

let loadPromise: Promise<boolean> | null = null;
let speakSession = 0;
let activeAudio: HTMLAudioElement | null = null;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

const unlockMespeakAudio = (): void => {
  try {
    window.meSpeak?.unlockAudio({ returnValue: true } as Event);
  } catch {
    // Ignore unlock failures.
  }
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const loadVoice = (meSpeak: NonNullable<Window["meSpeak"]>): Promise<boolean> =>
  new Promise((resolve) => {
    if (meSpeak.isVoiceLoaded(MESPEAK_VOICE)) {
      meSpeak.setDefaultVoice(MESPEAK_VOICE);
      resolve(true);
      return;
    }
    const timeout = window.setTimeout(() => resolve(false), 15000);
    meSpeak.loadVoice(MESPEAK_VOICE, (success) => {
      window.clearTimeout(timeout);
      if (success) {
        meSpeak.setDefaultVoice(MESPEAK_VOICE);
      }
      resolve(Boolean(success));
    });
  });

export const ensureMespeakReady = async (): Promise<boolean> => {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        await loadScript(MESPEAK_SCRIPT);
      } catch {
        return false;
      }
      const meSpeak = window.meSpeak;
      if (!meSpeak) {
        return false;
      }
      meSpeak.setVolume(1);
      await wait(400);
      let voiceLoaded = await loadVoice(meSpeak);
      if (!voiceLoaded && meSpeak.getRunMode() === "worker") {
        meSpeak.restartWithInstance();
        await wait(400);
        voiceLoaded = await loadVoice(meSpeak);
      }
      await ensureAudioReady();
      unlockMespeakAudio();
      return voiceLoaded;
    })();
  }
  return loadPromise;
};

const stopActiveAudio = (): void => {
  if (!activeAudio) {
    return;
  }
  activeAudio.onended = null;
  activeAudio.onerror = null;
  activeAudio.pause();
  activeAudio.src = "";
  activeAudio = null;
};

export const stopMespeak = (): void => {
  speakSession += 1;
  stopActiveAudio();
  const meSpeak = window.meSpeak;
  if (!meSpeak) {
    return;
  }
  meSpeak.stop();
  meSpeak.resetQueue?.();
};

const synthesizeLine = (
  line: string,
  session: number,
  pitch: number
): Promise<ArrayBuffer | null> =>
  new Promise((resolve) => {
    const meSpeak = window.meSpeak;
    if (!meSpeak || session !== speakSession) {
      resolve(null);
      return;
    }

    const utteranceId = meSpeak.speak(
      line,
      {
        speed: 150,
        pitch,
        amplitude: 100,
        rawdata: true,
      },
      (success, _id, stream) => {
        if (session !== speakSession) {
          resolve(null);
          return;
        }
        if (!success || !stream) {
          resolve(null);
          return;
        }
        resolve(stream);
      }
    );

    if (utteranceId === 0) {
      resolve(null);
    }
  });

const playWavBuffer = (stream: ArrayBuffer, session: number): Promise<void> =>
  new Promise((resolve) => {
    if (session !== speakSession) {
      resolve();
      return;
    }

    stopActiveAudio();
    const blob = new Blob([stream], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeAudio = audio;

    const finish = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) {
        activeAudio = null;
      }
      resolve();
    };

    audio.onended = () => {
      if (session === speakSession) {
        finish();
      }
    };
    audio.onerror = () => {
      finish();
    };

    void audio.play().catch(() => {
      finish();
    });
  });

const speakLine = async (line: string, session: number, pitch: number): Promise<void> => {
  if (session !== speakSession) {
    return;
  }
  unlockMespeakAudio();
  const stream = await synthesizeLine(line, session, pitch);
  if (!stream || session !== speakSession) {
    return;
  }
  await playWavBuffer(stream, session);
};

export type SpeakLyricsOptions = {
  /** MeSpeak pitch per lyric line (default 50). */
  pitches?: number[];
};

export const speakLyrics = async (
  lines: string[],
  options: SpeakLyricsOptions = {}
): Promise<void> => {
  const parts = lines.map((line) => line.trim()).filter(Boolean);
  if (parts.length === 0) {
    return;
  }

  stopMespeak();
  const session = speakSession;
  await ensureMespeakReady();
  if (session !== speakSession) {
    return;
  }
  unlockMespeakAudio();

  for (let index = 0; index < parts.length; index += 1) {
    if (session !== speakSession) {
      return;
    }
    const pitch = options.pitches?.[index] ?? 50;
    await speakLine(parts[index], session, pitch);
  }
};
