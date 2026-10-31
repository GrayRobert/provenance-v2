/**
 * Unified Chord Insertion Pipeline
 * 
 * This module provides a single insertion path for all chord sources:
 * - Suggestions (guided mode)
 * - Palette (free mode)
 * - Builder
 * - Future: Drag & Drop
 * 
 * All insertion goes through this pipeline to ensure consistency
 * and make it easy to add drag & drop later.
 */

import { songApi } from './api';
import { normalizeChordSymbol } from './chordService';

export interface ChordInsertionContext {
  songId: string;
  lineId: string;
  tokenId: string;
  charOffset: number;
}

export interface ChordInsertionResult {
  success: boolean;
  chordId?: string;
  error?: string;
}

/**
 * Insert a chord into a song at a specific location
 * This is the single insertion point for all chord sources
 */
export async function insertChord(
  symbol: string,
  context: ChordInsertionContext
): Promise<ChordInsertionResult> {
  try {
    // Normalize the chord symbol first
    const normalizedSymbol = normalizeChordSymbol(symbol);
    
    // Call the API to insert the chord
    const result = await songApi.addChord(
      context.songId,
      context.lineId,
      context.tokenId,
      context.charOffset,
      normalizedSymbol
    );
    
    return {
      success: true,
      chordId: result.chordId,
    };
  } catch (error: any) {
    console.error('Failed to insert chord', error);
    return {
      success: false,
      error: error.message || 'Failed to insert chord',
    };
  }
}

/**
 * Insert multiple chords in sequence
 * Useful for inserting a phrase or progression
 */
export async function insertChordSequence(
  symbols: string[],
  context: ChordInsertionContext,
  onProgress?: (index: number, total: number) => void
): Promise<ChordInsertionResult[]> {
  const results: ChordInsertionResult[] = [];
  
  for (let i = 0; i < symbols.length; i++) {
    if (onProgress) {
      onProgress(i, symbols.length);
    }
    
    const result = await insertChord(symbols[i], context);
    results.push(result);
    
    // If insertion failed, stop the sequence
    if (!result.success) {
      break;
    }
    
    // For subsequent chords, we might want to adjust the context
    // For now, we'll insert them at the same location
    // In the future, this could be enhanced to space them out
  }
  
  return results;
}

/**
 * Create an insertion handler that can be used by components
 * This provides a convenient way to create a callback with the context
 */
export function createChordInsertionHandler(
  context: ChordInsertionContext,
  onSuccess?: (chordId: string, symbol: string) => void,
  onError?: (error: string) => void
) {
  return async (symbol: string) => {
    const result = await insertChord(symbol, context);
    
    if (result.success && result.chordId) {
      if (onSuccess) {
        onSuccess(result.chordId, symbol);
      }
    } else {
      if (onError) {
        onError(result.error || 'Failed to insert chord');
      }
    }
    
    return result;
  };
}

/**
 * Update context for next chord in sequence
 * This is useful when inserting multiple chords
 */
export function getNextChordContext(
  currentContext: ChordInsertionContext,
  options?: {
    sameLine?: boolean;
    sameToken?: boolean;
    offsetAdjustment?: number;
  }
): ChordInsertionContext {
  // For now, return the same context
  // In the future, this could be enhanced to:
  // - Move to next token
  // - Adjust charOffset
  // - Move to next line
  return {
    ...currentContext,
    charOffset: currentContext.charOffset + (options?.offsetAdjustment || 0),
  };
}
