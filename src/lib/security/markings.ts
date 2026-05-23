/**
 * Client-safe helpers for classification markings.
 *
 * The masking strategy is intentionally simple: if a property has a
 * `sensitivity` tag and the caller hasn't been granted the matching
 * marking, the value is replaced with a sentinel string.
 */

export interface MarkingGrant {
  markingCode: string;
}

export function maskValue<T>(
  value: T,
  sensitivity: string | null | undefined,
  grants: MarkingGrant[],
): T | "■■■■ REDACTED" {
  if (!sensitivity) return value;
  const cleared = grants.some((g) => g.markingCode === sensitivity);
  return cleared ? value : "■■■■ REDACTED";
}
