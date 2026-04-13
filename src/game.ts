export type CardType = "strike" | "guard" | "bleed" | "focus" | "break" | "heal";
export type Rarity = "普通" | "稀有" | "史诗" | "传说";
export type DropTarget = "deck" | "bag";

export type Card = {
  id: number;
  name: string;
  type: CardType;
  power: number;
  cost: number;
  rarity: Rarity;
  text: string;
  image: string;
};

export type Fighter = {
  hp: number;
  maxHp: number;
  block: number;
  bleed: number;
  focus: number;
  level: number;
};

export type GameState = {
  started: boolean;
  stage: number;
  turn: number;
  energy: number;
  maxEnergy: number;
  deckIds: number[];
  collectionIds: number[];
  usedCardIds: number[];
  rewardIds: number[];
  player: Fighter;
  monster: Fighter;
  monsterCardIds: number[];
  monsterCardIndex: number;
  log: string[];
  awaitingReward: boolean;
};

export const names = {
  strike: ["裂刃", "霜击", "贯星", "短弩", "回旋斩", "伏击", "赤潮", "碎牙"],
  guard: ["铁幕", "偏转", "壁垒", "护心", "堡垒", "鳞甲", "阵列", "稳固"],
  bleed: ["毒针", "暗创", "腐蚀", "撕裂", "血契", "蛇吻", "锈痕", "钩爪"],
  focus: ["凝神", "过载", "战鼓", "校准", "燃点", "洞察", "升温", "鹰眼"],
  break: ["破甲", "震荡", "压制", "断筋", "重锤", "裂隙", "剥离", "穿刺"],
  heal: ["急救", "回春", "汲取", "复苏", "清创", "活性", "脉冲", "晨露"],
} satisfies Record<CardType, string[]>;

export const typeOrder: CardType[] = ["strike", "guard", "bleed", "focus", "break", "heal"];
export const rarityOrder: Rarity[] = ["普通", "稀有", "史诗", "传说"];

export const defaultCardPool = Array.from({ length: 1000 }, (_, index) => createCard(index + 1));

export function createCard(id: number): Card {
  const type = typeOrder[id % typeOrder.length];
  const rarityRoll = (id * 37) % 100;
  const rarity =
    rarityRoll > 94 ? "传说" : rarityRoll > 78 ? "史诗" : rarityRoll > 48 ? "稀有" : "普通";
  const rarityBoost = rarityOrder.indexOf(rarity) + 1;
  const power = 6 + (id % 11) + rarityBoost * 3 + Math.floor(id / 125);
  const cost = 1 + (id % 3 === 0 ? 1 : 0) + (rarity === "传说" ? 1 : 0);
  const nameRoot = names[type][id % names[type].length];

  return {
    id,
    name: `${nameRoot}-${String(id).padStart(4, "0")}`,
    type,
    power,
    cost,
    rarity,
    text: getCardText(type, power),
    image: "",
  };
}

export function getCardText(type: CardType, power: number) {
  switch (type) {
    case "strike":
      return `造成 ${power} 点伤害。`;
    case "guard":
      return `获得 ${power + 4} 点护盾。`;
    case "bleed":
      return `造成 ${Math.ceil(power * 0.55)} 点伤害，附加 ${Math.ceil(power / 7)} 层流血。`;
    case "focus":
      return `获得 ${Math.ceil(power / 8)} 点专注，下张攻击更痛。`;
    case "break":
      return `造成 ${Math.ceil(power * 0.75)} 点伤害并削弱护盾。`;
    case "heal":
      return `恢复生命；怪物使用时恢复 ${Math.ceil(power * 0.8)} 点。`;
  }
}

export function normalizeCard(card: Card): Card {
  return {
    id: Number(card.id),
    name: card.name.trim() || `卡牌-${card.id}`,
    type: typeOrder.includes(card.type) ? card.type : "strike",
    power: Math.max(0, Math.round(Number(card.power) || 0)),
    cost: Math.max(0, Math.round(Number(card.cost) || 0)),
    rarity: rarityOrder.includes(card.rarity) ? card.rarity : "普通",
    text: card.text.trim(),
    image: card.image.trim(),
  };
}

export function createCardMap(cards: Card[]) {
  return new Map(cards.map((card) => [card.id, card]));
}

export function labelType(type: CardType) {
  const labels: Record<CardType, string> = {
    strike: "攻击",
    guard: "护盾",
    bleed: "流血",
    focus: "专注",
    break: "破防",
    heal: "治疗",
  };
  return labels[type];
}

export function filterCards(cards: Card[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return cards;
  return cards.filter((card) =>
    [card.name, card.rarity, card.type, card.text, String(card.id)].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
}

export function createMonster(stage: number): Fighter {
  const isBoss = stage % 10 === 0;
  const maxHp = Math.round((isBoss ? 125 : 58) + stage * (isBoss ? 18 : 8));
  return {
    hp: maxHp,
    maxHp,
    block: 0,
    bleed: 0,
    focus: Math.floor(stage / 8),
    level: stage,
  };
}

export function drawUniqueIds(cards: Card[], count: number, avoid: number[] = []) {
  const picked: number[] = [];
  const blocked = new Set(avoid);

  while (picked.length < count && picked.length + blocked.size < cards.length) {
    const card = cards[Math.floor(Math.random() * cards.length)];
    if (!blocked.has(card.id)) {
      picked.push(card.id);
      blocked.add(card.id);
    }
  }

  return picked;
}

export function createGameState(cards: Card[]): GameState {
  const deckIds = drawUniqueIds(cards, 10);
  return {
    started: true,
    stage: 1,
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    deckIds,
    collectionIds: [...deckIds],
    usedCardIds: [],
    rewardIds: [],
    player: { hp: 5, maxHp: 5, block: 0, bleed: 0, focus: 0, level: 1 },
    monster: createMonster(1),
    monsterCardIds: drawUniqueIds(cards, 2),
    monsterCardIndex: 0,
    log: ["新游戏开始。"],
    awaitingReward: false,
  };
}

export function createEmptyGameState(): GameState {
  return {
    started: false,
    stage: 1,
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    deckIds: [],
    collectionIds: [],
    usedCardIds: [],
    rewardIds: [],
    player: { hp: 5, maxHp: 5, block: 0, bleed: 0, focus: 0, level: 1 },
    monster: createMonster(1),
    monsterCardIds: [],
    monsterCardIndex: 0,
    log: ["卡牌数据库初始化中。"],
    awaitingReward: false,
  };
}

export function playCard(snapshot: GameState, cardId: number, cards: Card[]): GameState {
  const cardMap = createCardMap(cards);
  const card = cardMap.get(cardId);
  if (!card || card.cost > snapshot.energy || snapshot.usedCardIds.includes(card.id)) {
    return snapshot;
  }

  let next: GameState = {
    ...snapshot,
    energy: snapshot.energy - card.cost,
    usedCardIds: [...snapshot.usedCardIds, card.id],
  };
  next = applyCard(next, card, "player");
  next = { ...next, log: [`你使用 ${card.name}。${card.text}`, ...next.log] };

  if (next.monster.hp <= 0) {
    next = recycleCardsIfEmpty(next);
    if (next.player.hp <= 0) return next;
    return completeStage(next, cards);
  }

  next = monsterAct(next, cards);
  next = {
    ...next,
    turn: next.turn + 1,
    energy: next.maxEnergy,
    player: { ...next.player, block: Math.max(0, Math.floor(next.player.block * 0.45)) },
  };
  return recycleCardsIfEmpty(next);
}

export function addCardToDeck(
  snapshot: GameState,
  cardId: number,
  cardMap: Map<number, Card>,
): GameState {
  const card = cardMap.get(cardId);
  if (!card) return snapshot;
  const collectionIds = snapshot.collectionIds.includes(cardId)
    ? snapshot.collectionIds
    : [...snapshot.collectionIds, cardId];

  if (snapshot.deckIds.length < 30) {
    return {
      ...snapshot,
      collectionIds,
      deckIds: [...snapshot.deckIds, cardId],
      log: [`获得 ${card.name}。当前携带 ${snapshot.deckIds.length + 1}/30。`, ...snapshot.log],
    };
  }

  return {
    ...snapshot,
    collectionIds,
    player: { ...snapshot.player, hp: Math.min(snapshot.player.maxHp, snapshot.player.hp + 1) },
    log: [`牌组已满 30 张，${card.name} 转化为生命恢复。`, ...snapshot.log],
  };
}

export function proceedToNextStage(snapshot: GameState, cards: Card[]): GameState {
  const stage = snapshot.stage + 1;
  return {
    ...snapshot,
    stage,
    turn: snapshot.turn + 1,
    energy: snapshot.maxEnergy,
    player: {
      ...snapshot.player,
      block: 0,
      level: Math.max(snapshot.player.level, Math.ceil(stage / 3)),
    },
    monster: createMonster(stage),
    monsterCardIds: drawUniqueIds(cards, 2),
    monsterCardIndex: 0,
    rewardIds: [],
    awaitingReward: false,
    log: [
      `第 ${stage} 关出现。${stage % 10 === 0 ? "Boss 正在等待。" : "怪物加入战斗。"}`,
      ...snapshot.log,
    ],
  };
}

export function chooseBossHealth(snapshot: GameState, cards: Card[]): GameState {
  if (!snapshot.awaitingReward || snapshot.stage % 10 !== 0) return snapshot;
  return proceedToNextStage(
    {
      ...snapshot,
      player: {
        ...snapshot.player,
        maxHp: snapshot.player.maxHp + 1,
        hp: snapshot.player.maxHp + 1,
      },
      log: [
        `Boss 奖励选择生命上限。当前生命 ${snapshot.player.maxHp + 1}/${snapshot.player.maxHp + 1}。`,
        ...snapshot.log,
      ],
    },
    cards,
  );
}

export function moveCardInState(
  snapshot: GameState,
  cardId: number,
  target: DropTarget,
  targetIndex: number,
  cardMap: Map<number, Card>,
): GameState {
  const card = cardMap.get(cardId);
  if (!card) return snapshot;
  const currentIndex = snapshot.deckIds.indexOf(cardId);

  if (target === "bag") {
    if (currentIndex === -1) return snapshot;
    return {
      ...snapshot,
      deckIds: snapshot.deckIds.filter((id) => id !== cardId),
      usedCardIds: snapshot.usedCardIds.filter((id) => id !== cardId),
      log: [`${card.name} 已移回背包。`, ...snapshot.log],
    };
  }

  if (currentIndex !== -1) {
    const deckIds = [...snapshot.deckIds];
    const [moving] = deckIds.splice(currentIndex, 1);
    const adjustedIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    deckIds.splice(Math.max(0, Math.min(adjustedIndex, deckIds.length)), 0, moving);
    return { ...snapshot, deckIds, log: [`${card.name} 已调整顺序。`, ...snapshot.log] };
  }

  if (snapshot.deckIds.length >= 30) {
    return { ...snapshot, log: ["牌组已满 30 张。", ...snapshot.log] };
  }

  const deckIds = [...snapshot.deckIds];
  deckIds.splice(Math.max(0, Math.min(targetIndex, deckIds.length)), 0, cardId);
  return { ...snapshot, deckIds, log: [`${card.name} 已加入牌组。`, ...snapshot.log] };
}

function applyCard(snapshot: GameState, card: Card, caster: "player" | "monster"): GameState {
  const source = caster === "player" ? snapshot.player : snapshot.monster;
  const target = caster === "player" ? snapshot.monster : snapshot.player;
  let nextSource = { ...source };
  let nextTarget = { ...target };
  const focusBonus = nextSource.focus * 3;

  switch (card.type) {
    case "strike":
      nextTarget = dealDamage(nextTarget, card.power + focusBonus, caster === "monster");
      nextSource.focus = Math.max(0, nextSource.focus - 1);
      break;
    case "guard":
      nextSource.block += card.power + 4;
      break;
    case "bleed":
      nextTarget = dealDamage(
        nextTarget,
        Math.ceil(card.power * 0.55) + focusBonus,
        caster === "monster",
      );
      nextTarget.bleed += Math.ceil(card.power / 7);
      nextSource.focus = Math.max(0, nextSource.focus - 1);
      break;
    case "focus":
      nextSource.focus += Math.ceil(card.power / 8);
      break;
    case "break":
      nextTarget.block = Math.max(0, nextTarget.block - Math.ceil(card.power * 0.9));
      nextTarget = dealDamage(
        nextTarget,
        Math.ceil(card.power * 0.75) + focusBonus,
        caster === "monster",
      );
      nextSource.focus = Math.max(0, nextSource.focus - 1);
      break;
    case "heal":
      nextSource.hp = Math.min(
        nextSource.maxHp,
        caster === "player" ? nextSource.hp + 1 : nextSource.hp + Math.ceil(card.power * 0.8),
      );
      break;
  }

  let nextLog = snapshot.log;
  if (nextTarget.bleed > 0) {
    const bleedDamage = caster === "monster" ? 1 : Math.min(nextTarget.hp, nextTarget.bleed);
    nextTarget.hp = Math.max(0, nextTarget.hp - bleedDamage);
    nextTarget.bleed = Math.max(0, nextTarget.bleed - 1);
    nextLog = [
      `${caster === "player" ? "你" : "怪物"}触发流血，追加 ${bleedDamage} 点伤害。`,
      ...nextLog,
    ];
  }

  return caster === "player"
    ? { ...snapshot, log: nextLog, monster: nextTarget, player: nextSource }
    : { ...snapshot, log: nextLog, monster: nextSource, player: nextTarget };
}

function dealDamage(target: Fighter, amount: number, targetIsPlayer: boolean): Fighter {
  const blocked = Math.min(target.block, amount);
  const rawDamage = amount - blocked;
  if (targetIsPlayer) {
    return {
      ...target,
      block: target.block - blocked,
      hp: Math.max(0, target.hp - (rawDamage > 0 ? 1 : 0)),
    };
  }
  return { ...target, block: target.block - blocked, hp: Math.max(0, target.hp - rawDamage) };
}

function monsterAct(snapshot: GameState, cards: Card[]): GameState {
  const cardMap = createCardMap(cards);
  const card = cardMap.get(snapshot.monsterCardIds[snapshot.monsterCardIndex]);
  if (!card) return snapshot;
  let next = applyCard(snapshot, card, "monster");
  let monsterCardIds = next.monsterCardIds;
  let monsterCardIndex = next.monsterCardIndex + 1;
  let nextLog = [`怪物使用 ${card.name}。${card.text}`, ...next.log];

  if (monsterCardIndex >= monsterCardIds.length) {
    monsterCardIds = drawUniqueIds(cards, 2);
    monsterCardIndex = 0;
    nextLog = ["怪物重新抽取了 2 张技能卡。", ...nextLog];
  }

  if (next.player.hp <= 0) {
    nextLog = [`挑战结束。最终抵达第 ${next.stage} 关，坚持 ${next.turn} 回合。`, ...nextLog];
  }

  return { ...next, log: nextLog, monsterCardIndex, monsterCardIds };
}

function completeStage(snapshot: GameState, cards: Card[]): GameState {
  return {
    ...snapshot,
    awaitingReward: true,
    rewardIds: drawUniqueIds(cards, 3, snapshot.collectionIds),
    log: [`第 ${snapshot.stage} 关清除。选择 1 张奖励卡继续。`, ...snapshot.log],
  };
}

function recycleCardsIfEmpty(snapshot: GameState): GameState {
  if (snapshot.deckIds.length === 0 || snapshot.usedCardIds.length < snapshot.deckIds.length) {
    return snapshot;
  }

  const player = { ...snapshot.player, hp: Math.max(0, snapshot.player.hp - 1) };
  const log = [
    `卡牌全部用完，扣除 1 点生命并重置可用卡。当前生命 ${player.hp}/${player.maxHp}。`,
    ...snapshot.log,
  ];

  return {
    ...snapshot,
    player,
    usedCardIds: [],
    log:
      player.hp <= 0
        ? [`挑战结束。最终抵达第 ${snapshot.stage} 关，坚持 ${snapshot.turn} 回合。`, ...log]
        : log,
  };
}
