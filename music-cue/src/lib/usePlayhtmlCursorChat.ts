import { usePlayContext } from "@playhtml/react";
import { playhtml } from "playhtml";
import { useEffect, useState } from "react";

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

export const usePlayhtmlCursorMessages = (): Map<string, string> => {
  const { isLoading, isProviderMissing } = usePlayContext();
  const [messagesByPublicKey, setMessagesByPublicKey] = useState(() => new Map<string, string>());

  useEffect(() => {
    if (isLoading || isProviderMissing) {
      return;
    }

    const client = playhtml.cursorClient;
    if (!client) {
      return;
    }

    let provider: {
      awareness: {
        on: (event: "change", callback: () => void) => void;
        off: (event: "change", callback: () => void) => void;
      };
    };
    try {
      provider = client.getProvider();
    } catch {
      return;
    }

    const handleChange = () => {
      setMessagesByPublicKey(readCursorMessages());
    };

    handleChange();
    provider.awareness.on("change", handleChange);
    return () => {
      provider.awareness.off("change", handleChange);
    };
  }, [isLoading, isProviderMissing]);

  return messagesByPublicKey;
};
