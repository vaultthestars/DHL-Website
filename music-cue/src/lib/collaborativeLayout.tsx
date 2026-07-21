import { createContext, useCallback, useContext, useEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { PlayProvider, useCursorPresences, useCursorZone, usePageData, usePlayContext } from "@playhtml/react";
import { isWebDeployment } from "./runtime";
import { loadClusterCenterOverrides } from "./storage";
import type { ClusterCenterOverrides } from "./types";

export const PLAYHTML_ROOM = "dhl-music-cue-v1";
export const GRAPH_CURSOR_ZONE_ID = "music-cue-graph-panel";

type CollaborativeLayoutContextValue = {
  publishClusterLayout: (overrides: ClusterCenterOverrides) => void;
  liveParticipantCount: number;
  isLiveSyncReady: boolean;
};

const noopContext: CollaborativeLayoutContextValue = {
  publishClusterLayout: () => {},
  liveParticipantCount: 0,
  isLiveSyncReady: false,
};

const CollaborativeLayoutContext = createContext<CollaborativeLayoutContextValue>(noopContext);

export const CollaborativePlayProvider = ({ children }: { children: ReactNode }) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  return (
    <PlayProvider
      initOptions={{
        room: PLAYHTML_ROOM,
        cursors: { enabled: true },
      }}
    >
      {children}
    </PlayProvider>
  );
};

const areClusterOverridesEqual = (left: ClusterCenterOverrides, right: ClusterCenterOverrides): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const CollaborativeLayoutBridge = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  children,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  children: ReactNode;
}) => {
  const [remoteOverrides, setRemoteOverrides] = usePageData<ClusterCenterOverrides>(
    "cluster-layout",
    loadClusterCenterOverrides()
  );
  const { isLoading } = usePlayContext();
  const cursorPresences = useCursorPresences();
  const localRef = useRef(clusterOverrides);
  const remoteRef = useRef(remoteOverrides);

  localRef.current = clusterOverrides;
  remoteRef.current = remoteOverrides;

  useEffect(() => {
    if (isLoading || draggingClusterIdRef.current) {
      return;
    }
    if (areClusterOverridesEqual(remoteOverrides, localRef.current)) {
      return;
    }
    setClusterOverrides(remoteOverrides);
  }, [draggingClusterIdRef, isLoading, remoteOverrides, setClusterOverrides]);

  const publishClusterLayout = useCallback(
    (overrides: ClusterCenterOverrides) => {
      if (areClusterOverridesEqual(overrides, remoteRef.current)) {
        return;
      }
      setRemoteOverrides(overrides);
    },
    [setRemoteOverrides]
  );

  const value: CollaborativeLayoutContextValue = {
    publishClusterLayout,
    liveParticipantCount: cursorPresences.size,
    isLiveSyncReady: !isLoading,
  };

  return <CollaborativeLayoutContext.Provider value={value}>{children}</CollaborativeLayoutContext.Provider>;
};

export const CollaborativeLayoutProvider = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  children,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  children: ReactNode;
}) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  return (
    <CollaborativeLayoutBridge
      clusterOverrides={clusterOverrides}
      setClusterOverrides={setClusterOverrides}
      draggingClusterIdRef={draggingClusterIdRef}
    >
      {children}
    </CollaborativeLayoutBridge>
  );
};

export const useCollaborativeLayout = (): CollaborativeLayoutContextValue =>
  useContext(CollaborativeLayoutContext);

const GraphCursorZoneInner = ({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) => {
  useCursorZone(panelRef);
  return null;
};

export const GraphCursorZone = ({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) => {
  if (!isWebDeployment) {
    return null;
  }
  return <GraphCursorZoneInner panelRef={panelRef} />;
};

export const LiveCollaborationBadge = () => {
  if (!isWebDeployment) {
    return null;
  }

  const { liveParticipantCount, isLiveSyncReady } = useCollaborativeLayout();
  if (!isLiveSyncReady) {
    return <span className="music-cue-live-badge music-cue-live-badge-connecting">Connecting live sync…</span>;
  }

  const participantLabel =
    liveParticipantCount === 1 ? "1 person here" : `${liveParticipantCount} people here`;
  return <span className="music-cue-live-badge">Live · {participantLabel}</span>;
};

export const ClusterLayoutPublisher = ({
  publishRef,
}: {
  publishRef: MutableRefObject<(overrides: ClusterCenterOverrides) => void>;
}) => {
  if (!isWebDeployment) {
    return null;
  }

  const { publishClusterLayout } = useCollaborativeLayout();

  useEffect(() => {
    publishRef.current = publishClusterLayout;
  }, [publishClusterLayout, publishRef]);

  return null;
};
