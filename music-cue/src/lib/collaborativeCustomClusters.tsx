import { useCallback, useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { usePageData, usePlayContext } from "@playhtml/react";
import { defaultCustomClusterCatalog } from "./customClusters";
import { isWebDeployment } from "./runtime";
import { loadCustomClusterCatalogState } from "./storage";
import type { CustomClusterCatalog } from "./types";
import type { ClusterLayoutSyncMode } from "./collaborativeLayout";

export const PLAYHTML_CUSTOM_CLUSTER_CATALOG_KEY = "custom-cluster-catalog-room";

export type RoomCustomClusterCatalogState = {
  conglomerate: CustomClusterCatalog;
  isolateByOwner: Record<string, CustomClusterCatalog>;
};

export const normalizeRoomCustomClusterCatalogState = (
  state: Partial<RoomCustomClusterCatalogState> | null | undefined
): RoomCustomClusterCatalogState => ({
  conglomerate:
    state?.conglomerate && Array.isArray(state.conglomerate.clusters)
      ? state.conglomerate
      : defaultCustomClusterCatalog(),
  isolateByOwner:
    state?.isolateByOwner && typeof state.isolateByOwner === "object" ? state.isolateByOwner : {},
});

const areRoomCatalogStatesEqual = (
  left: RoomCustomClusterCatalogState,
  right: RoomCustomClusterCatalogState
): boolean => JSON.stringify(left) === JSON.stringify(right);

const CollaborativeCustomClusterSync = ({
  customClusterCatalogState,
  setCustomClusterCatalogState,
  customClusterSyncMode,
  enableRemotePublish,
  publishRef,
}: {
  customClusterCatalogState: RoomCustomClusterCatalogState;
  setCustomClusterCatalogState: (state: RoomCustomClusterCatalogState) => void;
  customClusterSyncMode: ClusterLayoutSyncMode;
  enableRemotePublish: boolean;
  publishRef: MutableRefObject<(state: RoomCustomClusterCatalogState) => void>;
}) => {
  const [remoteState, setRemoteState] = usePageData<RoomCustomClusterCatalogState>(
    PLAYHTML_CUSTOM_CLUSTER_CATALOG_KEY,
    loadCustomClusterCatalogState()
  );
  const { isLoading } = usePlayContext();
  const localRef = useRef(customClusterCatalogState);
  const remoteRef = useRef(remoteState);

  localRef.current = customClusterCatalogState;
  remoteRef.current = remoteState;

  useEffect(() => {
    if (customClusterSyncMode !== "snapshot" || isLoading) {
      return;
    }
    if (areRoomCatalogStatesEqual(remoteState, localRef.current)) {
      return;
    }
    setCustomClusterCatalogState(normalizeRoomCustomClusterCatalogState(remoteState));
  }, [customClusterSyncMode, isLoading, remoteState, setCustomClusterCatalogState]);

  const publishCustomClusterCatalog = useCallback(
    (state: RoomCustomClusterCatalogState) => {
      if (!enableRemotePublish) {
        return;
      }
      const normalized = normalizeRoomCustomClusterCatalogState(state);
      if (areRoomCatalogStatesEqual(normalized, remoteRef.current)) {
        return;
      }
      setRemoteState(normalized);
    },
    [enableRemotePublish, setRemoteState]
  );

  useEffect(() => {
    publishRef.current = publishCustomClusterCatalog;
  }, [publishCustomClusterCatalog, publishRef]);

  return null;
};

export const CollaborativeCustomClusterProvider = ({
  customClusterCatalogState,
  setCustomClusterCatalogState,
  customClusterSyncMode = "off",
  enableRemotePublish = true,
  publishRef,
  children,
}: {
  customClusterCatalogState: RoomCustomClusterCatalogState;
  setCustomClusterCatalogState: (state: RoomCustomClusterCatalogState) => void;
  customClusterSyncMode?: ClusterLayoutSyncMode;
  enableRemotePublish?: boolean;
  publishRef: MutableRefObject<(state: RoomCustomClusterCatalogState) => void>;
  children: ReactNode;
}) => {
  if (!isWebDeployment) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <CollaborativeCustomClusterSync
        key={PLAYHTML_CUSTOM_CLUSTER_CATALOG_KEY}
        customClusterCatalogState={customClusterCatalogState}
        setCustomClusterCatalogState={setCustomClusterCatalogState}
        customClusterSyncMode={customClusterSyncMode}
        enableRemotePublish={enableRemotePublish}
        publishRef={publishRef}
      />
    </>
  );
};
