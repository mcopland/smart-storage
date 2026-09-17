// Generate a collision-free placement ID. crypto.randomUUID() is available in
// all modern browsers and Node 14.17+, and is safe to call synchronously.
export function newPlacementId(): string {
  return crypto.randomUUID();
}

// Derive an item type id from its display name. Item type ids key typeById, so
// a collision silently shadows an existing type; the caller passes the ids
// already in use and gets back one that is free.
export function newTypeId(name: string, existingIds: string[]): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "type";
  const taken = new Set(existingIds);
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
