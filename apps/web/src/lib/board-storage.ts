import {
  createDemoBoardElements,
  createElementId,
  DEMO_BOARD_TITLE,
  type BoardDocument,
  type BoardElement,
  type BoardMetadata,
  type CameraState,
} from "@doska/shared";

const DB_NAME = "doska_local_db_v1";
const DB_VERSION = 1;
const STORE_META = "boards_meta";
const STORE_DOCS = "boards_docs";
const SEED_KEY = "doska_demo_seeded_v1";
export const DEFAULT_DEMO_BOARD_ID = "demo-architecture";

interface StoredBoardPayload {
  id: string;
  elements: BoardElement[];
  camera: CameraState | null;
}

export interface LoadedBoardRecord {
  metadata: BoardMetadata;
  elements: BoardElement[];
  camera: CameraState | null;
}

// SSR / non-IndexedDB fallback store
const memoryMeta = new Map<string, BoardMetadata>();
const memoryDocs = new Map<string, StoredBoardPayload>();
let memorySeeded = false;

function isBrowserWithIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open error"));
  });
}

async function idbGetAllMeta(db: IDBDatabase): Promise<BoardMetadata[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve((req.result as BoardMetadata[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetRecord<T>(
  db: IDBDatabase,
  storeName: string,
  id: string
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbWriteBoard(
  db: IDBDatabase,
  meta: BoardMetadata,
  payload: StoredBoardPayload
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DOCS], "readwrite");
    tx.objectStore(STORE_META).put(meta);
    tx.objectStore(STORE_DOCS).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPutMeta(db: IDBDatabase, meta: BoardMetadata): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteBoard(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DOCS], "readwrite");
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_DOCS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildDemoRecord(id: string, title = DEMO_BOARD_TITLE): {
  meta: BoardMetadata;
  payload: StoredBoardPayload;
} {
  const now = Date.now();
  const elements = createDemoBoardElements(now);
  return {
    meta: {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      elementCount: elements.length,
    },
    payload: {
      id,
      elements,
      camera: null,
    },
  };
}

/**
 * Ensures the initial demo board «Архитектура и брейншторм Doska» is created on first visit.
 */
export async function ensureBoardsInitialized(): Promise<BoardMetadata[]> {
  if (!isBrowserWithIndexedDB()) {
    if (!memorySeeded) {
      const { meta, payload } = buildDemoRecord(DEFAULT_DEMO_BOARD_ID);
      memoryMeta.set(meta.id, meta);
      memoryDocs.set(payload.id, payload);
      memorySeeded = true;
    }
    return [...memoryMeta.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const db = await openDatabase();
  try {
    const existing = await idbGetAllMeta(db);
    const alreadySeeded = window.localStorage.getItem(SEED_KEY) === "1";

    if (existing.length === 0 && !alreadySeeded) {
      const { meta, payload } = buildDemoRecord(DEFAULT_DEMO_BOARD_ID);
      await idbWriteBoard(db, meta, payload);
      window.localStorage.setItem(SEED_KEY, "1");
      return [meta];
    }

    if (existing.length > 0 && !alreadySeeded) {
      window.localStorage.setItem(SEED_KEY, "1");
    }

    return existing.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function listBoards(): Promise<BoardMetadata[]> {
  return ensureBoardsInitialized();
}

export async function getBoardPreviewElements(
  boardId: string
): Promise<BoardElement[]> {
  if (!isBrowserWithIndexedDB()) {
    return memoryDocs.get(boardId)?.elements ?? [];
  }
  const db = await openDatabase();
  try {
    const doc = await idbGetRecord<StoredBoardPayload>(db, STORE_DOCS, boardId);
    return doc?.elements ?? [];
  } finally {
    db.close();
  }
}

export async function createBoard(options: {
  title?: string;
  template: "empty" | "demo";
}): Promise<BoardMetadata> {
  const id = createElementId("board");
  const now = Date.now();
  const elements =
    options.template === "demo" ? createDemoBoardElements(now) : [];
  const defaultTitle =
    options.template === "demo" ? DEMO_BOARD_TITLE : "Новая доска";
  const meta: BoardMetadata = {
    id,
    title: options.title?.trim() || defaultTitle,
    createdAt: now,
    updatedAt: now,
    elementCount: elements.length,
  };
  const payload: StoredBoardPayload = {
    id,
    elements,
    camera: null,
  };

  if (!isBrowserWithIndexedDB()) {
    memoryMeta.set(id, meta);
    memoryDocs.set(id, payload);
    return meta;
  }

  const db = await openDatabase();
  try {
    await idbWriteBoard(db, meta, payload);
    window.localStorage.setItem(SEED_KEY, "1");
    return meta;
  } finally {
    db.close();
  }
}

/**
 * Loads a board by ID. If `id === DEFAULT_DEMO_BOARD_ID` and it doesn't exist yet,
 * automatically provisions the demo board so direct URL visits work immediately.
 */
export async function loadBoardRecord(
  id: string
): Promise<LoadedBoardRecord | null> {
  await ensureBoardsInitialized();

  if (!isBrowserWithIndexedDB()) {
    const meta = memoryMeta.get(id);
    const doc = memoryDocs.get(id);
    if (!meta || !doc) return null;
    return { metadata: meta, elements: doc.elements, camera: doc.camera };
  }

  const db = await openDatabase();
  try {
    let meta = await idbGetRecord<BoardMetadata>(db, STORE_META, id);
    let doc = await idbGetRecord<StoredBoardPayload>(db, STORE_DOCS, id);

    if ((!meta || !doc) && id === DEFAULT_DEMO_BOARD_ID) {
      const seeded = buildDemoRecord(DEFAULT_DEMO_BOARD_ID);
      await idbWriteBoard(db, seeded.meta, seeded.payload);
      meta = seeded.meta;
      doc = seeded.payload;
    }

    if (!meta || !doc) {
      return null;
    }

    return {
      metadata: meta,
      elements: doc.elements,
      camera: doc.camera,
    };
  } finally {
    db.close();
  }
}

export async function saveBoardState(
  id: string,
  elements: BoardElement[],
  camera: CameraState | null
): Promise<BoardMetadata | null> {
  const now = Date.now();

  if (!isBrowserWithIndexedDB()) {
    const prev = memoryMeta.get(id);
    if (!prev) return null;
    const nextMeta: BoardMetadata = {
      ...prev,
      updatedAt: now,
      elementCount: elements.length,
    };
    memoryMeta.set(id, nextMeta);
    memoryDocs.set(id, { id, elements, camera });
    return nextMeta;
  }

  const db = await openDatabase();
  try {
    const prev = await idbGetRecord<BoardMetadata>(db, STORE_META, id);
    if (!prev) return null;
    const nextMeta: BoardMetadata = {
      ...prev,
      updatedAt: now,
      elementCount: elements.length,
    };
    await idbWriteBoard(db, nextMeta, { id, elements, camera });
    return nextMeta;
  } finally {
    db.close();
  }
}

export async function renameBoard(
  id: string,
  nextTitle: string
): Promise<BoardMetadata | null> {
  const trimmed = nextTitle.trim() || "Без названия";
  const now = Date.now();

  if (!isBrowserWithIndexedDB()) {
    const prev = memoryMeta.get(id);
    if (!prev) return null;
    const updated: BoardMetadata = { ...prev, title: trimmed, updatedAt: now };
    memoryMeta.set(id, updated);
    return updated;
  }

  const db = await openDatabase();
  try {
    const prev = await idbGetRecord<BoardMetadata>(db, STORE_META, id);
    if (!prev) return null;
    const updated: BoardMetadata = { ...prev, title: trimmed, updatedAt: now };
    await idbPutMeta(db, updated);
    return updated;
  } finally {
    db.close();
  }
}

export async function deleteBoard(id: string): Promise<void> {
  if (!isBrowserWithIndexedDB()) {
    memoryMeta.delete(id);
    memoryDocs.delete(id);
    return;
  }
  const db = await openDatabase();
  try {
    await idbDeleteBoard(db, id);
  } finally {
    db.close();
  }
}

export async function resetBoardToDemoScene(
  id: string
): Promise<BoardDocument | null> {
  const now = Date.now();
  const elements = createDemoBoardElements(now);
  const meta = await saveBoardState(id, elements, null);
  if (!meta) return null;
  return {
    metadata: meta,
    elements,
    camera: { x: 0, y: 0, zoom: 1 },
  };
}
