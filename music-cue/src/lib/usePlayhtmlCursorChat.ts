import { usePlayContext } from "@playhtml/react";
import { playhtml } from "playhtml";
import { useEffect, useRef, useState } from "react";

const PLAYHTML_CURSOR_AWARENESS_KEY = "__playhtml_cursors__";

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

const readMessageFromState = (
  state: Record<string, unknown> | undefined
): { publicKey: string; message: string } | null => {
  const cursorPresence = state?.[PLAYHTML_CURSOR_AWARENESS_KEY] as CursorAwarenessState | undefined;
  const message = cursorPresence?.message?.trim();
  const publicKey = cursorPresence?.playerIdentity?.publicKey;
  if (!publicKey || !message) {
    return null;
  }
  return { publicKey, message };
};

const readCursorMessages = (awareness: CursorAwareness): Map<string, string> => {
  const messages = new Map<string, string>();
  awareness.getStates().forEach((state) => {
    const entry = readMessageFromState(state);
    if (entry) {
      messages.set(entry.publicKey, entry.message);
    }
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

    const commitAllMessages = () => {
      const next = readCursorMessages(awareness);
      if (mapsEqual(next, latestRef.current)) {
        return;
      }
      latestRef.current = next;
      setMessagesByPublicKey(next);
    };

    const applyAwarenessChange = (change: AwarenessChange) => {
      if (change.removed.length > 0) {
        commitAllMessages();
        return;
      }

      const states = awareness.getStates();
      const next = new Map(latestRef.current);
      let changed = false;

      for (const clientId of [...change.added, ...change.updated]) {
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

    commitAllMessages();
    awareness.on("change", applyAwarenessChange);
    return () => {
      awareness.off("change", applyAwarenessChange);
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};
