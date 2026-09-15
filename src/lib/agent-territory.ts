export type TerritoryPoint = { x: number; y: number };

/** Keep every agent as a vertex, including concave arrangements. Angular
 * ordering avoids bow-tie edges when agents swap positions while dragging. */
export function orderTerritory(points: TerritoryPoint[]): TerritoryPoint[] {
  const unique = points.filter((point, index) => !points.slice(0, index)
    .some(other => Math.hypot(point.x - other.x, point.y - other.y) < .001));
  if (!unique.length) return [];
  const center = unique.reduce((sum, point) => ({ x: sum.x + point.x / unique.length,
    y: sum.y + point.y / unique.length }), { x: 0, y: 0 });
  return [...unique].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x)
    - Math.atan2(b.y - center.y, b.x - center.x));
}

export function territoryCoverage(point: TerritoryPoint, polygon: TerritoryPoint[], bleed: number): number {
  if (!polygon.length) return 0;
  let inside = false, distance = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    distance = Math.min(distance, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < a.x + (point.y - a.y) * dx / dy) inside = !inside;
  }
  const signedDistance = inside ? distance : -distance;
  const t = Math.max(0, Math.min(1, (signedDistance + bleed) / (bleed * 2)));
  return t * t * (3 - 2 * t);
}

export type TerritoryEllipse = { x: number; y: number; rx: number; ry: number; angle: number };

/** Search for a large inscribed ellipse. In ellipse coordinates each polygon
 * edge must stay outside the unit circle; this also works for concave areas. */
export function fitTerritoryEllipse(polygon: TerritoryPoint[]): TerritoryEllipse | null {
  if (polygon.length < 3) return null;
  const left = Math.min(...polygon.map(p => p.x)), right = Math.max(...polygon.map(p => p.x));
  const top = Math.min(...polygon.map(p => p.y)), bottom = Math.max(...polygon.map(p => p.y));
  let best: TerritoryEllipse | null = null, area = 0;
  for (let row = 1; row < 8; row++) for (let column = 1; column < 8; column++) {
    const x = left + (right - left) * column / 8, y = top + (bottom - top) * row / 8;
    if (territoryCoverage({ x, y }, polygon, .001) < .99) continue;
    for (let rotation = 0; rotation < 12; rotation++) {
      const angle = rotation * Math.PI / 12, cos = Math.cos(angle), sin = Math.sin(angle);
      for (const aspect of [1, 1.35, 1.8, 2.5, 3.5]) {
        const transformed = polygon.map(p => ({ x: ((p.x - x) * cos + (p.y - y) * sin) / aspect,
          y: -(p.x - x) * sin + (p.y - y) * cos }));
        let radius = Infinity;
        for (let index = 0; index < transformed.length; index++) {
          const a = transformed[index], b = transformed[(index + 1) % transformed.length];
          const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
          const t = length ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length)) : 0;
          radius = Math.min(radius, Math.hypot(a.x + dx * t, a.y + dy * t));
        }
        if (radius > 3 && radius * radius * aspect > area) {
          area = radius * radius * aspect;
          best = { x, y, rx: radius * aspect, ry: radius, angle };
        }
      }
    }
  }
  return best;
}
