(function initHabitHub() {
  const { BASE_QUESTS, ICON_CATALOG, initialState: INITIAL_STATE, progression: PROGRESSION, ui: UI_CONFIG } = HRPG.CONFIG;

  const storage = {
    keys: {
      state: "habithub-state-v2",
      legacyState: "habithub-state-v1",
      custom: "habithub-quests-custom-v1",
      hidden: "habithub-quests-hidden-v1",
      overrides: "habithub-quests-overrides-v1",
    },
    loadJson(key, fallback) {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    saveJson(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    loadState() {
      const raw = localStorage.getItem(this.keys.state) ?? localStorage.getItem(this.keys.legacyState);
      if (!raw) return { ...INITIAL_STATE, completedQuestIds: [] };
      try {
        const parsed = JSON.parse(raw);
        const totalXp = Math.max(0, Number(parsed.totalXp ?? parsed.xp) || 0);
        const levelData = computeLevelProgress(totalXp);
        return {
          xp: Math.max(0, Number(parsed.xp) || 0),
          totalXp,
          gold: Math.max(0, Number(parsed.gold) || 0),
          level: Math.max(levelData.level, Number(parsed.level) || 1),
          completedQuestIds: Array.isArray(parsed.completedQuestIds) ? parsed.completedQuestIds.filter((id) => typeof id === "string") : [],
        };
      } catch {
        return { ...INITIAL_STATE, completedQuestIds: [] };
      }
    },
    saveState(state) {
      this.saveJson(this.keys.state, state);
    },
    loadCustomQuests() {
      const list = this.loadJson(this.keys.custom, []);
      if (!Array.isArray(list)) return [];
      return list.filter((entry) => entry && typeof entry.id === "string").map((entry) => sanitizeQuest(entry)).filter(Boolean);
    },
    saveCustomQuests(list) {
      this.saveJson(this.keys.custom, list);
    },
    loadHiddenIds() {
      const ids = this.loadJson(this.keys.hidden, []);
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    },
    saveHiddenIds(ids) {
      this.saveJson(this.keys.hidden, ids);
    },
    loadOverrides() {
      const obj = this.loadJson(this.keys.overrides, {});
      return obj && typeof obj === "object" ? obj : {};
    },
    saveOverrides(overrides) {
      this.saveJson(this.keys.overrides, overrides);
    },
  };

  const catalog = {
    baseMap: new Map(BASE_QUESTS.map((quest) => [quest.id, quest])),
    iconMap: new Map(ICON_CATALOG.map((icon) => [icon.key, icon])),
    getIcon(key) {
      return this.iconMap.get(key) || ICON_CATALOG[0];
    },
    getAllQuestsMerged() {
      const merged = BASE_QUESTS.map((quest) => this.mergeQuest(quest, true));
      state.customQuests.forEach((quest) => merged.push(this.mergeQuest(quest, false)));
      return merged;
    },
    getVisibleQuests() {
      return this.getAllQuestsMerged().filter((quest) => !state.hiddenQuestIds.includes(quest.id));
    },
    mergeQuest(quest, isSeed) {
      const override = state.questOverrides[quest.id] || {};
      return {
        ...quest,
        ...override,
        title: sanitizeTitle(override.title ?? quest.title),
        xp: clamp(Math.round(Number(override.xp ?? quest.xp) || 1), 1, 200),
        gold: clamp(Math.round(Number(override.gold ?? quest.gold) || 0), 0, 200),
        icon: this.iconMap.has(override.icon) ? override.icon : quest.icon,
        source: isSeed ? "seed" : "custom",
        isHidden: state.hiddenQuestIds.includes(quest.id),
        hasOverride: Boolean(state.questOverrides[quest.id]),
      };
    },
  };

  const ui = {
    refs: {},
    activeTab: "today",
    createFilter: "all",
    createSearch: "",
    iconSearch: "",
    selectedIds: new Set(),
    editor: { open: false, mode: "create", questId: null, icon: ICON_CATALOG[0].key },
    bindRefs() {
      this.refs = {
        tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
        tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
        questsList: document.getElementById("quests-list"),
        xp: document.getElementById("xp-value"),
        gold: document.getElementById("gold-value"),
        levelBadge: document.getElementById("level-badge"),
        sessionText: document.getElementById("session-progress-text"),
        sessionBar: document.getElementById("session-progress-bar"),
        sessionTrack: document.getElementById("session-progress-track"),
        levelText: document.getElementById("level-progress-text"),
        levelBar: document.getElementById("level-progress-bar"),
        levelTrack: document.getElementById("level-progress-track"),
        levelRemain: document.getElementById("level-progress-remaining"),
        resetBtn: document.getElementById("reset-btn"),
        catalogSearch: document.getElementById("catalog-search-input"),
        filterRow: document.getElementById("catalog-filters"),
        catalogList: document.getElementById("catalog-list"),
        bulkHideBtn: document.getElementById("bulk-hide-btn"),
        catalogResetBtn: document.getElementById("catalog-reset-btn"),
        newQuestBtn: document.getElementById("new-quest-btn"),
        editorModal: document.getElementById("quest-editor-modal"),
        editorTitle: document.getElementById("editor-title"),
        editorForm: document.getElementById("quest-editor-form"),
        editorName: document.getElementById("editor-title-input"),
        editorXp: document.getElementById("editor-xp-input"),
        editorGold: document.getElementById("editor-gold-input"),
        iconSearch: document.getElementById("icon-search-input"),
        iconGrid: document.getElementById("icon-grid"),
        editorError: document.getElementById("editor-error"),
        editorRestore: document.getElementById("editor-restore-btn"),
        editorDelete: document.getElementById("editor-delete-btn"),
        toastRoot: document.getElementById("toast-root"),
      };
    },
    showToast(message) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = message;
      this.refs.toastRoot.append(toast);
      setTimeout(() => toast.remove(), UI_CONFIG.toastDurationMs);
    },
  };

  let state = {
    game: storage.loadState(),
    customQuests: storage.loadCustomQuests(),
    hiddenQuestIds: storage.loadHiddenIds(),
    questOverrides: storage.loadOverrides(),
  };

  function sanitizeTitle(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function sanitizeQuest(quest) {
    const title = sanitizeTitle(quest.title);
    if (title.length < 2) return null;
    return {
      id: typeof quest.id === "string" ? quest.id : createQuestId(),
      title,
      xp: clamp(Math.round(Number(quest.xp) || 0), 1, 200),
      gold: clamp(Math.round(Number(quest.gold) || 0), 0, 200),
      icon: catalog.iconMap.has(quest.icon) ? quest.icon : ICON_CATALOG[0].key,
      createdAt: Number(quest.createdAt) || Date.now(),
    };
  }

  function createQuestId() {
    return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function xpForNextLevel(level) {
    return Math.max(1, Math.round(PROGRESSION.BASE_XP * PROGRESSION.GROWTH ** (Math.max(1, level) - 1)));
  }

  function computeLevelProgress(totalXp) {
    let level = 1;
    let remaining = Math.max(0, Math.floor(Number(totalXp) || 0));
    while (remaining >= xpForNextLevel(level)) {
      remaining -= xpForNextLevel(level);
      level += 1;
    }
    const xpNeeded = xpForNextLevel(level);
    return { level, xpIntoLevel: remaining, xpNeeded, xpRemaining: Math.max(0, xpNeeded - remaining), ratio: xpNeeded ? remaining / xpNeeded : 0 };
  }

  function persistCatalog() {
    storage.saveCustomQuests(state.customQuests);
    storage.saveHiddenIds(state.hiddenQuestIds);
    storage.saveOverrides(state.questOverrides);
  }

  function cleanupCompletedIds() {
    const validIds = new Set(catalog.getAllQuestsMerged().map((quest) => quest.id));
    state.game.completedQuestIds = state.game.completedQuestIds.filter((id) => validIds.has(id));
  }

  function getQuestById(id) {
    return catalog.getAllQuestsMerged().find((quest) => quest.id === id);
  }

  function applyDelta(xpDelta, goldDelta) {
    const beforeLevel = state.game.level;
    state.game.xp = Math.max(0, state.game.xp + xpDelta);
    state.game.totalXp = Math.max(0, state.game.totalXp + xpDelta);
    state.game.gold = Math.max(0, state.game.gold + goldDelta);
    const progress = computeLevelProgress(state.game.totalXp);
    if (progress.level > beforeLevel) {
      const bonus = PROGRESSION.LEVEL_UP_GOLD_BASE_BONUS + (progress.level - 1) * PROGRESSION.LEVEL_UP_GOLD_PER_LEVEL;
      state.game.gold += bonus;
      ui.showToast(`Level up ! +${bonus} Gold`);
    }
    state.game.level = progress.level;
  }

  function rollbackCompletedQuest(quest) {
    state.game.completedQuestIds = state.game.completedQuestIds.filter((id) => id !== quest.id);
    applyDelta(-quest.xp, -quest.gold);
  }

  function toggleQuestCompletion(questId) {
    const quest = getQuestById(questId);
    if (!quest || quest.isHidden) return;
    const completed = state.game.completedQuestIds.includes(questId);
    if (completed) {
      rollbackCompletedQuest(quest);
      ui.showToast(`-${quest.xp} XP • -${quest.gold} Gold`);
    } else {
      state.game.completedQuestIds.push(questId);
      applyDelta(quest.xp, quest.gold);
      ui.showToast(`+${quest.xp} XP • +${quest.gold} Gold`);
    }
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
  }

  function setOverride(id, patch) {
    const existing = state.questOverrides[id] || {};
    state.questOverrides[id] = { ...existing, ...patch };
    persistCatalog();
  }

  function clearOverride(id) {
    delete state.questOverrides[id];
    persistCatalog();
  }

  function toggleHidden(id, force) {
    const isHidden = state.hiddenQuestIds.includes(id);
    const nextHidden = typeof force === "boolean" ? force : !isHidden;
    if (nextHidden === isHidden) return;
    if (nextHidden) state.hiddenQuestIds.push(id);
    else state.hiddenQuestIds = state.hiddenQuestIds.filter((entry) => entry !== id);
    persistCatalog();
  }

  function renderStats() {
    ui.refs.xp.textContent = String(state.game.xp);
    ui.refs.gold.textContent = String(state.game.gold);
    ui.refs.levelBadge.textContent = `Lv ${state.game.level}`;

    const levelProgress = computeLevelProgress(state.game.totalXp);
    ui.refs.levelText.textContent = `XP: ${levelProgress.xpIntoLevel} / ${levelProgress.xpNeeded}`;
    ui.refs.levelBar.style.width = `${Math.round(levelProgress.ratio * 100)}%`;
    ui.refs.levelRemain.textContent = `Reste: ${levelProgress.xpRemaining} XP`;

    ui.refs.levelTrack.setAttribute("aria-valuenow", String(levelProgress.xpIntoLevel));
    ui.refs.levelTrack.setAttribute("aria-valuemax", String(levelProgress.xpNeeded));
  }

  function renderTodayTab() {
    const visibleQuests = catalog.getVisibleQuests();
    ui.refs.questsList.innerHTML = "";
    visibleQuests.forEach((quest) => {
      const isCompleted = state.game.completedQuestIds.includes(quest.id);
      const li = document.createElement("li");
      li.className = "quest";
      if (isCompleted) li.classList.add("is-completed");
      li.innerHTML = `
        <div class="quest-main">
          <div class="quest-icon">${catalog.getIcon(quest.icon).svg}</div>
          <div>
            <p class="quest-title">${isCompleted ? "✅" : "🎯"} ${quest.title}</p>
            <div class="reward-chips"><span class="chip chip-xp">+${quest.xp} XP</span><span class="chip chip-gold">+${quest.gold} Gold</span></div>
          </div>
        </div>
        <button class="btn btn-primary" data-action="toggle-complete" data-id="${quest.id}">${isCompleted ? "Annuler" : "Terminer"}</button>`;
      ui.refs.questsList.append(li);
    });

    const completedVisible = visibleQuests.filter((quest) => state.game.completedQuestIds.includes(quest.id)).length;
    ui.refs.sessionText.textContent = `${completedVisible} / ${visibleQuests.length}`;
    const ratio = visibleQuests.length ? completedVisible / visibleQuests.length : 0;
    ui.refs.sessionBar.style.width = `${Math.round(ratio * 100)}%`;
    ui.refs.sessionTrack.setAttribute("aria-valuenow", String(completedVisible));
    ui.refs.sessionTrack.setAttribute("aria-valuemax", String(visibleQuests.length));

    renderStats();
  }

  function getFilteredCatalog() {
    return catalog.getAllQuestsMerged().filter((quest) => {
      const text = `${quest.title} ${quest.id}`.toLowerCase();
      const searchOk = text.includes(ui.createSearch.toLowerCase());
      if (!searchOk) return false;
      const typeFilterOk = {
        all: true,
        visible: !quest.isHidden,
        hidden: quest.isHidden,
        custom: quest.source === "custom",
        seed: quest.source === "seed",
      }[ui.createFilter];
      return Boolean(typeFilterOk);
    });
  }

  function renderCreateFilters() {
    const filters = [
      { key: "all", label: "Toutes" },
      { key: "visible", label: "Visibles" },
      { key: "hidden", label: "Masquées" },
      { key: "custom", label: "Custom" },
      { key: "seed", label: "Seed" },
    ];
    ui.refs.filterRow.innerHTML = "";
    filters.forEach((filter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn btn-filter ${ui.createFilter === filter.key ? "is-active" : ""}`;
      btn.textContent = filter.label;
      btn.dataset.filter = filter.key;
      ui.refs.filterRow.append(btn);
    });
  }

  function renderCreateTab() {
    renderCreateFilters();
    const list = getFilteredCatalog();
    ui.refs.catalogList.innerHTML = "";
    list.forEach((quest) => {
      const card = document.createElement("li");
      card.className = "catalog-card";
      card.dataset.questId = quest.id;
      card.innerHTML = `
        <label class="select-check"><input type="checkbox" data-action="select-catalog" data-id="${quest.id}" ${ui.selectedIds.has(quest.id) ? "checked" : ""}/> </label>
        <div class="quest-main">
          <div class="quest-icon">${catalog.getIcon(quest.icon).svg}</div>
          <div>
            <p class="quest-title">${quest.title}</p>
            <div class="reward-chips"><span class="chip chip-xp">+${quest.xp} XP</span><span class="chip chip-gold">+${quest.gold} Gold</span></div>
            <div class="reward-chips"><span class="chip">${quest.source === "seed" ? "Seed" : "Custom"}</span><span class="chip">${quest.isHidden ? "Masquée" : "Visible"}</span>${quest.hasOverride ? '<span class="chip">Modifiée</span>' : ""}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" data-action="edit-quest" data-id="${quest.id}">Éditer</button>
          <button class="btn" data-action="toggle-hidden" data-id="${quest.id}">${quest.isHidden ? "Afficher" : "Masquer"}</button>
          ${quest.source === "custom" ? `<button class="btn btn-danger" data-action="delete-quest" data-id="${quest.id}">Supprimer</button>` : ""}
          ${quest.hasOverride ? `<button class="btn" data-action="restore-quest" data-id="${quest.id}">Restaurer</button>` : ""}
        </div>`;
      ui.refs.catalogList.append(card);
    });
  }

  function renderIconGrid() {
    ui.refs.iconGrid.innerHTML = "";
    ICON_CATALOG.filter((icon) => `${icon.label} ${icon.key}`.toLowerCase().includes(ui.iconSearch.toLowerCase())).forEach((icon) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `icon-btn ${ui.editor.icon === icon.key ? "is-selected" : ""}`;
      btn.dataset.icon = icon.key;
      btn.title = icon.label;
      btn.setAttribute("aria-label", icon.label);
      btn.innerHTML = icon.svg;
      ui.refs.iconGrid.append(btn);
    });
  }

  function openQuestEditor(mode, questId) {
    ui.editor = { ...ui.editor, open: true, mode, questId: questId || null, icon: ICON_CATALOG[0].key };
    const quest = questId ? getQuestById(questId) : null;
    ui.refs.editorTitle.textContent = mode === "create" ? "Nouvelle habitude" : `Éditer: ${quest.title}`;
    ui.refs.editorName.value = quest ? quest.title : "";
    ui.refs.editorXp.value = quest ? String(quest.xp) : "10";
    ui.refs.editorGold.value = quest ? String(quest.gold) : "5";
    ui.editor.icon = quest ? quest.icon : ICON_CATALOG[0].key;
    ui.refs.editorRestore.hidden = !(quest && quest.hasOverride);
    ui.refs.editorDelete.hidden = !(quest && quest.source === "custom");
    ui.refs.editorError.textContent = "";
    ui.refs.editorModal.hidden = false;
    document.body.classList.add("modal-open");
    renderIconGrid();
  }

  function closeQuestEditor() {
    ui.refs.editorModal.hidden = true;
    document.body.classList.remove("modal-open");
    ui.editor.open = false;
  }

  function validateEditorForm() {
    const title = sanitizeTitle(ui.refs.editorName.value);
    const xp = Number(ui.refs.editorXp.value);
    const gold = Number(ui.refs.editorGold.value);
    if (title.length < 2 || title.length > 40) return { error: "Le nom doit faire entre 2 et 40 caractères." };
    if (!Number.isInteger(xp) || xp < 1 || xp > 200) return { error: "XP doit être un entier entre 1 et 200." };
    if (!Number.isInteger(gold) || gold < 0 || gold > 200) return { error: "Gold doit être un entier entre 0 et 200." };
    return { value: { title, xp, gold, icon: ui.editor.icon } };
  }

  function saveEditor() {
    const validation = validateEditorForm();
    if (validation.error) {
      ui.refs.editorError.textContent = validation.error;
      return;
    }
    const payload = validation.value;

    if (ui.editor.mode === "create") {
      state.customQuests.push({ id: createQuestId(), ...payload, createdAt: Date.now() });
      persistCatalog();
      ui.showToast("Enregistré ✅");
    } else {
      const quest = getQuestById(ui.editor.questId);
      if (!quest) return;
      if (quest.source === "custom") {
        const index = state.customQuests.findIndex((entry) => entry.id === quest.id);
        const oldQuest = state.customQuests[index];
        state.customQuests[index] = { ...oldQuest, ...payload };
        if (state.game.completedQuestIds.includes(quest.id)) applyDelta(payload.xp - oldQuest.xp, payload.gold - oldQuest.gold);
      } else {
        setOverride(quest.id, payload);
      }
      persistCatalog();
      storage.saveState(state.game);
      ui.showToast("Enregistré ✅");
    }

    cleanupCompletedIds();
    closeQuestEditor();
    renderTodayTab();
    renderCreateTab();
  }

  function handleToggleHidden(id) {
    const quest = getQuestById(id);
    if (!quest) return;
    if (!quest.isHidden && state.game.completedQuestIds.includes(id)) {
      const rollback = window.confirm("Cette quête est complétée. La masquer doit-elle annuler ses gains ?\nOK = oui, Annuler = non.");
      if (rollback) rollbackCompletedQuest(quest);
    }
    toggleHidden(id);
    cleanupCompletedIds();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
  }

  function deleteCustomQuest(id) {
    const quest = getQuestById(id);
    if (!quest || quest.source !== "custom") return;
    if (!window.confirm(`Supprimer \"${quest.title}\" ?`)) return;
    if (state.game.completedQuestIds.includes(id)) {
      const rollback = window.confirm("Cette quête est complétée. Supprimer doit-il annuler ses gains ?\nOK = oui, Annuler = non.");
      if (rollback) rollbackCompletedQuest(quest);
    }
    state.customQuests = state.customQuests.filter((entry) => entry.id !== id);
    state.hiddenQuestIds = state.hiddenQuestIds.filter((entry) => entry !== id);
    delete state.questOverrides[id];
    persistCatalog();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
    ui.showToast("Habitude supprimée");
  }

  function resetProgressOnly() {
    if (!window.confirm("Restart : réinitialiser XP/Gold/Niveau/progression ?")) return;
    state.game = { ...INITIAL_STATE, completedQuestIds: [] };
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
    ui.showToast("Progression réinitialisée");
  }

  function resetCatalogOnly() {
    if (!window.confirm("Réinitialiser tout le catalogue custom ?")) return;
    if (!window.confirm("Confirmer une 2e fois : supprimer custom + masques + overrides ?")) return;
    state.customQuests = [];
    state.hiddenQuestIds = [];
    state.questOverrides = {};
    persistCatalog();
    cleanupCompletedIds();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
    ui.showToast("Catalogue réinitialisé");
  }

  function attachEvents() {
    ui.refs.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        ui.activeTab = button.dataset.tabTarget;
        ui.refs.tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
        ui.refs.tabPanels.forEach((panel) => {
          panel.hidden = panel.dataset.tabPanel !== ui.activeTab;
        });
      });
    });

    ui.refs.questsList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='toggle-complete']");
      if (button) toggleQuestCompletion(button.dataset.id);
    });

    ui.refs.catalogSearch.addEventListener("input", () => {
      ui.createSearch = ui.refs.catalogSearch.value;
      renderCreateTab();
    });

    ui.refs.filterRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      ui.createFilter = button.dataset.filter;
      renderCreateTab();
    });

    ui.refs.catalogList.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      const { id } = action.dataset;
      if (action.dataset.action === "edit-quest") openQuestEditor("edit", id);
      if (action.dataset.action === "toggle-hidden") handleToggleHidden(id);
      if (action.dataset.action === "delete-quest") deleteCustomQuest(id);
      if (action.dataset.action === "restore-quest") {
        clearOverride(id);
        renderTodayTab();
        renderCreateTab();
      }
    });

    ui.refs.catalogList.addEventListener("change", (event) => {
      const check = event.target.closest("[data-action='select-catalog']");
      if (!check) return;
      if (check.checked) ui.selectedIds.add(check.dataset.id);
      else ui.selectedIds.delete(check.dataset.id);
    });

    ui.refs.bulkHideBtn.addEventListener("click", () => {
      Array.from(ui.selectedIds).forEach((id) => toggleHidden(id, true));
      ui.selectedIds.clear();
      renderTodayTab();
      renderCreateTab();
    });

    ui.refs.newQuestBtn.addEventListener("click", () => openQuestEditor("create"));
    ui.refs.resetBtn.addEventListener("click", resetProgressOnly);
    ui.refs.catalogResetBtn.addEventListener("click", resetCatalogOnly);

    ui.refs.editorModal.addEventListener("click", (event) => {
      const close = event.target.closest("[data-action='close-editor']");
      if (close) closeQuestEditor();
    });

    ui.refs.iconSearch.addEventListener("input", () => {
      ui.iconSearch = ui.refs.iconSearch.value;
      renderIconGrid();
    });

    ui.refs.iconGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-icon]");
      if (!button) return;
      ui.editor.icon = button.dataset.icon;
      renderIconGrid();
    });

    ui.refs.editorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveEditor();
    });

    ui.refs.editorRestore.addEventListener("click", () => {
      if (!ui.editor.questId) return;
      clearOverride(ui.editor.questId);
      closeQuestEditor();
      renderTodayTab();
      renderCreateTab();
    });

    ui.refs.editorDelete.addEventListener("click", () => {
      if (!ui.editor.questId) return;
      closeQuestEditor();
      deleteCustomQuest(ui.editor.questId);
    });
  }

  function init() {
    ui.bindRefs();
    cleanupCompletedIds();
    attachEvents();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
