"use client";

import React from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Copy,
  Diamond,
  RectangleHorizontal,
  Square,
  Trash2,
} from "lucide-react";
import {
  FONT_SIZE_PRESETS,
  SHAPE_FILL_PALETTE,
  STICKY_PALETTE,
  STROKE_AND_TEXT_PALETTE,
  type BoardElement,
  type CameraState,
  type ShapeKind,
} from "@doska/shared";
import { getElementAABB, worldToScreen } from "@doska/canvas-core";

interface ContextStyleBarProps {
  selectedElements: BoardElement[];
  camera: CameraState;
  viewportWidth: number;
  onUpdateSelected: (updater: (el: BoardElement) => BoardElement) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ContextStyleBar({
  selectedElements,
  camera,
  viewportWidth,
  onUpdateSelected,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
}: ContextStyleBarProps) {
  if (selectedElements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const el of selectedElements) {
    const b = getElementAABB(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
  }

  const anchorScreen = worldToScreen(
    { x: (minX + maxX) / 2, y: minY },
    camera
  );

  const clampedLeft = Math.max(
    260,
    Math.min(Math.max(260, viewportWidth - 260), anchorScreen.x)
  );
  const clampedTop = Math.max(74, anchorScreen.y - 62);

  const primary = selectedElements[0]!;
  const hasSticky = selectedElements.some((e) => e.type === "sticky");
  const hasShape = selectedElements.some((e) => e.type === "shape");
  const hasText = selectedElements.some((e) => e.type === "text");

  const activeFill =
    primary.type === "sticky" || primary.type === "shape" ? primary.fill : null;
  const activeStrokeOrColor =
    primary.type === "shape"
      ? primary.stroke
      : primary.type === "text"
        ? primary.color
        : null;

  const fillSwatches = hasSticky && !hasShape ? STICKY_PALETTE : SHAPE_FILL_PALETTE;

  const shapeKinds: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
    {
      kind: "rectangle",
      label: "Прямоугольник",
      icon: <Square className="h-3.5 w-3.5" />,
    },
    {
      kind: "rounded-rectangle",
      label: "Скруглённый",
      icon: <RectangleHorizontal className="h-3.5 w-3.5" />,
    },
    {
      kind: "ellipse",
      label: "Эллипс",
      icon: <Circle className="h-3.5 w-3.5" />,
    },
    {
      kind: "diamond",
      label: "Ромб",
      icon: <Diamond className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div
      style={{
        left: clampedLeft,
        top: clampedTop,
        transform: "translate(-50%, -100%)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-30 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-xl backdrop-blur-md"
    >
      {/* Shape Kind Selector */}
      {hasShape && (
        <>
          <div className="flex items-center gap-0.5">
            {shapeKinds.map((sk) => {
              const active =
                primary.type === "shape" && primary.shapeKind === sk.kind;
              return (
                <button
                  key={sk.kind}
                  type="button"
                  title={sk.label}
                  onClick={() =>
                    onUpdateSelected((el) =>
                      el.type === "shape" ? { ...el, shapeKind: sk.kind } : el
                    )
                  }
                  className={`rounded-lg p-1.5 transition ${
                    active
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {sk.icon}
                </button>
              );
            })}
          </div>
          <div className="h-5 w-px bg-slate-200" />
        </>
      )}

      {/* Fill / Sticky Color Swatches */}
      {(hasSticky || hasShape) && (
        <>
          <div className="flex items-center gap-1">
            {fillSwatches.map((sw) => {
              const isSelected = activeFill === sw.value;
              const isTransparent = sw.value === "transparent";
              return (
                <button
                  key={sw.id}
                  type="button"
                  title={`Заливка: ${sw.label}`}
                  onClick={() =>
                    onUpdateSelected((el) =>
                      el.type === "sticky" || el.type === "shape"
                        ? { ...el, fill: sw.value }
                        : el
                    )
                  }
                  className={`h-5 w-5 rounded-full border transition ${
                    isSelected
                      ? "scale-110 border-indigo-600 ring-2 ring-indigo-500/30"
                      : "border-slate-300 hover:scale-105"
                  }`}
                  style={{
                    backgroundColor: isTransparent ? "#ffffff" : sw.value,
                    backgroundImage: isTransparent
                      ? "linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%), linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%)"
                      : undefined,
                    backgroundSize: isTransparent ? "6px 6px" : undefined,
                    backgroundPosition: isTransparent ? "0 0, 3px 3px" : undefined,
                  }}
                />
              );
            })}
          </div>
          <div className="h-5 w-px bg-slate-200" />
        </>
      )}

      {/* Stroke / Text Color Swatches */}
      {(hasShape || hasText) && (
        <>
          <div className="flex items-center gap-1">
            {STROKE_AND_TEXT_PALETTE.slice(0, 6).map((sw) => {
              const isSelected = activeStrokeOrColor === sw.value;
              return (
                <button
                  key={sw.id}
                  type="button"
                  title={`Цвет линии/текста: ${sw.label}`}
                  onClick={() =>
                    onUpdateSelected((el) => {
                      if (el.type === "shape") return { ...el, stroke: sw.value };
                      if (el.type === "text") return { ...el, color: sw.value };
                      return el;
                    })
                  }
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                    isSelected
                      ? "scale-110 border-indigo-600 ring-2 ring-indigo-500/30"
                      : "border-slate-200 hover:scale-105"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: sw.value }}
                  />
                </button>
              );
            })}
          </div>
          <div className="h-5 w-px bg-slate-200" />
        </>
      )}

      {/* Font Size Selector */}
      <div className="flex items-center gap-0.5">
        {FONT_SIZE_PRESETS.map((sz) => {
          const active = primary.fontSize === sz;
          return (
            <button
              key={sz}
              type="button"
              title={`Размер шрифта ${sz}px`}
              onClick={() =>
                onUpdateSelected((el) => ({ ...el, fontSize: sz }))
              }
              className={`rounded-md px-1.5 py-0.5 text-xs font-semibold transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {sz}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-slate-200" />

      {/* Layering, Duplicate, Delete */}
      <button
        type="button"
        onClick={onBringToFront}
        title="На передний план"
        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowUpToLine className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSendToBack}
        title="На задний план"
        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowDownToLine className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        title="Дублировать (Ctrl/Cmd + D)"
        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Удалить (Delete / Backspace)"
        className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
