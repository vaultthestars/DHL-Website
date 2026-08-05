import { type ReactNode, useCallback, useEffect } from "react";
import { PlayProvider, usePageData, usePlayContext } from "@playhtml/react";
import { playhtmlPathname } from "./runtime";
import { createInitialGameState, DEFAULT_PLAYBACK_SPEED, normalizePlaybackSpeed, PLAYHTML_GAME_KEY, PLAYHTML_ROOM, type CasseroleGameState } from "./gameTypes";

export const PLAYHTML_PLAYBACK_SPEED_KEY = "chord-casserole-playback-speed-v1";

export const CollaborativePlayProvider = ({ children }: { children: ReactNode }) => (
  <PlayProvider
    pathname={playhtmlPathname()}
    initOptions={{
      room: PLAYHTML_ROOM,
      cursors: {
        enabled: true,
        enableChat: false,
      },
    }}
  >
    <WebDeploymentBodyClass />
    {children}
  </PlayProvider>
);

const WebDeploymentBodyClass = () => {
  useEffect(() => {
    document.body.classList.add("chord-casserole-web");
    return () => document.body.classList.remove("chord-casserole-web");
  }, []);
  return null;
};

export type SetGameState = {
  (next: CasseroleGameState): void;
  (mutator: (draft: CasseroleGameState) => void): void;
};

export const useSyncedGameState = (): {
  gameState: CasseroleGameState;
  setGameState: SetGameState;
  isLoading: boolean;
} => {
  const seed = createInitialGameState();
  const [gameState, setGameStateRaw] = usePageData<CasseroleGameState>(PLAYHTML_GAME_KEY, seed);
  const { isLoading } = usePlayContext();

  const setGameState = useCallback<SetGameState>(
    (update) => {
      setGameStateRaw(update as CasseroleGameState & ((draft: CasseroleGameState) => void));
    },
    [setGameStateRaw]
  );

  return { gameState, setGameState, isLoading };
};

export const useSyncedPlaybackSpeed = (): {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  resetPlaybackSpeed: () => void;
} => {
  const [playbackSpeed, setPlaybackSpeedRaw] = usePageData<number>(
    PLAYHTML_PLAYBACK_SPEED_KEY,
    DEFAULT_PLAYBACK_SPEED
  );

  const setPlaybackSpeed = useCallback(
    (speed: number) => {
      setPlaybackSpeedRaw(normalizePlaybackSpeed(speed));
    },
    [setPlaybackSpeedRaw]
  );

  const resetPlaybackSpeed = useCallback(() => {
    setPlaybackSpeedRaw(DEFAULT_PLAYBACK_SPEED);
  }, [setPlaybackSpeedRaw]);

  return {
    playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
    setPlaybackSpeed,
    resetPlaybackSpeed,
  };
};
