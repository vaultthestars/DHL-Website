import * as Tone from "tone";
import type { ChordSelection } from "./accordionGrid";
import { BEAT_COUNT, PITCH_ROW_COUNT, type NoteGrid } from "./gameTypes";
import { pitchRowToName } from "./accordionGrid";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Default song playback tempo (beats per minute). */
const DEFAULT_PLAYBACK_BPM = 240;

const noteNameToMidi = (name: string, octave = 4): number => {
  const index = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  return (index < 0 ? 0 : index) + (octave + 1) * 12;
};

const midiToNote = (midi: number): string => Tone.Frequency(midi, "midi").toNote();

let audioReady = false;

export const ensureAudioReady = async (): Promise<void> => {
  if (audioReady) {
    return;
  }
  await Tone.start();
  audioReady = true;
};

const createInstruments = () => {
  const piano = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.45, release: 1.2 },
  }).toDestination();
  piano.volume.value = -6;

  const melody = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.15, release: 0.25 },
  }).toDestination();
  melody.volume.value = -10;

  const bassDrum = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
  }).toDestination();

  const snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
  }).toDestination();
  snare.volume.value = -10;

  return { piano, melody, bassDrum, snare };
};

const chordMidiNotes = (chord: ChordSelection): number[] => {
  const rootMidi = noteNameToMidi(chord.root, 3);
  if (chord.quality === "Maj") {
    return [rootMidi, rootMidi + 4, rootMidi + 7];
  }
  if (chord.quality === "min") {
    return [rootMidi, rootMidi + 3, rootMidi + 7];
  }
  if (chord.quality === "7th") {
    return [rootMidi, rootMidi + 4, rootMidi + 10];
  }
  return [rootMidi, rootMidi + 3, rootMidi + 6, rootMidi + 9];
};

const playHihat = (time: number): void => {
  const hihat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).toDestination();
  hihat.volume.value = -18;
  hihat.triggerAttackRelease("32n", time);
  hihat.dispose();
};

const scheduleMeasure = (
  instruments: ReturnType<typeof createInstruments>,
  chord: ChordSelection,
  notes: NoteGrid,
  startTime: number,
  beatSeconds: number,
  onBeat?: (beat: number) => void
) => {
  const measureSeconds = beatSeconds * BEAT_COUNT;
  const chordNotes = chordMidiNotes(chord).map(midiToNote);
  instruments.piano.triggerAttackRelease(chordNotes, measureSeconds * 0.92, startTime);

  for (let beat = 0; beat < BEAT_COUNT; beat += 1) {
    const time = startTime + beat * beatSeconds + 0.001;
    Tone.Draw.schedule(() => {
      onBeat?.(beat);
    }, time);

    for (let row = 0; row < PITCH_ROW_COUNT; row += 1) {
      if (!notes[row]?.[beat]) {
        continue;
      }
      const note = midiToNote(noteNameToMidi(pitchRowToName(row), 4));
      instruments.melody.triggerAttackRelease(note, beatSeconds * 0.75, time + row * 0.0001);
    }

    if (notes[PITCH_ROW_COUNT]?.[beat]) {
      instruments.bassDrum.triggerAttackRelease("C2", "8n", time);
    }
    if (notes[PITCH_ROW_COUNT + 1]?.[beat]) {
      instruments.snare.triggerAttackRelease("8n", time + 0.0002);
    }
    if (notes[PITCH_ROW_COUNT + 2]?.[beat]) {
      playHihat(time + 0.0004);
    }
  }
};

export type MeasureLoopOptions = {
  bpm?: number;
  onBeat?: (beat: number) => void;
};

export type MeasurePlayback = {
  done: Promise<void>;
  stop: () => void;
};

/** Plays a single 16-beat measure once. */
export const playMeasureOnce = async (
  chord: ChordSelection,
  notes: NoteGrid,
  options: MeasureLoopOptions = {}
): Promise<MeasurePlayback> => {
  const { bpm = DEFAULT_PLAYBACK_BPM, onBeat } = options;
  await ensureAudioReady();
  const instruments = createInstruments();
  const beatSeconds = 60 / bpm;
  const measureSeconds = beatSeconds * BEAT_COUNT;
  let finished = false;

  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const dispose = () => {
    instruments.piano.dispose();
    instruments.melody.dispose();
    instruments.bassDrum.dispose();
    instruments.snare.dispose();
  };

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    window.clearTimeout(measureTimeout);
    dispose();
    resolveDone();
  };

  const startTime = Tone.now() + 0.08;
  scheduleMeasure(instruments, chord, notes, startTime, beatSeconds, (beat) => {
    if (!finished) {
      onBeat?.(beat);
    }
  });

  const measureTimeout = window.setTimeout(finish, measureSeconds * 1000 + 80);

  return {
    done,
    stop: finish,
  };
};

/** @deprecated Use playMeasureOnce for playback; loops until stop() is called. */
export const playMeasureLoop = async (
  chord: ChordSelection,
  notes: NoteGrid,
  options: MeasureLoopOptions = {}
): Promise<() => void> => {
  const { bpm = DEFAULT_PLAYBACK_BPM, onBeat } = options;
  await ensureAudioReady();
  const instruments = createInstruments();
  const beatSeconds = 60 / bpm;
  const measureSeconds = beatSeconds * BEAT_COUNT;
  let stopped = false;
  let loopTimeout = 0;

  const loop = () => {
    if (stopped) {
      return;
    }
    const startTime = Tone.now() + 0.08;
    scheduleMeasure(instruments, chord, notes, startTime, beatSeconds, onBeat);
    loopTimeout = window.setTimeout(loop, measureSeconds * 1000);
  };

  loop();

  return () => {
    stopped = true;
    window.clearTimeout(loopTimeout);
    instruments.piano.dispose();
    instruments.melody.dispose();
    instruments.bassDrum.dispose();
    instruments.snare.dispose();
  };
};

export const stopAllAudio = (): void => {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
};
