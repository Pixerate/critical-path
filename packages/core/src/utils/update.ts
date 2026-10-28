/**
 * Applies an update payload to a record the way the server does: `null` removes a field and
 * `undefined` leaves it unchanged. For optimistic UI state, where payloads may use `null` to clear
 * a field (see the update schemas in `@critical-path/core/schemas`).
 */
export function applyUpdate<T extends object>(record: T, updates: object): T {
  const next = { ...record } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as T;
}
