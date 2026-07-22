#!/usr/bin/env tsx
/**
 * Re-sanitize every shared-library snapshot in R2/local storage.
 * Requires SHARED_LIBRARY_S3_* env vars (or uses .data/shared-libraries locally).
 *
 * Usage:
 *   cd music-cue && npx tsx scripts/sanitize-shared-library-snapshots.ts
 *   cd music-cue && npx tsx scripts/sanitize-shared-library-snapshots.ts <contributorId>
 */
import {
  getSharedLibrarySnapshot,
  listSharedLibraryContributors,
  saveSharedLibrarySnapshot,
} from "../server/sharedLibraryStore.js";

const targetContributorId = process.argv[2]?.trim() || "";

const main = async (): Promise<void> => {
  const index = await listSharedLibraryContributors();
  const contributorIds = targetContributorId
    ? index.contributors.filter((contributor) => contributor.id === targetContributorId).map((c) => c.id)
    : index.contributors.map((contributor) => contributor.id);

  if (contributorIds.length === 0) {
    console.log(targetContributorId ? `No contributor found for id ${targetContributorId}` : "No shared library snapshots found.");
    return;
  }

  for (const contributorId of contributorIds) {
    const snapshot = await getSharedLibrarySnapshot(contributorId);
    if (!snapshot) {
      console.log(`Skip ${contributorId}: snapshot missing`);
      continue;
    }

    const beforePlaylistCount = snapshot.stats.playlistIds?.length ?? 0;
    await saveSharedLibrarySnapshot({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
    const after = await getSharedLibrarySnapshot(contributorId);
    const afterPlaylistCount = after?.stats.playlistIds?.length ?? 0;
    console.log(
      `${snapshot.contributor.name} (${contributorId}): playlists ${beforePlaylistCount} → ${afterPlaylistCount}, tracks ${after?.songs.length ?? 0}`
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
