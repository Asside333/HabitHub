const STORAGE_KEY = "habithub-state-v2";
const LEGACY_STORAGE_KEY = "habithub-state-v1";

let xpValue;
let goldValue;
let questsList;
let resetBtn;
let sessionProgressText;
let sessionProgressBar;
let progressTrack;
let toastRoot;
let confettiLayer;
let levelBadge;

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let state;
let audioContext = null;

// Set utilisé pour éviter les double-clics sur une quête pendant le traitement.
const processingQuestIds = new Set();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw);
    return {
      xp: Number(parsed.xp) || 0,
      gold: Number(parsed.gold) || 0,
      completedQuestIds: Array.isArray(parsed.completedQuestIds)
        ? parsed.completedQuestIds.filter((id) => typeof id === "string")
        : [],
    };
  } catch {
    return createInitialState();
  }
}

function createInitialState() {
  // Important: retourne un nouveau tableau pour éviter de muter INITIAL_STATE par référence.
  return {
    xp: INITIAL_STATE.xp,
    gold: INITIAL_STATE.gold,
    completedQuestIds: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

function getLevelFromXp(xp) {
  // Progression simple: 100 XP = 1 niveau.
  return Math.floor(xp / 100) + 1;
}

function renderLevel() {
  levelBadge.textContent = `Lv ${getLevelFromXp(state.xp)}`;
}

function animateValue(element, from, to, durationMs = UI_CONFIG.countUpDurationMs) {
  if (prefersReducedMotion() || from === to) {
    element.textContent = String(to);
    return;
  }

  const start = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - start) / durationMs, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    const value = Math.round(from + (to - from) * eased);
    element.textContent = String(value);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

function renderStats(previous = state) {
  animateValue(xpValue, previous.xp, state.xp);
  animateValue(goldValue, previous.gold, state.gold);
  renderLevel();
}

function renderSessionProgress() {
  const doneCount = state.completedQuestIds.length;
  const total = QUESTS.length;
  const ratio = total === 0 ? 0 : (doneCount / total) * 100;

  sessionProgressText.textContent = `${doneCount} / ${total}`;
  sessionProgressBar.style.width = `${ratio}%`;
  progressTrack.setAttribute("aria-valuemax", String(total));
  progressTrack.setAttribute("aria-valuenow", String(doneCount));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRoot.append(toast);

  setTimeout(() => {
    toast.remove();
  }, UI_CONFIG.toastDurationMs);
}

function playDing() {
  if (prefersReducedMotion()) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, now);
  oscillator.frequency.exponentialRampToValueAtTime(560, now + 0.12);

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.02, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
}

function spawnConfetti() {
  if (prefersReducedMotion()) return;

  const colors = ["#58cc6c", "#7ca6ff", "#ffd45e", "#ff8598"];

  for (let i = 0; i < UI_CONFIG.confettiPieces; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${8 + Math.random() * 84}%`;
    piece.style.top = `${12 + Math.random() * 20}%`;
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    confettiLayer.append(piece);

    setTimeout(() => piece.remove(), UI_CONFIG.confettiDurationMs + 180);
  }
}

function getQuestIconSvg(questId) {
  const icons = {
    water:
      '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M12 2c3.2 4 6.5 7.4 6.5 11.2A6.5 6.5 0 1 1 5.5 13.2C5.5 9.4 8.8 6 12 2z"/></svg>',
    walk:
      '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><circle cx="14" cy="5" r="2.5"/><path d="M7 13.5 11 9l2 1.6V15l2.6 4H13l-2.4-3.6L8.4 18H6l2.2-4.5L7 13.5z"/></svg>',
    read:
      '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11c1.2 0 2.3.4 3 1.2.7-.8 1.8-1.2 3-1.2h1.5c.8 0 1.5.7 1.5 1.5V18c0 .6-.4 1-1 1H17c-1.2 0-2.3.4-3 1.2-.7-.8-1.8-1.2-3-1.2H5c-.6 0-1-.4-1-1V5.5z"/></svg>',
  };

  return icons[questId] || '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
}

function markQuestAsCompleted(quest, questItem, button, title) {
  questItem.classList.add("is-completed", "pop", "glow");
  setTimeout(() => questItem.classList.remove("pop"), UI_CONFIG.questPopDurationMs);
  setTimeout(() => questItem.classList.remove("glow"), UI_CONFIG.questGlowDurationMs);

  title.textContent = `✅ ${quest.name}`;
  button.textContent = "Complétée";
  button.disabled = true;
  button.classList.add("btn-completed");
}

function completeQuest(quest, questItem, button, title) {
  if (processingQuestIds.has(quest.id)) return;
  processingQuestIds.add(quest.id);

  // Idempotence: si déjà complétée, on ne donne plus de récompense.
  if (state.completedQuestIds.includes(quest.id)) {
    markQuestAsCompleted(quest, questItem, button, title);
    processingQuestIds.delete(quest.id);
    return;
  }

  // Anti double-clic immédiat uniquement pour un clic valide.
  button.disabled = true;

  const previous = { ...state };
  state.xp += quest.xp;
  state.gold += quest.gold;
  state.completedQuestIds.push(quest.id);

  saveState();
  renderStats(previous);
  renderSessionProgress();
  markQuestAsCompleted(quest, questItem, button, title);

  showToast(`+${quest.xp} XP • +${quest.gold} Gold`);
  spawnConfetti();
  playDing();

  processingQuestIds.delete(quest.id);
}

function renderQuests() {
  questsList.innerHTML = "";

  for (const quest of QUESTS) {
    const isCompleted = state.completedQuestIds.includes(quest.id);

    const item = document.createElement("li");
    item.className = "quest";

    const questMain = document.createElement("div");
    questMain.className = "quest-main";

    const icon = document.createElement("div");
    icon.className = "quest-icon";
    icon.innerHTML = getQuestIconSvg(quest.id);

    const textWrap = document.createElement("div");

    const title = document.createElement("p");
    title.className = "quest-title";
    title.textContent = `${isCompleted ? "✅ " : "🎯 "}${quest.name}`;

    const chips = document.createElement("div");
    chips.className = "reward-chips";

    const xpChip = document.createElement("span");
    xpChip.className = "chip chip-xp";
    xpChip.textContent = `+${quest.xp} XP`;

    const goldChip = document.createElement("span");
    goldChip.className = "chip chip-gold";
    goldChip.textContent = `+${quest.gold} Gold`;

    chips.append(xpChip, goldChip);
    textWrap.append(title, chips);
    questMain.append(icon, textWrap);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn btn-primary";
    doneBtn.textContent = isCompleted ? "Complétée" : "Terminer";
    doneBtn.disabled = isCompleted;

    if (isCompleted) {
      item.classList.add("is-completed");
      doneBtn.classList.add("btn-completed");
    }

    doneBtn.addEventListener("click", () => completeQuest(quest, item, doneBtn, title));

    item.append(questMain, doneBtn);
    questsList.append(item);
  }
}

function resetSession() {
  const accepted = window.confirm("Redémarrer la session ? Toutes les stats et quêtes seront remises à zéro.");
  if (!accepted) return;

  const previous = { ...state };

  // Régression critique: INITIAL_STATE était muté à cause d'une copie superficielle.
  // Ici on réinitialise la RAM + le stockage de manière explicite.
  state = createInitialState();
  processingQuestIds.clear();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  renderStats(previous);
  renderSessionProgress();
  renderQuests();
  showToast("Session réinitialisée");
}

function initGame() {
  xpValue = document.getElementById("xp-value");
  goldValue = document.getElementById("gold-value");
  questsList = document.getElementById("quests-list");
  resetBtn = document.getElementById("reset-btn");
  sessionProgressText = document.getElementById("session-progress-text");
  sessionProgressBar = document.getElementById("session-progress-bar");
  progressTrack = document.querySelector(".progress-track");
  toastRoot = document.getElementById("toast-root");
  confettiLayer = document.getElementById("confetti-layer");
  levelBadge = document.getElementById("level-badge");

  state = loadState();
  resetBtn.addEventListener("click", resetSession);

  renderStats();
  renderSessionProgress();
  renderQuests();
}

document.addEventListener("DOMContentLoaded", initGame);
