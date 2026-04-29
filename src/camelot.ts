export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const CAMELOT_NUMBER_MAJOR: Record<number, number> = {
  0: 8,
  1: 3,
  2: 10,
  3: 5,
  4: 12,
  5: 7,
  6: 2,
  7: 9,
  8: 4,
  9: 11,
  10: 6,
  11: 1,
};

export const CAMELOT_NUMBER_MINOR: Record<number, number> = {
  0: 5,
  1: 12,
  2: 7,
  3: 2,
  4: 9,
  5: 4,
  6: 11,
  7: 6,
  8: 1,
  9: 8,
  10: 3,
  11: 10,
};

export function camelotFor(key: number, mode: 0 | 1): string | null {
  if (key == null || key < 0) return null;
  const num = mode === 1 ? CAMELOT_NUMBER_MAJOR[key] : CAMELOT_NUMBER_MINOR[key];
  if (num == null) return null;
  return `${num}${mode === 1 ? 'B' : 'A'}`;
}

export function keyName(key: number, mode: 0 | 1): string {
  if (key == null || key < 0) return 'Unknown';
  return `${PITCH_NAMES[key]} ${mode === 1 ? 'major' : 'minor'}`;
}

export function compatibleCodes(code: string): string[] {
  if (!code) return [];
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  const other = letter === 'A' ? 'B' : 'A';
  const prev = ((num - 2 + 12) % 12) + 1;
  const next = (num % 12) + 1;
  return [`${num}${other}`, `${prev}${letter}`, `${next}${letter}`];
}

export type WheelSlot = {
  num: number;
  letter: 'A' | 'B';
  code: string;
  keyLabel: string;
};

export function buildWheelSlots(): WheelSlot[] {
  const slots: WheelSlot[] = [];
  for (let n = 1; n <= 12; n++) {
    for (const letter of ['A', 'B'] as const) {
      const mode = letter === 'B' ? 1 : 0;
      const table = mode === 1 ? CAMELOT_NUMBER_MAJOR : CAMELOT_NUMBER_MINOR;
      const pitch = Object.keys(table).find((k) => table[Number(k)] === n);
      const keyLabel =
        pitch != null
          ? `${PITCH_NAMES[Number(pitch)]}${mode === 1 ? '' : 'm'}`
          : '';
      slots.push({ num: n, letter, code: `${n}${letter}`, keyLabel });
    }
  }
  return slots;
}
