import type { CasseroleParticipant } from "../lib/casseroleSession";

export const LobbyScreen = ({
  displayName,
  onNameChange,
  participants,
  joinedPlayerIds,
  hasJoinedLobby,
  onJoinSession,
  onBegin,
  canBegin,
  devSoloMode = false,
  playerIdReady = true,
  gameInProgress,
  onWatchGame,
  onResetGame,
}: {
  displayName: string;
  onNameChange: (value: string) => void;
  participants: CasseroleParticipant[];
  joinedPlayerIds: string[];
  hasJoinedLobby: boolean;
  onJoinSession: () => void;
  onBegin: () => void;
  canBegin: boolean;
  devSoloMode?: boolean;
  playerIdReady?: boolean;
  gameInProgress?: boolean;
  onWatchGame?: () => void;
  onResetGame?: () => void;
}) => (
  <div className="casserole-screen casserole-lobby">
    <h1 className="casserole-title">Chord Casserole</h1>
    <p className="casserole-lede">
      A collaborative nonsense song. One measure per person. Chords wander on a secret accordion chart.
    </p>

    <label className="casserole-field">
      <span>Your name</span>
      <input
        type="text"
        value={displayName}
        maxLength={32}
        placeholder="Enter your name"
        onChange={(event) => onNameChange(event.target.value)}
      />
    </label>

    <div className="casserole-participant-list">
      <h2>In the room ({participants.length})</h2>
      {participants.length === 0 ? (
        <p className="casserole-muted">Waiting for players…</p>
      ) : (
        <ul>
          {participants.map((participant) => (
            <li key={participant.id}>
              <span className="casserole-participant-dot" style={{ background: participant.color }} />
              {participant.name}
              {joinedPlayerIds.includes(participant.id) ? (
                <span className="casserole-joined-badge">joined</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>

    {gameInProgress ? (
      <div className="casserole-lobby-notice">
        <p>A game is already in progress in this room.</p>
        <div className="casserole-lobby-actions">
          <button
            type="button"
            className="casserole-primary-btn"
            disabled={!displayName.trim()}
            onClick={onWatchGame}
          >
            Watch current game
          </button>
          <button type="button" className="casserole-secondary-btn" onClick={onResetGame}>
            Reset room to lobby
          </button>
        </div>
      </div>
    ) : (
      <>
        <div className="casserole-lobby-actions">
          <button
            type="button"
            className="casserole-secondary-btn"
            disabled={!displayName.trim() || !playerIdReady || hasJoinedLobby}
            onClick={onJoinSession}
          >
            {hasJoinedLobby ? "Joined" : "Join session"}
          </button>
          <button
            type="button"
            className="casserole-primary-btn"
            disabled={!canBegin}
            onClick={onBegin}
          >
            Begin song
          </button>
        </div>
        {!canBegin ? (
          <p className="casserole-muted">
            {!playerIdReady
              ? "Connecting to the room…"
              : devSoloMode
                ? "Join the session, then begin solo (?dev=1)."
                : "Everyone who wants to play must click Join session. Then whoever clicks Begin song picks the opening chord first."}
          </p>
        ) : (
          <p className="casserole-muted">
            Whoever clicks Begin song goes first and picks the opening chord.
          </p>
        )}
      </>
    )}
  </div>
);
