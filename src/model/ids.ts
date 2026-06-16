// Generate a collision-free placement ID. crypto.randomUUID() is available in
// all modern browsers and Node 14.17+, and is safe to call synchronously.
export function newPlacementId(): string {
  return crypto.randomUUID();
}
