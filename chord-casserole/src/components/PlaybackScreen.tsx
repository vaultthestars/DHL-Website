import { useEffect, useRef, useState } from "react";
import { ensureAudioReady, playMeasureOnce, stopAllAudio } from "../lib/audioPlayback";
import { mespeakPitchesForLyrics } from "../lib/noteGridPitch";
import { speakLyrics, stopMespeak } from "../lib/mespeakPlayer";
import type { SongPart } from "../lib/gameTypes";
import { NoteGridEditor } from "./NoteGridEditor";

export const PlaybackScreen = ({
  parts,
  playbackIndex,
  onAdvance,
  onFinish,
}: {
  parts: SongPart[];
  playbackIndex: number;
  onAdvance: () => void;
  onFinish: () => void;
}) => {
  const stopLoopRef = useRef<(() => void) | null>(null);
  const [playbackBeat, setPlaybackBeat] = useState<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  const onFinishRef = useRef(onFinish);
  const partsRef = useRef(parts);

  onAdvanceRef.current = onAdvance;
  onFinishRef.current = onFinish;
  partsRef.current = parts;

  useEffect(() => {
    const currentParts = partsRef.current;
    if (playbackIndex >= currentParts.length) {
      onFinishRef.current();
      return;
    }

    const part = currentParts[playbackIndex];
    let cancelled = false;

    const run = async () => {
      await ensureAudioReady();
      if (cancelled) {
        return;
      }

      const measure = await playMeasureOnce(part.chord, part.notes, {
        onBeat: (beat) => {
          if (!cancelled) {
            setPlaybackBeat(beat);
          }
        },
      });
      stopLoopRef.current = measure.stop;

      const lyricPitches = mespeakPitchesForLyrics(part.notes);

      await Promise.all([
        speakLyrics([part.line1, part.line2], { pitches: lyricPitches }),
        measure.done,
      ]);

      if (cancelled) {
        return;
      }
      stopLoopRef.current = null;
      setPlaybackBeat(null);
      onAdvanceRef.current();
    };

    void run();

    return () => {
      cancelled = true;
      stopLoopRef.current?.();
      stopLoopRef.current = null;
      setPlaybackBeat(null);
      stopMespeak();
      stopAllAudio();
    };
  }, [playbackIndex]);

  const part = parts[playbackIndex];

  return (
    <div className="casserole-screen casserole-playback">
      <h1 className="casserole-title">Playing back the casserole</h1>
      <p className="casserole-muted">
        Measure {playbackIndex + 1} of {parts.length}
      </p>
      {part ? (
        <>
          <div className="casserole-playback-card">
            <div className="casserole-chord-pill">{part.chord.label}</div>
            <p className="casserole-lyric-line">{part.line1}</p>
            <p className="casserole-lyric-line">{part.line2}</p>
            <p className="casserole-muted">— {part.playerName}</p>
          </div>

          <div className="casserole-playback-visualizer">
            <div className="casserole-chord-banner">
              Now playing: <strong>{part.chord.label}</strong>
              {playbackBeat !== null ? (
                <span className="casserole-playback-beat">
                  {" "}
                  · beat {playbackBeat + 1}/16
                </span>
              ) : null}
            </div>
            <NoteGridEditor
              notes={part.notes}
              chord={part.chord}
              readOnly
              playbackBeat={playbackBeat}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};
