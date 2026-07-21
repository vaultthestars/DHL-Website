import { createContext, useCallback, useContext, useEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { PlayProvider, usePageData, usePlayContext } from "@playhtml/react";
import { isWebDeployment } from "./runtime";
import { loadClusterCenterOverrides, normalizeClusterCenterOverrides, type ClusterLayoutScope } from "./storage";
import type { ClusterCenterOverrides } from "./types";

export const PLAYHTML_ROOM = "dhl-music-cue-v1";

export const clusterLayoutPageDataKey = (scope: ClusterLayoutScope): string => `cluster-layout-${scope}`;

type CollaborativeLayoutContextValue = {
  publishClusterLayout: (overrides: ClusterCenterOverrides) => void;
  isLiveSyncReady: boolean;
};

const noopContext: CollaborativeLayoutContextValue = {
  publishClusterLayout: () => {},
  isLiveSyncReady: false,
};

const CollaborativeLayoutContext = createContext<CollaborativeLayoutContextValue>(noopContext);

export const CollaborativePlayProvider = ({ children }: { children: ReactNode }) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  return (
    <PlayProvider
      pathname="/music-cue/"
      initOptions={{
        room: PLAYHTML_ROOM,
        cursors: {
          enabled: true,
          shouldRenderCursor: () => false,
        },
      }}
    >
      {children}
    </PlayProvider>
  );
};

const areClusterOverridesEqual = (left: ClusterCenterOverrides, right: ClusterCenterOverrides): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export type ClusterLayoutSyncMode = "live" | "snapshot" | "off";

const CollaborativeLayoutBridge = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  layoutScope,
  clusterLayoutSyncMode,
  enableRemoteClusterPublish,
  children,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  layoutScope: ClusterLayoutScope;
  clusterLayoutSyncMode: ClusterLayoutSyncMode;
  enableRemoteClusterPublish: boolean;
  children: ReactNode;
}) => {
  const pageDataKey = clusterLayoutPageDataKey(layoutScope);
  const [remoteOverrides, setRemoteOverrides] = usePageData<ClusterCenterOverrides>(
    pageDataKey,
    loadClusterCenterOverrides(layoutScope)
  );
  const { isLoading } = usePlayContext();
  const localRef = useRef(clusterOverrides);
  const remoteRef = useRef(remoteOverrides);
  const lastAppliedRemoteRef = useRef<string | null>(null);
  const snapshotAppliedRef = useRef(false);

  localRef.current = clusterOverrides;
  remoteRef.current = remoteOverrides;

  useEffect(() => {
    if (clusterLayoutSyncMode === "off" || isLoading || draggingClusterIdRef.current) {
      return;
    }

    const remoteKey = JSON.stringify(remoteOverrides);
    if (remoteKey === lastAppliedRemoteRef.current) {
      return;
    }
    if (areClusterOverridesEqual(remoteOverrides, localRef.current)) {
      lastAppliedRemoteRef.current = remoteKey;
      return;
    }

    if (clusterLayoutSyncMode === "snapshot") {
      if (snapshotAppliedRef.current) {
        return;
      }
      snapshotAppliedRef.current = true;
    }

    lastAppliedRemoteRef.current = remoteKey;
    setClusterOverrides(normalizeClusterCenterOverrides(remoteOverrides));
  }, [
    clusterLayoutSyncMode,
    draggingClusterIdRef,
    isLoading,
    remoteOverrides,
    setClusterOverrides,
  ]);

  const publishClusterLayout = useCallback(
    (overrides: ClusterCenterOverrides) => {
      if (!enableRemoteClusterPublish) {
        return;
      }
      if (areClusterOverridesEqual(overrides, remoteRef.current)) {
        return;
      }
      setRemoteOverrides(overrides);
    },
    [enableRemoteClusterPublish, setRemoteOverrides]
  );

  const value: CollaborativeLayoutContextValue = {
    publishClusterLayout,
    isLiveSyncReady: !isLoading,
  };

  return <CollaborativeLayoutContext.Provider value={value}>{children}</CollaborativeLayoutContext.Provider>;
};

export const CollaborativeLayoutProvider = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  layoutScope,
  clusterLayoutSyncMode = "live",
  enableRemoteClusterPublish = true,
  children,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  layoutScope: ClusterLayoutScope;
  clusterLayoutSyncMode?: ClusterLayoutSyncMode;
  enableRemoteClusterPublish?: boolean;
  children: ReactNode;
}) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  return (
    <CollaborativeLayoutBridge
      key={layoutScope}
      clusterOverrides={clusterOverrides}
      setClusterOverrides={setClusterOverrides}
      draggingClusterIdRef={draggingClusterIdRef}
      layoutScope={layoutScope}
      clusterLayoutSyncMode={clusterLayoutSyncMode}
      enableRemoteClusterPublish={enableRemoteClusterPublish}
    >
      {children}
    </CollaborativeLayoutBridge>
  );
};

export const useCollaborativeLayout = (): CollaborativeLayoutContextValue =>
  useContext(CollaborativeLayoutContext);

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
