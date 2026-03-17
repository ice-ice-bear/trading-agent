/**
 * Parse a UTC timestamp from the backend.
 * SQLite datetime('now') produces strings like "2026-03-17 01:55:01" without
 * a timezone indicator. JS Date() treats bare strings as local time, causing
 * a 9-hour offset in KST. This appends 'Z' when no timezone info is present.
 */
export function parseUTC(timestamp: string): Date {
  if (timestamp.endsWith('Z') || timestamp.includes('+')) return new Date(timestamp);
  return new Date(timestamp + 'Z');
}
