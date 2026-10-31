/**
 * Roman Numeral Parser
 * Converts roman numerals (I, vi, ♭VII, etc.) to scale degrees and qualities
 */

export interface ParsedRomanNumeral {
  degree: number; // 1-7 for scale degree
  isFlat: boolean; // true for ♭VI, ♭VII, etc.
  quality: 'major' | 'minor' | 'diminished'; // inferred from case and symbols
  original: string; // original roman numeral string
}

const ROMAN_TO_DEGREE: Record<string, number> = {
  'I': 1,
  'II': 2,
  'III': 3,
  'IV': 4,
  'V': 5,
  'VI': 6,
  'VII': 7,
  'i': 1,
  'ii': 2,
  'iii': 3,
  'iv': 4,
  'v': 5,
  'vi': 6,
  'vii': 7,
};

/**
 * Parse a roman numeral string to get degree and quality
 */
export function parseRomanNumeral(roman: string): ParsedRomanNumeral {
  // Remove whitespace
  const trimmed = roman.trim();
  
  // Check for flat symbol (♭ or b)
  const hasFlat = trimmed.includes('♭') || trimmed.includes('b') || trimmed.includes('♭');
  let cleaned = trimmed.replace(/[♭b]/g, '');
  
  // Check for diminished symbol (° or dim)
  const isDiminished = cleaned.includes('°') || cleaned.includes('dim');
  if (isDiminished) {
    cleaned = cleaned.replace(/[°]|dim/gi, '');
  }
  
  // Get the base roman numeral (uppercase or lowercase)
  const baseNumeral = cleaned;
  const degree = ROMAN_TO_DEGREE[baseNumeral];
  
  if (!degree) {
    throw new Error(`Invalid roman numeral: ${roman}`);
  }
  
  // Determine quality:
  // - Uppercase = major (unless diminished)
  // - Lowercase = minor (unless diminished)
  // - Diminished symbol = diminished
  let quality: 'major' | 'minor' | 'diminished';
  if (isDiminished) {
    quality = 'diminished';
  } else if (baseNumeral === baseNumeral.toUpperCase()) {
    quality = 'major';
  } else {
    quality = 'minor';
  }
  
  return {
    degree,
    isFlat: hasFlat,
    quality,
    original: trimmed,
  };
}

/**
 * Parse an array of roman numerals
 */
export function parseRomanNumerals(romans: string[]): ParsedRomanNumeral[] {
  return romans.map(parseRomanNumeral);
}
