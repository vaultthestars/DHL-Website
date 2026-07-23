import { usePlayContext } from "@playhtml/react";
import { playhtml } from "playhtml";
import { useEffect, useRef, useState } from "react";

const PLAYHTML_CURSOR_AWARENESS_KEY = "__playhtml_cursors__";
const MESSAGE_FALLBACK_POLL_MS = 250;

type CursorAwarenessState = {
  message?: string | null;
  playerIdentity?: {
    publicKey?: string;
  };
};

type AwarenessChange = {
  added: number[];
  updated: number[];
  removed: number[];
};

type CursorAwareness = {
  getStates: () => Map<number, Record<string, unknown>>;
  on: (event: "change", handler: (change: AwarenessChange) => void) => void;
  off: (event: "change", handler: (change: AwarenessChange) => void) => void;
};

const readCursorMessages = (awareness: CursorAwareness): Map<string, string> => {
  const messages = new Map<string, string>();
  awareness.getStates().forEach((state) => {
    const presence = state[PLAYHTML_CURSOR_AWARENESS_KEY] as CursorAwarenessState | undefined;
    const message = presence?.message?.trim();
    const publicKey = presence?.playerIdentity?.publicKey;
    if (!publicKey || !message) {
      return;
    }
    messages.set(publicKey, message);
  });
  return messages;
};

const mapsEqual = (left: Map<string, string>, right: Map<string, string>): boolean => {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
};

const getCursorAwareness = (): CursorAwareness | null => {
  const client = playhtml.cursorClient;
  if (!client) {
    return null;
  }
  try {
    return client.getProvider().awareness as CursorAwareness;
  } catch {
    return null;
  }
};

export const usePlayhtmlCursorMessages = (): Map<string, string> => {
  const { isLoading, isProviderMissing } = usePlayContext();
  const [messagesByPublicKey, setMessagesByPublicKey] = useState(() => new Map<string, string>());
  const latestRef = useRef(messagesByPublicKey);

  useEffect(() => {
    latestRef.current = messagesByPublicKey;
  }, [messagesByPublicKey]);

  useEffect(() => {
    if (isLoading || isProviderMissing) {
      return;
    }

    const awareness = getCursorAwareness();
    if (!awareness) {
      return;
    }

    let flushRafId = 0;
    let pendingChange: AwarenessChange | null = null;

    const commitAllMessages = () => {
      const next = readCursorMessages(awareness);
      if (mapsEqual(next, latestRef.current)) {
        return;
      }
      latestRef.current = next;
      setMessagesByPublicKey(next);
    };

    const isMessageRelevant = (state: Record<string, unknown> | undefined): boolean => {
      const presence = state?.[PLAYHTML_CURSOR_AWARENESS_KEY] as CursorAwarenessState | undefined;
      const publicKey = presence?.playerIdentity?.publicKey;
      if (!publicKey) {
        return false;
      }
      if (presence?.message?.trim()) {
        return true;
      }
      return latestRef.current.has(publicKey);
    };

    const applyPendingChange = () => {
      flushRafId = 0;
      const change = pendingChange;
      pendingChange = null;
      if (!change) {
        return;
      }

      if (change.removed.length > 0) {
        if (latestRef.current.size > 0) {
          commitAllMessages();
        }
        return;
      }

      const states = awareness.getStates();
      const clientIds = [...change.added, ...change.updated];
      if (!clientIds.some((clientId) => isMessageRelevant(states.get(clientId)))) {
        return;
      }

      const next = new Map(latestRef.current);
      let changed = false;

      for (const clientId of clientIds) {
        const state = states.get(clientId);
        const presence = state?.[PLAYHTML_CURSOR_AWARENESS_KEY] as CursorAwarenessState | undefined;
        const publicKey = presence?.playerIdentity?.publicKey;
        if (!publicKey) {
          continue;
        }

        const message = presence?.message?.trim();
        if (!message) {
          if (next.delete(publicKey)) {
            changed = true;
          }
          continue;
        }

        if (next.get(publicKey) !== message) {
          next.set(publicKey, message);
          changed = true;
        }
      }

      if (!changed) {
        return;
      }

      latestRef.current = next;
      setMessagesByPublicKey(next);
    };

    const scheduleFlush = (change: AwarenessChange) => {
      pendingChange = change;
      if (flushRafId) {
        return;
      }
      flushRafId = requestAnimationFrame(applyPendingChange);
    };

    commitAllMessages();
    const handleAwarenessChange = (change: AwarenessChange) => {
      scheduleFlush(change);
    };

    awareness.on("change", handleAwarenessChange);
    const pollId = window.setInterval(commitAllMessages, MESSAGE_FALLBACK_POLL_MS);

    return () => {
      awareness.off("change", handleAwarenessChange);
      window.clearInterval(pollId);
      if (flushRafId) {
        cancelAnimationFrame(flushRafId);
      }
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};
