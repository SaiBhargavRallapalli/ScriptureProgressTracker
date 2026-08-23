// Small shared helper so lib/scriptures.ts and lib/items.ts don't need to
// import from each other just to generate an id.
export function newId(): string {
  return crypto.randomUUID();
}
