import { BEAT_COUNT, PITCH_ROW_COUNT, type NoteGrid } from "./gameTypes";

const MESPEAK_PITCH_CENTER = 50;
const SEMITONE_PITCH_STEP = 2;

/** Chronological pitch events in a measure (storage rows 0–11 = pitch class). */
export const listPitchEvents = (
  notes: NoteGrid
): { beat: number; pitchClass: number }[] => {
  const events: { beat: number; pitchClass: number }[] = [];
  for (let beat = 0; beat < BEAT_COUNT; beat += 1) {
    for (let row = 0; row < PITCH_ROW_COUNT; row += 1) {
      if (notes[row]?.[beat]) {
        events.push({ beat, pitchClass: row });
      }
    }
  }
  events.sort((left, right) => left.beat - right.beat || left.pitchClass - right.pitchClass);
  return events;
};

export const pitchClassToMespeakPitch = (pitchClass: number | null): number => {
  if (pitchClass === null) {
    return MESPEAK_PITCH_CENTER;
  }
  const pitch = MESPEAK_PITCH_CENTER + (pitchClass - 6) * SEMITONE_PITCH_STEP;
  return Math.max(20, Math.min(80, Math.round(pitch)));
};

/** Pitches for line 1 and line 2 based on the last melodic notes in the grid. */
export const mespeakPitchesForLyrics = (notes: NoteGrid): [number, number] => {
  const events = listPitchEvents(notes);
  if (events.length === 0) {
    return [MESPEAK_PITCH_CENTER, MESPEAK_PITCH_CENTER];
  }
  if (events.length === 1) {
    const only = pitchClassToMespeakPitch(events[0].pitchClass);
    return [only, only];
  }
  const last = events[events.length - 1].pitchClass;
  const previous = events[events.length - 2].pitchClass;
  return [pitchClassToMespeakPitch(previous), pitchClassToMespeakPitch(last)];
};
