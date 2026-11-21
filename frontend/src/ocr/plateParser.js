// Turns raw OCR text into a valid Indian registration number.
//
// Format: SS DD L[L] NNNN   e.g. MH 01 AB 1234, KA 05 M 9876
//   SS   state/UT code (letters)
//   DD   RTO district (digits)
//   L[L] series (1–2 letters)
//   NNNN number (digits)
//
// OCR on plates mostly fails by swapping look-alike characters (O/0, I/1,
// B/8, S/5 …). Because we know which positions must be letters and which
// must be digits, we can fix those swaps deterministically.

export const PLATE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;

export const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
  'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
  'TN', 'TR', 'TS', 'UK', 'UP', 'WB',
]);

const TO_DIGIT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', J: '1', T: '7', Z: '2', S: '5', B: '8', G: '6', A: '4' };
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };

const isLetter = (c) => c >= 'A' && c <= 'Z';
const isDigit = (c) => c >= '0' && c <= '9';

// Coerce one character to the expected class. Returns [char, fixed?] or null.
const coerce = (c, want) => {
  if (want === 'L') {
    if (isLetter(c)) return [c, false];
    return TO_LETTER[c] ? [TO_LETTER[c], true] : null;
  }
  if (isDigit(c)) return [c, false];
  return TO_DIGIT[c] ? [TO_DIGIT[c], true] : null;
};

const PATTERNS = ['LLDDLLDDDD', 'LLDDLDDDD'];

// Try to read `chunk` as a plate with the given pattern.
const fit = (chunk, pattern) => {
  if (chunk.length !== pattern.length) return null;
  let out = '';
  let fixes = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const r = coerce(chunk[i], pattern[i]);
    if (!r) return null;
    out += r[0];
    if (r[1]) fixes += 1;
  }
  return { plate: out, fixes };
};

// Common state-code misreads that are not simple character-class swaps.
const STATE_FIXES = { NH: 'MH', HH: 'MH', WH: 'MH', MN: 'MN', KK: 'KA', TH: 'TN' };

const score = ({ plate, fixes }, wholeLine) => {
  let s = 10 - fixes * 2;
  // A match that uses every character on the line is far more likely than one
  // that leaves stray characters behind (e.g. KA05M01234 → KA05MO1234, not KA05M0123).
  if (wholeLine) s += 4;
  if (STATE_CODES.has(plate.slice(0, 2))) s += 6;
  if (plate.length === 10) s += 1; // two-letter series is the most common today
  return s;
};

const clean = (text) =>
  String(text || '')
    .toUpperCase()
    // HSRP plates carry a small "IND" next to the chakra.
    .replace(/\bIND\b/g, ' ')
    .replace(/[^A-Z0-9\n]/g, '');

/**
 * Extract the most likely plate from raw OCR output.
 * @param {string} rawText text returned by the OCR engine (may span lines)
 * @returns {{plate: string, fixes: number, confidence: 'high'|'medium'|'low'} | null}
 */
export function extractPlate(rawText) {
  const lines = clean(rawText).split('\n').filter(Boolean);
  // Two-row plates (common on autos/bikes) are split across lines, so also
  // try the lines joined together.
  const sources = [...lines, lines.join('')];

  let best = null;
  for (const src of sources) {
    for (const pattern of PATTERNS) {
      for (let i = 0; i + pattern.length <= src.length; i += 1) {
        const r = fit(src.slice(i, i + pattern.length), pattern);
        if (!r) continue;
        const prefix = r.plate.slice(0, 2);
        if (!STATE_CODES.has(prefix) && STATE_FIXES[prefix]) {
          r.plate = STATE_FIXES[prefix] + r.plate.slice(2);
          r.fixes += 1;
        }
        const s = score(r, pattern.length === src.length);
        if (!best || s > best.score) best = { ...r, score: s };
      }
    }
  }
  if (!best) return null;

  const validState = STATE_CODES.has(best.plate.slice(0, 2));
  let confidence = 'low';
  if (validState && best.fixes === 0) confidence = 'high';
  else if (validState && best.fixes <= 2) confidence = 'medium';

  return { plate: best.plate, fixes: best.fixes, confidence };
}

export const isValidPlate = (p) => PLATE_REGEX.test(p);
