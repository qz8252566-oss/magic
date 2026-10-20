import { STAGES, SPELLS, createBattle, createProgress, castSpell, updateBattle, calculateReward } from "./engine.js";
import { GestureCamera } from "./gestures.js";
import { loadProgress, saveProgress } from "./save.js";

const app = document.querySelector("#app");
const video = document.querySelector("#camera-video");
const cameraStatus = document.querySelector("#camera-status");
const pointsDisplay = document.querySelector("#points-display");
const cameraToggle = document.querySelector("#camera-toggle");
const gesturePointer = document.querySelector("#gesture-pointer");
let gestureTarget = null;
let previousGestureTarget = null;
let modal = "";
cameraToggle.addEventListener("click", toggleCamera);
document.querySelector("#help-button").addEventListener("click", () => {
  modal = "settings";
  render();
});
const loadedProgress = loadProgress();
let progress = loadedProgress.progress;
let screen = "title";
let difficulty = "NORMAL";
let battle = null;
let gestureCamera = null;
let cameraStarting = false;
let lastFrame = 0;
let lastHudUpdate = 0;
let hitAnimationUntil = 0;
let errorMessage = loadedProgress.error ?? "";

const SPELL_COMMANDS = {
  fire: { key: "1", icon: "🔥", gesture: "ひとさし指を1本", short: "人さし指だけ", color: "fire" },
  shield: { key: "2", icon: "🛡️", gesture: "手のひらをパッ！", short: "手のひらをパー", color: "shield" },
  thunder: { key: "3", icon: "⚡", gesture: "指を2本立てる", short: "人さし指と中指", color: "thunder" },
  wind: { key: "4", icon: "💨", gesture: "手を横にシュッ！", short: "手を左右に動かす", color: "wind" },
};

function gestureIllustration(id) {
  const extended = id === "shield" ? [true, true, true, true] : id === "thunder" ? [true, true, false, false] : id === "fire" ? [true, false, false, false] : [true, true, true, true];
  const fingerX = [22, 31, 41, 50];
  const raisedY = [13, 7, 10, 16];
  const tipY = extended.map((isRaised, index) => isRaised ? raisedY[index] : 34);
  const motion = id === "wind" ? '<path class="gesture-motion" d="M8 30H18m-4-4 4 4-4 4M56 42h-9m4-4-4 4 4 4"/>' : "";
  const description = id === "wind" ? "手を左右に振るジェスチャー" : `${SPELL_COMMANDS[id].gesture}ジェスチャー`;
  return `<svg class="gesture-art gesture-art-${id}" viewBox="0 0 68 68" role="img" aria-label="${description}" focusable="false">
    <g class="gesture-fingers">${fingerX.map((x, index) => `<path d="M${x} 42V${tipY[index]}" />`).join("")}</g>
    <path class="gesture-palm" d="M19 39V${tipY[0]} Q19 ${tipY[0] - 4} 22 ${tipY[0] - 4} Q25 ${tipY[0] - 4} 25 ${tipY[0]} V${tipY[1] - 4} Q31 ${tipY[1] - 8} 34 ${tipY[1] - 4} V${tipY[2] - 4} Q41 ${tipY[2] - 8} 43 ${tipY[2] - 4} V${tipY[3] - 4} Q51 ${tipY[3] - 8} 53 ${tipY[3] - 3} V39 Q53 51 43 56 L34 59 Q25 58 22 51 L17 41 Q15 37 18 36Z" />
    <path class="gesture-cuff" d="M24 54 21 61q10 5 24 0l-3-7" />
    <path class="gesture-thumb" d="m19 43-6-7q-2-3 1-5 3-2 5 1l4 4" />
    <path class="gesture-crease" d="M29 43v6m10-6v6m9-6v5" />
    ${motion}
    <path class="gesture-sparkle" d="${id === "fire" ? "M56 12v8m-4-4h8" : id === "shield" ? "m10 16 2 2 4-5" : id === "thunder" ? "m55 10-4 7h4l-2 6" : "M34 3v5m-3-2h6"}" />
  </svg>`;
}

function spellCommand(id, { button = false, compact = false } = {}) {
  const spell = SPELLS[id];
  const gesture = SPELL_COMMANDS[id];
  const content = `${gestureIllustration(id)}<span class="command-copy"><strong>${gesture.icon} ${spell.name}</strong><span>${compact ? gesture.gesture : gesture.short}</span></span><kbd>${gesture.key}</kbd>`;
  if (!button) return `<div class="gesture-tile gesture-tile-${gesture.color}">${content}</div>`;
  const now = performance.now() / 1000;
  const remaining = Math.max(0, (battle.player.cooldowns[id] ?? 0) - now);
  return `<button class="spell-command spell-command-${gesture.color}" data-spell="${id}" title="${spell.name}：${gesture.gesture}。キー ${gesture.key} でも使えます">${content}<small>${gesture.gesture} · MP ${spell.cost}${remaining > 0 ? ` · ${remaining.toFixed(1)}秒` : ""}</small></button>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function isCameraError(message) {
  return /できなかった|読みこめなかった|見つからなかった/.test(message);
}

function render() {
  pointsDisplay.innerHTML = `⭐ <b>${progress.crystals}</b>こ`;
  cameraToggle.disabled = cameraStarting;
  cameraToggle.textContent = cameraStarting ? "カメラじゅんび中…" : gestureCamera?.running ? "カメラをおやすみ" : "✋ カメラであそぶ";
  if (screen === "title") renderTitle();
  if (screen === "stages") renderStages();
  if (screen === "battle") renderBattle();
  if (screen === "result") renderResult();
  if (screen === "upgrade") renderUpgrade();
  if (modal) renderModal();
  app.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", onAction));
  app.querySelectorAll("[data-spell]").forEach((element) => element.addEventListener("click", () => fireSpell(element.dataset.spell)));
  app.querySelectorAll("[data-difficulty]").forEach((element) => element.addEventListener("click", () => {
    difficulty = element.dataset.difficulty;
    render();
  }));
  app.querySelectorAll("[data-upgrade]").forEach((element) => element.addEventListener("click", () => buyUpgrade(element.dataset.upgrade)));
}

function renderTitle() {
  app.innerHTML = `
    <section class="home">
      <div class="hero-copy">
        <div class="eyebrow">⭐ &nbsp; きみの手が、まほうになる！</div>
        <h1>せーので、<br><em>まほう！</em></h1>
        <p>ポーズをまねして呪文をとなえよう！ やさしいモンスターといっしょに、森・火山・氷のお城を大冒険。</p>
        ${errorMessage ? `<p class="error-message">${escapeHtml(errorMessage)}</p>` : ""}
        <div class="actions"><button class="button primary" data-action="stages">ぼうけんスタート！　→</button><button class="button subtle" data-action="settings">あそびかた</button></div>
        <div class="controls-note">カメラがなくてもOK！ &nbsp;·&nbsp; <b>1 2 3 4</b> キーやボタンでもあそべるよ</div>
      </div>
      <div class="portal" aria-label="魔法使いと魔法の光のイラスト">
        <span class="rune r1">✧</span><span class="rune r2">ᛟ</span><span class="rune r3">✳</span><div class="wizard"></div><div class="orb"></div>
        <span class="portal-caption">✨ まほうの森へ、しゅっぱつ！ ✨</span>
      </div>
    </section>
    <section class="quick-guide" aria-labelledby="quick-guide-title">
      <div class="guide-heading"><span class="eyebrow">✋ ポーズをまねしてみよう</span><h2 id="quick-guide-title">まほうの出しかた</h2><p>すきなポーズであそぼう。カメラを使わなくても大丈夫！</p></div>
      <div class="gesture-grid">${Object.keys(SPELL_COMMANDS).map((id) => spellCommand(id)).join("")}</div>
    </section>`;
}

function renderStages() {
  app.innerHTML = `
    <section class="page-heading"><div><span class="eyebrow">🌈 どこへ行こう？</span><h2>冒険の舞台</h2></div><button class="button subtle back-button" data-action="title">← もどる</button></section>
    <section class="stage-grid">${STAGES.map((stage, index) => {
      const locked = index > progress.unlocked;
      const cleared = progress.cleared.includes(index);
      return `<button class="stage-card" data-action="stage-${index}" ${locked ? "disabled" : ""}>
        <div class="landscape ${stage.theme}"></div><span class="stage-index">ぼうけん ${index + 1} ${cleared ? "· クリア！" : ""}</span>
        ${locked ? '<span class="stage-lock">🔒 もう少し！</span>' : cleared ? '<span class="stage-lock">⭐ クリア！</span>' : ""}
        <h3 class="stage-title">${stage.icon} ${stage.name}</h3><span class="stage-copy">モンスターとボスにちょうせん！</span>
      </button>`;
    }).join("")}</section>
    <section class="selection-controls"><div><span class="eyebrow">あそびのむずかしさ</span><div class="difficulty">${[["EASY", "かんたん"], ["NORMAL", "ふつう"], ["HARD", "チャレンジ"]].map(([value, label]) => `<button data-difficulty="${value}" class="${value === difficulty ? "active" : ""}">${label}</button>`).join("")}</div></div>
    <span class="muted">⭐ ためた星 ${progress.crystals}こ　·　まほうの強さもそのままだよ</span></section>`;
}

function renderBattle() {
  if (!battle) return;
  const stage = STAGES[battle.stageIndex];
  const now = performance.now() / 1000;
  const enemyPercent = Math.max(0, battle.enemy.hp / battle.enemy.maxHp * 100);
  const playerPercent = Math.max(0, battle.player.hp / battle.player.maxHp * 100);
  const manaPercent = battle.player.mana / battle.player.maxMana * 100;
  app.innerHTML = `
    <section class="battle">
      <div class="battle-top"><button class="button subtle back-button" data-action="pause">☕ ひとやすみ</button>
        <div class="enemy-hud"><strong>${escapeHtml(battle.enemy.name)}　${battle.boss ? "· おおもの！" : ""}</strong><div class="bar"><i style="width:${enemyPercent}%"></i></div></div>
        <span class="battle-timer" data-role="battle-timer">⏱ ${formatTime(battle.elapsed)}　·　${stage.icon} ${stage.name}</span>
      </div>
      <div class="arena"><div class="stars"></div><div class="combatants">
        <div class="hero-figure ${battle.player.shieldUntil > now ? "shielded" : ""} ${battle.player.dodgeUntil > now ? "dodging" : ""}"></div>
        <div class="monster ${battle.enemy.phase === "telegraph" ? "telegraph" : ""} ${hitAnimationUntil > now ? "hit" : ""}" aria-label="${escapeHtml(battle.enemy.name)}">${battle.boss ? stage.bossMonster : stage.monster}</div>
      </div><div class="arena-toast" hidden></div></div>
      <div class="battle-bottom">
        <div class="status-card"><div class="status-row"><span>💖 たいりょく</span><b>${battle.player.hp} / ${battle.player.maxHp}</b></div><div class="bar"><i style="width:${playerPercent}%;background:linear-gradient(90deg,#ed638a,#fa9d91)"></i></div><div class="status-row" style="margin-top:12px"><span>✨ まほうパワー</span><b>${Math.floor(battle.player.mana)} / ${battle.player.maxMana}</b></div><div class="bar mana-bar"><i style="width:${manaPercent}%"></i></div></div>
        <div class="status-card"><div class="status-row"><span>⭐ スコア</span><b>${battle.score}</b></div><div class="status-row"><span>れんぞく</span><b>× ${battle.combo}</b></div><div class="status-row"><span>さいこう</span><b>× ${battle.bestCombo}</b></div><div class="status-row"><span>あたった数</span><b>${battle.hits}</b></div></div>
        <div class="camera-card"><div><strong>✨ まほうコマンド</strong><p data-role="camera-guidance" class="${isCameraError(cameraStatus.textContent) ? "error-message" : ""}">${escapeHtml(cameraStatus.textContent)} · ポーズをまねしてみてね</p>
        <div class="spells">${Object.keys(SPELL_COMMANDS).map((id) => spellCommand(id, { button: true })).join("")}</div></div>
        <div class="camera-actions"><button class="button" data-action="settings">あそびかた</button></div></div>
      </div>
    </section>`;
  if (gestureCamera?.running) video.classList.add("active");
}

function updateBattleUI(now) {
  if (screen !== "battle" || !battle) return;
  const stage = STAGES[battle.stageIndex];
  const statusCards = app.querySelectorAll(".status-card");
  const playerRows = statusCards[0]?.querySelectorAll(".status-row");
  const playerBars = statusCards[0]?.querySelectorAll(".bar > i");
  const scoreValues = statusCards[1]?.querySelectorAll(".status-row b");

  app.querySelector('[data-role="battle-timer"]').textContent = `⏱ ${formatTime(battle.elapsed)}　·　${stage.icon} ${stage.name}`;
  app.querySelector(".enemy-hud .bar > i").style.width = `${Math.max(0, battle.enemy.hp / battle.enemy.maxHp * 100)}%`;
  playerRows[0].querySelector("b").textContent = `${battle.player.hp} / ${battle.player.maxHp}`;
  playerBars[0].style.width = `${battle.player.hp / battle.player.maxHp * 100}%`;
  playerRows[1].querySelector("b").textContent = `${Math.floor(battle.player.mana)} / ${battle.player.maxMana}`;
  playerBars[1].style.width = `${battle.player.mana / battle.player.maxMana * 100}%`;
  scoreValues[0].textContent = String(battle.score);
  scoreValues[1].textContent = `× ${battle.combo}`;
  scoreValues[2].textContent = `× ${battle.bestCombo}`;
  scoreValues[3].textContent = String(battle.hits);

  const hero = app.querySelector(".hero-figure");
  hero.classList.toggle("shielded", battle.player.shieldUntil > now);
  hero.classList.toggle("dodging", battle.player.dodgeUntil > now);
  app.querySelector(".monster").classList.toggle("telegraph", battle.enemy.phase === "telegraph");
  app.querySelector(".monster").classList.toggle("hit", hitAnimationUntil > now);
  const toast = app.querySelector(".arena-toast");
  const message = battle.enemy.phase === "telegraph" ? "⚠ モンスターのこうげき！ まもるか、よけよう！" : battle.toastUntil > now ? battle.toast : "";
  toast.textContent = message;
  toast.hidden = !message;

  const guidance = app.querySelector('[data-role="camera-guidance"]');
  guidance.innerHTML = `${escapeHtml(cameraStatus.textContent)} · ポーズをまねしてみてね`;
  guidance.classList.toggle("error-message", isCameraError(cameraStatus.textContent));
  app.querySelectorAll("[data-spell]").forEach((button) => {
    const id = button.dataset.spell;
    const remaining = Math.max(0, (battle.player.cooldowns[id] ?? 0) - now);
    button.querySelector("small").textContent = `${SPELLS[id].name} ${remaining > 0 ? `${remaining.toFixed(1)}s` : ""}`;
  });
  const spells = app.querySelector(".spells");
  for (const id of Object.keys(SPELL_COMMANDS)) {
    const command = spells.querySelector(`[data-spell="${id}"]`);
    const remaining = Math.max(0, (battle.player.cooldowns[id] ?? 0) - now);
    command.querySelector("small").textContent = `${SPELL_COMMANDS[id].gesture} · MP ${SPELLS[id].cost}${remaining > 0 ? ` · ${remaining.toFixed(1)}秒` : ""}`;
  }
}

function renderResult() {
  const victory = battle.result === "victory";
  const reward = calculateReward(battle);
  app.innerHTML = `<section class="result-layout"><div class="result-card">
    <div class="result-symbol">${victory ? "⭐" : "🌱"}</div><span class="eyebrow">${victory ? "やったね！" : "つぎはきっとうまくいくよ！"}</span>
    <h2>${victory ? battle.boss ? "ステージクリア！" : "やった！ しょうり！" : "おしい！ もういちど！"}</h2>
    <p>${escapeHtml(battle.enemy.name)}とのたたかい${victory ? `。⭐ 星を ${reward}こ ゲット！` : "。まもる・よけるの魔法もためしてみよう。"}</p>
    <div class="result-stats"><div><b>${battle.score}</b><span>スコア</span></div><div><b>${formatTime(battle.elapsed)}</b><span>じかん</span></div><div><b>${battle.attackCasts ? Math.round(battle.hits / battle.attackCasts * 100) : 0}%</b><span>あたった割合</span></div><div><b>${battle.damageTaken}</b><span>うけたダメージ</span></div><div><b>${battle.bestCombo}</b><span>れんぞく</span></div></div>
    <div class="actions" style="justify-content:center">${victory && battle.boss ? '<button class="button gold" data-action="claim">⭐ 星をもらう！</button>' : `<button class="button primary" data-action="${victory ? "boss" : "retry"}">${victory ? "ボスにちょうせん！ →" : "もういちどあそぶ"}</button>`}<button class="button" data-action="stages">べつのばしょへ</button></div>
  </div></section>`;
}

function renderUpgrade() {
  const options = [
    ["power", "こうげきパワーUP", "ファイアやサンダーがもっと強くなる！", 18],
    ["shield", "シールドながもち", "シールドが0.5秒長くなる！", 15],
    ["efficiency", "パワーせつやく", "まほうパワーを使う量がへるよ！", 20],
  ];
  app.innerHTML = `<section class="upgrade-layout"><div class="upgrade-card">
    <span class="eyebrow">⭐ ためた星 ${progress.crystals}こ</span><h2>まほうをパワーアップ！</h2><p>冒険でもらった星をつかって、つぎのたたかいにそなえよう。</p>
    <div class="upgrade-list">${options.map(([id,title,copy,cost]) => `<div class="upgrade-row"><span><strong>${title}　Lv.${progress.upgrades[id]}</strong><small>${copy}</small></span><button class="button" data-upgrade="${id}" ${progress.crystals < cost ? "disabled" : ""}>⭐ ${cost}こ</button></div>`).join("")}</div>
    <button class="button primary" data-action="stages">次の冒険へ　→</button>
  </div></section>`;
}

function renderModal() {
  const pause = modal === "pause";
  app.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <span class="eyebrow">${pause ? "ひとやすみ" : "✋ まねしてみよう！"}</span><h2 id="modal-title">${pause ? "ちょっと休けい" : "ポーズでまほう！"}</h2>
    ${pause ? '<p>いつでも休けいできるよ。元気になったらつづきをあそぼう！ 指さしでボタンをねらって、親指と人さし指を合わせると決定できるよ。</p>' : `<p>まず一度だけカメラボタンを押して、カメラを使うことを許可してね。そのあとは、人さし指でボタンをねらって、親指と人さし指を合わせて決定！ これでマウスを使わずあそべるよ。</p>
      <div class="gesture-guide">${Object.keys(SPELL_COMMANDS).map((id) => spellCommand(id, { compact: true })).join("")}</div>
      <p>マウスを使わず遊ぶときは、もう一度カメラボタンをねらってつまむとカメラを止められるよ。敵が赤く光ったら、盾でまもるか風でよけよう！ カメラの映像はこのパソコンの中だけで使い、インターネットには送らないよ。はじめてカメラを使うときは、手を見つけるプログラム（約8 MB）をインターネットから読みこむよ。</p>`}
    ${errorMessage ? `<p class="error-message">${escapeHtml(errorMessage)}</p>` : ""}
    <div class="modal-actions">${pause ? '<button class="button" data-action="title">ぼうけんをやめる</button><button class="button" data-action="retry">もういちど</button><button class="button primary" data-action="resume">つづける！</button>' : '<button class="button" data-action="close-modal">もどる</button><button class="button primary" data-action="camera">✋ カメラであそぶ</button>'}</div>
  </section></div>`);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function startBattle(stageIndex, boss = false) {
  battle = createBattle(stageIndex, difficulty, progress, boss);
  screen = "battle";
  modal = "";
  lastFrame = performance.now();
  render();
}

function fireSpell(id) {
  if (!battle || screen !== "battle" || modal) return;
  const result = castSpell(battle, id, performance.now() / 1000);
  battle.toast = result.reason;
  battle.toastUntil = performance.now() / 1000 + .85;
  if (result.damage) hitAnimationUntil = performance.now() / 1000 + .22;
  if (battle.result) {
    screen = "result";
    render();
  } else {
    updateBattleUI(performance.now() / 1000);
  }
}

function findGestureTarget(point) {
  const element = document.elementFromPoint(point.x * window.innerWidth, point.y * window.innerHeight);
  return element?.closest("button:not(:disabled), a[href], [role=button]:not([aria-disabled=true])") ?? null;
}

function updateGesturePointer(point) {
  if (!point) {
    gesturePointer.classList.remove("visible", "pinching", "targeting");
    gesturePointer.style.left = "";
    gesturePointer.style.top = "";
    gesturePointer.querySelector("span").textContent = "つまんで きめる";
    previousGestureTarget?.classList.remove("gesture-hover");
    previousGestureTarget = null;
    gestureTarget = null;
    return;
  }

  const x = Math.min(1, Math.max(0, point.x));
  const y = Math.min(1, Math.max(0, point.y));
  gesturePointer.style.left = `${x * 100}vw`;
  gesturePointer.style.top = `${y * 100}vh`;
  gesturePointer.classList.add("visible");
  gesturePointer.classList.toggle("pinching", point.pinching);
  const target = findGestureTarget({ x, y });
  if (target !== previousGestureTarget) {
    previousGestureTarget?.classList.remove("gesture-hover");
    previousGestureTarget = target;
    target?.classList.add("gesture-hover");
    const label = target?.getAttribute("aria-label") || target?.innerText?.replace(/\s+/g, " ").trim().slice(0, 36);
    cameraStatus.innerHTML = `<i></i> ${escapeHtml(label ? `${label} をねらい中 · つまんで決定` : "ひとさし指でねらって、つまんで決定！")}`;
    cameraStatus.classList.toggle("connected", Boolean(gestureCamera?.stream));
    if (screen === "battle") updateBattleUI(performance.now() / 1000);
  }
  gestureTarget = target;
  gesturePointer.classList.toggle("targeting", Boolean(target));
  gesturePointer.querySelector("span").textContent = target ? "ここを つまんで きめる" : "ひとさし指で えらぶ";
}

function selectGestureTarget() {
  if (!gestureTarget?.isConnected || gestureTarget.disabled) {
    cameraStatus.innerHTML = "<i></i> ボタンをねらってから、親指と人さし指を合わせてね";
    return;
  }
  const target = gestureTarget;
  target.classList.add("gesture-selected");
  window.setTimeout(() => target.classList.remove("gesture-selected"), 240);
  target.click();
}

function onAction(event) {
  const action = event.currentTarget.dataset.action;
  if (action.startsWith("stage-")) {
    const index = Number(action.slice(6));
    if (index <= progress.unlocked) startBattle(index);
  } else if (action === "title") {
    modal = "";
    screen = "title";
    render();
  } else if (action === "stages") {
    modal = "";
    screen = "stages";
    render();
  } else if (action === "settings") {
    modal = "settings";
    render();
  } else if (action === "close-modal" || action === "resume") {
    modal = "";
    lastFrame = performance.now();
    render();
  } else if (action === "pause") {
    modal = "pause";
    render();
  } else if (action === "retry") {
    startBattle(battle.stageIndex, battle.boss);
  } else if (action === "boss") {
    startBattle(battle.stageIndex, true);
  } else if (action === "claim") {
    progress.crystals += calculateReward(battle);
    if (!progress.cleared.includes(battle.stageIndex)) progress.cleared.push(battle.stageIndex);
    progress.unlocked = Math.min(STAGES.length - 1, Math.max(progress.unlocked, battle.stageIndex + 1));
    errorMessage = saveProgress(progress) ?? "";
    screen = "upgrade";
    render();
  } else if (action === "camera") {
    toggleCamera();
  }
}

function buyUpgrade(id) {
  const costs = { power: 18, shield: 15, efficiency: 20 };
  if (!(id in costs) || progress.crystals < costs[id]) return;
  progress.crystals -= costs[id];
  progress.upgrades[id] += 1;
  errorMessage = saveProgress(progress) ?? "";
  render();
}

async function toggleCamera() {
  if (cameraStarting) return;
  if (gestureCamera?.running || gestureCamera?.stream) {
    gestureCamera.stop();
    gestureCamera = null;
    render();
    return;
  }
  cameraStarting = true;
  const camera = new GestureCamera(video, (gesture) => {
    if (gesture === "pinch") {
      selectGestureTarget();
    } else if (gesture in SPELLS && !gestureTarget?.isConnected) {
      fireSpell(gesture);
    }
  }, (text) => {
    cameraStatus.innerHTML = `<i></i> ${escapeHtml(text)}`;
    cameraStatus.classList.toggle("connected", Boolean(camera.stream));
    if (screen === "battle") updateBattleUI(performance.now() / 1000);
  }, updateGesturePointer, selectGestureTarget);
  gestureCamera = camera;
  render();
  try {
    await camera.start();
    if (gestureCamera !== camera) {
      camera.stop();
      return;
    }
    cameraStarting = false;
    errorMessage = "";
    video.classList.add("active");
    render();
  } catch (error) {
    camera.stop();
    if (gestureCamera !== camera) return;
    cameraStarting = false;
    errorMessage = friendlyCameraError(error);
    gestureCamera = null;
    cameraStatus.innerHTML = `<i></i> ${escapeHtml(errorMessage)}`;
    cameraStatus.classList.remove("connected");
    render();
  }
}

function friendlyCameraError(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "カメラを使えなかったよ。ブラウザーのカメラ許可を確認してね。";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "カメラが見つからなかったよ。";
  }
  if (error.message.startsWith("手認識モデルを読み込めませんでした")) {
    return "手を見つけるプログラムを読みこめなかったよ。インターネットにつないで、もう一度ためしてね。";
  }
  return `カメラをじゅんびできなかったよ。${error.message}`;
}

function tick(timestamp) {
  requestAnimationFrame(tick);
  if (screen !== "battle" || modal || cameraStarting || !battle) return;
  const dt = Math.min(.05, (timestamp - lastFrame) / 1000);
  lastFrame = timestamp;
  updateBattle(battle, dt, timestamp / 1000);
  if (battle.result) {
    screen = "result";
    render();
  } else if (timestamp - lastHudUpdate >= 100) {
    lastHudUpdate = timestamp;
    updateBattleUI(timestamp / 1000);
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "c" && !event.repeat) {
    toggleCamera();
    return;
  }
  if (screen !== "battle" || modal) {
    if (event.key === "Escape" && modal) {
      modal = "";
      render();
    }
    return;
  }
  const keys = { "1": "fire", "2": "shield", "3": "thunder", "4": "wind" };
  if (keys[event.key]) fireSpell(keys[event.key]);
  if (event.key === "Escape") {
    modal = "pause";
    render();
  }
});

window.addEventListener("beforeunload", () => gestureCamera?.stop());
cameraStatus.innerHTML = "<i></i> カメラおやすみ中";
render();
requestAnimationFrame(tick);
