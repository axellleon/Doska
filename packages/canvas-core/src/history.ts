import type { BoardElement } from "@doska/shared";

function cloneElements(elements: readonly BoardElement[]): BoardElement[] {
  return elements.map((el) => ({ ...el }));
}

function areSnapshotsEqual(
  a: readonly BoardElement[],
  b: readonly BoardElement[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ea = a[i]!;
    const eb = b[i]!;
    if (
      ea.id !== eb.id ||
      ea.updatedAt !== eb.updatedAt ||
      ea.x !== eb.x ||
      ea.y !== eb.y ||
      ea.width !== eb.width ||
      ea.height !== eb.height ||
      ea.rotation !== eb.rotation ||
      ea.zIndexKey !== eb.zIndexKey
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Bounded snapshot undo/redo manager for board elements.
 */
export class HistoryManager {
  private undoStack: BoardElement[][] = [];
  private redoStack: BoardElement[][] = [];
  private present: BoardElement[] = [];
  private readonly maxDepth: number;

  constructor(initial: readonly BoardElement[] = [], maxDepth = 100) {
    this.maxDepth = Math.max(5, maxDepth);
    this.present = cloneElements(initial);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  get current(): BoardElement[] {
    return cloneElements(this.present);
  }

  reset(elements: readonly BoardElement[]): void {
    this.undoStack = [];
    this.redoStack = [];
    this.present = cloneElements(elements);
  }

  /**
   * Pushes a new committed state onto the history stack (clearing redo).
   */
  push(nextElements: readonly BoardElement[]): void {
    if (areSnapshotsEqual(this.present, nextElements)) {
      return;
    }
    this.undoStack.push(this.present);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.present = cloneElements(nextElements);
    this.redoStack = [];
  }

  /**
   * Alias for `push` for semantic clarity at interaction end.
   */
  pushSnapshot(nextElements: readonly BoardElement[]): void {
    this.push(nextElements);
  }

  undo(): BoardElement[] | null {
    if (!this.canUndo) return null;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.present);
    this.present = prev;
    return cloneElements(this.present);
  }

  redo(): BoardElement[] | null {
    if (!this.canRedo) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.present);
    this.present = next;
    return cloneElements(this.present);
  }
}
