const escapeAppleScriptString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const NOW_PLAYING_PLAYLIST_NAME = "MusicCue — Now Playing";

export type CueTrack = {
  artist: string;
  title: string;
  persistentId?: string;
};

const buildFindTrackBlock = (
  artist: string,
  title: string,
  persistentId: string | undefined,
  variableName: string
): string => {
  const safeArtist = escapeAppleScriptString(artist);
  const safeTitle = escapeAppleScriptString(title);
  const safePersistentId = persistentId ? escapeAppleScriptString(persistentId) : "";

  const persistentIdBlock =
    safePersistentId.length > 0
      ? `    try
      set ${variableName} to (first track of library playlist 1 whose persistent ID is "${safePersistentId}")
    end try
`
      : "";

  return `    set ${variableName} to missing value
${persistentIdBlock}    if ${variableName} is missing value then
      try
        set ${variableName} to (first track of library playlist 1 whose artist is "${safeArtist}" and name is "${safeTitle}")
      end try
    end if
    if ${variableName} is missing value then
      try
        set ${variableName} to (first track of library playlist 1 whose artist contains "${safeArtist}" and name contains "${safeTitle}")
      end try
    end if`;
};

const buildDuplicateTracksBlock = (tracks: CueTrack[], playlistVariable: string): string =>
  tracks
    .map((track, index) => {
      const variableName = `matchTrack${index}`;
      return `${buildFindTrackBlock(track.artist, track.title, track.persistentId, variableName)}
    if ${variableName} is not missing value then
      duplicate ${variableName} to end of ${playlistVariable}
    end if`;
    })
    .join("\n");

const buildMatchedIdsCollector = (playlistVariable: string): string => `  set matchedIds to ""
  repeat with tr in (tracks of ${playlistVariable})
    set matchedIds to matchedIds & (persistent ID of tr) & ","
  end repeat`;

const buildCuePlaylistScript = (
  tracks: CueTrack[],
  playlistName: string,
  options: { replaceExisting: boolean; play: boolean }
): string => {
  const safePlaylistName = escapeAppleScriptString(playlistName);
  const replaceBlock = options.replaceExisting
    ? `  try
    if (exists playlist playlistName) then
      delete playlist playlistName
    end if
  end try`
    : "";

  const playBlock = options.play
    ? `  if matchedCount > 0 then
    play cuePlaylist
    return (matchedCount as text) & "|||" & matchedIds
  else
    return "0|||"
  end if`
    : `  if matchedCount > 0 then
    return (matchedCount as text) & "|||" & matchedIds & "|||" & playlistName
  else
    return "0|||"
  end if`;

  return `tell application "Music"
  activate
  set playlistName to "${safePlaylistName}"
${replaceBlock}
  set shuffle enabled to false
  set song repeat to off
  set cuePlaylist to make new playlist with properties {name:playlistName}
${buildDuplicateTracksBlock(tracks, "cuePlaylist")}
  set matchedCount to count of tracks of cuePlaylist
${buildMatchedIdsCollector("cuePlaylist")}
${playBlock}
end tell`;
};

export const buildValidateTracksScript = (tracks: CueTrack[]): string => {
  if (tracks.length === 0) {
    return `return ""`;
  }

  const blocks = tracks
    .map((track, index) => {
      const variableName = `matchTrack${index}`;
      const resultKey = escapeAppleScriptString(track.persistentId ?? `track-${index}`);
      return `${buildFindTrackBlock(track.artist, track.title, track.persistentId, variableName)}
    if ${variableName} is not missing value then
      set result${index} to "${resultKey}:1"
    else
      set result${index} to "${resultKey}:0"
    end if`;
    })
    .join("\n");

  const resultExpression =
    tracks.length === 1 ? "result0" : tracks.map((_, index) => `result${index}`).join(' & "|" & ');

  return `tell application "Music"
${blocks}
    return ${resultExpression}
  end tell`;
};

export const parseValidateTracksResult = (raw: string): Record<string, boolean> => {
  const availability: Record<string, boolean> = {};
  raw.split("|").forEach((entry) => {
    const [persistentId, flag] = entry.split(":");
    if (!persistentId) {
      return;
    }
    availability[persistentId] = flag === "1";
  });
  return availability;
};

export const buildPlayCueScript = (tracks: CueTrack[]): string =>
  buildCuePlaylistScript(tracks, NOW_PLAYING_PLAYLIST_NAME, { replaceExisting: true, play: true });

export const buildSaveCuePlaylistScript = (tracks: CueTrack[], playlistName: string): string =>
  buildCuePlaylistScript(tracks, playlistName, { replaceExisting: false, play: false });

export const parsePlayCueResult = (raw: string): { matchedCount: number; matchedPersistentIds: string[] } => {
  const [countText = "0", idsText = ""] = raw.split("|||");
  const matchedCount = Number(countText);
  const matchedPersistentIds = idsText
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return {
    matchedCount: Number.isFinite(matchedCount) ? matchedCount : 0,
    matchedPersistentIds,
  };
};

export const parseSaveCuePlaylistResult = (
  raw: string
): { matchedCount: number; matchedPersistentIds: string[]; playlistName: string } => {
  const [countText = "0", idsText = "", playlistName = ""] = raw.split("|||");
  const parsed = parsePlayCueResult(`${countText}|||${idsText}`);
  return {
    ...parsed,
    playlistName,
  };
};

export const buildPlayTrackNextScript = (track: CueTrack): string => {
  const safeNowPlayingName = escapeAppleScriptString(NOW_PLAYING_PLAYLIST_NAME);
  return `tell application "Music"
  activate
${buildFindTrackBlock(track.artist, track.title, track.persistentId, "matchTrack")}
  if matchTrack is missing value then
    return "not found"
  end if
  try
    set pl to playlist "${safeNowPlayingName}"
  on error
    play matchTrack
    return "playing"
  end try
  set insertIdx to 0
  try
    set currentPid to persistent ID of current track
    repeat with i from 1 to (count of tracks of pl)
      if persistent ID of track i of pl is currentPid then
        set insertIdx to i
        exit repeat
      end if
    end repeat
  end try
  if insertIdx > 0 then
    set trackCount to count of tracks of pl
    if insertIdx < trackCount then
      duplicate matchTrack to before track (insertIdx + 1) of pl
    else
      duplicate matchTrack to end of pl
    end if
    return "queued"
  end if
  duplicate matchTrack to end of pl
  return "queued"
end tell`;
};

export const buildSyncCuePlaylistScript = (
  tracks: CueTrack[],
  resumePersistentId: string | undefined
): string => {
  const safePlaylistName = escapeAppleScriptString(NOW_PLAYING_PLAYLIST_NAME);
  const safeResumeId = resumePersistentId ? escapeAppleScriptString(resumePersistentId) : "";

  const ensurePlaylistBlock = `  set cuePlaylist to missing value
  try
    set cuePlaylist to playlist "${safePlaylistName}"
  on error
    set cuePlaylist to make new playlist with properties {name:"${safePlaylistName}"}
  end try`;

  const clearPlaylistBlock = `  repeat while (count of tracks of cuePlaylist) > 0
    delete track 1 of cuePlaylist
  end repeat`;

  const resumeBlock =
    safeResumeId.length > 0
      ? `  set resumeIdx to 1
  set resumePos to 0
  try
    set resumePos to player position
  end try
  repeat with i from 1 to (count of tracks of cuePlaylist)
    if persistent ID of track i of cuePlaylist is "${safeResumeId}" then
      set resumeIdx to i
      exit repeat
    end if
  end repeat
  if (count of tracks of cuePlaylist) > 0 then
    play track resumeIdx of cuePlaylist
    if resumePos > 1 then
      set player position to resumePos
    end if
  end if`
      : "";

  if (tracks.length === 0) {
    return `tell application "Music"
  activate
  set shuffle enabled to false
  set song repeat to off
${ensurePlaylistBlock}
${clearPlaylistBlock}
  return "0|||"
end tell`;
  }

  return `tell application "Music"
  activate
  set shuffle enabled to false
  set song repeat to off
${ensurePlaylistBlock}
${clearPlaylistBlock}
${buildDuplicateTracksBlock(tracks, "cuePlaylist")}
  set matchedCount to count of tracks of cuePlaylist
${buildMatchedIdsCollector("cuePlaylist")}
${resumeBlock}
  return (matchedCount as text) & "|||" & matchedIds
end tell`;
};

export const buildGetPlaylistTrackIdsScript = (playlistName: string): string => {
  const safePlaylistName = escapeAppleScriptString(playlistName);
  return `tell application "Music"
  try
    set pl to playlist "${safePlaylistName}"
  on error
    return ""
  end try
  set ids to ""
  repeat with tr in (tracks of pl)
    set ids to ids & (persistent ID of tr) & ","
  end repeat
  return ids
end tell`;
};

export const parsePlaylistTrackIdsResult = (raw: string): string[] =>
  raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

export const buildRemoveTrackFromCuePlaylistScript = (persistentId: string): string => {
  const safePlaylistName = escapeAppleScriptString(NOW_PLAYING_PLAYLIST_NAME);
  const safePersistentId = escapeAppleScriptString(persistentId);
  return `tell application "Music"
  try
    set pl to playlist "${safePlaylistName}"
  on error
    return "no playlist"
  end try
  repeat with tr in (tracks of pl)
    if persistent ID of tr is "${safePersistentId}" then
      delete tr
      return "removed"
    end if
  end repeat
  return "not found"
end tell`;
};

export const buildPlayTrackScript = (track: CueTrack): string => {
  return `tell application "Music"
  activate
  set shuffle enabled to false
  set song repeat to off
${buildFindTrackBlock(track.artist, track.title, track.persistentId, "matchTrack")}
  if matchTrack is missing value then
    return "not found"
  end if
  play matchTrack
  return "ok"
end tell`;
};

export const buildNextTrackScript = (): string => `tell application "Music"
  activate
  next track
  return "ok"
end tell`;

export const buildPreviousTrackScript = (): string => `tell application "Music"
  activate
  previous track
  return "ok"
end tell`;

export const buildPlaybackStateScript = (): string => `tell application "Music"
  try
    set trackName to name of current track
    set trackArtist to artist of current track
    set trackIndex to index of current track
    set playlistName to name of current playlist
    set trackPersistentId to persistent ID of current track
    set playbackPosition to player position
    return trackArtist & "|||" & trackName & "|||" & trackIndex & "|||" & playlistName & "|||" & trackPersistentId & "|||" & playbackPosition
  on error
    return "|||0|||||||0"
  end try
end tell`;

export const buildPingScript = (): string => `tell application "Music"
  return name of current track
end tell`;

export const wrapTerminalAppleScriptCommand = (script: string): string =>
  `osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`;

export const buildTerminalSavePlaylistCommand = (tracks: CueTrack[], playlistName: string): string =>
  wrapTerminalAppleScriptCommand(buildSaveCuePlaylistScript(tracks, playlistName));

export const buildTerminalPlayCueCommand = (tracks: CueTrack[]): string =>
  wrapTerminalAppleScriptCommand(buildPlayCueScript(tracks));
