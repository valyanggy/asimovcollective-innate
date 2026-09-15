import { OrthographicCamera, Vector3 } from "three";

export const DISPLAY_GRID = { spacing: 0.28, minRadius: 0.27, maxRadius: 0.43, fieldFill: 0.78 } as const;
export type GridSpec = { readonly spacing: number; readonly minRadius?: number; readonly maxRadius?: number; readonly fieldFill?: number };

export type GridCell<T> = { item: T; position: Vector3; key: string; depth: number };

/** Project a 3D sample onto a camera-aligned lattice, retaining the nearest sample per cell. */
export function projectToGrid<T extends { position: Vector3 }>(
  items: T[], camera: OrthographicCamera, excluded: ReadonlySet<string> = new Set(),
  grid: GridSpec = DISPLAY_GRID,
): GridCell<T>[] {
  const cells = new Map<string, GridCell<T>>();
  for (const item of items) {
    const local = item.position.clone().applyMatrix4(camera.matrixWorldInverse);
    const column = Math.round(local.x / grid.spacing);
    const row = Math.round(local.y / grid.spacing);
    const key = `${column}:${row}`;
    if (excluded.has(key)) continue;
    const previous = cells.get(key);
    // The camera looks down -Z: the greater local Z is closer to the viewer.
    if (previous && previous.depth >= local.z) continue;
    const depth = local.z;
    local.x = column * grid.spacing;
    local.y = row * grid.spacing;
    cells.set(key, { item, key, depth, position: local.applyMatrix4(camera.matrixWorld) });
  }
  return [...cells.values()];
}
