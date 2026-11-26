"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Clock,
  Database,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { BoardElement, BoardMetadata } from "@doska/shared";
import {
  createBoard,
  deleteBoard,
  ensureBoardsInitialized,
  getBoardPreviewElements,
  renameBoard,
} from "@/lib/board-storage";

function formatUpdatedDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "недавно";
  }
}

function BoardMiniPreview({ elements }: { elements: BoardElement[] }) {
  if (elements.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-400">
        <LayoutGrid className="h-6 w-6 opacity-50" />
        <span className="text-xs">Чистый холст</span>
      </div>
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  }
  const spanW = Math.max(1, maxX - minX);
  const spanH = Math.max(1, maxY - minY);
  const pad = 28;
  const viewBox = `${minX - pad} ${minY - pad} ${spanW + pad * 2} ${spanH + pad * 2}`;

  return (
    <svg
      viewBox={viewBox}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {elements.slice(0, 30).map((el) => {
        if (el.type === "sticky") {
          return (
            <rect
              key={el.id}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              rx={10}
              fill={el.fill}
              stroke="rgba(15,23,42,0.12)"
              strokeWidth={3}
            />
          );
        }
        if (el.type === "shape") {
          const fill = el.fill === "transparent" ? "none" : el.fill;
          if (el.shapeKind === "ellipse") {
            return (
              <ellipse
                key={el.id}
                cx={el.x + el.width / 2}
                cy={el.y + el.height / 2}
                rx={el.width / 2}
                ry={el.height / 2}
                fill={fill}
                stroke={el.stroke}
                strokeWidth={4}
              />
            );
          }
          if (el.shapeKind === "diamond") {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            return (
              <polygon
                key={el.id}
                points={`${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`}
                fill={fill}
                stroke={el.stroke}
                strokeWidth={4}
              />
            );
          }
          return (
            <rect
              key={el.id}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              rx={el.shapeKind === "rounded-rectangle" ? 14 : 2}
              fill={fill}
              stroke={el.stroke}
              strokeWidth={4}
            />
          );
        }
        return (
          <rect
            key={el.id}
            x={el.x}
            y={el.y + el.height * 0.25}
            width={Math.min(el.width, 320)}
            height={Math.max(12, el.fontSize * 0.7)}
            rx={6}
            fill="#94A3B8"
            opacity={0.45}
          />
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardMetadata[]>([]);
  const [previews, setPreviews] = useState<Record<string, BoardElement[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const list = await ensureBoardsInitialized();
      if (!active) return;
      setBoards(list);

      const previewEntries = await Promise.all(
        list.map(async (b) => [b.id, await getBoardPreviewElements(b.id)] as const)
      );
      if (!active) return;
      setPreviews(Object.fromEntries(previewEntries));
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredBoards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => b.title.toLowerCase().includes(q));
  }, [boards, searchQuery]);

  const totalElements = useMemo(
    () => boards.reduce((sum, b) => sum + b.elementCount, 0),
    [boards]
  );

  async function handleCreateBoard(template: "empty" | "demo") {
    const created = await createBoard({ template });
    router.push(`/board/${created.id}`);
  }

  function startRename(board: BoardMetadata) {
    setEditingBoardId(board.id);
    setEditingTitle(board.title);
  }

  async function commitRename(id: string) {
    const updated = await renameBoard(id, editingTitle);
    if (updated) {
      setBoards((prev) =>
        prev
          .map((b) => (b.id === id ? updated : b))
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );
    }
    setEditingBoardId(null);
  }

  async function handleDelete(id: string) {
    await deleteBoard(id);
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/70">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/25">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  Doska
                </h1>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  Slice 1 • MVP
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Бесконечный интерактивный холст для команд и архитектуры
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleCreateBoard("demo")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Демо-доска
            </button>
            <button
              type="button"
              onClick={() => void handleCreateBoard("empty")}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Новая доска
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Metrics & Search Bar */}
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Рабочие доски
              </div>
              <div className="mt-0.5 text-2xl font-bold text-slate-900">
                {boards.length}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Всего объектов
              </div>
              <div className="mt-0.5 text-2xl font-bold text-slate-900">
                {totalElements}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Database className="h-4 w-4 text-emerald-600" />
              <span>Локальное хранилище IndexedDB активно</span>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию доски..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-10 pr-8 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Boards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="h-40 rounded-xl bg-slate-100" />
                <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <LayoutGrid className="h-10 w-10 text-slate-300" />
            <h2 className="mt-3 text-base font-semibold text-slate-800">
              {searchQuery ? "Ничего не найдено" : "У вас пока нет досок"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {searchQuery
                ? "Попробуйте изменить поисковый запрос или создайте новую доску."
                : "Создайте чистый бесконечный холст или откройте готовую демонстрационную сцену архитектуры Doska."}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void handleCreateBoard("demo")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Sparkles className="h-4 w-4 text-amber-500" />
                Создать демо-доску
              </button>
              <button
                type="button"
                onClick={() => void handleCreateBoard("empty")}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Пустая доска
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => {
              const isEditing = editingBoardId === board.id;
              return (
                <div
                  key={board.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <Link
                    href={`/board/${board.id}`}
                    className="relative block h-44 w-full overflow-hidden border-b border-slate-100 bg-slate-50/90 p-3"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-50"
                      style={{
                        backgroundImage:
                          "radial-gradient(#cbd5e1 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                      }}
                    />
                    <div className="relative h-full w-full">
                      <BoardMiniPreview elements={previews[board.id] ?? []} />
                    </div>
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 opacity-0 shadow-sm ring-1 ring-slate-200/80 backdrop-blur transition group-hover:opacity-100">
                      Открыть
                      <ArrowUpRight className="h-3.5 w-3.5 text-indigo-600" />
                    </span>
                  </Link>

                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingTitle}
                            autoFocus
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitRename(board.id);
                              if (e.key === "Escape") setEditingBoardId(null);
                            }}
                            className="w-full rounded-lg border border-indigo-400 px-2.5 py-1 text-sm font-semibold text-slate-900 outline-none ring-2 ring-indigo-500/20"
                          />
                          <button
                            type="button"
                            onClick={() => void commitRename(board.id)}
                            className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
                            title="Сохранить"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBoardId(null)}
                            className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
                            title="Отмена"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Link
                          href={`/board/${board.id}`}
                          className="line-clamp-1 text-base font-semibold text-slate-900 transition hover:text-indigo-600"
                        >
                          {board.title}
                        </Link>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          {board.elementCount} объ.
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatUpdatedDate(board.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startRename(board)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          title="Переименовать доску"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(board.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Удалить доску"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
