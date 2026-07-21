import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePlayerIdentity, usePresence, usePlayContext } from "@playhtml/react";
import { fromNormalizedPosition, type GraphDimensions } from "./graphLayout";
import type { ViewTransform } from "./graphView";
import type { LibraryScopeMode } from "./libraryScope";
import type { SongSpaceMode } from "./sharedLibraryApi";
import { layoutConfigKey } from "./layoutMetrics";
import { isWebDeployment } from "./runtime";
import type { LayoutConfig, NormalizedPoint } from "./types";

export const SESSION_PRESENCE_CHANNEL = "session";

export type CollaborativeViewSettings = {
  layoutConfig: LayoutConfig;
  libraryScopeMode: LibraryScopeMode;
  songSpaceMode: SongSpaceMode;
  includeMockUsers: boolean;
  viewTransform: ViewTransform;
};

export type CollaborativePresenceLayout = Omit<CollaborativeViewSettings, "viewTransform">;

export const presenceLayoutKey = (settings: CollaborativePresenceLayout): string =>
  `${layoutConfigKey(settings.layoutConfig)}|${settings.libraryScopeMode}|${settings.songSpaceMode}|${settings.includeMockUsers}`;

export type SessionPresenceData = {
  displayName: string;
  graphCursor: NormalizedPoint | null;
  presenceLayout: CollaborativePresenceLayout;
};

const getSessionData = (presence: Record<string, unknown>): SessionPresenceData | null => {
  const direct = presence as SessionPresenceData & { viewSettings?: CollaborativePresenceLayout };
  if (typeof direct.displayName === "string" && (direct.presenceLayout || direct.viewSettings)) {
    return {
      displayName: direct.displayName,
      graphCursor: direct.graphCursor ?? null,
      presenceLayout: direct.presenceLayout ?? direct.viewSettings!,
    };
  }
  const nested = presence[SESSION_PRESENCE_CHANNEL] as
    | (SessionPresenceData & { viewSettings?: CollaborativePresenceLayout })
    | undefined;
  if (nested && typeof nested.displayName === "string" && (nested.presenceLayout || nested.viewSettings)) {
    return {
      displayName: nested.displayName,
      graphCursor: nested.graphCursor ?? null,
      presenceLayout: nested.presenceLayout ?? nested.viewSettings!,
    };
  }
  return null;
};

export const viewSettingsMatch = (
  left: CollaborativeViewSettings,
  right: CollaborativeViewSettings
): boolean => presenceLayoutKey(left) === presenceLayoutKey(right);

type CollaborativeSessionContextValue = {
  participants: Array<{
    id: string;
    displayName: string;
    color: string;
    presenceLayout: CollaborativePresenceLayout;
    isSynced: boolean;
  }>;
  myPresenceLayout: CollaborativePresenceLayout;
  syncWithParticipant: (participantId: string) => void;
  setGraphCursor: (cursor: NormalizedPoint | null) => void;
  isLiveSyncReady: boolean;
};

const noopSessionContext: CollaborativeSessionContextValue = {
  participants: [],
  myPresenceLayout: {
    layoutConfig: { viewMode: "cluster", clusterMode: "playlist", axisX: "year", axisY: "year" },
    libraryScopeMode: "isolate",
    songSpaceMode: "shared",
    includeMockUsers: false,
  },
  syncWithParticipant: () => {},
  setGraphCursor: () => {},
  isLiveSyncReady: false,
};

const CollaborativeSessionContext = createContext<CollaborativeSessionContextValue>(noopSessionContext);

export const useCollaborativeSession = (): CollaborativeSessionContextValue =>
  useContext(CollaborativeSessionContext);

const CollaborativeSessionBridge = ({
  displayName,
  presenceLayout,
  onSyncPresenceLayout,
  children,
}: {
  displayName: string;
  presenceLayout: CollaborativePresenceLayout;
  onSyncPresenceLayout: (layout: CollaborativePresenceLayout) => void;
  children: ReactNode;
}) => {
  const { presences, setMyPresence } = usePresence<SessionPresenceData>(SESSION_PRESENCE_CHANNEL);
  const { isLoading } = usePlayContext();
  const presenceLayoutRef = useRef(presenceLayout);
  const displayNameRef = useRef(displayName);
  const graphCursorRef = useRef<NormalizedPoint | null>(null);

  presenceLayoutRef.current = presenceLayout;
  displayNameRef.current = displayName;

  const publishFrameRef = useRef(0);

  const publishPresence = useCallback(() => {
    setMyPresence({
      displayName: displayNameRef.current,
      graphCursor: graphCursorRef.current,
      presenceLayout: presenceLayoutRef.current,
    });
  }, [setMyPresence]);

  const setGraphCursor = useCallback(
    (cursor: NormalizedPoint | null) => {
      if (!cursor) {
        return;
      }
      graphCursorRef.current = cursor;
      if (publishFrameRef.current) {
        return;
      }
      publishFrameRef.current = requestAnimationFrame(() => {
        publishFrameRef.current = 0;
        publishPresence();
      });
    },
    [publishPresence]
  );

  const presenceLayoutKeyValue = presenceLayoutKey(presenceLayout);

  useEffect(() => {
    publishPresence();
  }, [displayName, presenceLayoutKeyValue, publishPresence]);

  const value = useMemo((): CollaborativeSessionContextValue => {
    const myPresenceLayout = presenceLayout;
    const participants = [...presences.entries()]
      .filter(([, presence]) => !presence.isMe)
      .map(([id, presence]) => {
        const session = getSessionData(presence as Record<string, unknown>);
        const color = presence.playerIdentity?.color ?? "#4a90d9";
        const participantLayout = session?.presenceLayout ?? myPresenceLayout;
        return {
          id,
          displayName: session?.displayName ?? "Guest",
          color,
          presenceLayout: participantLayout,
          isSynced: presenceLayoutKey(participantLayout) === presenceLayoutKey(myPresenceLayout),
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

    return {
      participants,
      myPresenceLayout,
      setGraphCursor,
      syncWithParticipant: (participantId: string) => {
        const presence = presences.get(participantId);
        const session = presence ? getSessionData(presence as Record<string, unknown>) : null;
        if (!session) {
          return;
        }
        onSyncPresenceLayout(session.presenceLayout);
      },
      isLiveSyncReady: !isLoading,
    };
  }, [isLoading, onSyncPresenceLayout, presences, presenceLayout, setGraphCursor]);

  return <CollaborativeSessionContext.Provider value={value}>{children}</CollaborativeSessionContext.Provider>;
};

export const CollaborativeSessionProvider = ({
  displayName,
  presenceLayout,
  onSyncPresenceLayout,
  enabled = true,
  children,
}: {
  displayName: string;
  presenceLayout: CollaborativePresenceLayout;
  onSyncPresenceLayout: (layout: CollaborativePresenceLayout) => void;
  enabled?: boolean;
  children: ReactNode;
}) => {
  if (!isWebDeployment || !enabled) {
    return <>{children}</>;
  }

  return (
    <CollaborativeSessionBridge
      displayName={displayName}
      presenceLayout={presenceLayout}
      onSyncPresenceLayout={onSyncPresenceLayout}
    >
      {children}
    </CollaborativeSessionBridge>
  );
};

export const GraphCursorPublisherBridge = ({
  publishRef,
}: {
  publishRef: MutableRefObject<(cursor: NormalizedPoint | null) => void>;
}) => {
  if (!isWebDeployment) {
    return null;
  }

  const { setGraphCursor } = useCollaborativeSession();

  useEffect(() => {
    publishRef.current = setGraphCursor;
  }, [publishRef, setGraphCursor]);

  return null;
};

export const CollaborativeParticipantsPanel = () => {
  if (!isWebDeployment) {
    return null;
  }

  const { participants, isLiveSyncReady, syncWithParticipant } = useCollaborativeSession();
  const { color, pid } = usePlayerIdentity();
  const { isLoading } = usePlayContext();
  const [open, setOpen] = useState(false);
  const [showConnecting, setShowConnecting] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      setShowConnecting(false);
    }
  }, [isLoading]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowConnecting(false), 12_000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!isLiveSyncReady && showConnecting) {
    return <span className="music-cue-live-badge music-cue-live-badge-connecting">Connecting live sync…</span>;
  }

  if (!isLiveSyncReady) {
    return null;
  }

  const totalCount = participants.length + 1;
  const participantLabel = totalCount === 1 ? "1 person here" : `${totalCount} people here`;

  return (
    <span className="music-cue-live-wrap">
      <button type="button" className="music-cue-live-badge" onClick={() => setOpen((current) => !current)}>
        Live · {participantLabel}
      </button>
      {open ? (
        <div className="music-cue-live-panel" role="menu">
          <div className="music-cue-live-panel-title">Online now</div>
          <button type="button" className="music-cue-live-participant music-cue-live-participant-me" disabled>
            <span className="music-cue-live-swatch" style={{ background: color }} aria-hidden />
            <span>You{pid ? "" : " (connecting)"}</span>
          </button>
          {participants.length === 0 ? (
            <p className="music-cue-live-panel-empty">Open another window to collaborate.</p>
          ) : (
            participants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                className={`music-cue-live-participant ${participant.isSynced ? "music-cue-live-participant-synced" : ""}`}
                onClick={() => {
                  syncWithParticipant(participant.id);
                  setOpen(false);
                }}
              >
                <span className="music-cue-live-swatch" style={{ background: participant.color }} aria-hidden />
                <span>{participant.displayName}</span>
                <span className="music-cue-live-participant-action">
                  {participant.isSynced ? "Synced" : "Sync view"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </span>
  );
};

const CollaborativeGraphCursorsInner = ({ dimensions }: { dimensions: GraphDimensions }) => {
  const { presences } = usePresence<SessionPresenceData>(SESSION_PRESENCE_CHANNEL);
  const { myPresenceLayout, syncWithParticipant } = useCollaborativeSession();

  const cursors = [...presences.entries()]
    .filter(([, presence]) => !presence.isMe)
    .map(([id, presence]) => {
      const session = getSessionData(presence as Record<string, unknown>);
      if (!session?.graphCursor) {
        return null;
      }
      const graphPoint = fromNormalizedPosition(session.graphCursor, dimensions);
      const isSynced =
        presenceLayoutKey(session.presenceLayout) === presenceLayoutKey(myPresenceLayout);
      return {
        id,
        displayName: session.displayName,
        color: presence.playerIdentity?.color ?? "#4a90d9",
        x: graphPoint.x,
        y: graphPoint.y,
        isSynced,
      };
    })
    .filter((cursor): cursor is NonNullable<typeof cursor> => cursor !== null);

  if (cursors.length === 0) {
    return null;
  }

  return (
    <g className="music-cue-remote-cursors-svg" aria-hidden>
      {cursors.map((cursor) => (
        <g
          key={cursor.id}
          className={`music-cue-remote-cursor-svg ${cursor.isSynced ? "music-cue-remote-cursor-svg-synced" : ""}`}
          transform={`translate(${cursor.x}, ${cursor.y})`}
          pointerEvents="visiblePainted"
          onClick={() => syncWithParticipant(cursor.id)}
        >
          <title>{`Sync with ${cursor.displayName}`}</title>
          <circle className="music-cue-remote-cursor-svg-dot" r={5} fill={cursor.color} />
          <text className="music-cue-remote-cursor-svg-label" x={8} y={4}>
            {cursor.displayName}
          </text>
        </g>
      ))}
    </g>
  );
};

export const CollaborativeGraphCursorsPortal = ({
  contentGroupRef,
  dimensions,
}: {
  contentGroupRef: RefObject<SVGGElement | null>;
  dimensions: GraphDimensions;
}) => {
  const [host, setHost] = useState<SVGGElement | null>(null);

  useEffect(() => {
    setHost(contentGroupRef.current);
  }, [contentGroupRef, dimensions.height, dimensions.width]);

  if (!host) {
    return null;
  }

  return createPortal(<CollaborativeGraphCursorsInner dimensions={dimensions} />, host);
};

export const CollaborativeParticipantsPortal = ({
  hostRef,
}: {
  hostRef: RefObject<HTMLSpanElement | null>;
}) => {
  const [host, setHost] = useState<HTMLSpanElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
  }, [hostRef]);

  if (!host) {
    return null;
  }

  return createPortal(<CollaborativeParticipantsPanel />, host);
};

export const CollaborativeSessionUi = ({
  publishRef,
  contentGroupRef,
  dimensions,
  participantsHostRef,
}: {
  publishRef: MutableRefObject<(cursor: NormalizedPoint | null) => void>;
  contentGroupRef: RefObject<SVGGElement | null>;
  dimensions: GraphDimensions;
  participantsHostRef: RefObject<HTMLSpanElement | null>;
}) => (
  <>
    <GraphCursorPublisherBridge publishRef={publishRef} />
    <CollaborativeParticipantsPortal hostRef={participantsHostRef} />
    <CollaborativeGraphCursorsPortal contentGroupRef={contentGroupRef} dimensions={dimensions} />
  </>
);
