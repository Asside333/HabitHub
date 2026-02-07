const STORAGE_KEY = "habithub-state-v2";
const LEGACY_STORAGE_KEY = "habithub-state-v1";

let xpValue;
let goldValue;
let questsList;
let resetBtn;
let sessionProgressText;
let sessionProgressBar;
let progressTrack;
let levelProgressText;
let levelProgressBar;
let levelProgressTrack;
let levelProgressRemaining;
let toastRoot;
let confettiLayer;
let levelBadge;
let levelUpOverlay;
let levelUpTitle;
let levelUpMessage;
let levelUpContinueBtn;
let levelUpModalListenersController;

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
    const safeXp = Math.max(0, Number(parsed.xp) || 0);
    const safeTotalXp = Math.max(0, Number(parsed.totalXp ?? parsed.xp) || 0);
    const levelProgress = computeLevelProgress(safeTotalXp);
    const safeLevel = Math.max(levelProgress.level, Number(parsed.level) || 1);

    return {
      xp: safeXp,
      totalXp: safeTotalXp,
      level: safeLevel,
      gold: Math.max(0, Number(parsed.gold) || 0),
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
    totalXp: INITIAL_STATE.totalXp,
    level: INITIAL_STATE.level,
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function xpForNextLevel(level) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return Math.max(1, Math.round(PROGRESSION.BASE_XP * PROGRESSION.GROWTH ** (safeLevel - 1)));
}

function computeLevelProgress(totalXp) {
  const safeTotalXp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  let remainingXp = safeTotalXp;

  while (remainingXp >= xpForNextLevel(level)) {
    remainingXp -= xpForNextLevel(level);
    level += 1;
  }

  const xpNeeded = xpForNextLevel(level);
  const xpIntoLevel = remainingXp;
  const progress = clamp(xpIntoLevel / xpNeeded, 0, 1);

  return {
    level,
    xpIntoLevel,
    xpNeeded,
    progress,
  };
}

function xpRequiredToReachLevel(level) {
  let required = 0;
  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    required += xpForNextLevel(currentLevel);
  }
  return required;
}

function computeDisplayedProgress(level, totalXp) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const safeTotalXp = Math.max(0, Math.floor(Number(totalXp) || 0));
  const xpNeeded = xpForNextLevel(safeLevel);
  const baseline = xpRequiredToReachLevel(safeLevel);
  const xpIntoLevel = clamp(safeTotalXp - baseline, 0, xpNeeded);

  return {
    xpIntoLevel,
    xpNeeded,
    progress: clamp(xpIntoLevel / xpNeeded, 0, 1),
  };
}

function getLevelUpGoldBonus(level) {
  return Math.max(0, PROGRESSION.LEVEL_UP_GOLD_BASE_BONUS + PROGRESSION.LEVEL_UP_GOLD_PER_LEVEL * (level - 1));
}

function showLevelUpOverlay(newLevel, levelsGained, goldBonus) {
  const gainedText = levelsGained > 1 ? `(+${levelsGained} niveaux)` : "";
  levelUpTitle.textContent = `Niveau ${newLevel} ! ${gainedText}`.trim();
  levelUpMessage.textContent = `+${goldBonus} Gold`;
  levelUpOverlay.hidden = false;
  levelUpOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    levelUpContinueBtn?.focus();
  });
}

function closeLevelUpModal() {
  if (!levelUpOverlay || levelUpOverlay.hidden) return;

  levelUpOverlay.hidden = true;
  levelUpOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setupLevelUpModalListeners() {
  if (!levelUpOverlay || !levelUpContinueBtn) return;

  levelUpModalListenersController?.abort();
  levelUpModalListenersController = new AbortController();
  const { signal } = levelUpModalListenersController;

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const closeButton = event.target.closest('[data-action="close-levelup"]');
      if (closeButton) {
        closeLevelUpModal();
        return;
      }

      if (event.target === levelUpOverlay) {
        closeLevelUpModal();
      }
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeLevelUpModal();
      }
    },
    { signal }
  );
}

function onLevelUp(oldLevel, newLevel) {
  if (newLevel <= oldLevel) return;

  let totalBonus = 0;
  for (let gainedLevel = oldLevel + 1; gainedLevel <= newLevel; gainedLevel += 1) {
    totalBonus += getLevelUpGoldBonus(gainedLevel);
  }

  state.gold += totalBonus;
  showToast(`LEVEL UP ! Lv ${newLevel} • +${totalBonus} Gold`);
  showLevelUpOverlay(newLevel, newLevel - oldLevel, totalBonus);
  levelBadge.classList.add("level-up-glow");
  setTimeout(() => levelBadge.classList.remove("level-up-glow"), UI_CONFIG.questGlowDurationMs);

  if (!prefersReducedMotion()) {
    spawnConfetti();
  }
}

function recomputeLevelFromTotalXp() {
  const previousLevel = state.level;
  const progress = computeLevelProgress(state.totalXp);

  // Option A: ne pas faire redescendre le niveau si le total XP baisse.
  state.level = Math.max(previousLevel, progress.level);

  if (state.level > previousLevel) {
    onLevelUp(previousLevel, state.level);
  }
}

function renderLevel() {
  levelBadge.textContent = `Lv ${state.level}`;
}

function renderLevelProgress() {
  const stats = computeDisplayedProgress(state.level, state.totalXp);
  levelProgressText.textContent = `XP: ${stats.xpIntoLevel} / ${stats.xpNeeded}`;
  levelProgressRemaining.textContent = `Reste: ${Math.max(0, stats.xpNeeded - stats.xpIntoLevel)} XP`;
  levelProgressBar.style.width = `${stats.progress * 100}%`;
  levelProgressTrack.setAttribute("aria-valuemax", String(stats.xpNeeded));
  levelProgressTrack.setAttribute("aria-valuenow", String(stats.xpIntoLevel));
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
  renderLevelProgress();
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

function updateQuestButtonState(button, isCompleted) {
  button.textContent = isCompleted ? "Annuler" : "Terminer";
  button.classList.toggle("btn-completed", isCompleted);
  button.setAttribute("aria-pressed", String(isCompleted));
}

function applyDelta({ xpDelta = 0, goldDelta = 0 }) {
  const previous = { ...state };
  state.xp = Math.max(0, state.xp + xpDelta);
  state.totalXp = Math.max(0, state.totalXp + xpDelta);
  state.gold = Math.max(0, state.gold + goldDelta);

  recomputeLevelFromTotalXp();
  renderStats(previous);
  renderSessionProgress();
  renderQuests();
}

function animateQuestToggle(questItem) {
  questItem.classList.add("pop", "glow");
  setTimeout(() => questItem.classList.remove("pop"), UI_CONFIG.questPopDurationMs);
  setTimeout(() => questItem.classList.remove("glow"), UI_CONFIG.questGlowDurationMs);
}

function toggleQuest(questId) {
  if (processingQuestIds.has(questId)) return;

  const quest = QUESTS.find((entry) => entry.id === questId);
  if (!quest) return;

  processingQuestIds.add(questId);

  const isCompleted = state.completedQuestIds.includes(questId);

  if (isCompleted) {
    state.completedQuestIds = state.completedQuestIds.filter((id) => id !== questId);
    applyDelta({ xpDelta: -quest.xp, goldDelta: -quest.gold });
    showToast(`-${quest.xp} XP • -${quest.gold} Gold`);
  } else {
    state.completedQuestIds.push(questId);
    applyDelta({ xpDelta: quest.xp, goldDelta: quest.gold });
    showToast(`+${quest.xp} XP • +${quest.gold} Gold`);
    spawnConfetti();
    playDing();
  }

  saveState();

  const questItem = questsList.querySelector(`[data-quest-id="${questId}"]`);
  if (questItem) {
    animateQuestToggle(questItem);
  }

  setTimeout(() => {
    processingQuestIds.delete(questId);
  }, UI_CONFIG.questToggleCooldownMs);
}

function renderQuests() {
  questsList.innerHTML = "";

  for (const quest of QUESTS) {
    const isCompleted = state.completedQuestIds.includes(quest.id);

    const item = document.createElement("li");
    item.className = "quest";
    item.dataset.questId = quest.id;

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

    if (isCompleted) {
      item.classList.add("is-completed");
    }

    updateQuestButtonState(doneBtn, isCompleted);
    doneBtn.addEventListener("click", () => toggleQuest(quest.id));

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
  closeLevelUpModal();
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
  levelProgressText = document.getElementById("level-progress-text");
  levelProgressBar = document.getElementById("level-progress-bar");
  levelProgressTrack = document.getElementById("level-progress-track");
  levelProgressRemaining = document.getElementById("level-progress-remaining");
  toastRoot = document.getElementById("toast-root");
  confettiLayer = document.getElementById("confetti-layer");
  levelBadge = document.getElementById("level-badge");
  levelUpOverlay = document.getElementById("level-up-overlay");
  levelUpTitle = document.getElementById("level-up-title");
  levelUpMessage = document.getElementById("level-up-message");
  levelUpContinueBtn = document.getElementById("level-up-continue-btn");

  state = loadState();
  resetBtn.addEventListener("click", resetSession);
  setupLevelUpModalListeners();

  renderStats();
  renderSessionProgress();
  renderQuests();
}

document.addEventListener("DOMContentLoaded", initGame);
