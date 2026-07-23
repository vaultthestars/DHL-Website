import { useEffect, useMemo, useState } from "react";
import type { SpotifyPlaylistSummary } from "../../shared/spotifyLibraryAssembly";
import { diffPlaylistCatalog } from "../lib/spotifyLibraryMerge";
import type { LibraryStats } from "../lib/types";

type SpotifySyncDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  playlists: SpotifyPlaylistSummary[];
  localStats: LibraryStats | null;
  onClose: () => void;
  onConfirm: (selection: { playlistIds: string[]; includeSavedTracks: boolean }) => void;
};

export const SpotifySyncDialog = ({
  open,
  loading,
  error,
  playlists,
  localStats,
  onClose,
  onConfirm,
}: SpotifySyncDialogProps) => {
  const { newPlaylists, existingPlaylists } = useMemo(
    () =>
      diffPlaylistCatalog(
        playlists.map((playlist) => ({ id: playlist.id, name: playlist.name })),
        localStats
      ),
    [localStats, playlists]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [includeSavedTracks, setIncludeSavedTracks] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedIds(new Set(newPlaylists.map((playlist) => playlist.id)));
    setIncludeSavedTracks(false);
  }, [newPlaylists, open]);

  if (!open) {
    return null;
  }

  const togglePlaylist = (playlistId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  };

  const renderPlaylistGroup = (
    title: string,
    items: Array<{ id: string; name: string }>,
    hint: string
  ) => (
    <section className="music-cue-sync-group">
      <div className="music-cue-sync-group-header">
        <h3>{title}</h3>
        <p className="music-cue-sync-group-hint">{hint}</p>
      </div>
      {items.length === 0 ? (
        <p className="music-cue-sync-empty">None</p>
      ) : (
        <ul className="music-cue-sync-playlist-list">
          {items.map((playlist) => (
            <li key={playlist.id}>
              <label className="music-cue-sync-playlist-item">
                <input
                  type="checkbox"
                  checked={selectedIds.has(playlist.id)}
                  onChange={() => togglePlaylist(playlist.id)}
                  disabled={loading}
                />
                <span>{playlist.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="music-cue-modal-backdrop" onClick={loading ? undefined : onClose}>
      <div
        className="music-cue-modal music-cue-modal-wide music-cue-sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-cue-sync-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="music-cue-modal-titlebar">
          <span id="music-cue-sync-dialog-title" className="music-cue-modal-title">
            Sync Spotify updates
          </span>
        </div>
        <div className="music-cue-modal-body">
          {loading ? (
            <p className="music-cue-modal-hint">Fetching your Spotify playlists…</p>
          ) : error ? (
            <p className="music-cue-modal-hint">{error}</p>
          ) : (
            <>
              <p className="music-cue-modal-hint">
                Pick what to import. New playlists are pre-selected. Existing playlists are only
                re-fetched if you check them — useful if a playlist changed a lot.
              </p>
              {renderPlaylistGroup(
                "New playlists",
                newPlaylists,
                "Not in your loaded library yet."
              )}
              {renderPlaylistGroup(
                "Already loaded",
                existingPlaylists,
                "Re-import only if you want fresh track lists."
              )}
              <label className="music-cue-sync-saved-tracks">
                <input
                  type="checkbox"
                  checked={includeSavedTracks}
                  onChange={(event) => setIncludeSavedTracks(event.target.checked)}
                  disabled={loading}
                />
                <span>Also refresh Liked Songs (slower — full saved-tracks pass)</span>
              </label>
            </>
          )}
        </div>
        <div className="music-cue-modal-actions">
          <button type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                playlistIds: [...selectedIds],
                includeSavedTracks,
              })
            }
            disabled={loading || (selectedIds.size === 0 && !includeSavedTracks)}
          >
            Sync selected
          </button>
        </div>
      </div>
    </div>
  );
};
