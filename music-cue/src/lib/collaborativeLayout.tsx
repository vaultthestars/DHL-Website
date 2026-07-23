import { useCallback, useEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { PlayProvider, usePageData, usePlayContext } from "@playhtml/react";
import { isWebDeployment } from "./runtime";
import {
  loadClusterCenterOverrides,
  normalizeClusterCenterOverrides,
  type ClusterLayoutScope,
} from "./storage";
import type { ClusterCenterOverrides } from "./types";

export const PLAYHTML_ROOM = "dhl-music-cue-v1";

export const clusterLayoutPageDataKey = (scope: ClusterLayoutScope): string => `cluster-layout-${scope}`;

/** Single room-wide cluster layout for live collaboration (independent of song-space scope). */
export const PLAYHTML_CLUSTER_LAYOUT_KEY = "cluster-layout-room";

export type ClusterLayoutSyncMode = "snapshot" | "off";

const areClusterOverridesEqual = (left: ClusterCenterOverrides, right: ClusterCenterOverrides): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Isolated sync layer — re-renders alone; never wraps the graph. */
const CollaborativeLayoutSync = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  layoutSyncPausedRef,
  roomLayoutSeed,
  clusterLayoutSyncMode,
  enableRemoteClusterPublish,
  publishRef,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  layoutSyncPausedRef?: RefObject<boolean>;
  roomLayoutSeed: ClusterCenterOverrides;
  clusterLayoutSyncMode: ClusterLayoutSyncMode;
  enableRemoteClusterPublish: boolean;
  publishRef: MutableRefObject<(overrides: ClusterCenterOverrides) => void>;
}) => {
  const pageDataKey = PLAYHTML_CLUSTER_LAYOUT_KEY;
  const [remoteOverrides, setRemoteOverrides] = usePageData<ClusterCenterOverrides>(
    pageDataKey,
    roomLayoutSeed
  );
  const { isLoading } = usePlayContext();
  const localRef = useRef(clusterOverrides);
  const remoteRef = useRef(remoteOverrides);
  const applyingRemoteRef = useRef(false);

  localRef.current = clusterOverrides;
  remoteRef.current = remoteOverrides;

  useEffect(() => {
    if (
      clusterLayoutSyncMode !== "snapshot" ||
      isLoading ||
      draggingClusterIdRef.current ||
      layoutSyncPausedRef?.current
    ) {
      return;
    }
    if (areClusterOverridesEqual(remoteOverrides, localRef.current)) {
      return;
    }
    applyingRemoteRef.current = true;
    setClusterOverrides(normalizeClusterCenterOverrides(remoteOverrides));
    queueMicrotask(() => {
      applyingRemoteRef.current = false;
    });
  }, [
    clusterLayoutSyncMode,
    draggingClusterIdRef,
    isLoading,
    layoutSyncPausedRef,
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

  useEffect(() => {
    publishRef.current = publishClusterLayout;
  }, [publishClusterLayout, publishRef]);

  return null;
};

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
          enableChat: true,
          shouldRenderCursor: () => false,
        },
      }}
    >
      {children}
    </PlayProvider>
  );
};

export const CollaborativeLayoutProvider = ({
  clusterOverrides,
  setClusterOverrides,
  draggingClusterIdRef,
  layoutSyncPausedRef,
  layoutScope,
  roomLayoutSeed,
  clusterLayoutSyncMode = "off",
  enableRemoteClusterPublish = true,
  publishRef,
  children,
}: {
  clusterOverrides: ClusterCenterOverrides;
  setClusterOverrides: (overrides: ClusterCenterOverrides) => void;
  draggingClusterIdRef: RefObject<string | null>;
  layoutSyncPausedRef?: RefObject<boolean>;
  layoutScope: ClusterLayoutScope;
  roomLayoutSeed?: ClusterCenterOverrides;
  clusterLayoutSyncMode?: ClusterLayoutSyncMode;
  enableRemoteClusterPublish?: boolean;
  publishRef: MutableRefObject<(overrides: ClusterCenterOverrides) => void>;
  clusterLayoutSyncRevision?: number;
  children: ReactNode;
}) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  const resolvedRoomLayoutSeed = roomLayoutSeed ?? loadClusterCenterOverrides(layoutScope);

  return (
    <>
      {children}
      <CollaborativeLayoutSync
        key={PLAYHTML_CLUSTER_LAYOUT_KEY}
        clusterOverrides={clusterOverrides}
        setClusterOverrides={setClusterOverrides}
        draggingClusterIdRef={draggingClusterIdRef}
        layoutSyncPausedRef={layoutSyncPausedRef}
        roomLayoutSeed={resolvedRoomLayoutSeed}
        clusterLayoutSyncMode={clusterLayoutSyncMode}
        enableRemoteClusterPublish={enableRemoteClusterPublish}
        publishRef={publishRef}
      />
    </>
  );
};
