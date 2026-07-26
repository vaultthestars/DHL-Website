import { useEffect, useState } from "react";
import { isWebDeployment } from "../lib/runtime";
import {
  formatSpotifyRateLimitCooldown,
  getSpotifyImportRateLimitCooldownMs,
} from "../lib/spotifyImportSession";
import type { ConnectionStatus } from "../lib/musicProvider";

const isGraphInteractionActive = (): boolean =>
  Boolean(
    document.querySelector(".music-cue-view-gesturing, .music-cue-graph-panning")
  );

const useSpotifyRateLimitCooldownMs = (
  musicService: string,
  importResumeRevision: number,
  isImporting: boolean
): number => {
  const [cooldownMs, setCooldownMs] = useState(0);

  useEffect(() => {
    if (musicService !== "spotify") {
      setCooldownMs(0);
      return undefined;
    }

    const updateCooldown = () => {
      if (isGraphInteractionActive()) {
        return;
      }
      const next = getSpotifyImportRateLimitCooldownMs();
      setCooldownMs((previous) => (previous === next ? previous : next));
    };

    updateCooldown();
    const intervalId = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(intervalId);
  }, [importResumeRevision, isImporting, musicService]);

  return cooldownMs;
};

export type SpotifyLibraryActionsProps = {
  musicService: string;
  importResumeRevision: number;
  isImporting: boolean;
  spotifyStatusLoading: boolean;
  spotifyCanLoadLibrary: boolean;
  spotifyStatus: ConnectionStatus | null;
  spotifyImportResumeLabel: string | null;
  hasLocalLibrary: boolean;
  isLoadingSharedLibrary: boolean;
  onConnect: () => void;
  onLoadLibrary: () => void;
  onLoadLibraryFresh: () => void;
  onOpenSync: () => void;
  onPublishSharedLibrary: () => void;
  onRefreshSharedLibrary: () => void;
};

export const SpotifyLibraryActions = ({
  musicService,
  importResumeRevision,
  isImporting,
  spotifyStatusLoading,
  spotifyCanLoadLibrary,
  spotifyStatus,
  spotifyImportResumeLabel,
  hasLocalLibrary,
  isLoadingSharedLibrary,
  onConnect,
  onLoadLibrary,
  onLoadLibraryFresh,
  onOpenSync,
  onPublishSharedLibrary,
  onRefreshSharedLibrary,
}: SpotifyLibraryActionsProps) => {
  const rateLimitCooldownMs = useSpotifyRateLimitCooldownMs(
    musicService,
    importResumeRevision,
    isImporting
  );

  return (
    <div className="music-cue-spotify-actions">
      <button
        type="button"
        onClick={onConnect}
        disabled={spotifyStatus?.configured === false}
      >
        {spotifyStatus?.connected ? "Reconnect Spotify" : "Connect Spotify"}
      </button>
      <button
        type="button"
        onClick={onLoadLibrary}
        disabled={
          isImporting || spotifyStatusLoading || !spotifyCanLoadLibrary || rateLimitCooldownMs > 0
        }
        title={
          rateLimitCooldownMs > 0
            ? `Spotify rate limit — wait ${formatSpotifyRateLimitCooldown(rateLimitCooldownMs)}`
            : spotifyStatusLoading
              ? "Checking Spotify connection…"
              : !spotifyCanLoadLibrary
                ? "Connect Spotify first"
                : spotifyImportResumeLabel ?? undefined
        }
      >
        {isImporting
          ? "Loading…"
          : rateLimitCooldownMs > 0
            ? `Wait ${formatSpotifyRateLimitCooldown(rateLimitCooldownMs)}`
            : spotifyStatusLoading
              ? "Checking Spotify…"
              : spotifyImportResumeLabel
                ? "Resume load & share"
                : hasLocalLibrary
                  ? "Sync library"
                  : "Load & share library"}
      </button>
      {spotifyImportResumeLabel && !isImporting && spotifyCanLoadLibrary ? (
        <button
          type="button"
          onClick={onLoadLibraryFresh}
          disabled={!spotifyCanLoadLibrary || rateLimitCooldownMs > 0}
          title={
            rateLimitCooldownMs > 0
              ? `Spotify rate limit — wait ${formatSpotifyRateLimitCooldown(rateLimitCooldownMs)}`
              : spotifyImportResumeLabel
          }
        >
          Start fresh
        </button>
      ) : null}
      {spotifyCanLoadLibrary && !spotifyImportResumeLabel && hasLocalLibrary ? (
        <button
          type="button"
          onClick={onOpenSync}
          disabled={isImporting || spotifyStatusLoading || rateLimitCooldownMs > 0}
          title="Import only new or changed playlists"
        >
          Sync updates
        </button>
      ) : null}
      {isWebDeployment && spotifyStatus?.connected ? (
        <button type="button" onClick={onPublishSharedLibrary} disabled={isImporting}>
          {isImporting ? "Publishing…" : "Re-share library"}
        </button>
      ) : null}
      {isWebDeployment ? (
        <button type="button" onClick={onRefreshSharedLibrary} disabled={isLoadingSharedLibrary}>
          {isLoadingSharedLibrary ? "Refreshing…" : "Refresh shared"}
        </button>
      ) : null}
    </div>
  );
};
