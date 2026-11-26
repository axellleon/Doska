import { generateKeyBetween, generateNKeysBetween } from "./fractionalIndex.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_STICKY_COLOR,
  DEFAULT_TEXT_COLOR,
} from "./palettes.js";
import type {
  BoardElement,
  ShapeElement,
  ShapeKind,
  StickyNoteElement,
  TextElement,
} from "./types.js";

export function createElementId(prefix = "el"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
  }
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

export function createStickyElement(
  overrides: Partial<Omit<StickyNoteElement, "type">> = {}
): StickyNoteElement {
  return {
    id: overrides.id ?? createElementId("sticky"),
    type: "sticky",
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 220,
    height: overrides.height ?? 220,
    rotation: overrides.rotation ?? 0,
    zIndexKey: overrides.zIndexKey ?? generateKeyBetween(null, null),
    updatedAt: overrides.updatedAt ?? Date.now(),
    fill: overrides.fill ?? DEFAULT_STICKY_COLOR,
    text: overrides.text ?? "",
    fontSize: overrides.fontSize ?? 20,
  };
}

export function createShapeElement(
  shapeKind: ShapeKind = "rounded-rectangle",
  overrides: Partial<Omit<ShapeElement, "type" | "shapeKind">> = {}
): ShapeElement {
  return {
    id: overrides.id ?? createElementId("shape"),
    type: "shape",
    shapeKind,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 220,
    height: overrides.height ?? 130,
    rotation: overrides.rotation ?? 0,
    zIndexKey: overrides.zIndexKey ?? generateKeyBetween(null, null),
    updatedAt: overrides.updatedAt ?? Date.now(),
    fill: overrides.fill ?? DEFAULT_SHAPE_FILL,
    stroke: overrides.stroke ?? DEFAULT_SHAPE_STROKE,
    strokeWidth: overrides.strokeWidth ?? 2.5,
    text: overrides.text ?? "",
    fontSize: overrides.fontSize ?? 18,
  };
}

export function createTextElement(
  overrides: Partial<Omit<TextElement, "type">> = {}
): TextElement {
  return {
    id: overrides.id ?? createElementId("text"),
    type: "text",
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 280,
    height: overrides.height ?? 56,
    rotation: overrides.rotation ?? 0,
    zIndexKey: overrides.zIndexKey ?? generateKeyBetween(null, null),
    updatedAt: overrides.updatedAt ?? Date.now(),
    text: overrides.text ?? "Текст",
    color: overrides.color ?? DEFAULT_TEXT_COLOR,
    fontSize: overrides.fontSize ?? 28,
  };
}

export const DEMO_BOARD_TITLE = "Архитектура и брейншторм Doska";

/**
 * Rich initial scene demonstrating infinite canvas capabilities:
 * headers, architecture blocks, decision diamond, and colorful brainstorm sticky notes.
 */
export function createArchitectureDemoElements(now = Date.now()): BoardElement[] {
  const keys = generateNKeysBetween(null, null, 14);
  let k = 0;
  const nextKey = () => keys[k++]!;

  return [
    // Background zone card: Architecture pipeline
    createShapeElement("rounded-rectangle", {
      id: "demo_zone_arch",
      x: -540,
      y: -310,
      width: 1080,
      height: 330,
      fill: "#F8FAFC",
      stroke: "#CBD5E1",
      strokeWidth: 2,
      text: "",
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    // Title & subtitle
    createTextElement({
      id: "demo_title",
      x: -510,
      y: -292,
      width: 720,
      height: 52,
      text: "Doska — Архитектура движка холста (Slice 1)",
      color: "#0F172A",
      fontSize: 28,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createTextElement({
      id: "demo_subtitle",
      x: -510,
      y: -242,
      width: 820,
      height: 36,
      text: "High-DPI HTML5 Canvas 2D  •  RBush R-Tree Culling  •  Fractional Z-Index  •  IndexedDB",
      color: "#475569",
      fontSize: 16,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    // Architecture pipeline nodes
    createShapeElement("rounded-rectangle", {
      id: "demo_node_ui",
      x: -500,
      y: -175,
      width: 230,
      height: 145,
      fill: "#EEF2FF",
      stroke: "#4F46E5",
      strokeWidth: 2.5,
      text: "@doska/web\nNext.js + Панели UI\n& Hotkeys (V/H/N/R/O/D/T)",
      fontSize: 16,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createShapeElement("rounded-rectangle", {
      id: "demo_node_engine",
      x: -225,
      y: -175,
      width: 245,
      height: 145,
      fill: "#E0F2FE",
      stroke: "#0284C7",
      strokeWidth: 2.5,
      text: "@doska/canvas-core\nАффинная камера,\nHit-Test и Smart Guides",
      fontSize: 16,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createShapeElement("diamond", {
      id: "demo_node_rtree",
      x: 65,
      y: -185,
      width: 215,
      height: 165,
      fill: "#FEF3C7",
      stroke: "#D97706",
      strokeWidth: 2.5,
      text: "RBush R-Tree\nViewport\nCulling",
      fontSize: 15,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createShapeElement("ellipse", {
      id: "demo_node_storage",
      x: 320,
      y: -175,
      width: 195,
      height: 145,
      fill: "#ECFDF5",
      stroke: "#059669",
      strokeWidth: 2.5,
      text: "IndexedDB +\nHistory Undo/Redo",
      fontSize: 16,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    // Brainstorming section header
    createTextElement({
      id: "demo_brainstorm_header",
      x: -530,
      y: 55,
      width: 560,
      height: 44,
      text: "Брейншторм команды и продуктовые гипотезы",
      color: "#1E293B",
      fontSize: 22,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    // Sticky notes cluster
    createStickyElement({
      id: "demo_sticky_1",
      x: -530,
      y: 115,
      width: 225,
      height: 215,
      rotation: -2,
      fill: "#FEF08A",
      text: "Мгновенный отклик 60 FPS даже на тысячах стикеров благодаря R-Tree индексу",
      fontSize: 18,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createStickyElement({
      id: "demo_sticky_2",
      x: -275,
      y: 118,
      width: 225,
      height: 215,
      rotation: 1.5,
      fill: "#BAE6FD",
      text: "Дробные индексы слоёв (zIndexKey) позволяют менять порядок без перезаписи всей сцены — готово к CRDT!",
      fontSize: 17,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createStickyElement({
      id: "demo_sticky_3",
      x: -20,
      y: 115,
      width: 225,
      height: 215,
      rotation: -1,
      fill: "#BBF7D0",
      text: "Попробуй:\n• Двойной клик — текст\n• Колесо / Pinch — зум\n• Пробел + Drag — рука\n• Направляющие при перетаскивании",
      fontSize: 16,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createStickyElement({
      id: "demo_sticky_4",
      x: 235,
      y: 120,
      width: 225,
      height: 215,
      rotation: 2,
      fill: "#FECDD3",
      text: "Следующий этап (Slice 2):\nМультиплеер на Yjs + Hocuspocus, живые курсоры и коннекторы!",
      fontSize: 17,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),

    createShapeElement("rectangle", {
      id: "demo_badge_ready",
      x: 195,
      y: 52,
      width: 345,
      height: 44,
      fill: "#F5F3FF",
      stroke: "#7C3AED",
      strokeWidth: 2,
      text: "Офлайн-персистентность активна",
      fontSize: 15,
      zIndexKey: nextKey(),
      updatedAt: now,
    }),
  ];
}
