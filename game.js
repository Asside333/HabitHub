const STORAGE_KEY = "habithub-state-v1";

const xpValue = document.getElementById("xp-value");
const goldValue = document.getElementById("gold-value");
const questsList = document.getElementById("quests-list");
const resetBtn = document.getElementById("reset-btn");

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return { ...INITIAL_STATE };

  try {
    const parsed = JSON.parse(raw);
    return {
      xp: Number(parsed.xp) || 0,
      gold: Number(parsed.gold) || 0,
    };
  } catch {
    return { ...INITIAL_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderStats() {
  xpValue.textContent = String(state.xp);
  goldValue.textContent = String(state.gold);
}

function completeQuest(quest) {
  state.xp += quest.xp;
  state.gold += quest.gold;
  saveState();
  renderStats();
}

function renderQuests() {
  questsList.innerHTML = "";

  for (const quest of QUESTS) {
    const item = document.createElement("li");
    item.className = "quest";

    const textWrap = document.createElement("div");
    const title = document.createElement("p");
    title.textContent = quest.name;
    const reward = document.createElement("p");
    reward.className = "reward";
    reward.textContent = `+${quest.xp} XP • +${quest.gold} Gold`;
    textWrap.append(title, reward);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn btn-primary";
    doneBtn.textContent = "Terminer";
    doneBtn.addEventListener("click", () => completeQuest(quest));

    item.append(textWrap, doneBtn);
    questsList.append(item);
  }
}

resetBtn.addEventListener("click", () => {
  state = { ...INITIAL_STATE };
  saveState();
  renderStats();
});

renderStats();
renderQuests();
