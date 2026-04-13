import {
  defaultCardPool,
  defaultGameConfig,
  defaultMonsterTemplates,
  normalizeCard,
  type Card,
  type GameConfig,
  type GameState,
  type MonsterTemplate,
} from "./game";

export type ConfigSnapshot = {
  id: string;
  createdAt: number;
  source: "global-config";
  cards: Card[];
  gameConfig: GameConfig;
  monsterTemplates: MonsterTemplate[];
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
const configStoreName = "gameConfig";
const monsterStoreName = "monsterTemplates";
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

export async function loadGameConfig(): Promise<GameConfig> {
  const db = await openGameDb();
  const tx = db.transaction(configStoreName, "readwrite");
  const store = tx.objectStore(configStoreName);
  const existing = await requestToPromise<GameConfig | undefined>(store.get("global"));
  if (!existing) {
    store.put(defaultGameConfig);
    await transactionDone(tx);
    db.close();
    return defaultGameConfig;
  }
  await transactionDone(tx);
  db.close();
  return { ...defaultGameConfig, ...existing, id: "global" };
}

export async function putGameConfig(config: GameConfig) {
  const db = await openGameDb();
  const tx = db.transaction(configStoreName, "readwrite");
  tx.objectStore(configStoreName).put({ ...config, id: "global" });
  await transactionDone(tx);
  db.close();
}

export async function loadMonsterTemplates(): Promise<MonsterTemplate[]> {
  const db = await openGameDb();
  const tx = db.transaction(monsterStoreName, "readwrite");
  const store = tx.objectStore(monsterStoreName);
  const existing = await requestToPromise<MonsterTemplate[]>(store.getAll());
  if (existing.length === 0) {
    defaultMonsterTemplates.forEach((template) => store.put(template));
    await transactionDone(tx);
    db.close();
    return [...defaultMonsterTemplates];
  }
  await transactionDone(tx);
  db.close();
  return existing.sort((a, b) => a.id - b.id);
}

export async function putMonsterTemplate(template: MonsterTemplate) {
  const db = await openGameDb();
  const tx = db.transaction(monsterStoreName, "readwrite");
  tx.objectStore(monsterStoreName).put(template);
  await transactionDone(tx);
  db.close();
}

export async function deleteMonsterTemplate(templateId: number) {
  const db = await openGameDb();
  const tx = db.transaction(monsterStoreName, "readwrite");
  tx.objectStore(monsterStoreName).delete(templateId);
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

export async function createSnapshot(
  cards: Card[],
  gameConfig: GameConfig,
  monsterTemplates: MonsterTemplate[],
): Promise<ConfigSnapshot> {
  const snapshot: ConfigSnapshot = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    source: "global-config",
    cards: cards.map(normalizeCard),
    gameConfig,
    monsterTemplates,
    hash: hashSnapshot(cards, gameConfig, monsterTemplates),
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
    const request = indexedDB.open(dbName, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(cardStoreName)) {
        db.createObjectStore(cardStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(configStoreName)) {
        db.createObjectStore(configStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(monsterStoreName)) {
        db.createObjectStore(monsterStoreName, { keyPath: "id" });
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

function hashSnapshot(cards: Card[], gameConfig: GameConfig, monsterTemplates: MonsterTemplate[]) {
  const configText = JSON.stringify(gameConfig);
  const monsterText = JSON.stringify(monsterTemplates);
  return String(
    cards.reduce(
      (hash, card) => {
        const value = `${card.id}:${card.name}:${card.type}:${card.power}:${card.cost}:${card.rarity}:${card.text}:${card.image}`;
        return Array.from(value).reduce(
          (innerHash, char) => (innerHash * 31 + char.charCodeAt(0)) >>> 0,
          hash,
        );
      },
      hashText(`${configText}:${monsterText}`),
    ),
  );
}

function hashText(value: string) {
  return Array.from(value).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    2166136261,
  );
}
