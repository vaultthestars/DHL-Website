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

type TransportPresence = {
  message?: string | null;
  playerIdentity?: {
    publicKey?: string;
  };
};

type CursorClientReader = {
  presenceTransport?: unknown;
  presenceStore?: {
    getRemotePresences: (excludePublicKey: string) => Map<string, TransportPresence>;
  };
  getMyPlayerIdentity: () => { publicKey: string };
  getProvider: () => { awareness: CursorAwareness };
  onCursorPresencesChange?: (callback: () => void) => () => void;
};

const getCursorClient = (): CursorClientReader | null => {
  if (!playhtml.cursorClient) {
    return null;
  }
  try {
    playhtml.cursorClient.getProvider();
    return playhtml.cursorClient as CursorClientReader;
  } catch {
    return null;
  }
};

const readCursorMessagesFromAwareness = (awareness: CursorAwareness): Map<string, string> => {
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

const readCursorMessagesFromTransport = (client: CursorClientReader): Map<string, string> => {
  const messages = new Map<string, string>();
  const store = client.presenceStore;
  if (!store) {
    return messages;
  }

  const selfKey = client.getMyPlayerIdentity().publicKey;
  for (const [publicKey, presence] of store.getRemotePresences(selfKey)) {
    const message = presence.message?.trim();
    if (message) {
      messages.set(publicKey, message);
    }
  }
  return messages;
};

const readCursorMessages = (client: CursorClientReader): Map<string, string> => {
  if (client.presenceTransport) {
    return readCursorMessagesFromTransport(client);
  }
  return readCursorMessagesFromAwareness(client.getProvider().awareness);
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

    const client = getCursorClient();
    if (!client) {
      return;
    }

    const awareness = client.getProvider().awareness;
    const usesTransport = Boolean(client.presenceTransport);

    let flushRafId = 0;
    let needsSync = false;

    const commitAllMessages = () => {
      const next = readCursorMessages(client);
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

    const scheduleCommit = () => {
      needsSync = true;
      if (flushRafId) {
        return;
      }
      flushRafId = requestAnimationFrame(() => {
        flushRafId = 0;
        if (!needsSync) {
          return;
        }
        needsSync = false;
        commitAllMessages();
      });
    };

    const handleAwarenessChange = (change: AwarenessChange) => {
      if (usesTransport) {
        return;
      }

      if (change.removed.length > 0 && latestRef.current.size > 0) {
        scheduleCommit();
        return;
      }

      const states = awareness.getStates();
      if ([...change.added, ...change.updated].some((clientId) => isMessageRelevant(states.get(clientId)))) {
        scheduleCommit();
      }
    };

    commitAllMessages();
    awareness.on("change", handleAwarenessChange);
    const unsubscribePresences = client.onCursorPresencesChange?.(() => {
      scheduleCommit();
    });
    const pollId = window.setInterval(commitAllMessages, MESSAGE_FALLBACK_POLL_MS);

    return () => {
      awareness.off("change", handleAwarenessChange);
      unsubscribePresences?.();
      window.clearInterval(pollId);
      if (flushRafId) {
        cancelAnimationFrame(flushRafId);
      }
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};
