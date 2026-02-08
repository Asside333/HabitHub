const STORAGE_KEY = "habithub-state-v2";
const LEGACY_STORAGE_KEY = "habithub-state-v1";
const CUSTOM_QUESTS_STORAGE_KEY = "habithub-quests-custom-v1";

let xpValue;
let goldValue;
let questsList;
let customQuestsList;
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
let tabButtons;
let tabPanels;
let questForm;
let questTitleInput;
let questXpInput;
let questGoldInput;
let questIconSelect;
let questSubmitBtn;
let questCancelEditBtn;
let titleError;
let numbersError;
let editWarning;
let createdCount;

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let state;
let customQuests = [];
let editingQuestId = null;
let audioContext = null;

const processingQuestIds = new Set();

const ICONS = {
  water: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M12 2c3.2 4 6.5 7.4 6.5 11.2A6.5 6.5 0 1 1 5.5 13.2C5.5 9.4 8.8 6 12 2z"/></svg>',
  walk: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><circle cx="14" cy="5" r="2.5"/><path d="M7 13.5 11 9l2 1.6V15l2.6 4H13l-2.4-3.6L8.4 18H6l2.2-4.5L7 13.5z"/></svg>',
  book: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11c1.2 0 2.3.4 3 1.2.7-.8 1.8-1.2 3-1.2h1.5c.8 0 1.5.7 1.5 1.5V18c0 .6-.4 1-1 1H17c-1.2 0-2.3.4-3 1.2-.7-.8-1.8-1.2-3-1.2H5c-.6 0-1-.4-1-1V5.5z"/></svg>',
  gym: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M2 10h3v4H2v-4zm17 0h3v4h-3v-4zM6 8h2v8H6V8zm10 0h2v8h-2V8zM9 11h6v2H9v-2z"/></svg>',
  meditation: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><path d="M7.2 13.5c1.2-2 2.7-3.2 4.8-3.2s3.6 1.2 4.8 3.2L15 15.2c-.8-1.3-1.8-2-3-2s-2.2.7-3 2l-1.8-1.7zM6 19c0-2.4 2.6-3.8 6-3.8s6 1.4 6 3.8v1H6v-1z"/></svg>',
  cleanup: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M8 5h8l-.7 14.2A2 2 0 0 1 13.3 21h-2.6a2 2 0 0 1-2-1.8L8 5zm-2 0h12v2H6V5zm3-2h6v2H9V3z"/></svg>',
  work: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm5-3h6a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2z"/></svg>',
  music: '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M15 4v10.8a3.2 3.2 0 1 1-2-3V7.3l8-2v8.5a3.2 3.2 0 1 1-2-3V4h-4z"/></svg>',
};

function getAllQuests() {
  const seen = new Set();
  const merged = [];

  for (const quest of BASE_QUESTS) {
    if (!seen.has(quest.id)) {
      seen.add(quest.id);
      merged.push(quest);
    }
  }

  for (const quest of customQuests) {
    if (!seen.has(quest.id)) {
      seen.add(quest.id);
      merged.push(quest);
    }
  }

  return merged;
}

function createInitialState() {
  return {
    xp: INITIAL_STATE.xp,
    totalXp: INITIAL_STATE.totalXp,
    level: INITIAL_STATE.level,
    gold: INITIAL_STATE.gold,
    completedQuestIds: [],
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw);
    const safeXp = Math.max(0, Number(parsed.xp) || 0);
    const safeTotalXp = Math.max(0, Number(parsed.totalXp ?? parsed.xp) || 0);
    const levelProgress = computeLevelProgress(safeTotalXp);

    return {
      xp: safeXp,
      totalXp: safeTotalXp,
      level: Math.max(levelProgress.level, Number(parsed.level) || 1),
      gold: Math.max(0, Number(parsed.gold) || 0),
      completedQuestIds: Array.isArray(parsed.completedQuestIds)
        ? parsed.completedQuestIds.filter((id) => typeof id === "string")
        : [],
    };
  } catch {
    return createInitialState();
  }
}

function loadCustomQuests() {
  const raw = localStorage.getItem(CUSTOM_QUESTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((quest) => quest && typeof quest === "object")
      .map((quest) => ({
        id: typeof quest.id === "string" ? quest.id : `q_${Date.now().toString(36)}`,
        title: sanitizeTitle(quest.title),
        xp: clamp(Number(quest.xp) || 0, 1, 200),
        gold: clamp(Number(quest.gold) || 0, 0, 200),
        icon: ICON_OPTIONS.includes(quest.icon) ? quest.icon : ICON_OPTIONS[0],
        createdAt: Number(quest.createdAt) || Date.now(),
      }))
      .filter((quest) => quest.title.length >= 2);
  } catch {
    return [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveCustomQuests() {
  localStorage.setItem(CUSTOM_QUESTS_STORAGE_KEY, JSON.stringify(customQuests));
}

function sanitizeTitle(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function createQuestId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

  return { level, xpIntoLevel, xpNeeded, progress: clamp(xpIntoLevel / xpNeeded, 0, 1) };
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

  return { xpIntoLevel, xpNeeded, progress: clamp(xpIntoLevel / xpNeeded, 0, 1) };
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
  requestAnimationFrame(() => levelUpContinueBtn?.focus());
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

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const closeButton = event.target.closest('[data-action="close-levelup"]');
    if (closeButton || event.target === levelUpOverlay) closeLevelUpModal();
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLevelUpModal();
  }, { signal });
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
  if (!prefersReducedMotion()) spawnConfetti();
}

function recomputeLevelFromTotalXp() {
  const previousLevel = state.level;
  const progress = computeLevelProgress(state.totalXp);
  state.level = Math.max(previousLevel, progress.level);
  if (state.level > previousLevel) onLevelUp(previousLevel, state.level);
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
    element.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
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
  const quests = getAllQuests();
  const validIds = new Set(quests.map((quest) => quest.id));
  const doneCount = state.completedQuestIds.filter((id) => validIds.has(id)).length;
  const total = quests.length;
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
  setTimeout(() => toast.remove(), UI_CONFIG.toastDurationMs);
}

function playDing() {
  if (prefersReducedMotion()) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!audioContext) audioContext = new AudioCtx();

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

function getQuestIconSvg(iconKey) {
  return ICONS[iconKey] || '<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
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
  renderCustomQuests();
}

function animateQuestToggle(questItem) {
  questItem.classList.add("pop", "glow");
  setTimeout(() => questItem.classList.remove("pop"), UI_CONFIG.questPopDurationMs);
  setTimeout(() => questItem.classList.remove("glow"), UI_CONFIG.questGlowDurationMs);
}

function findQuestById(questId) {
  return getAllQuests().find((entry) => entry.id === questId);
}

function cleanupCompletedIds() {
  const validIds = new Set(getAllQuests().map((quest) => quest.id));
  state.completedQuestIds = state.completedQuestIds.filter((id) => validIds.has(id));
}

function toggleQuest(questId) {
  if (processingQuestIds.has(questId)) return;

  const quest = findQuestById(questId);
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
  if (questItem) animateQuestToggle(questItem);

  setTimeout(() => processingQuestIds.delete(questId), UI_CONFIG.questToggleCooldownMs);
}

function renderQuestItem(quest, showActions = false) {
  const isCompleted = state.completedQuestIds.includes(quest.id);
  const item = document.createElement("li");
  item.className = "quest";
  item.dataset.questId = quest.id;

  if (isCompleted) item.classList.add("is-completed");

  const questMain = document.createElement("div");
  questMain.className = "quest-main";

  const icon = document.createElement("div");
  icon.className = "quest-icon";
  icon.innerHTML = getQuestIconSvg(quest.icon);

  const textWrap = document.createElement("div");
  const title = document.createElement("p");
  title.className = "quest-title";
  title.textContent = `${isCompleted && !showActions ? "✅ " : "🎯 "}${quest.title}`;

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

  item.append(questMain);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "quest-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", () => startEditingQuest(quest.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", () => deleteCustomQuest(quest.id));

    actions.append(editBtn, deleteBtn);
    item.append(actions);
  } else {
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn btn-primary";
    updateQuestButtonState(doneBtn, isCompleted);
    doneBtn.addEventListener("click", () => toggleQuest(quest.id));
    item.append(doneBtn);
  }

  return item;
}

function renderQuests() {
  questsList.innerHTML = "";
  const quests = getAllQuests();
  quests.forEach((quest) => questsList.append(renderQuestItem(quest, false)));
}

function renderCustomQuests() {
  customQuestsList.innerHTML = "";
  customQuests
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((quest) => customQuestsList.append(renderQuestItem(quest, true)));

  createdCount.textContent = `Habitudes créées : ${customQuests.length}`;
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  });
}

function initTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
  });
}

function fillIconSelect() {
  questIconSelect.innerHTML = "";
  ICON_OPTIONS.forEach((iconKey) => {
    const option = document.createElement("option");
    option.value = iconKey;
    option.textContent = iconKey;
    questIconSelect.append(option);
  });
}

function clearFormErrors() {
  titleError.textContent = "";
  numbersError.textContent = "";
  editWarning.textContent = "";
}

function validateForm() {
  clearFormErrors();
  const title = sanitizeTitle(questTitleInput.value);
  const xp = Number(questXpInput.value);
  const gold = Number(questGoldInput.value);

  let isValid = true;

  if (title.length < 2 || title.length > 40) {
    titleError.textContent = "Le nom doit faire entre 2 et 40 caractères.";
    isValid = false;
  }

  if (!Number.isFinite(xp) || xp < 1 || xp > 200 || !Number.isInteger(xp)) {
    numbersError.textContent = "XP doit être un entier entre 1 et 200.";
    isValid = false;
  }

  if (!Number.isFinite(gold) || gold < 0 || gold > 200 || !Number.isInteger(gold)) {
    numbersError.textContent = "Gold doit être un entier entre 0 et 200.";
    isValid = false;
  }

  return {
    isValid,
    value: {
      title,
      xp: clamp(Math.round(xp), 1, 200),
      gold: clamp(Math.round(gold), 0, 200),
      icon: ICON_OPTIONS.includes(questIconSelect.value) ? questIconSelect.value : ICON_OPTIONS[0],
    },
  };
}

function resetQuestForm() {
  editingQuestId = null;
  questForm.reset();
  questXpInput.value = "10";
  questGoldInput.value = "5";
  questIconSelect.value = ICON_OPTIONS[0];
  questSubmitBtn.textContent = "Ajouter";
  questCancelEditBtn.hidden = true;
  clearFormErrors();
}

function startEditingQuest(questId) {
  const quest = customQuests.find((entry) => entry.id === questId);
  if (!quest) return;

  editingQuestId = questId;
  questTitleInput.value = quest.title;
  questXpInput.value = String(quest.xp);
  questGoldInput.value = String(quest.gold);
  questIconSelect.value = quest.icon;
  questSubmitBtn.textContent = "Mettre à jour";
  questCancelEditBtn.hidden = false;

  if (state.completedQuestIds.includes(questId)) {
    editWarning.textContent = "Cette quête est déjà complétée : on recalcule les gains immédiatement.";
  } else {
    editWarning.textContent = "";
  }

  setActiveTab("create");
}

function updateCompletedQuestRewards(questId, oldQuest, newQuest) {
  if (!state.completedQuestIds.includes(questId)) return;
  const xpDelta = newQuest.xp - oldQuest.xp;
  const goldDelta = newQuest.gold - oldQuest.gold;
  if (xpDelta === 0 && goldDelta === 0) return;
  applyDelta({ xpDelta, goldDelta });
}

function upsertCustomQuest(payload) {
  if (editingQuestId) {
    const index = customQuests.findIndex((quest) => quest.id === editingQuestId);
    if (index === -1) return;

    const oldQuest = customQuests[index];
    const updatedQuest = {
      ...oldQuest,
      title: payload.title,
      xp: payload.xp,
      gold: payload.gold,
      icon: payload.icon,
    };

    customQuests[index] = updatedQuest;
    updateCompletedQuestRewards(editingQuestId, oldQuest, updatedQuest);
    showToast("Habitude mise à jour ✨");
  } else {
    customQuests.push({
      id: createQuestId(),
      title: payload.title,
      xp: payload.xp,
      gold: payload.gold,
      icon: payload.icon,
      createdAt: Date.now(),
    });
    showToast("Habitude ajoutée ✅");
  }

  saveCustomQuests();
  saveState();
  cleanupCompletedIds();
  renderSessionProgress();
  renderQuests();
  renderCustomQuests();
  resetQuestForm();
}

function deleteCustomQuest(questId) {
  const quest = customQuests.find((entry) => entry.id === questId);
  if (!quest) return;

  const accepted = window.confirm(`Supprimer "${quest.title}" ?`);
  if (!accepted) return;

  if (state.completedQuestIds.includes(questId)) {
    state.completedQuestIds = state.completedQuestIds.filter((id) => id !== questId);
    applyDelta({ xpDelta: -quest.xp, goldDelta: -quest.gold });
  }

  customQuests = customQuests.filter((entry) => entry.id !== questId);

  if (editingQuestId === questId) {
    resetQuestForm();
  }

  saveCustomQuests();
  saveState();
  cleanupCompletedIds();
  renderSessionProgress();
  renderQuests();
  renderCustomQuests();
  showToast("Habitude supprimée");
}

function onQuestFormSubmit(event) {
  event.preventDefault();
  const result = validateForm();
  if (!result.isValid) return;
  upsertCustomQuest(result.value);
}

function resetSession() {
  const accepted = window.confirm("Redémarrer la session ? Toutes les stats et quêtes seront remises à zéro.");
  if (!accepted) return;

  const previous = { ...state };
  state = createInitialState();
  processingQuestIds.clear();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  renderStats(previous);
  renderSessionProgress();
  renderQuests();
  renderCustomQuests();
  closeLevelUpModal();
  showToast("Session réinitialisée");
}

function initGame() {
  xpValue = document.getElementById("xp-value");
  goldValue = document.getElementById("gold-value");
  questsList = document.getElementById("quests-list");
  customQuestsList = document.getElementById("custom-quests-list");
  resetBtn = document.getElementById("reset-btn");
  sessionProgressText = document.getElementById("session-progress-text");
  sessionProgressBar = document.getElementById("session-progress-bar");
  progressTrack = document.getElementById("session-progress-track");
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
  tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  questForm = document.getElementById("quest-form");
  questTitleInput = document.getElementById("quest-title-input");
  questXpInput = document.getElementById("quest-xp-input");
  questGoldInput = document.getElementById("quest-gold-input");
  questIconSelect = document.getElementById("quest-icon-select");
  questSubmitBtn = document.getElementById("quest-submit-btn");
  questCancelEditBtn = document.getElementById("quest-cancel-edit-btn");
  titleError = document.getElementById("title-error");
  numbersError = document.getElementById("numbers-error");
  editWarning = document.getElementById("edit-warning");
  createdCount = document.getElementById("created-count");

  state = loadState();
  customQuests = loadCustomQuests();
  cleanupCompletedIds();

  fillIconSelect();
  resetQuestForm();
  initTabs();
  setupLevelUpModalListeners();

  resetBtn.addEventListener("click", resetSession);
  questForm.addEventListener("submit", onQuestFormSubmit);
  questCancelEditBtn.addEventListener("click", resetQuestForm);

  renderStats();
  renderSessionProgress();
  renderQuests();
  renderCustomQuests();
  saveState();
}

document.addEventListener("DOMContentLoaded", initGame);
