import { useCallback, useEffect, useMemo, useState } from "react";
import { positionToChord, type Direction } from "../lib/accordionGrid";
import { useCasseroleSession } from "../lib/casseroleSession";
import { CollaborativePlayProvider, useSyncedGameState } from "../lib/collaborativeGame";
import {
  createEmptyDraft,
  createInitialGameState,
  normalizePlaybackSpeed,
  resetActiveTurnDraft,
  TURN_SECONDS,
  type SongPart,
} from "../lib/gameTypes";
import { isDevSoloMode, minPlayersToBegin } from "../lib/runtime";
import { LobbyScreen } from "./LobbyScreen";
import { PlaybackScreen } from "./PlaybackScreen";
import {
  applyDirection,
  resolveCurrentChord,
  TurnEditor,
} from "./TurnEditor";

const STORAGE_NAME_KEY = "chord-casserole-display-name";
const STORAGE_JOINED_EPOCH_KEY = "chord-casserole-joined-epoch";

const loadStoredName = (): string => {
  try {
    return localStorage.getItem(STORAGE_NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

const saveStoredName = (name: string): void => {
  try {
    localStorage.setItem(STORAGE_NAME_KEY, name);
  } catch {
    // Ignore quota errors.
  }
};

const loadJoinedSessionEpoch = (): number => {
  try {
    const value = localStorage.getItem(STORAGE_JOINED_EPOCH_KEY);
    return value ? Number(value) : 0;
  } catch {
    return 0;
  }
};

const saveJoinedSessionEpoch = (epoch: number): void => {
  try {
    localStorage.setItem(STORAGE_JOINED_EPOCH_KEY, String(epoch));
  } catch {
    // Ignore quota errors.
  }
};

const CasseroleGame = () => {
  const [displayName, setDisplayName] = useState(loadStoredName);
  const [joinedSessionEpoch, setJoinedSessionEpoch] = useState(loadJoinedSessionEpoch);
  const { playerId, playerIdReady, participants, updateDisplayName } = useCasseroleSession(displayName);
  const { gameState, setGameState, isLoading } = useSyncedGameState();

  useEffect(() => {
    saveStoredName(displayName);
    updateDisplayName(displayName);
  }, [displayName, updateDisplayName]);

  useEffect(() => {
    if (!playerId) {
      return;
    }
    setGameState((state) => {
      if (state.turnOrder.includes(playerId)) {
        return;
      }
      const localIndex = state.turnOrder.indexOf("local");
      if (localIndex === -1) {
        return;
      }
      state.turnOrder[localIndex] = playerId;
      if (state.startedBy === "local") {
        state.startedBy = playerId;
      }
      state.parts.forEach((part) => {
        if (part.playerId === "local") {
          part.playerId = playerId;
        }
      });
    });
  }, [playerId, setGameState]);

  const isMyTurn = useMemo(() => {
    if (!playerId) {
      return false;
    }
    const activeId = gameState.turnOrder[gameState.currentTurnIndex];
    return Boolean(activeId && activeId === playerId);
  }, [gameState.currentTurnIndex, gameState.turnOrder, playerId]);

  const previousLine = useMemo(() => {
    const lastPart = gameState.parts[gameState.parts.length - 1];
    return lastPart?.line2 ?? "";
  }, [gameState.parts]);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.turnStartedAt || !isMyTurn) {
      return;
    }
    const interval = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(interval);
  }, [gameState.phase, gameState.turnStartedAt, isMyTurn]);

  const timedOut = useMemo(() => {
    if (!gameState.turnStartedAt || !isMyTurn) {
      return false;
    }
    return Date.now() - gameState.turnStartedAt >= TURN_SECONDS * 1000;
  }, [gameState.turnStartedAt, isMyTurn, tick]);

  const sessionEpoch = gameState.sessionEpoch ?? 0;
  const joinedPlayerIds = gameState.joinedPlayerIds ?? [];
  const hasJoinedLobby = Boolean(playerId && joinedPlayerIds.includes(playerId));
  const gameInProgress = gameState.phase !== "lobby" && sessionEpoch > 0;
  const hasJoinedCurrentSession =
    sessionEpoch > 0 && joinedSessionEpoch === sessionEpoch;
  const showLobby =
    !displayName.trim() || gameState.phase === "lobby" || !hasJoinedCurrentSession;

  const markJoinedSession = useCallback((epoch: number) => {
    setJoinedSessionEpoch(epoch);
    saveJoinedSessionEpoch(epoch);
  }, []);

  const joinSession = useCallback(() => {
    if (!playerId) {
      return;
    }
    setGameState((state) => {
      if (!state.joinedPlayerIds) {
        state.joinedPlayerIds = [];
      }
      if (!state.joinedPlayerIds.includes(playerId)) {
        state.joinedPlayerIds.push(playerId);
      }
    });
  }, [playerId, setGameState]);

  const joinedParticipantCount = useMemo(
    () =>
      joinedPlayerIds.filter((id) => participants.some((participant) => participant.id === id))
        .length,
    [joinedPlayerIds, participants]
  );

  const beginSong = useCallback(() => {
    const requiredPlayers = minPlayersToBegin();
    if (!displayName.trim() || !playerId) {
      return;
    }
    const roster = [...joinedPlayerIds];
    if (!roster.includes(playerId)) {
      roster.push(playerId);
    }
    const others = roster.filter((id) => id !== playerId);
    if (others.length + 1 < requiredPlayers) {
      return;
    }
    const nextEpoch = Date.now();
    markJoinedSession(nextEpoch);
    setGameState((state) => {
      state.phase = "playing";
      state.sessionEpoch = nextEpoch;
      state.startedBy = playerId;
      state.joinedPlayerIds = roster;
      state.turnOrder = [playerId, ...others];
      state.currentTurnIndex = 0;
      state.turnStartedAt = Date.now();
      state.parts = [];
      state.chordPosition = null;
      state.activeDraft = createEmptyDraft();
      state.playbackIndex = 0;
    });
  }, [displayName, joinedPlayerIds, markJoinedSession, playerId, setGameState]);

  const updateDraft = useCallback(
    (draft: NonNullable<typeof gameState.activeDraft>) => {
      if (!isMyTurn) {
        return;
      }
      setGameState((state) => {
        if (!state.activeDraft) {
          state.activeDraft = createEmptyDraft();
        }
        state.activeDraft.line1 = draft.line1;
        state.activeDraft.line2 = draft.line2;
        state.activeDraft.notes = draft.notes.map((row) => [...row]);
      });
    },
    [isMyTurn, setGameState]
  );

  const pickOpeningChord = useCallback(
    (row: number, col: number) => {
      if (!isMyTurn) {
        return;
      }
      const chord = positionToChord({ row, col });
      setGameState((state) => {
        state.chordPosition = { row: chord.row, col: chord.col };
        if (!state.activeDraft) {
          state.activeDraft = createEmptyDraft();
        }
        state.activeDraft.direction = null;
        state.activeDraft.directionChosen = true;
      });
    },
    [isMyTurn, setGameState]
  );

  const pickDirection = useCallback(
    (direction: Direction) => {
      if (!isMyTurn) {
        return;
      }
      setGameState((state) => {
        const { chordPosition } = applyDirection(state, direction);
        state.chordPosition = chordPosition;
        if (!state.activeDraft) {
          state.activeDraft = createEmptyDraft();
        }
        state.activeDraft.direction = direction;
        state.activeDraft.directionChosen = true;
      });
    },
    [isMyTurn, setGameState]
  );

  const finishTurn = useCallback(() => {
    if (!isMyTurn || !playerId) {
      return;
    }

    setGameState((state) => {
      const draft = state.activeDraft ?? createEmptyDraft();
      const chord = state.chordPosition
        ? positionToChord(state.chordPosition)
        : positionToChord({ row: 0, col: 2 });
      const participant = participants.find((entry) => entry.id === playerId);
      const part: SongPart = {
        playerId,
        playerName: participant?.name ?? (displayName.trim() || "Anonymous"),
        direction: draft.direction,
        chord,
        line1: draft.line1.trim(),
        line2: draft.line2.trim(),
        notes: draft.notes.map((row) => [...row]),
      };

      const nextIndex = state.currentTurnIndex + 1;
      const finished = nextIndex >= state.turnOrder.length;

      state.parts.push(part);
      state.currentTurnIndex = finished ? state.currentTurnIndex : nextIndex;
      state.turnStartedAt = finished ? null : Date.now();
      if (finished) {
        state.activeDraft = null;
      } else if (!state.activeDraft) {
        state.activeDraft = createEmptyDraft();
        resetActiveTurnDraft(state.activeDraft);
      } else {
        resetActiveTurnDraft(state.activeDraft);
      }
      state.phase = finished ? "playback" : "playing";
      if (finished) {
        state.playbackIndex = 0;
        state.playbackSpeed = normalizePlaybackSpeed(state.playbackSpeed);
      }
    });
  }, [displayName, isMyTurn, participants, playerId, setGameState]);

  const skipToSong = useCallback(() => {
    setGameState((state) => {
      if (state.parts.length === 0) {
        return;
      }
      state.phase = "playback";
      state.playbackIndex = 0;
      state.activeDraft = null;
      state.turnStartedAt = null;
    });
  }, [setGameState]);

  const advancePlayback = useCallback(() => {
    setGameState((state) => {
      state.playbackIndex += 1;
    });
  }, [setGameState]);

  const setPlaybackSpeed = useCallback(
    (speed: number) => {
      setGameState((state) => {
        state.playbackSpeed = normalizePlaybackSpeed(speed);
      });
    },
    [setGameState]
  );

  const restartGame = useCallback(() => {
    setJoinedSessionEpoch(0);
    saveJoinedSessionEpoch(0);
    setGameState(createInitialGameState());
  }, [setGameState]);

  const watchCurrentGame = useCallback(() => {
    if (sessionEpoch > 0) {
      markJoinedSession(sessionEpoch);
    }
  }, [markJoinedSession, sessionEpoch]);

  useEffect(() => {
    if (
      isLoading ||
      !playerId ||
      !displayName.trim() ||
      sessionEpoch === 0 ||
      gameState.phase === "lobby"
    ) {
      return;
    }
    const isParticipant =
      joinedPlayerIds.includes(playerId) || gameState.turnOrder.includes(playerId);
    if (isParticipant && joinedSessionEpoch !== sessionEpoch) {
      markJoinedSession(sessionEpoch);
    }
  }, [
    displayName,
    gameState.phase,
    gameState.turnOrder,
    isLoading,
    joinedPlayerIds,
    joinedSessionEpoch,
    markJoinedSession,
    playerId,
    sessionEpoch,
  ]);

  const finishPlayback = useCallback(() => {
    setGameState((state) => {
      state.playbackIndex = state.parts.length;
    });
  }, [setGameState]);

  const draft = gameState.activeDraft ?? createEmptyDraft();
  const currentChord = resolveCurrentChord(gameState);

  if (isLoading) {
    return <div className="casserole-screen">Connecting to the room…</div>;
  }

  if (showLobby) {
    return (
      <LobbyScreen
        displayName={displayName}
        onNameChange={setDisplayName}
        participants={participants}
        joinedPlayerIds={joinedPlayerIds}
        hasJoinedLobby={hasJoinedLobby}
        onJoinSession={joinSession}
        onBegin={beginSong}
        canBegin={
          playerIdReady &&
          displayName.trim().length > 0 &&
          hasJoinedLobby &&
          joinedParticipantCount >= minPlayersToBegin()
        }
        devSoloMode={isDevSoloMode()}
        playerIdReady={playerIdReady}
        gameInProgress={gameInProgress && displayName.trim().length > 0}
        onWatchGame={watchCurrentGame}
        onResetGame={restartGame}
      />
    );
  }

  if (gameState.phase === "playback") {
    if (gameState.playbackIndex >= gameState.parts.length) {
      return (
        <div className="casserole-screen casserole-finished">
          <h1 className="casserole-title">The casserole is served</h1>
          <p className="casserole-lede">That was your collaborative masterpiece.</p>
          <button type="button" className="casserole-primary-btn" onClick={restartGame}>
            Play again
          </button>
        </div>
      );
    }

    return (
      <PlaybackScreen
        parts={gameState.parts}
        playbackIndex={gameState.playbackIndex}
        playbackSpeed={normalizePlaybackSpeed(gameState.playbackSpeed)}
        onPlaybackSpeedChange={setPlaybackSpeed}
        onAdvance={advancePlayback}
        onFinish={finishPlayback}
      />
    );
  }

  return (
    <TurnEditor
      gameState={gameState}
      isMyTurn={isMyTurn}
      readOnly={!isMyTurn}
      currentChord={currentChord}
      previousLine={previousLine}
      draft={draft}
      onDraftChange={updateDraft}
      onPickOpeningChord={pickOpeningChord}
      onPickDirection={pickDirection}
      onDone={finishTurn}
      onSkipToSong={skipToSong}
      onResetGame={restartGame}
      timedOut={timedOut}
    />
  );
};

export const ChordCasseroleTool = () => (
  <CollaborativePlayProvider>
    <CasseroleGame />
  </CollaborativePlayProvider>
);
