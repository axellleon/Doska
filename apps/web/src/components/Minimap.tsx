"use client";

import React, { useEffect, useRef } from "react";
import type { BoardElement, Bounds, CameraState } from "@doska/shared";
import { getElementAABB, getViewportWorldBounds } from "@doska/canvas-core";

interface MinimapProps {
  elements: readonly BoardElement[];
  camera: CameraState;
  viewportWidth: number;
  viewportHeight: number;
  onJumpToWorld: (worldX: number, worldY: number) => void;
}

const MINIMAP_W = 196;
const MINIMAP_H = 126;

function computeMinimapWorldDomain(
  elements: readonly BoardElement[],
  viewportBounds: Bounds
): Bounds {
  let minX = viewportBounds.minX;
  let minY = viewportBounds.minY;
  let maxX = viewportBounds.maxX;
  let maxY = viewportBounds.maxY;

  for (const el of elements) {
    const b = getElementAABB(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  const padX = Math.max(120, (maxX - minX) * 0.12);
  const padY = Math.max(120, (maxY - minY) * 0.12);

  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}

export function Minimap({
  elements,
  camera,
  viewportWidth,
  viewportHeight,
  onJumpToWorld,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const transformRef = useRef<{
    scale: number;
    offsetX: number;
    offsetY: number;
    domain: Bounds;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportWidth <= 0 || viewportHeight <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(MINIMAP_W * dpr);
    canvas.height = Math.round(MINIMAP_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    const vpBounds = getViewportWorldBounds(camera, viewportWidth, viewportHeight);
    const domain = computeMinimapWorldDomain(elements, vpBounds);
    const domainW = Math.max(1, domain.maxX - domain.minX);
    const domainH = Math.max(1, domain.maxY - domain.minY);
    const scale = Math.min(MINIMAP_W / domainW, MINIMAP_H / domainH);
    const offsetX = (MINIMAP_W - domainW * scale) / 2;
    const offsetY = (MINIMAP_H - domainH * scale) / 2;

    transformRef.current = { scale, offsetX, offsetY, domain };

    // Draw elements
    for (const el of elements) {
      const mx = offsetX + (el.x - domain.minX) * scale;
      const my = offsetY + (el.y - domain.minY) * scale;
      const mw = Math.max(2, el.width * scale);
      const mh = Math.max(2, el.height * scale);

      if (el.type === "sticky") {
        ctx.fillStyle = el.fill;
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeStyle = "rgba(15, 23, 42, 0.2)";
        ctx.lineWidth = 0.75;
        ctx.strokeRect(mx, my, mw, mh);
      } else if (el.type === "shape") {
        ctx.fillStyle = el.fill === "transparent" ? "#E2E8F0" : el.fill;
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeStyle = el.stroke || "#64748B";
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, mw, mh);
      } else {
        ctx.fillStyle = "#94A3B8";
        ctx.fillRect(mx, my, mw, Math.max(2, mh * 0.45));
      }
    }

    // Draw current camera viewport frame
    const vx = offsetX + (vpBounds.minX - domain.minX) * scale;
    const vy = offsetY + (vpBounds.minY - domain.minY) * scale;
    const vw = (vpBounds.maxX - vpBounds.minX) * scale;
    const vh = (vpBounds.maxY - vpBounds.minY) * scale;

    ctx.fillStyle = "rgba(79, 70, 229, 0.10)";
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = "#4F46E5";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
  }, [elements, camera, viewportWidth, viewportHeight]);

  function handlePointerToWorld(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const tr = transformRef.current;
    if (!canvas || !tr) return;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = tr.domain.minX + (localX - tr.offsetX) / tr.scale;
    const worldY = tr.domain.minY + (localY - tr.offsetY) / tr.scale;
    onJumpToWorld(worldX, worldY);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between px-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span>Миникарта</span>
        <span>{elements.length} объ.</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: MINIMAP_W, height: MINIMAP_H }}
        className="block cursor-crosshair rounded-xl border border-slate-100"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          handlePointerToWorld(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          handlePointerToWorld(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      />
    </div>
  );
}
