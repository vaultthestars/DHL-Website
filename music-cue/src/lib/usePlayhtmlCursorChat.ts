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

const readCursorMessages = (): Map<string, string> => {
  const messages = new Map<string, string>();
  const client = playhtml.cursorClient;
  if (!client) {
    return messages;
  }

  let provider: { awareness: { getStates: () => Map<number, Record<string, unknown>> } };
  try {
    provider = client.getProvider();
  } catch {
    return messages;
  }

  provider.awareness.getStates().forEach((state) => {
    const cursorPresence = state[PLAYHTML_CURSOR_AWARENESS_KEY] as CursorAwarenessState | undefined;
    const message = cursorPresence?.message?.trim();
    const publicKey = cursorPresence?.playerIdentity?.publicKey;
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

    const commitMessages = () => {
      const next = readCursorMessages();
      if (mapsEqual(next, latestRef.current)) {
        return;
      }
      latestRef.current = next;
      setMessagesByPublicKey(next);
    };

    commitMessages();
    const intervalId = window.setInterval(commitMessages, 400);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};
