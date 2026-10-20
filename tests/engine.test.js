import { createBattle, createProgress, castSpell, updateBattle, calculateReward } from "../src/engine.js";
import { GestureCamera, MEDIAPIPE_VERSION } from "../src/gestures.js";
import { loadProgress, saveProgress } from "../src/save.js";

const results = document.querySelector("#results");
const checks = [];
function test(name, check) {
  try {
    if (!check()) throw new Error("条件が成立しませんでした");
    checks.push(`PASS ${name}`);
  } catch (error) {
    checks.push(`FAIL ${name}: ${error.message}`);
  }
}

test("ファイアボールが15ダメージを与える", () => {
  const game = createBattle(0);
  return castSpell(game, "fire", 1).damage === 15 && game.enemy.hp === 85 && game.attackCasts === 1;
});
test("魔力不足なら魔法を発動しない", () => {
  const game = createBattle(0);
  game.player.mana = 0;
  return !castSpell(game, "thunder", 1).ok && game.enemy.hp === game.enemy.maxHp;
});
test("クールダウン中は再発動できない", () => {
  const game = createBattle(0);
  return castSpell(game, "fire", 1).ok && !castSpell(game, "fire", 1.1).ok;
});
test("シールドが敵の攻撃ダメージを軽減する", () => {
  const game = createBattle(0);
  castSpell(game, "shield", 1);
  game.enemy.phase = "telegraph";
  game.enemy.timer = .01;
  updateBattle(game, .02, 1.1);
  return game.player.hp === 95 && game.damageTaken === 5;
});
test("回避中は敵の攻撃を無効化する", () => {
  const game = createBattle(0);
  castSpell(game, "wind", 1);
  game.enemy.phase = "telegraph";
  game.enemy.timer = .01;
  updateBattle(game, .02, 1.1);
  return game.player.hp === 100 && game.score === 20;
});
test("敵のHPがゼロで勝利し報酬を得る", () => {
  const game = createBattle(0);
  game.enemy.hp = 15;
  castSpell(game, "fire", 1);
  return game.result === "victory" && calculateReward(game) > 0;
});
test("プレイヤーのHPがゼロで敗北する", () => {
  const game = createBattle(0, "HARD");
  game.player.hp = 1;
  game.enemy.phase = "telegraph";
  game.enemy.timer = .01;
  updateBattle(game, .02, 1);
  return game.result === "defeat";
});
test("魔力が時間とともに回復する", () => {
  const game = createBattle(0);
  game.player.mana = 0;
  updateBattle(game, 1, 1);
  return game.player.mana === 6;
});
test("強化で攻撃力とシールド時間が増す", () => {
  const progress = createProgress();
  progress.upgrades.power = 1;
  progress.upgrades.shield = 1;
  const game = createBattle(0, "NORMAL", progress);
  const shot = castSpell(game, "fire", 1);
  castSpell(game, "shield", 7);
  return shot.damage === 17 && game.player.shieldUntil === 10.5;
});
test("クリア報酬の値は時間とスコアから計算される", () => {
  const game = createBattle(0, "NORMAL", createProgress(), true);
  game.result = "victory";
  game.score = 90;
  game.elapsed = 40;
  return calculateReward(game) === 41;
});
test("手の形は継続して認識したときだけ一度発動する", () => {
  const events = [];
  const camera = new GestureCamera({}, (spell) => events.push(spell), () => {});
  const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  hand[0] = { x: .5, y: .9 };
  hand[8] = { x: .5, y: .2 };
  hand[6] = { x: .5, y: .6 };
  camera.classify(hand, 1000);
  camera.classify(hand, 1230);
  camera.classify(hand, 2200);
  const relaxed = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  relaxed[0] = { x: .5, y: .9 };
  camera.classify(relaxed, 2250);
  camera.classify(hand, 2300);
  camera.classify(hand, 2540);
  return events.length === 2 && events.every((spell) => spell === "fire");
});
test("セーブした進行と強化を復元する", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progress = createProgress();
  progress.crystals = 42;
  progress.unlocked = 1;
  progress.upgrades.power = 2;
  const stored = saveProgress(progress, () => storage);
  const loaded = loadProgress(() => storage);
  return stored === null && loaded.error === null && loaded.progress.crystals === 42 && loaded.progress.unlocked === 1 && loaded.progress.upgrades.power === 2;
});
test("壊れたセーブを初期状態に戻しエラーを返す", () => {
  const loaded = loadProgress(() => ({ getItem: () => "{" }));
  return loaded.error?.includes("セーブデータを読み込めませんでした") && loaded.progress.crystals === 0;
});
test("セーブ書き込み失敗を通知する", () => {
  const error = saveProgress(createProgress(), () => ({ setItem: () => { throw new Error("quota"); } }));
  return error?.includes("セーブに失敗しました");
});
test("手認識ランタイムの固定バージョンがCDNに存在する", () => MEDIAPIPE_VERSION === "0.10.18");
test("指先で画面ポインターを動かしピンチで一度だけ決定する", () => {
  const selections = [];
  const points = [];
  const camera = new GestureCamera({}, () => {}, () => {}, (point) => points.push(point), () => selections.push("selected"));
  const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  hand[0] = { x: .5, y: .9 };
  hand[9] = { x: .5, y: .6 };
  hand[8] = { x: .45, y: .3 };
  hand[4] = { x: .5, y: .31 };
  camera.classify(hand, 1000);
  camera.classify(hand, 1190);
  camera.classify(hand, 1300);
  const released = hand.map((point) => ({ ...point }));
  released[4] = { x: .8, y: .5 };
  camera.classify(released, 1400);
  camera.classify(hand, 1500);
  camera.classify(hand, 1690);
  return selections.length === 2 && points.every((point) => point.x === .55) && points[0].pinching && points[3].pinching === false;
});

results.textContent = checks.join("\n");
results.style.color = checks.every((check) => check.startsWith("PASS")) ? "#91efbd" : "#ff9292";
