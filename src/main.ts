import "./style.css";

type CardType = "strike" | "guard" | "bleed" | "focus" | "break" | "heal";

type Card = {
  id: number;
  name: string;
  type: CardType;
  power: number;
  cost: number;
  rarity: "普通" | "稀有" | "史诗" | "传说";
  text: string;
};

type Fighter = {
  hp: number;
  maxHp: number;
  block: number;
  bleed: number;
  focus: number;
  level: number;
};

type GameState = {
  started: boolean;
  stage: number;
  turn: number;
  energy: number;
  maxEnergy: number;
  deck: Card[];
  collection: Card[];
  usedCardIds: number[];
  rewards: Card[];
  player: Fighter;
  monster: Fighter;
  monsterCards: Card[];
  monsterCardIndex: number;
  log: string[];
  awaitingReward: boolean;
};

const names = {
  strike: ["裂刃", "霜击", "贯星", "短弩", "回旋斩", "伏击", "赤潮", "碎牙"],
  guard: ["铁幕", "偏转", "壁垒", "护心", "堡垒", "鳞甲", "阵列", "稳固"],
  bleed: ["毒针", "暗创", "腐蚀", "撕裂", "血契", "蛇吻", "锈痕", "钩爪"],
  focus: ["凝神", "过载", "战鼓", "校准", "燃点", "洞察", "升温", "鹰眼"],
  break: ["破甲", "震荡", "压制", "断筋", "重锤", "裂隙", "剥离", "穿刺"],
  heal: ["急救", "回春", "汲取", "复苏", "清创", "活性", "脉冲", "晨露"],
} satisfies Record<CardType, string[]>;

const typeOrder: CardType[] = ["strike", "guard", "bleed", "focus", "break", "heal"];
const rarityOrder: Card["rarity"][] = ["普通", "稀有", "史诗", "传说"];

const cardPool = Array.from({ length: 1000 }, (_, index) => createCard(index + 1));

let state: GameState = createInitialState();
let helpOpen = false;
let logOpen = false;
let backpackOpen = false;
let actionLocked = false;
let draggedCardId: number | null = null;

function createCard(id: number): Card {
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
  };
}

function getCardText(type: CardType, power: number) {
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

function createInitialState(): GameState {
  const deck = drawUniqueCards(10);
  const monster = createMonster(1);

  return {
    started: false,
    stage: 1,
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    deck,
    collection: [...deck],
    usedCardIds: [],
    rewards: [],
    player: { hp: 5, maxHp: 5, block: 0, bleed: 0, focus: 0, level: 1 },
    monster,
    monsterCards: drawUniqueCards(2),
    monsterCardIndex: 0,
    log: ["系统已装入 1000 张技能卡。创建新游戏后会抽取 10 张起始卡。"],
    awaitingReward: false,
  };
}

function drawUniqueCards(count: number, avoid: number[] = []) {
  const picked: Card[] = [];
  const blocked = new Set(avoid);

  while (picked.length < count) {
    const card = cardPool[Math.floor(Math.random() * cardPool.length)];
    if (!blocked.has(card.id)) {
      picked.push(card);
      blocked.add(card.id);
    }
  }

  return picked;
}

function createMonster(stage: number): Fighter {
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

function startGame() {
  state = createInitialState();
  state.started = true;
  helpOpen = false;
  logOpen = false;
  backpackOpen = false;
  state.log = ["新游戏开始。"];
  render();
}

async function useCard(cardId: number, source: HTMLElement) {
  if (actionLocked || !state.started || state.awaitingReward || state.player.hp <= 0) return;
  const card = state.deck.find((item) => item.id === cardId);
  if (!card || card.cost > state.energy || state.usedCardIds.includes(card.id)) return;

  actionLocked = true;
  source.classList.add("launching");
  await animatePlayedCard(source, card);

  state.energy -= card.cost;
  state.usedCardIds.push(card.id);
  applyCard(card, state.player, state.monster, "你");
  state.log.unshift(`你使用 ${card.name}。${card.text}`);

  if (state.monster.hp <= 0) {
    recycleCardsIfEmpty();
    if (state.player.hp <= 0) {
      render();
      actionLocked = false;
      return;
    }
    completeStage();
    render();
    actionLocked = false;
    return;
  }

  monsterAct();
  state.turn += 1;
  state.energy = state.maxEnergy;
  state.player.block = Math.max(0, Math.floor(state.player.block * 0.45));
  recycleCardsIfEmpty();
  render();
  actionLocked = false;
}

function applyCard(card: Card, caster: Fighter, target: Fighter, actor: string) {
  const focusBonus = caster.focus * 3;
  switch (card.type) {
    case "strike":
      dealDamage(target, card.power + focusBonus);
      caster.focus = Math.max(0, caster.focus - 1);
      break;
    case "guard":
      caster.block += card.power + 4;
      break;
    case "bleed":
      dealDamage(target, Math.ceil(card.power * 0.55) + focusBonus);
      target.bleed += Math.ceil(card.power / 7);
      caster.focus = Math.max(0, caster.focus - 1);
      break;
    case "focus":
      caster.focus += Math.ceil(card.power / 8);
      break;
    case "break":
      target.block = Math.max(0, target.block - Math.ceil(card.power * 0.9));
      dealDamage(target, Math.ceil(card.power * 0.75) + focusBonus);
      caster.focus = Math.max(0, caster.focus - 1);
      break;
    case "heal":
      caster.hp = Math.min(
        caster.maxHp,
        caster === state.player ? caster.hp + 1 : caster.hp + Math.ceil(card.power * 0.8),
      );
      break;
  }

  if (target.bleed > 0) {
    const bleedDamage = target === state.player ? 1 : Math.min(target.hp, target.bleed);
    target.hp = Math.max(0, target.hp - bleedDamage);
    target.bleed = Math.max(0, target.bleed - 1);
    state.log.unshift(`${actor}触发流血，追加 ${bleedDamage} 点伤害。`);
  }
}

function dealDamage(target: Fighter, amount: number) {
  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  const rawDamage = amount - blocked;
  if (target === state.player) {
    target.hp = Math.max(0, target.hp - (rawDamage > 0 ? 1 : 0));
    return;
  }
  target.hp = Math.max(0, target.hp - rawDamage);
}

function monsterAct() {
  const card = state.monsterCards[state.monsterCardIndex];
  applyCard(card, state.monster, state.player, "怪物");
  state.log.unshift(`怪物使用 ${card.name}。${card.text}`);
  state.monsterCardIndex += 1;

  if (state.monsterCardIndex >= state.monsterCards.length) {
    state.monsterCards = drawUniqueCards(2);
    state.monsterCardIndex = 0;
    state.log.unshift("怪物重新抽取了 2 张技能卡。");
  }

  if (state.player.hp <= 0) {
    state.log.unshift(`挑战结束。最终抵达第 ${state.stage} 关，坚持 ${state.turn} 回合。`);
  }
}

function completeStage() {
  state.awaitingReward = true;
  state.rewards = drawUniqueCards(
    3,
    state.collection.map((card) => card.id),
  );
  state.log.unshift(`第 ${state.stage} 关清除。选择 1 张奖励卡继续。`);
}

function chooseReward(cardId: number) {
  const card = state.rewards.find((item) => item.id === cardId);
  if (!card) return;

  addCardToDeck(card);

  proceedToNextStage();
  render();
}

function chooseBossHealth() {
  if (!state.awaitingReward || state.stage % 10 !== 0) return;
  state.player.maxHp += 1;
  state.player.hp = state.player.maxHp;
  state.log.unshift(`Boss 奖励选择生命上限。当前生命 ${state.player.hp}/${state.player.maxHp}。`);
  proceedToNextStage();
  render();
}

function skipReward() {
  if (!state.awaitingReward) return;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
  state.log.unshift("放弃奖励，恢复 1 点生命。");
  proceedToNextStage();
  render();
}

function addCardToDeck(card: Card) {
  if (!state.collection.some((item) => item.id === card.id)) {
    state.collection.push(card);
  }

  if (state.deck.length < 30) {
    state.deck.push(card);
    state.log.unshift(`获得 ${card.name}。当前携带 ${state.deck.length}/30。`);
  } else {
    state.log.unshift(`牌组已满 30 张，${card.name} 转化为生命恢复。`);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
  }
}

function proceedToNextStage() {
  state.stage += 1;
  state.turn += 1;
  state.energy = state.maxEnergy;
  state.player.level = Math.max(state.player.level, Math.ceil(state.stage / 3));
  state.player.block = 0;
  state.monster = createMonster(state.stage);
  state.monsterCards = drawUniqueCards(2);
  state.monsterCardIndex = 0;
  state.rewards = [];
  state.awaitingReward = false;
  state.log.unshift(
    `第 ${state.stage} 关出现。${state.stage % 10 === 0 ? "Boss 正在等待。" : "怪物加入战斗。"}`,
  );
}

function recycleCardsIfEmpty() {
  if (state.deck.length === 0 || state.usedCardIds.length < state.deck.length) return;
  state.player.hp = Math.max(0, state.player.hp - 1);
  state.usedCardIds = [];
  state.log.unshift(
    `卡牌全部用完，扣除 1 点生命并重置可用卡。当前生命 ${state.player.hp}/${state.player.maxHp}。`,
  );

  if (state.player.hp <= 0) {
    state.log.unshift(`挑战结束。最终抵达第 ${state.stage} 关，坚持 ${state.turn} 回合。`);
  }
}

function percent(current: number, max: number) {
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}

function cardClass(card: Card) {
  return `card card-${card.type} rarity-${card.rarity}`;
}

function renderCard(
  card: Card,
  action: string,
  disabled = false,
  index = 0,
  total = 1,
  extraAttributes = "",
) {
  const spread = total <= 1 ? 0 : index - (total - 1) / 2;
  const style =
    action === "play-card"
      ? `style="--spread: ${spread}; --fan-y: ${Math.abs(spread) * 8}px;"`
      : `style="--drop-index: ${index};"`;
  return `
    <button class="${cardClass(card)}" data-action="${action}" data-card-id="${card.id}" ${style} ${extraAttributes} ${disabled ? "disabled" : ""}>
      <span class="card-top"><strong>${card.name}</strong><em>${card.cost}</em></span>
      <span class="card-type">${labelType(card.type)} / ${card.rarity}</span>
      <span class="card-text">${card.text}</span>
      <span class="card-power">强度 ${card.power}</span>
    </button>
  `;
}

function labelType(type: CardType) {
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

function render() {
  const isBoss = state.stage % 10 === 0;
  const monsterName = isBoss ? `第 ${state.stage} 关 Boss` : `第 ${state.stage} 关怪物`;
  const usedCount = state.usedCardIds.length;
  const visibleCards = state.deck.filter((card) => !state.usedCardIds.includes(card.id));
  const handCards = visibleCards.slice(0, 6);

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main class="game-shell">
      <section class="topbar ${state.started ? "topbar-compact" : ""}">
        ${
          state.started
            ? ""
            : `<div>
                <p class="eyebrow">无尽卡牌闯关</p>
                <h1>千技牌阵</h1>
              </div>`
        }
        <div class="metrics">
          <span>关卡 <b>${state.stage}</b></span>
          <span>回合 <b>${state.turn}</b></span>
          <span>卡池 <b>${cardPool.length}</b></span>
          <span>携带 <b>${state.deck.length}/30</b></span>
          <span>生命 <b>${state.player.hp}/${state.player.maxHp}</b></span>
          <span>已用 <b>${usedCount}/${state.deck.length}</b></span>
        </div>
        <div class="top-actions">
          ${state.started ? `<button class="help-button" data-action="restart">重新开始</button>` : ""}
          ${state.started ? `<button class="help-button" data-action="backpack">背包</button>` : ""}
          <button class="help-button" data-action="log">记录</button>
          <button class="help-button" data-action="help">Help</button>
        </div>
      </section>

      ${
        state.started
          ? `
          <section class="battlefield ${isBoss ? "boss-field" : ""}">
            <aside class="panel player-panel">
              <p class="eyebrow">玩家</p>
              <h2>牌手 Lv.${state.player.level}</h2>
              ${renderPlayerStats()}
              <div class="energy">${Array.from({ length: state.maxEnergy }, (_, i) => `<span class="${i < state.energy ? "filled" : ""}"></span>`).join("")}</div>
            </aside>

            <section class="monster-stage">
              <div class="monster-aura"></div>
              <div class="monster" aria-label="${monsterName}">
                ${monsterSvg(isBoss)}
              </div>
              <div class="monster-info">
                <p class="eyebrow">${isBoss ? "Boss" : "Monster"} Lv.${state.monster.level}</p>
                <h2>${monsterName}</h2>
                ${renderStats(state.monster)}
              </div>
            </section>

            <aside class="panel intent-panel">
              <p class="eyebrow">怪物手牌</p>
              <h2>两张循环</h2>
              <div class="intent-cards">
                ${state.monsterCards
                  .map(
                    (card, index) => `
                  <div class="intent ${index === state.monsterCardIndex ? "next" : ""}">
                    <span>${card.name}</span>
                    <b>${labelType(card.type)}</b>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </aside>
          </section>

          <section class="hand">
            <div class="card-fan">
              ${handCards
                .map((card, index) =>
                  renderCard(
                    card,
                    "play-card",
                    state.awaitingReward || card.cost > state.energy || state.player.hp <= 0,
                    index,
                    handCards.length,
                  ),
                )
                .join("")}
            </div>
          </section>
        `
          : `
          <section class="start-screen">
            <div class="start-copy">
              <p class="eyebrow">1000 张系统技能卡已就绪</p>
              <h2>抽 10 张卡，开始无尽挑战。</h2>
              <button data-action="start">创建新游戏</button>
            </div>
            <div class="start-monster">${monsterSvg(false)}</div>
          </section>
        `
      }

      ${state.started ? renderActionHint() : ""}
      ${state.awaitingReward ? renderRewards() : ""}
      ${helpOpen ? renderHelp() : ""}
      ${logOpen ? renderLog() : ""}
      ${backpackOpen ? renderBackpack() : ""}
    </main>
  `;
}

function renderStats(fighter: Fighter) {
  return `
    <div class="hp-row">
      <span>${fighter.hp}/${fighter.maxHp}</span>
      <div class="hp-bar"><i style="width: ${percent(fighter.hp, fighter.maxHp)}"></i></div>
    </div>
    <div class="status-row">
      <span>护盾 ${fighter.block}</span>
      <span>流血 ${fighter.bleed}</span>
      <span>专注 ${fighter.focus}</span>
    </div>
  `;
}

function renderPlayerStats() {
  return `
    <div class="life-row" aria-label="玩家生命">
      ${Array.from(
        { length: state.player.maxHp },
        (_, index) => `<span class="${index < state.player.hp ? "alive" : ""}"></span>`,
      ).join("")}
    </div>
    <div class="status-row">
      <span>护盾 ${state.player.block}</span>
      <span>流血 ${state.player.bleed}</span>
      <span>专注 ${state.player.focus}</span>
    </div>
  `;
}

function renderRewards() {
  const isBossReward = state.stage % 10 === 0;
  return `
    <section class="reward-layer">
      <div class="reward-box">
        <div class="section-title">
          <div>
            <p class="eyebrow">${isBossReward ? "Boss 奖励" : "关卡奖励"}</p>
            <h2>${isBossReward ? "选择卡牌或生命" : "选择 1 张卡牌"}</h2>
          </div>
          ${isBossReward ? `<button data-action="boss-health">生命 +1</button>` : ""}
        </div>
        <div class="reward-grid">
          ${state.rewards.map((card, index) => renderCard(card, "choose-reward", false, index, state.rewards.length)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderActionHint() {
  const actionLogs = state.log.filter(
    (item) => item.startsWith("你使用") || item.startsWith("怪物使用"),
  );
  return `
    <section class="action-hint" aria-live="polite">
      ${actionLogs
        .slice(0, 2)
        .map((item) => `<p>${item}</p>`)
        .join("")}
    </section>
  `;
}

function renderLog() {
  return `
    <section class="log-layer">
      <article class="log-box">
        <div class="section-title">
          <div>
            <p class="eyebrow">Log</p>
            <h2>战斗记录</h2>
          </div>
          <button class="secondary" data-action="close-log">关闭</button>
        </div>
        <div class="log-list">
          ${state.log.map((item) => `<p>${item}</p>`).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderBackpack() {
  const availableDeck = state.deck.filter((card) => !state.usedCardIds.includes(card.id));
  const deckIds = new Set(state.deck.map((card) => card.id));
  const bagCards = state.collection.filter((card) => !deckIds.has(card.id));
  return `
    <section class="backpack-layer">
      <article class="backpack-box">
        <div class="section-title">
          <div>
            <p class="eyebrow">Backpack</p>
            <h2>卡牌背包</h2>
          </div>
          <button class="secondary" data-action="close-backpack">关闭</button>
        </div>
        <section class="pack-section">
          <div class="pack-heading">
            <p class="eyebrow">当前牌组</p>
            <span>${availableDeck.length}/${state.deck.length} 可用，最多 30 张</span>
          </div>
          <div class="pack-grid pack-dropzone" data-drop-zone="deck">
            ${state.deck
              .map((card, index) =>
                renderCard(
                  card,
                  "inspect-card",
                  false,
                  index,
                  state.deck.length,
                  `draggable="true" data-drag-card="${card.id}" data-drag-source="deck" data-drop-index="${index}" ${state.usedCardIds.includes(card.id) ? `data-used="true"` : ""}`,
                ),
              )
              .join("")}
          </div>
        </section>
        <section class="pack-section">
          <div class="pack-heading">
            <p class="eyebrow">背包库存</p>
            <span>${bagCards.length}/${state.collection.length} 张未放入牌组</span>
          </div>
          <div class="pack-grid pack-dropzone" data-drop-zone="bag">
            ${
              bagCards.length > 0
                ? bagCards
                    .map((card) =>
                      renderCard(
                        card,
                        "inspect-card",
                        false,
                        0,
                        1,
                        `draggable="true" data-drag-card="${card.id}" data-drag-source="bag"`,
                      ),
                    )
                    .join("")
                : `<p class="empty-pack">背包里没有闲置卡牌。</p>`
            }
          </div>
        </section>
      </article>
    </section>
  `;
}

function renderHelp() {
  return `
    <section class="help-layer">
      <article class="help-box">
        <div class="section-title">
          <div>
            <p class="eyebrow">Help</p>
            <h2>规则</h2>
          </div>
          <button class="secondary" data-action="close-help">关闭</button>
        </div>
        <div class="help-doc">
          <p>创建新游戏后获得 10 张卡牌。每张卡在当前循环中只能使用一次，用后会从底部手牌消失。</p>
          <p>所有卡牌用完时扣除 1 点生命，并刷新整组卡牌。初始生命为 5。</p>
          <p>击败怪物会掉落 3 张卡牌，只能选择 1 张。每 10 关为 Boss，胜利后可以选择卡牌或生命 +1。</p>
          <p>最多携带 30 张卡。怪物每次持有 2 张技能卡，用完后重新抽取。</p>
        </div>
      </article>
    </section>
  `;
}

function monsterSvg(isBoss: boolean) {
  return `
    <svg viewBox="0 0 220 210" role="img" aria-hidden="true">
      <path class="monster-shadow" d="M42 178c24 18 108 23 139 0 14-10 8-29-13-31-31-3-36 12-57 12-23 0-33-17-62-11-22 4-25 18-7 30Z" />
      <path class="horn" d="M60 62 27 22c31 1 50 12 57 34ZM158 57l35-35c-5 30-18 48-45 55Z" />
      <path class="body" d="M41 101c0-47 34-77 76-77 44 0 76 33 76 81 0 52-31 83-79 83-46 0-73-33-73-87Z" />
      <path class="belly" d="M75 119c9 37 65 42 81 2 7 41-11 61-43 61-31 0-48-22-38-63Z" />
      <circle class="eye" cx="84" cy="88" r="${isBoss ? 13 : 10}" />
      <circle class="eye" cx="143" cy="88" r="${isBoss ? 13 : 10}" />
      <path class="mouth" d="M82 128c18 19 49 19 66 0" />
      <path class="mark" d="M111 51 97 77h28Z" />
    </svg>
  `;
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionTarget = target.closest<HTMLElement>("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const cardId = Number(actionTarget.dataset.cardId);

  if (action === "start" || action === "restart") startGame();
  if (action === "help") {
    helpOpen = true;
    logOpen = false;
    backpackOpen = false;
    render();
  }
  if (action === "close-help") {
    helpOpen = false;
    render();
  }
  if (action === "log") {
    logOpen = true;
    helpOpen = false;
    backpackOpen = false;
    render();
  }
  if (action === "close-log") {
    logOpen = false;
    render();
  }
  if (action === "backpack") {
    backpackOpen = true;
    helpOpen = false;
    logOpen = false;
    render();
  }
  if (action === "close-backpack") {
    backpackOpen = false;
    render();
  }
  if (action === "play-card") void useCard(cardId, actionTarget);
  if (action === "choose-reward") chooseReward(cardId);
  if (action === "boss-health") chooseBossHealth();
  if (action === "skip-reward") skipReward();
});

document.addEventListener("dragstart", (event) => {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>("[data-drag-card]");
  if (!card) return;

  draggedCardId = Number(card.dataset.dragCard);
  card.classList.add("dragging");
  event.dataTransfer?.setData("text/plain", String(draggedCardId));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
});

document.addEventListener("dragend", (event) => {
  const target = event.target as HTMLElement;
  target.closest<HTMLElement>("[data-drag-card]")?.classList.remove("dragging");
  draggedCardId = null;
});

document.addEventListener("dragover", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("[data-drop-zone], [data-drop-index]")) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
});

document.addEventListener("drop", (event) => {
  const target = event.target as HTMLElement;
  const dropCard = target.closest<HTMLElement>("[data-drop-index]");
  const dropZone = target.closest<HTMLElement>("[data-drop-zone]");
  if (!dropCard && !dropZone) return;

  event.preventDefault();
  const cardId = draggedCardId ?? Number(event.dataTransfer?.getData("text/plain"));
  if (!cardId) return;

  const zone = dropCard ? "deck" : dropZone?.dataset.dropZone;
  const index = dropCard?.dataset.dropIndex
    ? Number(dropCard.dataset.dropIndex)
    : state.deck.length;
  moveCard(cardId, zone === "bag" ? "bag" : "deck", index);
  draggedCardId = null;
  render();
});

render();

function moveCard(cardId: number, target: "deck" | "bag", targetIndex: number) {
  const card = state.collection.find((item) => item.id === cardId);
  if (!card) return;

  const currentIndex = state.deck.findIndex((item) => item.id === cardId);

  if (target === "bag") {
    if (currentIndex === -1) return;
    state.deck.splice(currentIndex, 1);
    state.usedCardIds = state.usedCardIds.filter((id) => id !== cardId);
    state.log.unshift(`${card.name} 已移回背包。`);
    return;
  }

  if (currentIndex !== -1) {
    const [moving] = state.deck.splice(currentIndex, 1);
    const adjustedIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    state.deck.splice(Math.max(0, Math.min(adjustedIndex, state.deck.length)), 0, moving);
    state.log.unshift(`${card.name} 已调整顺序。`);
    return;
  }

  if (state.deck.length >= 30) {
    state.log.unshift("牌组已满 30 张。");
    return;
  }

  state.deck.splice(Math.max(0, Math.min(targetIndex, state.deck.length)), 0, card);
  state.log.unshift(`${card.name} 已加入牌组。`);
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
