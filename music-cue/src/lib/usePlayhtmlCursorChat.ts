import { usePlayContext } from "@playhtml/react";
import { playhtml } from "playhtml";
import { useEffect, useRef, useState } from "react";

const PLAYHTML_CURSOR_AWARENESS_KEY = "__playhtml_cursors__";
const MESSAGE_POLL_MS = 150;

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

type CursorChatReader = {
  listening: boolean;
  getCurrentMessage: () => string | null;
};

type CursorClientReader = {
  presenceTransport?: unknown;
  presenceStore?: {
    getRemotePresences: (excludePublicKey: string) => Map<string, TransportPresence>;
  };
  getMyPlayerIdentity: () => { publicKey: string };
  getProvider: () => { awareness: CursorAwareness };
  chat?: CursorChatReader;
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

export const isPlayhtmlChatAvailable = (): boolean => {
  const client = getCursorClient();
  return Boolean(client?.chat);
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

    const commitAllMessages = () => {
      const client = getCursorClient();
      if (!client) {
        return;
      }
      const next = readCursorMessages(client);
      if (mapsEqual(next, latestRef.current)) {
        return;
      }
      latestRef.current = next;
      setMessagesByPublicKey(next);
    };

    commitAllMessages();

    // PlayHTML's presence transport routes chat outside Yjs awareness. Poll that
    // store instead of hooking onCursorPresencesChange, which also fires on every
    // cursor move and was blocking the "/" chat hotkey on the main thread.
    let awareness: CursorAwareness | null = null;
    let handleAwarenessChange: ((change: AwarenessChange) => void) | null = null;

    const client = getCursorClient();
    if (client && !client.presenceTransport) {
      awareness = client.getProvider().awareness;

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

      handleAwarenessChange = (change: AwarenessChange) => {
        if (change.removed.length > 0 && latestRef.current.size > 0) {
          commitAllMessages();
          return;
        }

        const states = awareness!.getStates();
        if ([...change.added, ...change.updated].some((clientId) => isMessageRelevant(states.get(clientId)))) {
          commitAllMessages();
        }
      };

      awareness.on("change", handleAwarenessChange);
    }

    const pollId = window.setInterval(commitAllMessages, MESSAGE_POLL_MS);

    return () => {
      if (awareness && handleAwarenessChange) {
        awareness.off("change", handleAwarenessChange);
      }
      window.clearInterval(pollId);
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};

export type LocalCursorChatState = {
  isListening: boolean;
  message: string | null;
  /** Text shown on the graph bubble (message, or "..." while composing). */
  displayMessage: string | null;
};

const readLocalCursorChat = (client: CursorClientReader): LocalCursorChatState => {
  const chat = client.chat;
  if (!chat) {
    return { isListening: false, message: null, displayMessage: null };
  }

  const isListening = chat.listening;
  const message = chat.getCurrentMessage();
  const displayMessage = message ?? (isListening ? "..." : null);

  return { isListening, message, displayMessage };
};

const localChatEqual = (left: LocalCursorChatState, right: LocalCursorChatState): boolean =>
  left.isListening === right.isListening &&
  left.message === right.message &&
  left.displayMessage === right.displayMessage;

export const usePlayhtmlLocalCursorChat = (): LocalCursorChatState => {
  const { isLoading, isProviderMissing } = usePlayContext();
  const [localChat, setLocalChat] = useState<LocalCursorChatState>(() => ({
    isListening: false,
    message: null,
    displayMessage: null,
  }));
  const latestRef = useRef(localChat);

  useEffect(() => {
    latestRef.current = localChat;
  }, [localChat]);

  useEffect(() => {
    if (isLoading || isProviderMissing) {
      return;
    }

    const commit = () => {
      const client = getCursorClient();
      if (!client?.chat) {
        return;
      }
      const next = readLocalCursorChat(client);
      if (localChatEqual(next, latestRef.current)) {
        return;
      }
      latestRef.current = next;
      setLocalChat(next);
    };

    commit();
    const pollId = window.setInterval(commit, MESSAGE_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [isLoading, isProviderMissing]);

  return localChat;
};
