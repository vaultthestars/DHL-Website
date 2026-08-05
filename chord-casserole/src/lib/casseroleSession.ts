import { useCallback, useEffect, useMemo } from "react";
import { useCursorPresences, usePlayerIdentity, usePlayContext, usePresence } from "@playhtml/react";
import { SESSION_PRESENCE_CHANNEL, type SessionPresenceData } from "./gameTypes";

export type CasseroleParticipant = {
  id: string;
  name: string;
  color: string;
};

const readPresenceDisplayName = (presence: Record<string, unknown>): string => {
  const nested = presence[SESSION_PRESENCE_CHANNEL] as SessionPresenceData | undefined;
  const direct = presence as SessionPresenceData;
  return (nested?.displayName ?? direct.displayName ?? "").trim();
};

export const useCasseroleSession = (displayName: string) => {
  const { color, pid } = usePlayerIdentity();
  const { isLoading } = usePlayContext();
  const playerId = pid;
  const playerColor = color;

  const { presences, setMyPresence } = usePresence<SessionPresenceData>(SESSION_PRESENCE_CHANNEL);
  const cursorPresences = useCursorPresences();

  const publishDisplayName = useCallback(
    (name: string) => {
      if (isLoading) {
        return;
      }
      setMyPresence({
        displayName: name.trim(),
      });
    },
    [isLoading, setMyPresence]
  );

  useEffect(() => {
    publishDisplayName(displayName);
  }, [displayName, publishDisplayName]);

  const participants = useMemo((): CasseroleParticipant[] => {
    const byId = new Map<string, CasseroleParticipant>();
    const onlineIds = new Set(cursorPresences.keys());

    if (displayName.trim() && playerId) {
      byId.set(playerId, {
        id: playerId,
        name: displayName.trim(),
        color: playerColor,
      });
    }

    presences.forEach((presence, id) => {
      if (presence.isMe) {
        return;
      }
      if (!onlineIds.has(id)) {
        return;
      }
      const name = readPresenceDisplayName(presence as Record<string, unknown>);
      if (!name) {
        return;
      }
      byId.set(id, {
        id,
        name,
        color:
          (presence.playerIdentity as { color?: string } | undefined)?.color ?? "#404040",
      });
    });

    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [cursorPresences, displayName, playerColor, playerId, presences]);

  const updateDisplayName = useCallback(
    (name: string) => {
      publishDisplayName(name);
    },
    [publishDisplayName]
  );

  return {
    playerId,
    playerIdReady: Boolean(playerId),
    playerColor,
    participants,
    updateDisplayName,
  };
};
