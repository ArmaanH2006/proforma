let counter = 0;

/** Short unique id for rows the user adds. Not cryptographic. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
