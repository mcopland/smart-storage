// Tray metrics: single source of truth for inventory sizing.
// Panel width is DERIVED from the tile content (size, gap, column count, padding,
// and the reserved scrollbar gutter) so it always hugs the columns exactly,
// regardless of how the tiles are styled. No magic width constants.
export function trayMetrics(isRail: boolean) {
  const tileSize = isRail ? 68 : 76;
  const gap = isRail ? 6 : 8;
  const cols = isRail ? 1 : 2;
  const padL = isRail ? 10 : 16;
  const padR = isRail ? 2 : 8;
  const gutter = 8; // scrollbar-gutter: stable keeps width constant whether or not it scrolls
  const width = padL + cols * tileSize + (cols - 1) * gap + padR + gutter;
  return {
    tileSize,
    gap,
    cols,
    padL,
    padR,
    gutter,
    width,
    padCss: `14px ${padR}px 14px ${padL}px`,
  };
}
