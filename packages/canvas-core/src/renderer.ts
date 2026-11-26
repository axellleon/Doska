import type {
  BoardElement,
  Bounds,
  CameraState,
  ShapeElement,
  StickyNoteElement,
  TextElement,
} from "@doska/shared";
import { getViewportWorldBounds } from "./camera.js";
import {
  degToRad,
  getElementAABB,
  getElementCenter,
  getTransformHandles,
  type SmartGuideLine,
} from "./spatial-index.js";

export interface RenderFrameOptions {
  ctx: CanvasRenderingContext2D;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  camera: CameraState;
  /** Visible elements sorted ascending by `zIndexKey` */
  elements: readonly BoardElement[];
  selectedIds: ReadonlySet<string>;
  hoveredId?: string | null;
  /** Element currently edited via native HTML textarea overlay (skip text draw to avoid ghosting) */
  editingId?: string | null;
  marqueeBounds?: Bounds | null;
  smartGuides?: readonly SmartGuideLine[];
  backgroundColor?: string;
}

const FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        // Break overly long single token character-by-character if needed
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function fitMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  preferredFontSize: number,
  maxWidth: number,
  maxHeight: number,
  fontWeight = 500,
  minFontSize = 11
): { fontSize: number; lines: string[]; lineHeight: number } {
  let size = preferredFontSize;
  while (size >= minFontSize) {
    ctx.font = `${fontWeight} ${size}px ${FONT_FAMILY}`;
    const lines = wrapTextLines(ctx, text, maxWidth);
    const lineHeight = size * 1.32;
    if (lines.length * lineHeight <= maxHeight || size === minFontSize) {
      return { fontSize: size, lines, lineHeight };
    }
    size -= 1;
  }
  ctx.font = `${fontWeight} ${minFontSize}px ${FONT_FAMILY}`;
  return {
    fontSize: minFontSize,
    lines: wrapTextLines(ctx, text, maxWidth),
    lineHeight: minFontSize * 1.32,
  };
}

/**
 * Draws an adaptive infinite dot grid that adjusts spacing smoothly across zoom levels.
 */
export function renderAdaptiveGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number
): void {
  let stepWorld = 24;
  while (stepWorld * camera.zoom < 18) {
    stepWorld *= 2;
  }
  while (stepWorld * camera.zoom > 72) {
    stepWorld /= 2;
  }

  const bounds = getViewportWorldBounds(camera, viewportWidth, viewportHeight);
  const startX = Math.floor(bounds.minX / stepWorld) * stepWorld;
  const startY = Math.floor(bounds.minY / stepWorld) * stepWorld;

  const dotRadius = Math.max(0.8, Math.min(1.8, 1.25 * Math.sqrt(camera.zoom)));
  ctx.fillStyle = "#CBD5E1";

  ctx.beginPath();
  for (let wx = startX; wx <= bounds.maxX; wx += stepWorld) {
    const sx = wx * camera.zoom + camera.x;
    for (let wy = startY; wy <= bounds.maxY; wy += stepWorld) {
      const sy = wy * camera.zoom + camera.y;
      ctx.moveTo(sx + dotRadius, sy);
      ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function renderSticky(
  ctx: CanvasRenderingContext2D,
  el: StickyNoteElement,
  skipText: boolean
): void {
  ctx.save();

  // Soft realistic drop shadow
  ctx.shadowColor = "rgba(15, 23, 42, 0.14)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  drawRoundedRectPath(ctx, el.x, el.y, el.width, el.height, 10);
  ctx.fillStyle = el.fill;
  ctx.fill();

  // Subtle top highlight border
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Fold accent bar at top
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(15, 23, 42, 0.035)";
  ctx.fillRect(el.x, el.y, el.width, 14);
  ctx.restore();

  if (!skipText && el.text.trim().length > 0) {
    const pad = 18;
    const availW = Math.max(24, el.width - pad * 2);
    const availH = Math.max(24, el.height - pad * 2);
    const { fontSize, lines, lineHeight } = fitMultilineText(
      ctx,
      el.text,
      el.fontSize,
      availW,
      availH,
      500,
      11
    );

    ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = "#0F172A";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const totalH = lines.length * lineHeight;
    const startY = el.y + pad + Math.max(0, (availH - totalH) / 2);

    ctx.save();
    drawRoundedRectPath(ctx, el.x + 6, el.y + 6, el.width - 12, el.height - 12, 6);
    ctx.clip();
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, el.x + pad, startY + i * lineHeight);
    }
    ctx.restore();
  }

  ctx.restore();
}

function renderShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  skipText: boolean
): void {
  ctx.save();

  ctx.shadowColor = "rgba(15, 23, 42, 0.06)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  if (el.shapeKind === "rectangle") {
    ctx.rect(el.x, el.y, el.width, el.height);
  } else if (el.shapeKind === "rounded-rectangle") {
    drawRoundedRectPath(ctx, el.x, el.y, el.width, el.height, 14);
  } else if (el.shapeKind === "ellipse") {
    ctx.ellipse(
      el.x + el.width / 2,
      el.y + el.height / 2,
      Math.max(1, el.width / 2),
      Math.max(1, el.height / 2),
      0,
      0,
      Math.PI * 2
    );
  } else if (el.shapeKind === "diamond") {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.moveTo(cx, el.y);
    ctx.lineTo(el.x + el.width, cy);
    ctx.lineTo(cx, el.y + el.height);
    ctx.lineTo(el.x, cy);
    ctx.closePath();
  }

  if (el.fill && el.fill !== "transparent") {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  ctx.shadowColor = "transparent";
  if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }

  if (!skipText && el.text.trim().length > 0) {
    const insetFactor =
      el.shapeKind === "diamond" ? 0.26 : el.shapeKind === "ellipse" ? 0.16 : 0.1;
    const padX = Math.max(14, el.width * insetFactor);
    const padY = Math.max(12, el.height * insetFactor);
    const availW = Math.max(24, el.width - padX * 2);
    const availH = Math.max(20, el.height - padY * 2);

    const { fontSize, lines, lineHeight } = fitMultilineText(
      ctx,
      el.text,
      el.fontSize,
      availW,
      availH,
      600,
      10
    );

    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = "#0F172A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const totalH = lines.length * lineHeight;
    const firstLineCenterY =
      el.y + el.height / 2 - totalH / 2 + lineHeight / 2;
    const cx = el.x + el.width / 2;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, cx, firstLineCenterY + i * lineHeight);
    }
  }

  ctx.restore();
}

function renderTextElement(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  skipText: boolean
): void {
  if (skipText || !el.text) return;
  ctx.save();
  ctx.font = `700 ${el.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = el.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = wrapTextLines(ctx, el.text, Math.max(40, el.width));
  const lineHeight = el.fontSize * 1.28;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, el.x + 4, el.y + 4 + i * lineHeight);
  }
  ctx.restore();
}

function renderSingleElement(
  ctx: CanvasRenderingContext2D,
  el: BoardElement,
  skipText: boolean
): void {
  ctx.save();
  if (el.rotation !== 0) {
    const c = getElementCenter(el);
    ctx.translate(c.x, c.y);
    ctx.rotate(degToRad(el.rotation));
    ctx.translate(-c.x, -c.y);
  }

  if (el.type === "sticky") {
    renderSticky(ctx, el, skipText);
  } else if (el.type === "shape") {
    renderShape(ctx, el, skipText);
  } else if (el.type === "text") {
    renderTextElement(ctx, el, skipText);
  }

  ctx.restore();
}

function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  selectedElements: readonly BoardElement[],
  zoom: number
): void {
  if (selectedElements.length === 0) return;

  const invZoom = 1 / Math.max(0.1, zoom);
  ctx.save();

  if (selectedElements.length === 1) {
    const el = selectedElements[0]!;
    ctx.save();
    if (el.rotation !== 0) {
      const c = getElementCenter(el);
      ctx.translate(c.x, c.y);
      ctx.rotate(degToRad(el.rotation));
      ctx.translate(-c.x, -c.y);
    }

    ctx.strokeStyle = "#4F46E5";
    ctx.lineWidth = 2 * invZoom;
    ctx.strokeRect(el.x, el.y, el.width, el.height);

    // Connector line from top-center to rotation handle
    const rotOffset = 26 * invZoom;
    ctx.beginPath();
    ctx.moveTo(el.x + el.width / 2, el.y);
    ctx.lineTo(el.x + el.width / 2, el.y - rotOffset);
    ctx.stroke();
    ctx.restore();

    // Draw 8 resize handles + 1 rotation circle
    const handles = getTransformHandles(el, zoom);
    const handleSize = 9 * invZoom;
    for (const h of handles) {
      ctx.beginPath();
      if (h.kind === "rotate") {
        ctx.arc(h.x, h.y, 5.5 * invZoom, 0, Math.PI * 2);
      } else {
        ctx.rect(
          h.x - handleSize / 2,
          h.y - handleSize / 2,
          handleSize,
          handleSize
        );
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "#4F46E5";
      ctx.lineWidth = 2 * invZoom;
      ctx.stroke();
    }
  } else {
    // Multi-selection individual outlines + group bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of selectedElements) {
      const b = getElementAABB(el);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;

      ctx.save();
      if (el.rotation !== 0) {
        const c = getElementCenter(el);
        ctx.translate(c.x, c.y);
        ctx.rotate(degToRad(el.rotation));
        ctx.translate(-c.x, -c.y);
      }
      ctx.strokeStyle = "rgba(79, 70, 229, 0.55)";
      ctx.lineWidth = 1.5 * invZoom;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      ctx.restore();
    }

    ctx.strokeStyle = "#4F46E5";
    ctx.lineWidth = 1.75 * invZoom;
    ctx.setLineDash([6 * invZoom, 4 * invZoom]);
    ctx.strokeRect(minX - 4 * invZoom, minY - 4 * invZoom, maxX - minX + 8 * invZoom, maxY - minY + 8 * invZoom);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function renderSmartGuides(
  ctx: CanvasRenderingContext2D,
  guides: readonly SmartGuideLine[],
  zoom: number
): void {
  if (guides.length === 0) return;
  const invZoom = 1 / Math.max(0.1, zoom);
  ctx.save();
  ctx.strokeStyle = "#F43F5E";
  ctx.lineWidth = 1.5 * invZoom;
  ctx.setLineDash([5 * invZoom, 4 * invZoom]);

  for (const g of guides) {
    ctx.beginPath();
    if (g.orientation === "vertical") {
      ctx.moveTo(g.position, g.start);
      ctx.lineTo(g.position, g.end);
    } else {
      ctx.moveTo(g.start, g.position);
      ctx.lineTo(g.end, g.position);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Imperative High-DPI HTML5 Canvas 2D renderer for infinite board scenes.
 */
export class Canvas2DRenderer {
  renderFrame(opts: RenderFrameOptions): void {
    const {
      ctx,
      viewportWidth,
      viewportHeight,
      dpr,
      camera,
      elements,
      selectedIds,
      hoveredId,
      editingId,
      marqueeBounds,
      smartGuides,
      backgroundColor = "#F8FAFC",
    } = opts;

    const targetW = Math.max(1, Math.round(viewportWidth * dpr));
    const targetH = Math.max(1, Math.round(viewportHeight * dpr));
    if (ctx.canvas.width !== targetW || ctx.canvas.height !== targetH) {
      ctx.canvas.width = targetW;
      ctx.canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Background fill & screen-space adaptive dot grid
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    renderAdaptiveGrid(ctx, camera, viewportWidth, viewportHeight);

    // 2. World-space transform
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    const selectedElements: BoardElement[] = [];

    for (const el of elements) {
      renderSingleElement(ctx, el, el.id === editingId);
      if (selectedIds.has(el.id)) {
        selectedElements.push(el);
      } else if (hoveredId === el.id) {
        ctx.save();
        if (el.rotation !== 0) {
          const c = getElementCenter(el);
          ctx.translate(c.x, c.y);
          ctx.rotate(degToRad(el.rotation));
          ctx.translate(-c.x, -c.y);
        }
        ctx.strokeStyle = "rgba(99, 102, 241, 0.55)";
        ctx.lineWidth = 1.5 / Math.max(0.1, camera.zoom);
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.restore();
      }
    }

    if (smartGuides && smartGuides.length > 0) {
      renderSmartGuides(ctx, smartGuides, camera.zoom);
    }

    renderSelectionOverlay(ctx, selectedElements, camera.zoom);

    if (marqueeBounds) {
      const invZ = 1 / Math.max(0.1, camera.zoom);
      const x = Math.min(marqueeBounds.minX, marqueeBounds.maxX);
      const y = Math.min(marqueeBounds.minY, marqueeBounds.maxY);
      const w = Math.abs(marqueeBounds.maxX - marqueeBounds.minX);
      const h = Math.abs(marqueeBounds.maxY - marqueeBounds.minY);
      ctx.fillStyle = "rgba(79, 70, 229, 0.09)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#4F46E5";
      ctx.lineWidth = 1.5 * invZ;
      ctx.strokeRect(x, y, w, h);
    }

    ctx.restore();
    ctx.restore();
  }
}
