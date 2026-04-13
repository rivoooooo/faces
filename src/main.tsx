import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  addCardToDeck,
  chooseBossHealth,
  createCardMap,
  createEmptyGameState,
  createGameState,
  defaultGameConfig,
  defaultMonsterTemplates,
  filterCards,
  generateMonsterVisual,
  labelType,
  moveCardInState,
  normalizeCard,
  playCard,
  proceedToNextStage,
  rarityOrder,
  typeOrder,
  type Card,
  type CardType,
  type DropTarget,
  type Fighter,
  type GameConfig,
  type GameState,
  type GeneratedMonster,
  type MonsterPart,
  type MonsterTemplate,
  type Rarity,
} from "./game";
import {
  createSnapshot,
  deleteCardFromDb,
  deleteMonsterTemplate,
  getSaveSlot,
  getSnapshot,
  loadCardsFromDb,
  loadGameConfig,
  loadMonsterTemplates,
  loadSaveSlots,
  makeSaveSlot,
  putCardInDb,
  putGameConfig,
  putMonsterTemplate,
  putSaveSlot,
  updateSaveSlot,
  type SaveSlot,
} from "./storage";
import "./style.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<HomePage />} path="/" />
        <Route element={<GamePage />} path="/game/:slotId" />
        <Route element={<SettingsPage />} path="/settings" />
        <Route element={<SettingsPage />} path="/settings/:section" />
        <Route element={<CodexPage />} path="/codex" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [monsterTemplates, setMonsterTemplates] = useState<MonsterTemplate[]>([]);
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadCardsFromDb(),
      loadGameConfig(),
      loadMonsterTemplates(),
      loadSaveSlots(),
    ]).then(([loadedCards, loadedConfig, loadedTemplates, loadedSaves]) => {
      if (!active) return;
      setCards(loadedCards);
      setGameConfig(loadedConfig);
      setMonsterTemplates(loadedTemplates);
      setSaves(loadedSaves);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const startGame = async () => {
    if (!ready || saves.length >= 8 || !gameConfig) return;
    const snapshot = await createSnapshot(cards, gameConfig, monsterTemplates);
    const gameState = createGameState(
      snapshot.cards,
      snapshot.monsterTemplates,
      snapshot.gameConfig,
    );
    const save = makeSaveSlot(gameState, snapshot, saves.length);
    await putSaveSlot(save);
    void navigate(`/game/${save.id}`);
  };

  return (
    <main className="game-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">无尽卡牌闯关</p>
          <h1>千技牌阵</h1>
        </div>
        <div className="top-actions">
          <Link className="nav-button" to="/codex">
            图鉴
          </Link>
          <Link className="nav-button" to="/settings/cards">
            设置
          </Link>
          <button disabled={!ready || saves.length >= 8} type="button" onClick={startGame}>
            新游戏
          </button>
        </div>
      </section>

      <section className="start-screen home-screen">
        <div className="start-copy">
          <p className="eyebrow">
            {ready ? `${cards.length} 张全局卡牌已就绪` : "卡牌数据库初始化中"}
          </p>
          <h2>选择存档，或用当前卡牌配置创建新的挑战。</h2>
          <p>开始游戏会复制当前卡牌配置，生成独立快照。之后设置页的改动不会影响这场游戏。</p>
        </div>
        <div className="save-grid">
          {saves.map((save) => (
            <button
              className="save-slot"
              key={save.id}
              type="button"
              onClick={() => navigate(`/game/${save.id}`)}
            >
              <span>{save.name}</span>
              <b>
                第 {save.stage} 关 / {save.turn} 回合
              </b>
              <em>{save.lockedConfig ? "配置锁定" : "可刷新配置"}</em>
            </button>
          ))}
          {Array.from({ length: Math.max(0, 8 - saves.length) }, (_, index) => (
            <button className="save-slot empty" disabled key={index} type="button">
              空存档
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function GamePage() {
  const { slotId } = useParams();
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveSlot | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [monsterTemplates, setMonsterTemplates] = useState<MonsterTemplate[]>([]);
  const [state, setState] = useState<GameState>(createEmptyGameState);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const actionLocked = useRef(false);
  const draggedCardId = useRef<number | null>(null);
  const loaded = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cardMap = useMemo(() => createCardMap(cards), [cards]);

  useEffect(() => {
    let active = true;
    if (!slotId) return;

    void getSaveSlot(slotId).then(async (loadedSave) => {
      if (!active || !loadedSave) return;
      const snapshot = await getSnapshot(loadedSave.configSnapshotId);
      if (!active || !snapshot) return;
      setSave(loadedSave);
      const safeGameConfig = snapshot.gameConfig ?? defaultGameConfig;
      const safeMonsterTemplates = snapshot.monsterTemplates ?? defaultMonsterTemplates;
      const safeGameState = {
        ...loadedSave.gameState,
        monsterVisual:
          loadedSave.gameState.monsterVisual ??
          generateMonsterVisual(safeMonsterTemplates, safeGameConfig),
      };
      setCards(snapshot.cards);
      setGameConfig(safeGameConfig);
      setMonsterTemplates(safeMonsterTemplates);
      setState(safeGameState);
      loaded.current = true;
    });

    return () => {
      active = false;
    };
  }, [slotId]);

  useEffect(() => {
    if (!loaded.current || !save) return;
    const nextSave = updateSaveSlot(save, state);
    setSave(nextSave);
    void putSaveSlot(nextSave);
  }, [state]);

  const useCard = async (cardId: number, source: HTMLElement) => {
    const current = stateRef.current;
    const card = cardMap.get(cardId);
    if (
      actionLocked.current ||
      !card ||
      current.awaitingReward ||
      current.player.hp <= 0 ||
      current.usedCardIds.includes(cardId) ||
      card.cost > current.energy
    ) {
      return;
    }

    actionLocked.current = true;
    source.classList.add("launching");
    await animatePlayedCard(source, card);
    setState((snapshot) => playCard(snapshot, cardId, cards));
    actionLocked.current = false;
  };

  const onDrop = (target: DropTarget, targetIndex: number, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const cardId = draggedCardId.current ?? Number(event.dataTransfer.getData("text/plain"));
    if (!cardId) return;
    draggedCardId.current = null;
    setState((snapshot) => moveCardInState(snapshot, cardId, target, targetIndex, cardMap));
  };

  const chooseReward = (cardId: number) => {
    setState((snapshot) =>
      proceedToNextStage(
        addCardToDeck(snapshot, cardId, cardMap),
        cards,
        monsterTemplates,
        gameConfig ?? undefined,
      ),
    );
  };

  if (!slotId) return <Navigate replace to="/" />;

  const isBoss = state.stage % 10 === 0;
  const usedCount = state.usedCardIds.length;
  const visibleCards = state.deckIds
    .filter((id) => !state.usedCardIds.includes(id))
    .map((id) => cardMap.get(id))
    .filter(isCard);
  const handCards = visibleCards.slice(0, 6);
  const monsterCards = state.monsterCardIds.map((id) => cardMap.get(id)).filter(isCard);
  const rewardCards = state.rewardIds.map((id) => cardMap.get(id)).filter(isCard);
  const monsterName = isBoss ? `第 ${state.stage} 关 Boss` : state.monsterVisual.name;

  return (
    <main className={`game-shell game-bg-${gameConfig?.background ?? "ember-grid"}`}>
      <section className="topbar topbar-compact">
        <div className="metrics">
          <span>
            关卡 <b>{state.stage}</b>
          </span>
          <span>
            回合 <b>{state.turn}</b>
          </span>
          <span>
            卡池 <b>{cards.length}</b>
          </span>
          <span>
            携带 <b>{state.deckIds.length}/30</b>
          </span>
          <span>
            生命{" "}
            <b>
              {state.player.hp}/{state.player.maxHp}
            </b>
          </span>
          <span>
            已用{" "}
            <b>
              {usedCount}/{state.deckIds.length}
            </b>
          </span>
        </div>
        <div className="top-actions">
          <button className="help-button" type="button" onClick={() => navigate("/")}>
            主页
          </button>
          <button className="help-button" type="button" onClick={() => setBackpackOpen(true)}>
            背包
          </button>
          <button className="help-button" type="button" onClick={() => setLogOpen(true)}>
            记录
          </button>
          <button className="help-button" type="button" onClick={() => setHelpOpen(true)}>
            Help
          </button>
        </div>
      </section>

      <section className={`battlefield ${isBoss ? "boss-field" : ""}`}>
        <aside className="panel player-panel">
          <p className="eyebrow">玩家</p>
          <h2>牌手 Lv.{state.player.level}</h2>
          <PlayerStats player={state.player} />
          <div className="energy">
            {Array.from({ length: state.maxEnergy }, (_, index) => (
              <span className={index < state.energy ? "filled" : ""} key={index} />
            ))}
          </div>
        </aside>

        <section className="monster-stage">
          <div className="monster-aura" />
          <div className="monster" aria-label={monsterName}>
            <MonsterVisual isBoss={isBoss} visual={state.monsterVisual} />
          </div>
          <div className="monster-info">
            <p className="eyebrow">
              {isBoss ? "Boss" : "Monster"} Lv.{state.monster.level}
            </p>
            <h2>{monsterName}</h2>
            <Stats fighter={state.monster} />
          </div>
        </section>

        <aside className="panel intent-panel">
          <p className="eyebrow">怪物手牌</p>
          <h2>两张循环</h2>
          <div className="intent-cards">
            {monsterCards.map((card, index) => (
              <div
                className={`intent ${index === state.monsterCardIndex ? "next" : ""}`}
                key={card.id}
              >
                <span>{card.name}</span>
                <b>{labelType(card.type)}</b>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="hand">
        <div className="card-fan">
          {handCards.map((card, index) => (
            <CardView
              action="play-card"
              card={card}
              disabled={state.awaitingReward || card.cost > state.energy || state.player.hp <= 0}
              index={index}
              key={card.id}
              onClick={(event) => void useCard(card.id, event.currentTarget)}
              total={handCards.length}
            />
          ))}
        </div>
      </section>

      <ActionHint log={state.log} />
      {state.awaitingReward && (
        <Rewards
          isBossReward={isBoss}
          onBossHealth={() =>
            setState((snapshot) =>
              chooseBossHealth(snapshot, cards, monsterTemplates, gameConfig ?? undefined),
            )
          }
          onChoose={chooseReward}
          rewards={rewardCards}
        />
      )}
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
      {logOpen && <Log log={state.log} onClose={() => setLogOpen(false)} />}
      {backpackOpen && (
        <Backpack
          cardMap={cardMap}
          collectionIds={state.collectionIds}
          deckIds={state.deckIds}
          onClose={() => setBackpackOpen(false)}
          onDragEnd={(event) => {
            event.currentTarget.classList.remove("dragging");
            draggedCardId.current = null;
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragStart={(cardId, event) => {
            draggedCardId.current = cardId;
            event.currentTarget.classList.add("dragging");
            event.dataTransfer.setData("text/plain", String(cardId));
            event.dataTransfer.effectAllowed = "move";
          }}
          onDrop={onDrop}
          usedCardIds={state.usedCardIds}
        />
      )}
    </main>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const { section = "cards" } = useParams();
  const [cards, setCards] = useState<Card[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [monsterTemplates, setMonsterTemplates] = useState<MonsterTemplate[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingMonster, setEditingMonster] = useState<MonsterTemplate | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void Promise.all([loadCardsFromDb(), loadGameConfig(), loadMonsterTemplates()]).then(
      ([loadedCards, loadedConfig, loadedTemplates]) => {
        setCards(loadedCards);
        setGameConfig(loadedConfig);
        setMonsterTemplates(loadedTemplates);
      },
    );
  }, []);

  const reload = async () => setCards(await loadCardsFromDb(false));
  const reloadMonsters = async () => setMonsterTemplates(await loadMonsterTemplates());
  const saveCard = async (card: Card) => {
    const normalized = normalizeCard(card);
    await putCardInDb(normalized);
    await reload();
    setEditingCard(normalized);
  };

  const deleteCard = async (cardId: number) => {
    await deleteCardFromDb(cardId);
    await reload();
    setEditingCard(null);
  };

  const createCard = () => {
    const nextId = Math.max(0, ...cards.map((card) => card.id)) + 1;
    setEditingCard({
      id: nextId,
      name: `自定义-${String(nextId).padStart(4, "0")}`,
      type: "strike",
      power: 12,
      cost: 1,
      rarity: "普通",
      text: "造成 12 点伤害。",
      image: "",
    });
  };

  const exportCards = () => {
    exportJson("cards-export.json", cards);
  };

  const exportMod = () => {
    exportJson("mod-export.json", {
      version: 1,
      cards,
      gameConfig,
      monsterTemplates,
      pluginApi: gameConfig?.pluginApi,
    });
  };

  const saveGameConfig = async (config: GameConfig) => {
    await putGameConfig(config);
    setGameConfig(config);
  };

  const saveMonster = async (template: MonsterTemplate) => {
    await putMonsterTemplate(template);
    await reloadMonsters();
    setEditingMonster(template);
  };

  const deleteMonster = async (templateId: number) => {
    await deleteMonsterTemplate(templateId);
    await reloadMonsters();
    setEditingMonster(null);
  };

  const createMonsterTemplate = () => {
    const nextId = Math.max(0, ...monsterTemplates.map((template) => template.id)) + 1;
    setEditingMonster({
      id: nextId,
      name: `自定义怪物-${String(nextId).padStart(2, "0")}`,
      stance: "站立",
      head: { kind: "svg", value: "◉‿◉" },
      body: { kind: "svg", value: "⬢" },
      leftHand: { kind: "svg", value: "╱" },
      rightHand: { kind: "svg", value: "╲" },
      leftLeg: { kind: "svg", value: "╿" },
      rightLeg: { kind: "svg", value: "╽" },
      hitAudio: "",
      backgroundMusic: "",
    });
  };

  const exportJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importMod = async (file: File) => {
    const content = await file.text();
    const mod = JSON.parse(content) as {
      cards?: Card[];
      gameConfig?: GameConfig;
      monsterTemplates?: MonsterTemplate[];
    };

    if (Array.isArray(mod.cards)) {
      for (const card of mod.cards) {
        await putCardInDb(normalizeCard(card));
      }
      await reload();
    }

    if (mod.gameConfig) {
      await saveGameConfig({ ...defaultGameConfig, ...mod.gameConfig, id: "global" });
    }

    if (Array.isArray(mod.monsterTemplates)) {
      for (const template of mod.monsterTemplates) {
        await putMonsterTemplate(template);
      }
      await reloadMonsters();
    }
  };

  return (
    <main className="game-shell page-shell">
      <section className="settings-layer inline-layer">
        <article className="settings-box">
          <div className="section-title">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>设置</h2>
            </div>
            <div className="settings-actions">
              <Link className="nav-button" to="/settings/cards">
                卡牌
              </Link>
              <Link className="nav-button" to="/settings/game">
                游戏
              </Link>
              <Link className="nav-button" to="/settings/monsters">
                怪物
              </Link>
              <Link className="nav-button" to="/settings/mods">
                Mod
              </Link>
              <button className="secondary" type="button" onClick={() => navigate("/")}>
                返回
              </button>
            </div>
          </div>
          {section === "game" && gameConfig ? (
            <GameConfigPanel config={gameConfig} onSave={saveGameConfig} />
          ) : section === "monsters" ? (
            <MonsterSettings
              editingMonster={editingMonster}
              monsters={monsterTemplates}
              onCreate={createMonsterTemplate}
              onDelete={deleteMonster}
              onEdit={setEditingMonster}
              onSave={saveMonster}
            />
          ) : section === "mods" ? (
            <ModSettings
              onExport={exportMod}
              onImport={(file) => void importMod(file)}
              pluginApi={gameConfig?.pluginApi ?? ""}
            />
          ) : (
            <Settings
              cards={cards}
              editingCard={editingCard}
              onClose={() => navigate("/")}
              onCreate={createCard}
              onDelete={deleteCard}
              onEdit={setEditingCard}
              onExport={exportCards}
              onSave={saveCard}
              onSearch={setSearch}
              search={search}
            />
          )}
        </article>
      </section>
    </main>
  );
}

function CodexPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadCardsFromDb().then(setCards);
  }, []);

  return (
    <main className="game-shell page-shell">
      <CardCodex cards={cards} onClose={() => navigate("/")} onSearch={setSearch} search={search} />
    </main>
  );
}

function isCard(card: Card | undefined): card is Card {
  return card !== undefined;
}

function CardView({
  action,
  card,
  disabled = false,
  draggable = false,
  index = 0,
  onClick,
  onDragEnd,
  onDragStart,
  onDrop,
  total = 1,
  used = false,
}: {
  action: string;
  card: Card;
  disabled?: boolean;
  draggable?: boolean;
  index?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
  total?: number;
  used?: boolean;
}) {
  const spread = total <= 1 ? 0 : index - (total - 1) / 2;
  const style =
    action === "play-card"
      ? ({ "--spread": spread, "--fan-y": `${Math.abs(spread) * 8}px` } as CSSProperties)
      : ({ "--drop-index": index } as CSSProperties);

  return (
    <button
      className={`card card-${card.type} rarity-${card.rarity}`}
      data-action={action}
      data-card-id={card.id}
      data-drag-card={draggable ? card.id : undefined}
      data-drop-index={onDrop ? index : undefined}
      data-used={used ? "true" : undefined}
      disabled={disabled}
      draggable={draggable}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDrop={onDrop}
      style={style}
      type="button"
    >
      <span className="card-top">
        <strong>{card.name}</strong>
        <em>{card.cost}</em>
      </span>
      {card.image ? <img className="card-image" src={card.image} alt="" /> : null}
      <span className="card-type">
        {labelType(card.type)} / {card.rarity}
      </span>
      <span className="card-text">{card.text}</span>
      <span className="card-power">强度 {card.power}</span>
    </button>
  );
}

function Stats({ fighter }: { fighter: Fighter }) {
  return (
    <>
      <div className="hp-row">
        <span>
          {fighter.hp}/{fighter.maxHp}
        </span>
        <div className="hp-bar">
          <i style={{ width: percent(fighter.hp, fighter.maxHp) }} />
        </div>
      </div>
      <div className="status-row">
        <span>护盾 {fighter.block}</span>
        <span>流血 {fighter.bleed}</span>
        <span>专注 {fighter.focus}</span>
      </div>
    </>
  );
}

function PlayerStats({ player }: { player: Fighter }) {
  return (
    <>
      <div className="life-row" aria-label="玩家生命">
        {Array.from({ length: player.maxHp }, (_, index) => (
          <span className={index < player.hp ? "alive" : ""} key={index} />
        ))}
      </div>
      <div className="status-row">
        <span>护盾 {player.block}</span>
        <span>流血 {player.bleed}</span>
        <span>专注 {player.focus}</span>
      </div>
    </>
  );
}

function Rewards({
  isBossReward,
  onBossHealth,
  onChoose,
  rewards,
}: {
  isBossReward: boolean;
  onBossHealth: () => void;
  onChoose: (cardId: number) => void;
  rewards: Card[];
}) {
  return (
    <section className="reward-layer">
      <div className="reward-box">
        <div className="section-title">
          <div>
            <p className="eyebrow">{isBossReward ? "Boss 奖励" : "关卡奖励"}</p>
            <h2>{isBossReward ? "选择卡牌或生命" : "选择 1 张卡牌"}</h2>
          </div>
          {isBossReward && (
            <button type="button" onClick={onBossHealth}>
              生命 +1
            </button>
          )}
        </div>
        <div className="reward-grid">
          {rewards.map((card, index) => (
            <CardView
              action="choose-reward"
              card={card}
              index={index}
              key={card.id}
              onClick={() => onChoose(card.id)}
              total={rewards.length}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionHint({ log }: { log: string[] }) {
  const actionLogs = log.filter((item) => item.startsWith("你使用") || item.startsWith("怪物使用"));
  return (
    <section className="action-hint" aria-live="polite">
      {actionLogs.slice(0, 2).map((item, index) => (
        <p key={`${item}-${index}`}>{item}</p>
      ))}
    </section>
  );
}

function Log({ log, onClose }: { log: string[]; onClose: () => void }) {
  return (
    <section className="log-layer">
      <article className="log-box">
        <div className="section-title">
          <div>
            <p className="eyebrow">Log</p>
            <h2>战斗记录</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="log-list">
          {log.map((item, index) => (
            <p key={`${item}-${index}`}>{item}</p>
          ))}
        </div>
      </article>
    </section>
  );
}

function Backpack({
  cardMap,
  collectionIds,
  deckIds,
  onClose,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  usedCardIds,
}: {
  cardMap: Map<number, Card>;
  collectionIds: number[];
  deckIds: number[];
  onClose: () => void;
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (cardId: number, event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (target: DropTarget, targetIndex: number, event: DragEvent<HTMLElement>) => void;
  usedCardIds: number[];
}) {
  const deckIdSet = new Set(deckIds);
  const deckCards = deckIds.map((id) => cardMap.get(id)).filter(isCard);
  const bagCards = collectionIds
    .filter((id) => !deckIdSet.has(id))
    .map((id) => cardMap.get(id))
    .filter(isCard);
  const availableDeck = deckIds.filter((id) => !usedCardIds.includes(id));

  return (
    <section className="backpack-layer">
      <article className="backpack-box">
        <div className="section-title">
          <div>
            <p className="eyebrow">Backpack</p>
            <h2>卡牌背包</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <section className="pack-section">
          <div className="pack-heading">
            <p className="eyebrow">当前牌组</p>
            <span>
              {availableDeck.length}/{deckIds.length} 可用，最多 30 张
            </span>
          </div>
          <div
            className="pack-grid pack-dropzone"
            onDragOver={onDragOver}
            onDrop={(event) => onDrop("deck", deckIds.length, event)}
          >
            {deckCards.map((card, index) => (
              <CardView
                action="inspect-card"
                card={card}
                draggable
                index={index}
                key={card.id}
                onDragEnd={onDragEnd}
                onDragStart={(event) => onDragStart(card.id, event)}
                onDrop={(event) => onDrop("deck", index, event)}
                total={deckCards.length}
                used={usedCardIds.includes(card.id)}
              />
            ))}
          </div>
        </section>
        <section className="pack-section">
          <div className="pack-heading">
            <p className="eyebrow">背包库存</p>
            <span>
              {bagCards.length}/{collectionIds.length} 张未放入牌组
            </span>
          </div>
          <div
            className="pack-grid pack-dropzone"
            onDragOver={onDragOver}
            onDrop={(event) => onDrop("bag", 0, event)}
          >
            {bagCards.length > 0 ? (
              bagCards.map((card) => (
                <CardView
                  action="inspect-card"
                  card={card}
                  draggable
                  key={card.id}
                  onDragEnd={onDragEnd}
                  onDragStart={(event) => onDragStart(card.id, event)}
                />
              ))
            ) : (
              <p className="empty-pack">背包里没有闲置卡牌。</p>
            )}
          </div>
        </section>
      </article>
    </section>
  );
}

function CardCodex({
  cards,
  onClose,
  onSearch,
  search,
}: {
  cards: Card[];
  onClose: () => void;
  onSearch: (value: string) => void;
  search: string;
}) {
  const visibleCards = filterCards(cards, search);

  return (
    <section className="codex-layer inline-layer">
      <article className="library-box">
        <div className="section-title">
          <div>
            <p className="eyebrow">Codex</p>
            <h2>卡牌图鉴</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            返回
          </button>
        </div>
        <input
          className="search-input"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="搜索名称、类型、稀有度、描述或 ID"
          value={search}
        />
        <div className="library-grid">
          {visibleCards.map((card) => (
            <CardView action="inspect-card" card={card} key={card.id} />
          ))}
        </div>
      </article>
    </section>
  );
}

function Settings({
  cards,
  editingCard,
  onClose,
  onCreate,
  onDelete,
  onEdit,
  onExport,
  onSave,
  onSearch,
  search,
}: {
  cards: Card[];
  editingCard: Card | null;
  onClose: () => void;
  onCreate: () => void;
  onDelete: (cardId: number) => void;
  onEdit: (card: Card) => void;
  onExport: () => void;
  onSave: (card: Card) => void;
  onSearch: (value: string) => void;
  search: string;
}) {
  const visibleCards = filterCards(cards, search);

  return (
    <>
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Cards</p>
          <h2>卡牌管理</h2>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={onCreate}>
            新建
          </button>
          <button className="secondary" type="button" onClick={onExport}>
            导出
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            返回
          </button>
        </div>
      </div>
      <div className="settings-layout">
        <section className="settings-list">
          <input
            className="search-input"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="搜索卡牌"
            value={search}
          />
          <div className="settings-card-list">
            {visibleCards.map((card) => (
              <button
                className={`settings-row ${editingCard?.id === card.id ? "selected" : ""}`}
                key={card.id}
                type="button"
                onClick={() => onEdit(card)}
              >
                <span>{card.name}</span>
                <b>
                  {labelType(card.type)} / {card.rarity}
                </b>
              </button>
            ))}
          </div>
        </section>
        <CardEditor card={editingCard} onDelete={onDelete} onSave={onSave} />
      </div>
    </>
  );
}

function CardEditor({
  card,
  onDelete,
  onSave,
}: {
  card: Card | null;
  onDelete: (cardId: number) => void;
  onSave: (card: Card) => void;
}) {
  const [draft, setDraft] = useState<Card | null>(card);

  useEffect(() => {
    setDraft(card);
  }, [card]);

  if (!draft) {
    return (
      <section className="card-editor empty-editor">
        <p>选择一张卡牌，或点击新建。</p>
      </section>
    );
  }

  const updateDraft = <K extends keyof Card>(key: K, value: Card[K]) => {
    setDraft((snapshot) => (snapshot ? { ...snapshot, [key]: value } : snapshot));
  };

  return (
    <section className="card-editor">
      <div className="editor-preview">
        <CardView action="inspect-card" card={draft} />
      </div>
      <label>
        ID
        <input
          type="number"
          value={draft.id}
          onChange={(event) => updateDraft("id", Number(event.target.value))}
        />
      </label>
      <label>
        名称
        <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
      </label>
      <label>
        类型
        <select
          value={draft.type}
          onChange={(event) => updateDraft("type", event.target.value as CardType)}
        >
          {typeOrder.map((type) => (
            <option key={type} value={type}>
              {labelType(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        稀有度
        <select
          value={draft.rarity}
          onChange={(event) => updateDraft("rarity", event.target.value as Rarity)}
        >
          {rarityOrder.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>
      </label>
      <label>
        消耗
        <input
          type="number"
          value={draft.cost}
          onChange={(event) => updateDraft("cost", Number(event.target.value))}
        />
      </label>
      <label>
        强度
        <input
          type="number"
          value={draft.power}
          onChange={(event) => updateDraft("power", Number(event.target.value))}
        />
      </label>
      <label>
        图片 URL
        <input value={draft.image} onChange={(event) => updateDraft("image", event.target.value)} />
      </label>
      <label>
        技能文本
        <textarea
          value={draft.text}
          onChange={(event) => updateDraft("text", event.target.value)}
        />
      </label>
      <div className="editor-actions">
        <button type="button" onClick={() => onSave(draft)}>
          保存到 index.db
        </button>
        <button className="secondary danger" type="button" onClick={() => onDelete(draft.id)}>
          删除
        </button>
      </div>
    </section>
  );
}

function GameConfigPanel({
  config,
  onSave,
}: {
  config: GameConfig;
  onSave: (config: GameConfig) => void;
}) {
  const [draft, setDraft] = useState(config);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  return (
    <section className="card-editor">
      <label>
        游戏背景
        <select
          value={draft.background}
          onChange={(event) =>
            setDraft({ ...draft, background: event.target.value as GameConfig["background"] })
          }
        >
          <option value="ember-grid">Ember Grid</option>
          <option value="neon-rift">Neon Rift</option>
          <option value="toxic-wave">Toxic Wave</option>
          <option value="star-forge">Star Forge</option>
        </select>
      </label>
      <label>
        Shader
        <select
          value={draft.shader}
          onChange={(event) =>
            setDraft({ ...draft, shader: event.target.value as GameConfig["shader"] })
          }
        >
          <option value="ember-grid">Ember Grid</option>
          <option value="neon-rift">Neon Rift</option>
          <option value="toxic-wave">Toxic Wave</option>
          <option value="star-forge">Star Forge</option>
        </select>
      </label>
      <label>
        游戏音乐 URL
        <input
          value={draft.music}
          onChange={(event) => setDraft({ ...draft, music: event.target.value })}
        />
      </label>
      <label>
        混合怪物概率：{draft.mixedMonsterChance}%
        <input
          max="100"
          min="0"
          type="range"
          value={draft.mixedMonsterChance}
          onChange={(event) =>
            setDraft({ ...draft, mixedMonsterChance: Number(event.target.value) })
          }
        />
      </label>
      <label className="check-row">
        <input
          checked={draft.mixedMonsterEnabled}
          type="checkbox"
          onChange={(event) => setDraft({ ...draft, mixedMonsterEnabled: event.target.checked })}
        />
        开启混合怪物
      </label>
      <label>
        插件 API 示例
        <textarea
          value={draft.pluginApi}
          onChange={(event) => setDraft({ ...draft, pluginApi: event.target.value })}
        />
      </label>
      <button type="button" onClick={() => onSave(draft)}>
        保存游戏配置
      </button>
    </section>
  );
}

function MonsterSettings({
  editingMonster,
  monsters,
  onCreate,
  onDelete,
  onEdit,
  onSave,
}: {
  editingMonster: MonsterTemplate | null;
  monsters: MonsterTemplate[];
  onCreate: () => void;
  onDelete: (templateId: number) => void;
  onEdit: (template: MonsterTemplate) => void;
  onSave: (template: MonsterTemplate) => void;
}) {
  return (
    <div className="settings-layout">
      <section className="settings-list">
        <button type="button" onClick={onCreate}>
          新建怪物模板
        </button>
        <div className="settings-card-list">
          {monsters.map((monster) => (
            <button
              className={`settings-row ${editingMonster?.id === monster.id ? "selected" : ""}`}
              key={monster.id}
              type="button"
              onClick={() => onEdit(monster)}
            >
              <span>{monster.name}</span>
              <b>{monster.stance}</b>
            </button>
          ))}
        </div>
      </section>
      <MonsterEditor monster={editingMonster} onDelete={onDelete} onSave={onSave} />
    </div>
  );
}

function MonsterEditor({
  monster,
  onDelete,
  onSave,
}: {
  monster: MonsterTemplate | null;
  onDelete: (templateId: number) => void;
  onSave: (template: MonsterTemplate) => void;
}) {
  const [draft, setDraft] = useState(monster);

  useEffect(() => {
    setDraft(monster);
  }, [monster]);

  if (!draft) {
    return (
      <section className="card-editor empty-editor">
        <p>选择一个怪物模板。</p>
      </section>
    );
  }

  const updatePart = (
    key: keyof Pick<
      MonsterTemplate,
      "head" | "body" | "leftHand" | "rightHand" | "leftLeg" | "rightLeg"
    >,
    part: MonsterPart,
  ) => {
    setDraft((snapshot) => (snapshot ? { ...snapshot, [key]: part } : snapshot));
  };

  return (
    <section className="card-editor">
      <MonsterVisual isBoss={false} visual={{ ...draft, templateId: draft.id, mixed: false }} />
      <label>
        ID
        <input
          type="number"
          value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: Number(event.target.value) })}
        />
      </label>
      <label>
        名称
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label>
        姿态
        <select
          value={draft.stance}
          onChange={(event) =>
            setDraft({ ...draft, stance: event.target.value as MonsterTemplate["stance"] })
          }
        >
          <option value="站立">站立</option>
          <option value="四肢模式">四肢模式</option>
          <option value="爬行">爬行</option>
        </select>
      </label>
      {(["head", "body", "leftHand", "rightHand", "leftLeg", "rightLeg"] as const).map((key) => (
        <PartEditor
          key={key}
          label={key}
          part={draft[key]}
          onChange={(part) => updatePart(key, part)}
        />
      ))}
      <label>
        挂物音频 URL
        <input
          value={draft.hitAudio}
          onChange={(event) => setDraft({ ...draft, hitAudio: event.target.value })}
        />
      </label>
      <label>
        怪物背景音乐 URL
        <input
          value={draft.backgroundMusic}
          onChange={(event) => setDraft({ ...draft, backgroundMusic: event.target.value })}
        />
      </label>
      <div className="editor-actions">
        <button type="button" onClick={() => onSave(draft)}>
          保存怪物模板
        </button>
        <button className="secondary danger" type="button" onClick={() => onDelete(draft.id)}>
          删除
        </button>
      </div>
    </section>
  );
}

function PartEditor({
  label,
  onChange,
  part,
}: {
  label: string;
  onChange: (part: MonsterPart) => void;
  part: MonsterPart;
}) {
  return (
    <label>
      {label}
      <select
        value={part.kind}
        onChange={(event) => onChange({ ...part, kind: event.target.value as MonsterPart["kind"] })}
      >
        <option value="svg">SVG/文本</option>
        <option value="png">PNG URL</option>
      </select>
      <input
        value={part.value}
        onChange={(event) => onChange({ ...part, value: event.target.value })}
      />
    </label>
  );
}

function ModSettings({
  onExport,
  onImport,
  pluginApi,
}: {
  onExport: () => void;
  onImport: (file: File) => void;
  pluginApi: string;
}) {
  return (
    <section className="card-editor">
      <p>Mod 包包含卡牌、游戏配置、怪物模板和插件 API 文本。</p>
      <div className="editor-actions">
        <button type="button" onClick={onExport}>
          导出 Mod JSON
        </button>
        <label className="file-button">
          导入 Mod JSON
          <input
            accept="application/json"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <label>
        插件 API
        <textarea readOnly value={pluginApi} />
      </label>
    </section>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <section className="help-layer">
      <article className="help-box">
        <div className="section-title">
          <div>
            <p className="eyebrow">Help</p>
            <h2>规则</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="help-doc">
          <p>主页设置卡牌配置；进入游戏后会绑定创建时的卡牌快照。</p>
          <p>每张卡在当前循环中只能使用一次，用后会从底部手牌消失。</p>
          <p>
            击败怪物会掉落 3 张卡牌，只能选择 1 张。每 10 关为 Boss，胜利后可以选择卡牌或生命 +1。
          </p>
          <p>最多携带 30 张卡。怪物每次持有 2 张技能卡，用完后重新抽取。</p>
        </div>
      </article>
    </section>
  );
}

function MonsterVisual({ isBoss, visual }: { isBoss: boolean; visual: GeneratedMonster }) {
  const className = `monster-build stance-${visual.stance} ${isBoss ? "boss-build" : ""}`;
  return (
    <div className={className} title={visual.mixed ? "混合怪物" : visual.name}>
      <span className="monster-part monster-part-head">{renderMonsterPart(visual.head)}</span>
      <span className="monster-part monster-part-body">{renderMonsterPart(visual.body)}</span>
      <span className="monster-part monster-part-left-hand">
        {renderMonsterPart(visual.leftHand)}
      </span>
      <span className="monster-part monster-part-right-hand">
        {renderMonsterPart(visual.rightHand)}
      </span>
      <span className="monster-part monster-part-left-leg">
        {renderMonsterPart(visual.leftLeg)}
      </span>
      <span className="monster-part monster-part-right-leg">
        {renderMonsterPart(visual.rightLeg)}
      </span>
    </div>
  );
}

function renderMonsterPart(part: MonsterPart) {
  if (part.kind === "png" && part.value) {
    return <img src={part.value} alt="" />;
  }
  return part.value || "?";
}

function percent(current: number, max: number) {
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}

async function animatePlayedCard(source: HTMLElement, card: Card) {
  const monster = document.querySelector<HTMLElement>(".monster");
  if (!monster) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = monster.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add("card-projectile", `card-${card.type}`);
  clone.style.setProperty("--from-x", `${sourceRect.left}px`);
  clone.style.setProperty("--from-y", `${sourceRect.top}px`);
  const toX = targetRect.left + targetRect.width * 0.5 - sourceRect.width * 0.5;
  const toY = targetRect.top + targetRect.height * 0.45 - sourceRect.height * 0.5;
  clone.style.setProperty("--to-x", `${toX}px`);
  clone.style.setProperty("--to-y", `${toY}px`);
  clone.style.setProperty("--mid-x", `${(sourceRect.left + toX) / 2}px`);
  clone.style.setProperty("--mid-y", `${(sourceRect.top + toY) / 2 - 150}px`);
  clone.style.width = `${sourceRect.width}px`;
  clone.style.height = `${sourceRect.height}px`;
  document.body.append(clone);

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 560);
  });

  clone.remove();
  monster.classList.add("monster-impact");
  window.setTimeout(() => monster.classList.remove("monster-impact"), 220);
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
