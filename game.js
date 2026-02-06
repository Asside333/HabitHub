const STORAGE_KEY = "habithub-state-v2";
const LEGACY_STORAGE_KEY = "habithub-state-v1";

const xpValue = document.getElementById("xp-value");
const goldValue = document.getElementById("gold-value");
const questsList = document.getElementById("quests-list");
const resetBtn = document.getElementById("reset-btn");
const sessionProgressText = document.getElementById("session-progress-text");
const sessionProgressBar = document.getElementById("session-progress-bar");
const progressTrack = document.querySelector(".progress-track");
const toastRoot = document.getElementById("toast-root");
const confettiLayer = document.getElementById("confetti-layer");

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = loadState();
let audioContext = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!raw) return { ...INITIAL_STATE };

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
    return { ...INITIAL_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function prefersReducedMotion() {
  return reducedMotionQuery.matches;
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

  const colors = ["#58cc6c", "#4f8dff", "#f6c54b", "#ff7e8c"];

  for (let i = 0; i < 18; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${10 + Math.random() * 80}%`;
    piece.style.top = `${10 + Math.random() * 20}%`;
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    confettiLayer.append(piece);

    setTimeout(() => piece.remove(), UI_CONFIG.confettiDurationMs + 200);
  }
}

function completeQuest(quest, questItem, button, title) {
  if (state.completedQuestIds.includes(quest.id)) return;

  const previous = { ...state };
  state.xp += quest.xp;
  state.gold += quest.gold;
  state.completedQuestIds.push(quest.id);

  saveState();
  renderStats(previous);
  renderSessionProgress();

  questItem.classList.add("is-completed", "pop");
  setTimeout(() => questItem.classList.remove("pop"), 380);

  title.textContent = `✅ ${quest.name}`;
  button.textContent = "Terminé ✓";
  button.disabled = true;
  button.classList.add("btn-completed");

  showToast(`+${quest.xp} XP • +${quest.gold} Gold`);
  spawnConfetti();
  playDing();
}

function renderQuests() {
  questsList.innerHTML = "";

  for (const quest of QUESTS) {
    const isCompleted = state.completedQuestIds.includes(quest.id);

    const item = document.createElement("li");
    item.className = "quest";
    if (isCompleted) item.classList.add("is-completed");

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

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn btn-primary";
    doneBtn.textContent = isCompleted ? "Terminé ✓" : "Terminer";
    doneBtn.disabled = isCompleted;
    if (isCompleted) doneBtn.classList.add("btn-completed");

    doneBtn.addEventListener("click", () => completeQuest(quest, item, doneBtn, title));

    item.append(textWrap, doneBtn);
    questsList.append(item);
  }
}

resetBtn.addEventListener("click", () => {
  state = { ...INITIAL_STATE };
  saveState();
  renderStats({ ...state });
  renderSessionProgress();
  renderQuests();
  showToast("Progression réinitialisée");
});

renderStats();
renderSessionProgress();
renderQuests();
