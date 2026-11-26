import { describe, expect, it } from "vitest";
import {
  createShapeElement,
  createStickyElement,
  generateNKeysBetween,
  type CameraState,
} from "@doska/shared";
import {
  computeSmartGuides,
  fitCameraToBounds,
  getTransformHandles,
  HistoryManager,
  hitTestTransformHandles,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  panCamera,
  resizeElementBox,
  screenToWorld,
  SpatialIndex,
  worldToScreen,
  zoomAtPoint,
} from "./index.js";

describe("@doska/canvas-core — affine camera math", () => {
  it("converts reversibly between screen and world coordinates", () => {
    const cam: CameraState = { x: 240, y: -120, zoom: 1.75 };
    const world = { x: -85.5, y: 310.25 };
    const screen = worldToScreen(world, cam);
    const roundtrip = screenToWorld(screen, cam);

    expect(roundtrip.x).toBeCloseTo(world.x, 6);
    expect(roundtrip.y).toBeCloseTo(world.y, 6);
  });

  it("preserves world point under cursor during zoomAtPoint and clamps 0.1..5.0", () => {
    const cam: CameraState = { x: 100, y: 80, zoom: 1 };
    const cursor = { x: 520, y: 360 };
    const beforeWorld = screenToWorld(cursor, cam);

    const zoomed = zoomAtPoint(cam, 2.4, cursor);
    const afterWorld = screenToWorld(cursor, zoomed);

    expect(zoomed.zoom).toBeCloseTo(2.4, 6);
    expect(afterWorld.x).toBeCloseTo(beforeWorld.x, 6);
    expect(afterWorld.y).toBeCloseTo(beforeWorld.y, 6);

    expect(zoomAtPoint(cam, 0.001, cursor).zoom).toBe(MIN_CAMERA_ZOOM);
    expect(zoomAtPoint(cam, 99, cursor).zoom).toBe(MAX_CAMERA_ZOOM);
  });

  it("pans camera and fits scene bounds into viewport", () => {
    const cam: CameraState = { x: 10, y: 20, zoom: 1.5 };
    expect(panCamera(cam, 40, -15)).toEqual({ x: 50, y: 5, zoom: 1.5 });

    const fitted = fitCameraToBounds(
      { minX: -200, minY: -100, maxX: 200, maxY: 100 },
      1000,
      800,
      100
    );
    const centerScreen = worldToScreen({ x: 0, y: 0 }, fitted);
    expect(centerScreen.x).toBeCloseTo(500, 5);
    expect(centerScreen.y).toBeCloseTo(400, 5);
  });
});

describe("@doska/canvas-core — RBush spatial index, rotation hit-test & handles", () => {
  it("performs viewport culling and zIndexKey-ordered hit testing", () => {
    const [kBack, kFront] = generateNKeysBetween(null, null, 2);
    const backSticky = createStickyElement({
      id: "back",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      zIndexKey: kBack!,
    });
    const frontSticky = createStickyElement({
      id: "front",
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      zIndexKey: kFront!,
    });
    const farOffscreen = createStickyElement({
      id: "far",
      x: 5000,
      y: 5000,
      width: 200,
      height: 200,
      zIndexKey: "z9",
    });

    const index = new SpatialIndex();
    index.rebuild([frontSticky, farOffscreen, backSticky]);

    const visible = index.queryViewport({
      minX: -100,
      minY: -100,
      maxX: 500,
      maxY: 500,
    });
    expect(visible.map((e) => e.id)).toEqual(["back", "front"]);

    // Overlap region hits topmost element
    expect(index.hitTestPoint({ x: 100, y: 100 })?.id).toBe("front");
    // Non-overlap region hits back element
    expect(index.hitTestPoint({ x: 20, y: 20 })?.id).toBe("back");
    // Empty space returns null
    expect(index.hitTestPoint({ x: -300, y: -300 })).toBeNull();
  });

  it("accurately hit-tests rotated elements and diamond/ellipse shapes", () => {
    const rotatedBar = createShapeElement("rectangle", {
      id: "bar",
      x: 0,
      y: 90,
      width: 200,
      height: 20,
      rotation: 45,
      zIndexKey: "a0",
    });
    const diamond = createShapeElement("diamond", {
      id: "dia",
      x: 400,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      zIndexKey: "a1",
    });

    const index = new SpatialIndex();
    index.rebuild([rotatedBar, diamond]);

    // Center (100, 100) is inside rotated bar, whereas unrotated left endpoint (5, 100) is rotated away!
    expect(index.hitTestPoint({ x: 100, y: 100 }, 0)?.id).toBe("bar");
    expect(index.hitTestPoint({ x: 5, y: 100 }, 0)).toBeNull();

    // Diamond center (500, 100) is inside, AABB corner (405, 5) is outside diamond
    expect(index.hitTestPoint({ x: 500, y: 100 }, 0)?.id).toBe("dia");
    expect(index.hitTestPoint({ x: 405, y: 5 }, 0)).toBeNull();
  });

  it("computes 8 resize + 1 rotate handles, resizes box, and snaps smart guides", () => {
    const el = createStickyElement({
      id: "s1",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });
    const handles = getTransformHandles(el, 1);
    expect(handles).toHaveLength(9);

    const seHandle = handles.find((h) => h.kind === "se")!;
    expect(hitTestTransformHandles({ x: seHandle.x, y: seHandle.y }, el, 1)).toBe("se");

    const resized = resizeElementBox(el, "se", { x: 350, y: 310 }, 40);
    expect(resized).toEqual({ x: 100, y: 100, width: 250, height: 210 });

    const snapResult = computeSmartGuides(
      { x: 103, y: 280, width: 200, height: 150 },
      [el],
      new Set(["moving"]),
      6
    );
    expect(snapResult.snappedX).toBe(100);
    expect(snapResult.guides.some((g) => g.orientation === "vertical")).toBe(true);
  });
});

describe("@doska/canvas-core — HistoryManager", () => {
  it("supports undo, redo, and clears redo stack on new push", () => {
    const s0 = [createStickyElement({ id: "1", x: 0, updatedAt: 1 })];
    const s1 = [createStickyElement({ id: "1", x: 100, updatedAt: 2 })];
    const s2 = [createStickyElement({ id: "1", x: 250, updatedAt: 3 })];

    const history = new HistoryManager(s0);
    expect(history.canUndo).toBe(false);

    history.push(s1);
    history.push(s2);
    expect(history.canUndo).toBe(true);

    const afterUndo = history.undo();
    expect(afterUndo?.[0]?.x).toBe(100);
    expect(history.canRedo).toBe(true);

    const afterRedo = history.redo();
    expect(afterRedo?.[0]?.x).toBe(250);

    history.undo();
    history.push([createStickyElement({ id: "1", x: 999, updatedAt: 4 })]);
    expect(history.canRedo).toBe(false);
  });
});
