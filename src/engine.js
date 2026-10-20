export const SPELLS = {
  fire: { name: "ファイアボール", cost: 10, cooldown: 0.8, damage: 15 },
  shield: { name: "マジックシールド", cost: 18, cooldown: 5, duration: 3 },
  thunder: { name: "サンダー", cost: 30, cooldown: 6, damage: 35 },
  wind: { name: "ウィンド", cost: 8, cooldown: 4, duration: 0.5 },
};

export const STAGES = [
  { name: "霧深き森", enemy: "森のモコ", boss: "くまのたいちょう", monster: "🦊", bossMonster: "🐻", icon: "🌲", theme: "forest", color: "#88dfad" },
  { name: "紅蓮火山", enemy: "火山のトカゲ", boss: "ゴロゴロりゅう", monster: "🦎", bossMonster: "🐲", icon: "🌋", theme: "volcano", color: "#ffa083" },
  { name: "氷晶の城", enemy: "こおりのペンギン", boss: "ゆきのクイーン", monster: "🐧", bossMonster: "🐻‍❄️", icon: "❄", theme: "ice", color: "#a8e4ff" },
];

export const DIFFICULTIES = {
  EASY: { hp: 0.8, damage: 0.7, label: "かんたん" },
  NORMAL: { hp: 1, damage: 1, label: "ふつう" },
  HARD: { hp: 1.4, damage: 1.3, label: "チャレンジ" },
};

export function createProgress() {
  return { unlocked: 0, cleared: [], crystals: 0, upgrades: { power: 0, shield: 0, efficiency: 0 } };
}

export function createBattle(stageIndex, difficulty = "NORMAL", progress = createProgress(), boss = false) {
  const stage = STAGES[stageIndex];
  const scale = DIFFICULTIES[difficulty] ?? DIFFICULTIES.NORMAL;
  return {
    stageIndex, difficulty, boss, startedAt: 0, elapsed: 0,
    player: { hp: 100, maxHp: 100, mana: 100, maxMana: 100, shieldUntil: 0, dodgeUntil: 0, cooldowns: {} },
    enemy: { hp: Math.round((boss ? 180 : 100) * scale.hp), maxHp: Math.round((boss ? 180 : 100) * scale.hp), name: boss ? stage.boss : stage.enemy, phase: "idle", timer: 1.7, damage: (boss ? 20 : 14) * scale.damage },
    score: 0, hits: 0, casts: 0, attackCasts: 0, combo: 0, bestCombo: 0, damageTaken: 0,
    result: null, toast: "", toastUntil: 0, progress,
  };
}

export function castSpell(battle, spellId, now) {
  if (battle.result) return { ok: false, reason: "戦闘は終了しています" };
  const spell = SPELLS[spellId];
  if (!spell) return { ok: false, reason: "不明な魔法です" };
  if ((battle.player.cooldowns[spellId] ?? 0) > now) return { ok: false, reason: "このまほうは じゅんび中！" };
  const efficiency = battle.progress.upgrades.efficiency;
  const cost = Math.max(1, Math.floor(spell.cost * (1 - efficiency * 0.1)));
  if (battle.player.mana < cost) return { ok: false, reason: "まほうパワーがたりないよ！" };

  battle.player.mana -= cost;
  battle.player.cooldowns[spellId] = now + spell.cooldown;
  battle.casts += 1;
  if (spellId === "shield") {
    battle.player.shieldUntil = Math.max(battle.player.shieldUntil, now + spell.duration + battle.progress.upgrades.shield * 0.5);
    return { ok: true, reason: "キラキラシールド！" };
  }
  if (spellId === "wind") {
    battle.player.dodgeUntil = now + spell.duration;
    return { ok: true, reason: "風にのってよけたよ！" };
  }

  battle.attackCasts += 1;
  const damage = Math.round(spell.damage * (1 + battle.progress.upgrades.power * 0.15));
  battle.enemy.hp = Math.max(0, battle.enemy.hp - damage);
  battle.hits += 1;
  battle.combo += 1;
  battle.bestCombo = Math.max(battle.combo, battle.bestCombo);
  battle.score += damage + Math.max(0, battle.combo - 1) * 5;
  if (battle.enemy.hp === 0) battle.result = "victory";
  return { ok: true, reason: `${spell.name}！ ${damage} パワー！`, damage };
}

export function updateBattle(battle, dt, now) {
  if (battle.result) return;
  battle.elapsed += dt;
  battle.player.mana = Math.min(battle.player.maxMana, battle.player.mana + 6 * dt);
  const enemy = battle.enemy;
  enemy.timer -= dt;
  if (enemy.phase === "idle" && enemy.timer <= 0) {
    enemy.phase = "telegraph";
    enemy.timer = 1.05;
    battle.toast = "モンスターがこっちに気づいたよ！";
    battle.toastUntil = now + 1.05;
  } else if (enemy.phase === "telegraph" && enemy.timer <= 0) {
    enemy.phase = "attack";
    enemy.timer = 0.5;
    if (battle.player.dodgeUntil <= now) {
      const damage = Math.ceil(enemy.damage * (battle.player.shieldUntil > now ? 0.35 : 1));
      battle.player.hp = Math.max(0, battle.player.hp - damage);
      battle.damageTaken += damage;
      battle.combo = 0;
      battle.toast = `${damage} たいりょくがへっちゃった！`;
    } else {
      battle.score += 20;
      battle.toast = "じょうずによけたね！ +20";
    }
    battle.toastUntil = now + 0.9;
    if (battle.player.hp === 0) battle.result = "defeat";
  } else if (enemy.phase === "attack" && enemy.timer <= 0) {
    enemy.phase = "recovery";
    enemy.timer = 1.1;
  } else if (enemy.phase === "recovery" && enemy.timer <= 0) {
    enemy.phase = "idle";
    enemy.timer = 1.8;
  }
}

export function calculateReward(battle) {
  if (battle.result !== "victory") return 0;
  return Math.max(10, Math.round((battle.boss ? 40 : 18) + battle.score / 30 - battle.elapsed / 20));
}
