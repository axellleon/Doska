import type { Bounds, CameraState, Point } from "@doska/shared";

export const MIN_CAMERA_ZOOM = 0.1;
export const MAX_CAMERA_ZOOM = 5.0;

export function clampZoom(
  zoom: number,
  min = MIN_CAMERA_ZOOM,
  max = MAX_CAMERA_ZOOM
): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(min, zoom));
}

/**
 * Converts screen pixel coordinates `(sx, sy)` to world coordinates `(wx, wy)`.
 * Formula: `screen = world * zoom + camera.(x, y)` => `world = (screen - camera.(x, y)) / zoom`.
 */
export function screenToWorld(screen: Point, camera: CameraState): Point {
  const z = camera.zoom || 1;
  return {
    x: (screen.x - camera.x) / z,
    y: (screen.y - camera.y) / z,
  };
}

/**
 * Converts world coordinates `(wx, wy)` to screen pixel coordinates `(sx, sy)`.
 */
export function worldToScreen(world: Point, camera: CameraState): Point {
  return {
    x: world.x * camera.zoom + camera.x,
    y: world.y * camera.zoom + camera.y,
  };
}

/**
 * Zooms the camera around a fixed screen focal point (cursor / pinch center)
 * so the world point beneath `screenPoint` remains stationary on screen.
 */
export function zoomAtPoint(
  camera: CameraState,
  nextZoomRaw: number,
  screenPoint: Point,
  minZoom = MIN_CAMERA_ZOOM,
  maxZoom = MAX_CAMERA_ZOOM
): CameraState {
  const nextZoom = clampZoom(nextZoomRaw, minZoom, maxZoom);
  const worldFocus = screenToWorld(screenPoint, camera);
  return {
    x: screenPoint.x - worldFocus.x * nextZoom,
    y: screenPoint.y - worldFocus.y * nextZoom,
    zoom: nextZoom,
  };
}

/**
 * Translates camera by screen-space delta `(dx, dy)`.
 */
export function panCamera(
  camera: CameraState,
  dx: number,
  dy: number
): CameraState {
  return {
    x: camera.x + dx,
    y: camera.y + dy,
    zoom: camera.zoom,
  };
}

/**
 * Returns the world-space AABB currently visible in a viewport of `(viewportWidth, viewportHeight)`.
 */
export function getViewportWorldBounds(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  paddingWorld = 0
): Bounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera);
  const bottomRight = screenToWorld(
    { x: viewportWidth, y: viewportHeight },
    camera
  );
  return {
    minX: Math.min(topLeft.x, bottomRight.x) - paddingWorld,
    minY: Math.min(topLeft.y, bottomRight.y) - paddingWorld,
    maxX: Math.max(topLeft.x, bottomRight.x) + paddingWorld,
    maxY: Math.max(topLeft.y, bottomRight.y) + paddingWorld,
  };
}

/**
 * Computes a camera state that centers `bounds` inside the viewport with pixel padding.
 */
export function fitCameraToBounds(
  bounds: Bounds | null,
  viewportWidth: number,
  viewportHeight: number,
  paddingPx = 72,
  maxFitZoom = 1.25
): CameraState {
  if (
    !bounds ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    bounds.maxX < bounds.minX ||
    bounds.maxY < bounds.minY
  ) {
    return {
      x: viewportWidth / 2,
      y: viewportHeight / 2,
      zoom: 1,
    };
  }

  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const availW = Math.max(64, viewportWidth - paddingPx * 2);
  const availH = Math.max(64, viewportHeight - paddingPx * 2);

  const zoom = clampZoom(
    Math.min(availW / contentW, availH / contentH, maxFitZoom),
    MIN_CAMERA_ZOOM,
    MAX_CAMERA_ZOOM
  );

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: viewportWidth / 2 - centerX * zoom,
    y: viewportHeight / 2 - centerY * zoom,
    zoom,
  };
}
