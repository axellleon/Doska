"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Circle,
  Diamond,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Square,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";
import {
  bringToFrontKey,
  createElementId,
  createShapeElement,
  createStickyElement,
  createTextElement,
  sendToBackKey,
  sortElementsByZIndex,
  STICKY_PALETTE,
  type BoardElement,
  type Bounds,
  type CameraState,
  type Point,
  type ShapeKind,
} from "@doska/shared";
import {
  Canvas2DRenderer,
  computeSmartGuides,
  fitCameraToBounds,
  getElementCenter,
  getSceneBounds,
  getViewportWorldBounds,
  HistoryManager,
  hitTestTransformHandles,
  panCamera,
  radToDeg,
  resizeElementBox,
  screenToWorld,
  SpatialIndex,
  worldToScreen,
  zoomAtPoint,
  type ResizeHandleKind,
  type SmartGuideLine,
} from "@doska/canvas-core";
import {
  loadBoardRecord,
  renameBoard,
  resetBoardToDemoScene,
  saveBoardState,
} from "@/lib/board-storage";
import { ContextStyleBar } from "./ContextStyleBar";
import { Minimap } from "./Minimap";

export type ActiveTool =
  | "select"
  | "hand"
  | "sticky"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text";

type InteractionState =
  | { kind: "idle" }
  | {
      kind: "panning";
      startClient: Point;
      initialCamera: CameraState;
    }
  | {
      kind: "dragging";
      startWorld: Point;
      initialPositions: Map<string, { x: number; y: number }>;
      primaryId: string;
      primarySize: { width: number; height: number };
      moved: boolean;
    }
  | {
      kind: "resizing";
      elementId: string;
      handle: ResizeHandleKind;
      initialBox: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
      };
    }
  | {
      kind: "rotating";
      elementId: string;
      center: Point;
      startPointerAngleDeg: number;
      initialRotationDeg: number;
    }
  | {
      kind: "marquee";
      startWorld: Point;
      currentWorld: Point;
      additive: boolean;
      baseSelection: Set<string>;
    }
  | {
      kind: "creating-shape";
      shapeKind: ShapeKind;
      elementId: string;
      startWorld: Point;
    };

const TOOL_ITEMS: {
  id: ActiveTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "select",
    label: "Курсор",
    shortcut: "V",
    icon: <MousePointer2 className="h-4 w-4" />,
  },
  {
    id: "hand",
    label: "Рука (Панорама)",
    shortcut: "H",
    icon: <Hand className="h-4 w-4" />,
  },
  {
    id: "sticky",
    label: "Стикер",
    shortcut: "N",
    icon: <StickyNote className="h-4 w-4" />,
  },
  {
    id: "rectangle",
    label: "Прямоугольник",
    shortcut: "R",
    icon: <Square className="h-4 w-4" />,
  },
  {
    id: "ellipse",
    label: "Эллипс",
    shortcut: "O",
    icon: <Circle className="h-4 w-4" />,
  },
  {
    id: "diamond",
    label: "Ромб",
    shortcut: "D",
    icon: <Diamond className="h-4 w-4" />,
  },
  {
    id: "text",
    label: "Текст",
    shortcut: "T",
    icon: <Type className="h-4 w-4" />,
  },
];

export function BoardWorkspace({ boardId }: { boardId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef(new Canvas2DRenderer());
  const spatialRef = useRef(new SpatialIndex());
  const historyRef = useRef(new HistoryManager([]));
  const interactionRef = useRef<InteractionState>({ kind: "idle" });
  const stickyColorIdxRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [boardTitle, setBoardTitle] = useState("Загрузка...");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [camera, setCamera] = useState<CameraState>({ x: 720, y: 450, zoom: 1 });
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [spacePressed, setSpacePressed] = useState(false);

  const [marqueeBounds, setMarqueeBounds] = useState<Bounds | null>(null);
  const [smartGuides, setSmartGuides] = useState<SmartGuideLine[]>([]);

  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  // Track window viewport size
  useEffect(() => {
    function updateSize() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Load board from IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    async function init() {
      const record = await loadBoardRecord(boardId);
      if (!mounted) return;
      if (!record) {
        setNotFound(true);
        return;
      }

      const sorted = sortElementsByZIndex(record.elements);
      setBoardTitle(record.metadata.title);
      setTitleDraft(record.metadata.title);
      setElements(sorted);
      spatialRef.current.rebuild(sorted);
      historyRef.current.reset(sorted);
      syncHistoryFlags();

      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      if (record.camera) {
        setCamera(record.camera);
      } else {
        const bounds = getSceneBounds(sorted);
        setCamera(fitCameraToBounds(bounds, vw, vh, 96, 1.05));
      }
      setReady(true);
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [boardId, syncHistoryFlags]);

  // Rebuild spatial index whenever elements change
  useEffect(() => {
    spatialRef.current.rebuild(elements);
  }, [elements]);

  // Debounced IndexedDB persistence
  useEffect(() => {
    if (!ready) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveBoardState(boardId, elements, camera).then(() => {
        setSaveState("saved");
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [ready, boardId, elements, camera]);

  // Render frame on canvas (with viewport culling via RBush)
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cullBounds = getViewportWorldBounds(
      camera,
      viewport.width,
      viewport.height,
      160
    );
    const visibleElements = spatialRef.current.queryViewport(cullBounds);

    rendererRef.current.renderFrame({
      ctx,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      dpr,
      camera,
      elements: visibleElements,
      selectedIds,
      hoveredId,
      editingId: editingElementId,
      marqueeBounds,
      smartGuides,
    });
  }, [
    ready,
    viewport,
    camera,
    elements,
    selectedIds,
    hoveredId,
    editingElementId,
    marqueeBounds,
    smartGuides,
  ]);

  const commitElements = useCallback(
    (next: BoardElement[]) => {
      const sorted = sortElementsByZIndex(next);
      setElements(sorted);
      historyRef.current.pushSnapshot(sorted);
      syncHistoryFlags();
    },
    [syncHistoryFlags]
  );

  const commitTextEditing = useCallback(() => {
    if (!editingElementId) return;
    const targetId = editingElementId;
    const nextValue = editingText;
    setEditingElementId(null);

    setElements((prev) => {
      const updated = prev
        .map((el) => {
          if (el.id !== targetId) return el;
          return {
            ...el,
            text: nextValue,
            updatedAt: Date.now(),
          };
        })
        .filter((el) => !(el.type === "text" && el.text.trim().length === 0));
      const sorted = sortElementsByZIndex(updated);
      historyRef.current.pushSnapshot(sorted);
      syncHistoryFlags();
      return sorted;
    });
  }, [editingElementId, editingText, syncHistoryFlags]);

  const openEditorForElement = useCallback((el: BoardElement) => {
    setEditingElementId(el.id);
    setEditingText(el.text);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (editingElementId) commitTextEditing();
    const prev = historyRef.current.undo();
    if (prev) {
      setElements(sortElementsByZIndex(prev));
      setSelectedIds(new Set());
      syncHistoryFlags();
    }
  }, [editingElementId, commitTextEditing, syncHistoryFlags]);

  const handleRedo = useCallback(() => {
    if (editingElementId) commitTextEditing();
    const next = historyRef.current.redo();
    if (next) {
      setElements(sortElementsByZIndex(next));
      setSelectedIds(new Set());
      syncHistoryFlags();
    }
  }, [editingElementId, commitTextEditing, syncHistoryFlags]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const remaining = elements.filter((el) => !selectedIds.has(el.id));
    setSelectedIds(new Set());
    commitElements(remaining);
  }, [selectedIds, elements, commitElements]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const now = Date.now();
    const keys = elements.map((e) => e.zIndexKey);
    const clones: BoardElement[] = [];
    const nextSel = new Set<string>();

    for (const el of elements) {
      if (!selectedIds.has(el.id)) continue;
      const zKey = bringToFrontKey(keys);
      keys.push(zKey);
      const newId = createElementId(el.type);
      nextSel.add(newId);
      clones.push({
        ...el,
        id: newId,
        x: el.x + 28,
        y: el.y + 28,
        zIndexKey: zKey,
        updatedAt: now,
      });
    }

    commitElements([...elements, ...clones]);
    setSelectedIds(nextSel);
  }, [selectedIds, elements, commitElements]);

  const handleBringToFront = useCallback(() => {
    if (selectedIds.size === 0) return;
    const now = Date.now();
    const keys = elements.map((e) => e.zIndexKey);
    const next = elements.map((el) => {
      if (!selectedIds.has(el.id)) return el;
      const front = bringToFrontKey(keys);
      keys.push(front);
      return { ...el, zIndexKey: front, updatedAt: now };
    });
    commitElements(next);
  }, [selectedIds, elements, commitElements]);

  const handleSendToBack = useCallback(() => {
    if (selectedIds.size === 0) return;
    const now = Date.now();
    const keys = elements.map((e) => e.zIndexKey);
    const next = elements.map((el) => {
      if (!selectedIds.has(el.id)) return el;
      const back = sendToBackKey(keys);
      keys.push(back);
      return { ...el, zIndexKey: back, updatedAt: now };
    });
    commitElements(next);
  }, [selectedIds, elements, commitElements]);

  const handleUpdateSelected = useCallback(
    (updater: (el: BoardElement) => BoardElement) => {
      const now = Date.now();
      const next = elements.map((el) =>
        selectedIds.has(el.id) ? { ...updater(el), updatedAt: now } : el
      );
      commitElements(next);
    },
    [elements, selectedIds, commitElements]
  );

  const handleFitScreen = useCallback(() => {
    const bounds = getSceneBounds(elements);
    setCamera(fitCameraToBounds(bounds, viewport.width, viewport.height, 96, 1.2));
  }, [elements, viewport]);

  const handleResetDemo = useCallback(async () => {
    const doc = await resetBoardToDemoScene(boardId);
    if (!doc) return;
    const sorted = sortElementsByZIndex(doc.elements);
    setElements(sorted);
    setSelectedIds(new Set());
    historyRef.current.reset(sorted);
    syncHistoryFlags();
    setCamera(
      fitCameraToBounds(
        getSceneBounds(sorted),
        viewport.width,
        viewport.height,
        96,
        1.05
      )
    );
  }, [boardId, viewport, syncHistoryFlags]);

  // Global keyboard shortcuts
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.code === "Space") {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setActiveTool("select");
        return;
      }

      const key = e.key.toLowerCase();
      if (!mod && !e.altKey) {
        if (key === "v") setActiveTool("select");
        else if (key === "h") setActiveTool("hand");
        else if (key === "n") setActiveTool("sticky");
        else if (key === "r") setActiveTool("rectangle");
        else if (key === "o") setActiveTool("ellipse");
        else if (key === "d") setActiveTool("diamond");
        else if (key === "t") setActiveTool("text");
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpacePressed(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleUndo, handleRedo, handleDuplicateSelected, handleDeleteSelected]);

  // Non-passive wheel listener for smooth zoom around cursor & pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // Pinch-to-zoom or standard mouse wheel zooms around cursor; Shift+wheel or horizontal trackpad pans
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setCamera((prev) => panCamera(prev, -e.deltaY, -e.deltaX));
        return;
      }

      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setCamera((prev) => panCamera(prev, -e.deltaX, -e.deltaY));
        return;
      }

      const factor = Math.exp(-e.deltaY * 0.0016);
      setCamera((prev) => zoomAtPoint(prev, prev.zoom * factor, pointer));
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [ready]);

  const selectedElements = useMemo(
    () => elements.filter((el) => selectedIds.has(el.id)),
    [elements, selectedIds]
  );

  const editingElement = useMemo(
    () => elements.find((el) => el.id === editingElementId) ?? null,
    [elements, editingElementId]
  );

  function getCanvasPointer(e: React.PointerEvent<HTMLCanvasElement>): {
    screen: Point;
    world: Point;
  } {
    const rect = e.currentTarget.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return { screen, world: screenToWorld(screen, camera) };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingElementId) {
      commitTextEditing();
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    const { screen, world } = getCanvasPointer(e);

    // Middle mouse button, Spacebar hold, or Hand tool => pan camera
    if (e.button === 1 || spacePressed || activeTool === "hand") {
      interactionRef.current = {
        kind: "panning",
        startClient: screen,
        initialCamera: camera,
      };
      return;
    }

    if (e.button !== 0) return;

    // Creation tools
    if (activeTool === "sticky") {
      const zKey = bringToFrontKey(elements.map((el) => el.zIndexKey));
      const paletteItem =
        STICKY_PALETTE[stickyColorIdxRef.current % STICKY_PALETTE.length]!;
      stickyColorIdxRef.current += 1;
      const sticky = createStickyElement({
        x: Math.round(world.x - 110),
        y: Math.round(world.y - 110),
        width: 220,
        height: 220,
        fill: paletteItem.value,
        text: "",
        zIndexKey: zKey,
      });
      const next = sortElementsByZIndex([...elements, sticky]);
      setElements(next);
      historyRef.current.pushSnapshot(next);
      syncHistoryFlags();
      setSelectedIds(new Set([sticky.id]));
      setActiveTool("select");
      openEditorForElement(sticky);
      return;
    }

    if (activeTool === "text") {
      const zKey = bringToFrontKey(elements.map((el) => el.zIndexKey));
      const textEl = createTextElement({
        x: Math.round(world.x - 20),
        y: Math.round(world.y - 22),
        width: 300,
        height: 52,
        text: "",
        zIndexKey: zKey,
      });
      const next = sortElementsByZIndex([...elements, textEl]);
      setElements(next);
      historyRef.current.pushSnapshot(next);
      syncHistoryFlags();
      setSelectedIds(new Set([textEl.id]));
      setActiveTool("select");
      openEditorForElement(textEl);
      return;
    }

    if (
      activeTool === "rectangle" ||
      activeTool === "ellipse" ||
      activeTool === "diamond"
    ) {
      const shapeKind: ShapeKind =
        activeTool === "rectangle"
          ? "rounded-rectangle"
          : activeTool === "ellipse"
            ? "ellipse"
            : "diamond";
      const zKey = bringToFrontKey(elements.map((el) => el.zIndexKey));
      const shape = createShapeElement(shapeKind, {
        x: Math.round(world.x),
        y: Math.round(world.y),
        width: 12,
        height: 12,
        zIndexKey: zKey,
      });
      setElements((prev) => sortElementsByZIndex([...prev, shape]));
      setSelectedIds(new Set([shape.id]));
      interactionRef.current = {
        kind: "creating-shape",
        shapeKind,
        elementId: shape.id,
        startWorld: world,
      };
      return;
    }

    // Select tool: 1. Check transform handles if single element is selected
    if (selectedElements.length === 1) {
      const sel = selectedElements[0]!;
      const handle = hitTestTransformHandles(world, sel, camera.zoom);
      if (handle === "rotate") {
        const center = getElementCenter(sel);
        const startAngle = radToDeg(
          Math.atan2(world.y - center.y, world.x - center.x)
        );
        interactionRef.current = {
          kind: "rotating",
          elementId: sel.id,
          center,
          startPointerAngleDeg: startAngle,
          initialRotationDeg: sel.rotation,
        };
        return;
      }
      if (handle) {
        interactionRef.current = {
          kind: "resizing",
          elementId: sel.id,
          handle,
          initialBox: {
            x: sel.x,
            y: sel.y,
            width: sel.width,
            height: sel.height,
            rotation: sel.rotation,
          },
        };
        return;
      }
    }

    // 2. Hit test elements via RBush spatial index
    const hit = spatialRef.current.hitTestPoint(world, 4 / Math.max(0.1, camera.zoom));
    if (hit) {
      let nextSelection = new Set(selectedIds);
      if (e.shiftKey) {
        if (nextSelection.has(hit.id)) nextSelection.delete(hit.id);
        else nextSelection.add(hit.id);
      } else if (!nextSelection.has(hit.id)) {
        nextSelection = new Set([hit.id]);
      }
      setSelectedIds(nextSelection);

      if (nextSelection.has(hit.id)) {
        const initialPositions = new Map<string, { x: number; y: number }>();
        for (const el of elements) {
          if (nextSelection.has(el.id)) {
            initialPositions.set(el.id, { x: el.x, y: el.y });
          }
        }
        interactionRef.current = {
          kind: "dragging",
          startWorld: world,
          initialPositions,
          primaryId: hit.id,
          primarySize: { width: hit.width, height: hit.height },
          moved: false,
        };
      }
      return;
    }

    // 3. Empty canvas click => start marquee box selection
    const baseSelection = e.shiftKey ? new Set(selectedIds) : new Set<string>();
    if (!e.shiftKey) {
      setSelectedIds(new Set());
    }
    interactionRef.current = {
      kind: "marquee",
      startWorld: world,
      currentWorld: world,
      additive: e.shiftKey,
      baseSelection,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { screen, world } = getCanvasPointer(e);
    const state = interactionRef.current;

    if (state.kind === "idle") {
      if (activeTool === "select" && !spacePressed) {
        const hit = spatialRef.current.hitTestPoint(
          world,
          3 / Math.max(0.1, camera.zoom)
        );
        setHoveredId(hit?.id ?? null);
      } else {
        setHoveredId(null);
      }
      return;
    }

    if (state.kind === "panning") {
      const dx = screen.x - state.startClient.x;
      const dy = screen.y - state.startClient.y;
      setCamera(panCamera(state.initialCamera, dx, dy));
      return;
    }

    if (state.kind === "dragging") {
      const rawDx = world.x - state.startWorld.x;
      const rawDy = world.y - state.startWorld.y;
      if (Math.hypot(rawDx, rawDy) > 1) {
        state.moved = true;
      }

      const primaryStart = state.initialPositions.get(state.primaryId);
      if (!primaryStart) return;

      const candidateBox = {
        x: primaryStart.x + rawDx,
        y: primaryStart.y + rawDy,
        width: state.primarySize.width,
        height: state.primarySize.height,
      };

      const snap = computeSmartGuides(
        candidateBox,
        elements,
        new Set(state.initialPositions.keys()),
        6 / Math.max(0.2, camera.zoom)
      );
      setSmartGuides(snap.guides);

      const finalDx = snap.snappedX - primaryStart.x;
      const finalDy = snap.snappedY - primaryStart.y;
      const now = Date.now();

      setElements((prev) =>
        prev.map((el) => {
          const init = state.initialPositions.get(el.id);
          if (!init) return el;
          return {
            ...el,
            x: Math.round((init.x + finalDx) * 10) / 10,
            y: Math.round((init.y + finalDy) * 10) / 10,
            updatedAt: now,
          };
        })
      );
      return;
    }

    if (state.kind === "resizing") {
      const box = resizeElementBox(
        state.initialBox,
        state.handle,
        world,
        36,
        e.shiftKey
      );
      const now = Date.now();
      setElements((prev) =>
        prev.map((el) =>
          el.id === state.elementId ? { ...el, ...box, updatedAt: now } : el
        )
      );
      return;
    }

    if (state.kind === "rotating") {
      const angle = radToDeg(
        Math.atan2(world.y - state.center.y, world.x - state.center.x)
      );
      let nextRotation =
        state.initialRotationDeg + (angle - state.startPointerAngleDeg);
      if (e.shiftKey) {
        nextRotation = Math.round(nextRotation / 15) * 15;
      }
      const now = Date.now();
      setElements((prev) =>
        prev.map((el) =>
          el.id === state.elementId
            ? {
                ...el,
                rotation: Math.round(nextRotation * 10) / 10,
                updatedAt: now,
              }
            : el
        )
      );
      return;
    }

    if (state.kind === "marquee") {
      state.currentWorld = world;
      const bounds: Bounds = {
        minX: Math.min(state.startWorld.x, world.x),
        minY: Math.min(state.startWorld.y, world.y),
        maxX: Math.max(state.startWorld.x, world.x),
        maxY: Math.max(state.startWorld.y, world.y),
      };
      setMarqueeBounds(bounds);
      const hits = spatialRef.current.queryMarquee(bounds, "intersect");
      const next = new Set(state.baseSelection);
      for (const h of hits) next.add(h.id);
      setSelectedIds(next);
      return;
    }

    if (state.kind === "creating-shape") {
      const minX = Math.min(state.startWorld.x, world.x);
      const minY = Math.min(state.startWorld.y, world.y);
      const w = Math.max(16, Math.abs(world.x - state.startWorld.x));
      const h = Math.max(16, Math.abs(world.y - state.startWorld.y));
      setElements((prev) =>
        prev.map((el) =>
          el.id === state.elementId
            ? { ...el, x: minX, y: minY, width: w, height: h }
            : el
        )
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const state = interactionRef.current;
    interactionRef.current = { kind: "idle" };
    setSmartGuides([]);
    setMarqueeBounds(null);

    if (
      state.kind === "dragging" &&
      state.moved
    ) {
      historyRef.current.pushSnapshot(elements);
      syncHistoryFlags();
    } else if (state.kind === "resizing" || state.kind === "rotating") {
      historyRef.current.pushSnapshot(elements);
      syncHistoryFlags();
    } else if (state.kind === "creating-shape") {
      setElements((prev) => {
        const adjusted = prev.map((el) => {
          if (el.id !== state.elementId) return el;
          if (el.width < 32 && el.height < 32) {
            return {
              ...el,
              x: Math.round(state.startWorld.x - 105),
              y: Math.round(state.startWorld.y - 65),
              width: 210,
              height: 130,
              updatedAt: Date.now(),
            };
          }
          return { ...el, updatedAt: Date.now() };
        });
        const sorted = sortElementsByZIndex(adjusted);
        historyRef.current.pushSnapshot(sorted);
        syncHistoryFlags();
        return sorted;
      });
      setActiveTool("select");
    }
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      camera
    );
    const hit = spatialRef.current.hitTestPoint(
      world,
      4 / Math.max(0.1, camera.zoom)
    );
    if (hit) {
      setSelectedIds(new Set([hit.id]));
      openEditorForElement(hit);
    }
  }

  async function saveTitleEdit() {
    setEditingTitle(false);
    const updated = await renameBoard(boardId, titleDraft);
    if (updated) {
      setBoardTitle(updated.title);
      setTitleDraft(updated.title);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Доска не найдена</h1>
        <p className="mt-2 text-sm text-slate-500">
          Возможно, она была удалена из локального хранилища браузера.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться к списку досок
        </Link>
      </div>
    );
  }

  const cursorClass =
    spacePressed || activeTool === "hand"
      ? "cursor-grab active:cursor-grabbing"
      : activeTool !== "select"
        ? "cursor-crosshair"
        : "cursor-default";

  const editorOverlayPos = editingElement
    ? worldToScreen({ x: editingElement.x, y: editingElement.y }, camera)
    : null;

  return (
    <div className="relative h-screen w-screen select-none overflow-hidden bg-slate-50">
      {/* Main Infinite Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ width: viewport.width, height: viewport.height }}
        className={`block touch-none ${cursorClass}`}
      />

      {/* Native HTML Textarea Overlay for Double-Click / Creation Editing */}
      {editingElement && editorOverlayPos && (
        <textarea
          ref={textareaRef}
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onBlur={commitTextEditing}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitTextEditing();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              commitTextEditing();
            }
          }}
          placeholder="Введите текст..."
          style={{
            position: "fixed",
            left: editorOverlayPos.x,
            top: editorOverlayPos.y,
            width: Math.max(80, editingElement.width * camera.zoom),
            height: Math.max(40, editingElement.height * camera.zoom),
            transform: editingElement.rotation
              ? `rotate(${editingElement.rotation}deg)`
              : undefined,
            transformOrigin: "center center",
            fontSize: `${Math.max(12, editingElement.fontSize * camera.zoom)}px`,
            lineHeight: 1.3,
            padding:
              editingElement.type === "sticky"
                ? `${16 * camera.zoom}px`
                : editingElement.type === "shape"
                  ? `${12 * camera.zoom}px`
                  : `${4 * camera.zoom}px`,
            textAlign: editingElement.type === "shape" ? "center" : "left",
            color:
              editingElement.type === "text" ? editingElement.color : "#0F172A",
            fontWeight: editingElement.type === "text" ? 700 : 500,
            background: "transparent",
          }}
          className="z-40 resize-none rounded-lg border-2 border-indigo-500 outline-none ring-4 ring-indigo-500/15"
        />
      )}

      {/* Top Floating Bar */}
      <div className="fixed left-4 top-4 z-30 flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md">
        <Link
          href="/"
          title="К списку досок"
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Доски</span>
        </Link>

        <div className="h-5 w-px bg-slate-200" />

        {editingTitle ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void saveTitleEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitleEdit();
                if (e.key === "Escape") {
                  setTitleDraft(boardTitle);
                  setEditingTitle(false);
                }
              }}
              className="w-56 rounded-lg border border-indigo-400 px-2.5 py-1 text-sm font-semibold text-slate-900 outline-none ring-2 ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={() => void saveTitleEdit()}
              className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(boardTitle);
              setEditingTitle(true);
            }}
            title="Нажмите, чтобы переименовать доску"
            className="max-w-[260px] truncate rounded-lg px-2 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            {boardTitle}
          </button>
        )}

        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {elements.length} объ.
        </span>

        <span className="hidden text-xs text-slate-400 md:inline">
          {saveState === "saving" ? "Сохранение..." : "Сохранено"}
        </span>

        <div className="h-5 w-px bg-slate-200" />

        <button
          type="button"
          onClick={() => void handleResetDemo()}
          title="Сбросить к начальной демо-сцене"
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Сброс демо</span>
        </button>
      </div>

      {/* Left Floating Tool Dock */}
      <div className="fixed left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-lg backdrop-blur-md">
        {TOOL_ITEMS.map((tool) => {
          const isActive =
            (spacePressed && tool.id === "hand") ||
            (!spacePressed && activeTool === tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tool.icon}
              <span
                className={`absolute bottom-1 right-1 text-[9px] font-bold leading-none ${
                  isActive ? "text-indigo-100" : "text-slate-400"
                }`}
              >
                {tool.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* Context Floating Style Bar above Selection */}
      {!editingElementId && (
        <ContextStyleBar
          selectedElements={selectedElements}
          camera={camera}
          viewportWidth={viewport.width}
          onUpdateSelected={handleUpdateSelected}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onDuplicate={handleDuplicateSelected}
          onDelete={handleDeleteSelected}
        />
      )}

      {/* Bottom-Left Undo / Redo Floating Bar */}
      <div className="fixed bottom-4 left-4 z-30 flex items-center gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Отменить (Ctrl/Cmd + Z)"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="Повторить (Ctrl/Cmd + Shift + Z)"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom-Right Interactive Minimap + Zoom Controls */}
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2.5">
        <Minimap
          elements={elements}
          camera={camera}
          viewportWidth={viewport.width}
          viewportHeight={viewport.height}
          onJumpToWorld={(worldX, worldY) => {
            setCamera((prev) => ({
              x: viewport.width / 2 - worldX * prev.zoom,
              y: viewport.height / 2 - worldY * prev.zoom,
              zoom: prev.zoom,
            }));
          }}
        />

        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() =>
              setCamera((prev) =>
                zoomAtPoint(prev, prev.zoom / 1.2, {
                  x: viewport.width / 2,
                  y: viewport.height / 2,
                })
              )
            }
            title="Отдалить"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              setCamera((prev) =>
                zoomAtPoint(prev, 1, {
                  x: viewport.width / 2,
                  y: viewport.height / 2,
                })
              )
            }
            title="Сбросить масштаб до 100%"
            className="min-w-[56px] rounded-lg px-2 py-1 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {Math.round(camera.zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={() =>
              setCamera((prev) =>
                zoomAtPoint(prev, prev.zoom * 1.2, {
                  x: viewport.width / 2,
                  y: viewport.height / 2,
                })
              )
            }
            title="Приблизить"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
          </button>

          <div className="mx-0.5 h-5 w-px bg-slate-200" />

          <button
            type="button"
            onClick={handleFitScreen}
            title="Вписать все объекты в экран"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Вписать</span>
          </button>
        </div>
      </div>
    </div>
  );
}
