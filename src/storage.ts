import { defaultCardPool, normalizeCard, type Card, type GameState } from "./game";

export type ConfigSnapshot = {
  id: string;
  createdAt: number;
  source: "global-config";
  cards: Card[];
  hash: string;
};

export type SaveSlot = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  stage: number;
  turn: number;
  lockedConfig: boolean;
  configSnapshotId: string;
  gameState: GameState;
};

const dbName = "card-roguelike-index-db";
const cardStoreName = "cards";
const snapshotStoreName = "configSnapshots";
const saveStoreName = "saveSlots";

export async function loadCardsFromDb(seedIfEmpty = true): Promise<Card[]> {
  const db = await openGameDb();
  const tx = db.transaction(cardStoreName, "readwrite");
  const store = tx.objectStore(cardStoreName);
  const existing = await requestToPromise<Card[]>(store.getAll());

  if (existing.length === 0 && seedIfEmpty) {
    defaultCardPool.forEach((card) => store.put(card));
    await transactionDone(tx);
    db.close();
    return [...defaultCardPool];
  }

  await transactionDone(tx);
  db.close();
  return existing.map(normalizeCard).sort((a, b) => a.id - b.id);
}

export async function putCardInDb(card: Card) {
  const db = await openGameDb();
  const tx = db.transaction(cardStoreName, "readwrite");
  tx.objectStore(cardStoreName).put(normalizeCard(card));
  await transactionDone(tx);
  db.close();
}

export async function deleteCardFromDb(cardId: number) {
  const db = await openGameDb();
  const tx = db.transaction(cardStoreName, "readwrite");
  tx.objectStore(cardStoreName).delete(cardId);
  await transactionDone(tx);
  db.close();
}

export async function loadSaveSlots(): Promise<SaveSlot[]> {
  const db = await openGameDb();
  const tx = db.transaction(saveStoreName, "readonly");
  const saves = await requestToPromise<SaveSlot[]>(tx.objectStore(saveStoreName).getAll());
  await transactionDone(tx);
  db.close();
  return saves.sort((a, b) => a.createdAt - b.createdAt).slice(0, 8);
}

export async function getSaveSlot(id: string): Promise<SaveSlot | undefined> {
  const db = await openGameDb();
  const tx = db.transaction(saveStoreName, "readonly");
  const save = await requestToPromise<SaveSlot | undefined>(tx.objectStore(saveStoreName).get(id));
  await transactionDone(tx);
  db.close();
  return save;
}

export async function putSaveSlot(save: SaveSlot) {
  const db = await openGameDb();
  const tx = db.transaction(saveStoreName, "readwrite");
  tx.objectStore(saveStoreName).put(save);
  await transactionDone(tx);
  db.close();
}

export async function createSnapshot(cards: Card[]): Promise<ConfigSnapshot> {
  const snapshot: ConfigSnapshot = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    source: "global-config",
    cards: cards.map(normalizeCard),
    hash: hashCards(cards),
  };
  const db = await openGameDb();
  const tx = db.transaction(snapshotStoreName, "readwrite");
  tx.objectStore(snapshotStoreName).put(snapshot);
  await transactionDone(tx);
  db.close();
  return snapshot;
}

export async function getSnapshot(id: string): Promise<ConfigSnapshot | undefined> {
  const db = await openGameDb();
  const tx = db.transaction(snapshotStoreName, "readonly");
  const snapshot = await requestToPromise<ConfigSnapshot | undefined>(
    tx.objectStore(snapshotStoreName).get(id),
  );
  await transactionDone(tx);
  db.close();
  return snapshot;
}

export function makeSaveSlot(
  gameState: GameState,
  snapshot: ConfigSnapshot,
  index: number,
): SaveSlot {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: `存档 ${index + 1}`,
    createdAt: now,
    updatedAt: now,
    stage: gameState.stage,
    turn: gameState.turn,
    lockedConfig: true,
    configSnapshotId: snapshot.id,
    gameState,
  };
}

export function updateSaveSlot(save: SaveSlot, gameState: GameState): SaveSlot {
  return {
    ...save,
    updatedAt: Date.now(),
    stage: gameState.stage,
    turn: gameState.turn,
    gameState,
  };
}

function openGameDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(cardStoreName)) {
        db.createObjectStore(cardStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(snapshotStoreName)) {
        db.createObjectStore(snapshotStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(saveStoreName)) {
        db.createObjectStore(saveStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function hashCards(cards: Card[]) {
  return String(
    cards.reduce((hash, card) => {
      const value = `${card.id}:${card.name}:${card.type}:${card.power}:${card.cost}:${card.rarity}:${card.text}:${card.image}`;
      return Array.from(value).reduce(
        (innerHash, char) => (innerHash * 31 + char.charCodeAt(0)) >>> 0,
        hash,
      );
    }, 2166136261),
  );
}
