import RBush from "rbush";
import {
  compareZIndexKeys,
  type BoardElement,
  type Bounds,
  type Point,
} from "@doska/shared";

export type ResizeHandleKind =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

export type TransformHandleKind = ResizeHandleKind | "rotate";

export interface HandleDescriptor {
  kind: TransformHandleKind;
  /** World-space position of the handle center */
  x: number;
  y: number;
}

export interface SmartGuideLine {
  orientation: "vertical" | "horizontal";
  /** X coordinate for vertical guide, Y coordinate for horizontal guide (in world space) */
  position: number;
  /** Span start/end along the perpendicular axis for rendering */
  start: number;
  end: number;
}

export interface SmartGuideResult {
  snappedX: number;
  snappedY: number;
  guides: SmartGuideLine[];
}

export interface SpatialItem extends Bounds {
  id: string;
  element: BoardElement;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function rotatePointAround(
  point: Point,
  center: Point,
  angleDeg: number
): Point {
  if (angleDeg === 0) return { x: point.x, y: point.y };
  const rad = degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function getElementCenter(el: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Point {
  return {
    x: el.x + el.width / 2,
    y: el.y + el.height / 2,
  };
}

/**
 * Computes the world-space axis-aligned bounding box of a (possibly rotated) element.
 */
export function getElementAABB(el: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}): Bounds {
  if (!el.rotation) {
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
    };
  }
  const center = getElementCenter(el);
  const corners: Point[] = [
    rotatePointAround({ x: el.x, y: el.y }, center, el.rotation),
    rotatePointAround({ x: el.x + el.width, y: el.y }, center, el.rotation),
    rotatePointAround(
      { x: el.x + el.width, y: el.y + el.height },
      center,
      el.rotation
    ),
    rotatePointAround({ x: el.x, y: el.y + el.height }, center, el.rotation),
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, minY, maxX, maxY };
}

export function getSceneBounds(elements: readonly BoardElement[]): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getElementAABB(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Precise point-in-element hit test accounting for element rotation and shape geometry.
 */
export function isPointInsideElement(
  worldPoint: Point,
  el: BoardElement,
  toleranceWorld = 2
): boolean {
  const center = getElementCenter(el);
  const local = rotatePointAround(worldPoint, center, -el.rotation);

  const halfW = el.width / 2 + toleranceWorld;
  const halfH = el.height / 2 + toleranceWorld;
  const dx = local.x - center.x;
  const dy = local.y - center.y;

  if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) {
    return false;
  }

  if (el.type === "shape") {
    if (el.shapeKind === "ellipse") {
      const rx = Math.max(1, halfW);
      const ry = Math.max(1, halfH);
      return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    if (el.shapeKind === "diamond") {
      const rx = Math.max(1, halfW);
      const ry = Math.max(1, halfH);
      return Math.abs(dx) / rx + Math.abs(dy) / ry <= 1;
    }
  }

  return true;
}

/**
 * Computes the 8 resize handles + 1 rotation handle in world coordinates for an element.
 */
export function getTransformHandles(
  el: Pick<BoardElement, "x" | "y" | "width" | "height" | "rotation">,
  zoom = 1
): HandleDescriptor[] {
  const center = getElementCenter(el);
  const { x, y, width: w, height: h, rotation } = el;
  const rotateOffsetWorld = 26 / Math.max(0.1, zoom);

  const raw: HandleDescriptor[] = [
    { kind: "nw", x, y },
    { kind: "n", x: x + w / 2, y },
    { kind: "ne", x: x + w, y },
    { kind: "e", x: x + w, y: y + h / 2 },
    { kind: "se", x: x + w, y: y + h },
    { kind: "s", x: x + w / 2, y: y + h },
    { kind: "sw", x, y: y + h },
    { kind: "w", x, y: y + h / 2 },
    { kind: "rotate", x: x + w / 2, y: y - rotateOffsetWorld },
  ];

  if (!rotation) return raw;
  return raw.map((item) => {
    const p = rotatePointAround({ x: item.x, y: item.y }, center, rotation);
    return { kind: item.kind, x: p.x, y: p.y };
  });
}

/**
 * Hit-tests transform handles of a selected element.
 */
export function hitTestTransformHandles(
  worldPoint: Point,
  el: Pick<BoardElement, "x" | "y" | "width" | "height" | "rotation">,
  zoom = 1,
  hitRadiusScreenPx = 9
): TransformHandleKind | null {
  const handles = getTransformHandles(el, zoom);
  const radiusWorld = hitRadiusScreenPx / Math.max(0.1, zoom);
  const r2 = radiusWorld * radiusWorld;

  for (const h of handles) {
    const dx = worldPoint.x - h.x;
    const dy = worldPoint.y - h.y;
    if (dx * dx + dy * dy <= r2) {
      return h.kind;
    }
  }
  return null;
}

/**
 * Computes resized element geometry `{ x, y, width, height }` when dragging a resize handle
 * in world space, preserving rotation around the opposite anchor point.
 */
export function resizeElementBox(
  initial: Pick<BoardElement, "x" | "y" | "width" | "height" | "rotation">,
  handle: ResizeHandleKind,
  worldPointer: Point,
  minSize = 32,
  keepAspect = false
): { x: number; y: number; width: number; height: number } {
  const center = getElementCenter(initial);
  const localPointer = rotatePointAround(
    worldPointer,
    center,
    -initial.rotation
  );

  let left = initial.x;
  let right = initial.x + initial.width;
  let top = initial.y;
  let bottom = initial.y + initial.height;

  if (handle.includes("w")) {
    left = Math.min(localPointer.x, right - minSize);
  }
  if (handle.includes("e")) {
    right = Math.max(localPointer.x, left + minSize);
  }
  if (handle.includes("n")) {
    top = Math.min(localPointer.y, bottom - minSize);
  }
  if (handle.includes("s")) {
    bottom = Math.max(localPointer.y, top + minSize);
  }

  let width = right - left;
  let height = bottom - top;

  if (keepAspect && initial.width > 0 && initial.height > 0) {
    const ratio = initial.width / initial.height;
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    if (handle.includes("w")) left = right - width;
    else right = left + width;
    if (handle.includes("n")) top = bottom - height;
    else bottom = top + height;
  }

  const newLocalCenter = {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
  };
  const newWorldCenter = rotatePointAround(
    newLocalCenter,
    center,
    initial.rotation
  );

  return {
    x: newWorldCenter.x - width / 2,
    y: newWorldCenter.y - height / 2,
    width,
    height,
  };
}

/**
 * Computes smart alignment guides (left, center, right / top, middle, bottom)
 * when dragging a bounding box relative to other elements on the canvas.
 */
export function computeSmartGuides(
  movingBox: { x: number; y: number; width: number; height: number },
  candidates: readonly BoardElement[],
  excludeIds: ReadonlySet<string>,
  thresholdWorld = 6
): SmartGuideResult {
  let snappedX = movingBox.x;
  let snappedY = movingBox.y;
  let bestDx = thresholdWorld + 0.001;
  let bestDy = thresholdWorld + 0.001;

  let vGuide: SmartGuideLine | null = null;
  let hGuide: SmartGuideLine | null = null;

  const mXPoints = [
    { offset: 0, val: movingBox.x },
    { offset: movingBox.width / 2, val: movingBox.x + movingBox.width / 2 },
    { offset: movingBox.width, val: movingBox.x + movingBox.width },
  ];
  const mYPoints = [
    { offset: 0, val: movingBox.y },
    { offset: movingBox.height / 2, val: movingBox.y + movingBox.height / 2 },
    { offset: movingBox.height, val: movingBox.y + movingBox.height },
  ];

  for (const el of candidates) {
    if (excludeIds.has(el.id)) continue;
    const b = getElementAABB(el);
    const cX = [b.minX, (b.minX + b.maxX) / 2, b.maxX];
    const cY = [b.minY, (b.minY + b.maxY) / 2, b.maxY];

    for (const mp of mXPoints) {
      for (const targetX of cX) {
        const diff = Math.abs(targetX - mp.val);
        if (diff <= thresholdWorld && diff < bestDx) {
          bestDx = diff;
          snappedX = targetX - mp.offset;
          vGuide = {
            orientation: "vertical",
            position: targetX,
            start: Math.min(movingBox.y, b.minY) - 16,
            end: Math.max(movingBox.y + movingBox.height, b.maxY) + 16,
          };
        }
      }
    }

    for (const mp of mYPoints) {
      for (const targetY of cY) {
        const diff = Math.abs(targetY - mp.val);
        if (diff <= thresholdWorld && diff < bestDy) {
          bestDy = diff;
          snappedY = targetY - mp.offset;
          hGuide = {
            orientation: "horizontal",
            position: targetY,
            start: Math.min(movingBox.x, b.minX) - 16,
            end: Math.max(movingBox.x + movingBox.width, b.maxX) + 16,
          };
        }
      }
    }
  }

  const guides: SmartGuideLine[] = [];
  if (vGuide) guides.push(vGuide);
  if (hGuide) guides.push(hGuide);

  return { snappedX, snappedY, guides };
}

/**
 * RBush-backed spatial index for fast viewport culling, marquee selection, and z-ordered hit-testing.
 */
export class SpatialIndex {
  private tree = new RBush<SpatialItem>();
  private itemById = new Map<string, SpatialItem>();

  get size(): number {
    return this.itemById.size;
  }

  clear(): void {
    this.tree.clear();
    this.itemById.clear();
  }

  rebuild(elements: readonly BoardElement[]): void {
    this.clear();
    const items: SpatialItem[] = elements.map((element) => {
      const aabb = getElementAABB(element);
      const item: SpatialItem = {
        ...aabb,
        id: element.id,
        element,
      };
      this.itemById.set(element.id, item);
      return item;
    });
    this.tree.load(items);
  }

  upsert(element: BoardElement): void {
    const existing = this.itemById.get(element.id);
    if (existing) {
      this.tree.remove(existing);
    }
    const aabb = getElementAABB(element);
    const next: SpatialItem = {
      ...aabb,
      id: element.id,
      element,
    };
    this.itemById.set(element.id, next);
    this.tree.insert(next);
  }

  remove(id: string): void {
    const existing = this.itemById.get(id);
    if (existing) {
      this.tree.remove(existing);
      this.itemById.delete(id);
    }
  }

  /**
   * Returns visible elements intersecting `viewportBounds`, sorted ascending by `zIndexKey` for painter's order.
   */
  queryViewport(viewportBounds: Bounds): BoardElement[] {
    const hits = this.tree.search(viewportBounds);
    return hits
      .map((h) => h.element)
      .sort((a, b) => {
        const cmp = compareZIndexKeys(a.zIndexKey, b.zIndexKey);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });
  }

  /**
   * Returns elements intersecting a marquee selection rectangle in world coordinates.
   */
  queryMarquee(
    rectBounds: Bounds,
    mode: "intersect" | "contain" = "intersect"
  ): BoardElement[] {
    const normalized: Bounds = {
      minX: Math.min(rectBounds.minX, rectBounds.maxX),
      minY: Math.min(rectBounds.minY, rectBounds.maxY),
      maxX: Math.max(rectBounds.minX, rectBounds.maxX),
      maxY: Math.max(rectBounds.minY, rectBounds.maxY),
    };
    const hits = this.tree.search(normalized);
    const filtered =
      mode === "contain"
        ? hits.filter(
            (item) =>
              item.minX >= normalized.minX &&
              item.maxX <= normalized.maxX &&
              item.minY >= normalized.minY &&
              item.maxY <= normalized.maxY
          )
        : hits;
    return filtered
      .map((h) => h.element)
      .sort((a, b) => compareZIndexKeys(a.zIndexKey, b.zIndexKey));
  }

  /**
   * Returns the topmost element containing `worldPoint` (respecting rotation, shape geometry, and `zIndexKey`).
   */
  hitTestPoint(worldPoint: Point, toleranceWorld = 2): BoardElement | null {
    const searchBox: Bounds = {
      minX: worldPoint.x - toleranceWorld,
      minY: worldPoint.y - toleranceWorld,
      maxX: worldPoint.x + toleranceWorld,
      maxY: worldPoint.y + toleranceWorld,
    };
    const candidates = this.tree
      .search(searchBox)
      .map((h) => h.element)
      .sort((a, b) => {
        // Descending order: topmost element first
        const cmp = compareZIndexKeys(b.zIndexKey, a.zIndexKey);
        return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
      });

    for (const candidate of candidates) {
      if (isPointInsideElement(worldPoint, candidate, toleranceWorld)) {
        return candidate;
      }
    }
    return null;
  }
}
