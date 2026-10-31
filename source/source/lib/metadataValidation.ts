/**
 * Safe character validation for work metadata name and value.
 * Allows letters, digits, space, and common punctuation; no <>& or control chars.
 */
const SAFE_PATTERN = /^[\p{L}\p{N}\s\-_.,;:'"()/\\]*$/u;
const MAX_NAME_LENGTH = 255;
const MAX_VALUE_LENGTH = 10_000;

export function validateMetadataName(name: string): { valid: boolean; error?: string } {
  if (name == null || typeof name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name must be ${MAX_NAME_LENGTH} characters or less` };
  }
  if (!SAFE_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  return { valid: true };
}

export function validateMetadataValue(value: string | null | undefined): { valid: boolean; error?: string } {
  if (value == null) return { valid: true };
  const s = String(value);
  if (s.length > MAX_VALUE_LENGTH) {
    return { valid: false, error: `Value must be ${MAX_VALUE_LENGTH} characters or less` };
  }
  if (!SAFE_PATTERN.test(s)) {
    return { valid: false, error: 'Value contains invalid characters' };
  }
  return { valid: true };
}
