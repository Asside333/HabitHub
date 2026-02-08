(function initHabitHub() {
  // === SECTION: Config access ===
  const { BASE_QUESTS, ICON_CATALOG, initialGameState: INITIAL_GAME_STATE, progressionConfig: PROGRESSION_CONFIG, progression: PROGRESSION, ui: UI_CONFIG } = HRPG.CONFIG;

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function createInitialGameState() {
    const seed = cloneJson(INITIAL_GAME_STATE);
    seed.quests.completedQuestIds = Array.isArray(seed.quests.completedQuestIds) ? seed.quests.completedQuestIds : [];
    seed.completedQuestIds = seed.quests.completedQuestIds;
    seed.xp = seed.currencies.xp;
    seed.gold = seed.currencies.gold;
    seed.totalXp = seed.currencies.totalXp;
    seed.level = seed.progress.level;
    return seed;
  }

  function sanitizeEventLog(value) {
    if (!Array.isArray(value)) return [];
    const maxEntries = Math.max(1, Number(PROGRESSION_CONFIG.antiExploit?.eventLogMaxEntries) || 200);
    return value
      .filter((entry) => entry && typeof entry.type === "string")
      .map((entry) => ({
        timestamp: typeof entry.timestamp === "string" ? entry.timestamp : (typeof entry.at === "string" ? entry.at : new Date().toISOString()),
        type: entry.type,
        payload: entry.payload && typeof entry.payload === "object" ? entry.payload : {},
      }))
      .slice(-maxEntries);
  }

  function sanitizeRewardClaims(value) {
    if (!value || typeof value !== "object") return {};
    return Object.entries(value).reduce((acc, [key, claim]) => {
      if (typeof key !== "string" || !claim || typeof claim !== "object") return acc;
      const xp = Math.max(0, Number(claim.xp) || 0);
      const gold = Math.max(0, Number(claim.gold) || 0);
      const claimedAt = typeof claim.claimedAt === "string" ? claim.claimedAt : new Date().toISOString();
      acc[key] = { claimedAt, xp, gold };
      return acc;
    }, {});
  }

  function sanitizeDailyState(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      dateKey: typeof raw.dateKey === "string" ? raw.dateKey : null,
      objectivesCompleted: Math.max(0, Math.floor(Number(raw.objectivesCompleted) || 0)),
      tier: typeof raw.tier === "string" ? raw.tier : "none",
      tierBonusGoldApplied: Math.max(0, Math.floor(Number(raw.tierBonusGoldApplied) || 0)),
      vacationMode: raw.vacationMode === true,
    };
  }

  function sanitizeCycles(rawCycles) {
    const raw = rawCycles && typeof rawCycles === "object" ? rawCycles : {};
    const weeklyRaw = raw.weekly && typeof raw.weekly === "object" ? raw.weekly : {};
    const monthlyRaw = raw.monthly && typeof raw.monthly === "object" ? raw.monthly : {};
    const yearlyRaw = raw.yearly && typeof raw.yearly === "object" ? raw.yearly : {};
    return {
      weekly: {
        weekKey: typeof weeklyRaw.weekKey === "string" ? weeklyRaw.weekKey : null,
        days: weeklyRaw.days && typeof weeklyRaw.days === "object" ? weeklyRaw.days : {},
        score: Math.max(0, Math.floor(Number(weeklyRaw.score) || 0)),
        chestTierId: typeof weeklyRaw.chestTierId === "string" ? weeklyRaw.chestTierId : null,
        chestClaimed: weeklyRaw.chestClaimed === true,
        bossMaxHp: Math.max(0, Math.floor(Number(weeklyRaw.bossMaxHp) || 0)),
        bossHp: Math.max(0, Math.floor(Number(weeklyRaw.bossHp) || 0)),
        bossDefeated: weeklyRaw.bossDefeated === true,
      },
      weeklyArchives: Array.isArray(raw.weeklyArchives) ? raw.weeklyArchives.filter((entry) => entry && typeof entry.weekKey === "string") : [],
      bossStreak: Math.max(0, Math.floor(Number(raw.bossStreak) || 0)),
      monthly: {
        monthKey: typeof monthlyRaw.monthKey === "string" ? monthlyRaw.monthKey : null,
        points: Math.max(0, Math.floor(Number(monthlyRaw.points) || 0)),
        badgeId: typeof monthlyRaw.badgeId === "string" ? monthlyRaw.badgeId : null,
      },
      yearly: {
        yearKey: typeof yearlyRaw.yearKey === "string" ? yearlyRaw.yearKey : null,
        points: Math.max(0, Math.floor(Number(yearlyRaw.points) || 0)),
        relicsUnlocked: Array.isArray(yearlyRaw.relicsUnlocked) ? yearlyRaw.relicsUnlocked.filter((id) => typeof id === "string") : [],
        milestonesClaimed: Array.isArray(yearlyRaw.milestonesClaimed) ? yearlyRaw.milestonesClaimed.filter((id) => typeof id === "string") : [],
      },
      cosmeticInventory: Array.isArray(raw.cosmeticInventory) ? raw.cosmeticInventory.filter((id) => typeof id === "string") : [],
      badgesUnlocked: Array.isArray(raw.badgesUnlocked) ? raw.badgesUnlocked.filter((id) => typeof id === "string") : [],
    };
  }

  function normalizeGameState(rawState) {
    const fallback = createInitialGameState();
    if (!rawState || typeof rawState !== "object") return fallback;

    const legacyCompleted = Array.isArray(rawState.completedQuestIds) ? rawState.completedQuestIds : [];
    const nestedCompleted = rawState.quests && Array.isArray(rawState.quests.completedQuestIds) ? rawState.quests.completedQuestIds : legacyCompleted;
    const completedQuestIds = nestedCompleted.filter((id) => typeof id === "string");

    const totalXp = clamp(Number(rawState.totalXp ?? rawState.currencies?.totalXp ?? rawState.xp ?? rawState.currencies?.xp) || 0, 0, Number.MAX_SAFE_INTEGER);
    const progressData = computeLevelProgress(totalXp);
    const xp = clamp(Number(rawState.xp ?? rawState.currencies?.xp) || 0, 0, Number.MAX_SAFE_INTEGER);
    const gold = clamp(Number(rawState.gold ?? rawState.currencies?.gold) || 0, 0, Number.MAX_SAFE_INTEGER);
    const level = Math.max(progressData.level, Number(rawState.level ?? rawState.progress?.level) || 1);

    const next = {
      v: clamp(Math.floor(Number(rawState.v) || 1), 1, 999),
      currencies: {
        xp,
        gold,
        totalXp,
        tokens: Math.max(0, Number(rawState.currencies?.tokens) || 0),
      },
      daily: sanitizeDailyState(rawState.daily),
      progress: {
        level,
        streak: Math.max(0, Number(rawState.progress?.streak) || 0),
        lastActiveDate: typeof rawState.progress?.lastActiveDate === "string" ? rawState.progress.lastActiveDate : null,
        lastTier: typeof rawState.progress?.lastTier === "string" ? rawState.progress.lastTier : "none",
        streakShield: Math.max(0, Math.min(1, Number(rawState.progress?.streakShield) || 0)),
        restDaysUsedByWeek: rawState.progress?.restDaysUsedByWeek && typeof rawState.progress.restDaysUsedByWeek === "object" ? rawState.progress.restDaysUsedByWeek : {},
        vacationDaysRemaining: Math.max(0, Number(rawState.progress?.vacationDaysRemaining ?? PROGRESSION_CONFIG.streakRules?.vacationRules?.maxDaysPerYear) || 0),
        lastShieldRefillMonth: typeof rawState.progress?.lastShieldRefillMonth === "string" ? rawState.progress.lastShieldRefillMonth : null,
      },
      quests: {
        completedQuestIds,
      },
      claims: {
        rewardClaims: sanitizeRewardClaims(rawState.claims?.rewardClaims),
        tierClaims: rawState.claims?.tierClaims && typeof rawState.claims.tierClaims === "object" ? rawState.claims.tierClaims : {},
        chestClaims: rawState.claims?.chestClaims && typeof rawState.claims.chestClaims === "object" ? rawState.claims.chestClaims : {},
      },
      logs: {
        eventLog: sanitizeEventLog(rawState.logs?.eventLog),
      },
      debug: {
        useDebugDate: rawState.debug?.useDebugDate === true,
        debugDate: typeof rawState.debug?.debugDate === "string" ? rawState.debug.debugDate : null,
      },
      cycles: sanitizeCycles(rawState.cycles),
    };

    next.completedQuestIds = next.quests.completedQuestIds;
    next.xp = next.currencies.xp;
    next.gold = next.currencies.gold;
    next.totalXp = next.currencies.totalXp;
    next.level = next.progress.level;
    return next;
  }

  function toPersistedGameState(gameState) {
    const normalized = normalizeGameState(gameState);
    normalized.v = 1;
    normalized.currencies.xp = clamp(Number(normalized.xp) || 0, 0, Number.MAX_SAFE_INTEGER);
    normalized.currencies.gold = clamp(Number(normalized.gold) || 0, 0, Number.MAX_SAFE_INTEGER);
    normalized.currencies.totalXp = clamp(Number(normalized.totalXp) || 0, 0, Number.MAX_SAFE_INTEGER);
    normalized.progress.level = Math.max(1, Number(normalized.level) || 1);
    normalized.quests.completedQuestIds = Array.isArray(normalized.completedQuestIds) ? normalized.completedQuestIds.filter((id) => typeof id === "string") : [];
    normalized.completedQuestIds = normalized.quests.completedQuestIds;
    normalized.logs.eventLog = sanitizeEventLog(normalized.logs.eventLog);
    normalized.claims.rewardClaims = sanitizeRewardClaims(normalized.claims.rewardClaims);
    normalized.daily = sanitizeDailyState(normalized.daily);
    normalized.progress.streakShield = Math.max(0, Math.min(1, Number(normalized.progress.streakShield) || 0));
    normalized.progress.restDaysUsedByWeek = normalized.progress.restDaysUsedByWeek && typeof normalized.progress.restDaysUsedByWeek === "object" ? normalized.progress.restDaysUsedByWeek : {};
    normalized.progress.vacationDaysRemaining = Math.max(0, Number(normalized.progress.vacationDaysRemaining) || 0);
    normalized.cycles = sanitizeCycles(normalized.cycles);
    return normalized;
  }

  // === SECTION: State persistence (load/save/migrations) ===
  const storage = {
    keys: {
      save: "habitrpg.save",
      legacyState: "habithub-state-v2",
      oldLegacyState: "habithub-state-v1",
      custom: "habithub-quests-custom-v1",
      hidden: "habithub-quests-hidden-v1",
      overrides: "habithub-quests-overrides-v1",
      settings: "habithub-settings-v1",
      createUi: "habithub-ui-create-filter-v1",
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
    migrateStateVersion(stateValue, fromVersion) {
      const normalized = normalizeGameState(stateValue);
      const safeFromVersion = clamp(Math.floor(Number(fromVersion) || 1), 1, 999);
      if (safeFromVersion <= 1) return { ...normalized, v: 1 };
      return { ...normalized, v: 1 };
    },
    migrateState(oldState, fromVersion = 1) {
      return this.migrateStateVersion(oldState, fromVersion);
    },
    loadState() {
      const save = this.loadJson(this.keys.save, null);
      if (save && typeof save === "object") {
        const schemaVersion = clamp(Math.floor(Number(save.schemaVersion) || 1), 1, 999);
        const migrated = this.migrateState(save.state, schemaVersion);
        return migrated;
      }

      const legacy = this.loadJson(this.keys.legacyState, null) ?? this.loadJson(this.keys.oldLegacyState, null);
      if (legacy && typeof legacy === "object") {
        return this.migrateState(legacy);
      }
      return createInitialGameState();
    },
    saveState(gameState) {
      const next = toPersistedGameState(gameState);
      assertState(next);
      this.saveJson(this.keys.save, {
        schemaVersion: next.v,
        updatedAt: new Date().toISOString(),
        state: next,
      });
    },
    resetProgress(gameState) {
      const reset = createInitialGameState();
      reset.debug = cloneJson(gameState.debug || reset.debug);
      return reset;
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
    loadSettings() {
      const settings = this.loadJson(this.keys.settings, {});
      if (!settings || typeof settings !== "object") {
        return { hapticsEnabled: true, developerModeEnabled: false, reduceMotion: false, soundsEnabled: false, soundsVolume: 70 };
      }
      return {
        hapticsEnabled: settings.hapticsEnabled !== false,
        developerModeEnabled: settings.developerModeEnabled === true,
        reduceMotion: settings.reduceMotion === true,
        soundsEnabled: settings.soundsEnabled === true,
        soundsVolume: clamp(Math.round(Number(settings.soundsVolume) || 70), 0, 100),
      };
    },
    saveSettings(settings) {
      this.saveJson(this.keys.settings, settings);
    },
    loadCreateUi() {
      const data = this.loadJson(this.keys.createUi, {});
      if (!data || typeof data !== "object") return { filter: "all", sort: "recent" };
      return {
        filter: typeof data.filter === "string" ? data.filter : "all",
        sort: typeof data.sort === "string" ? data.sort : "recent",
      };
    },
    saveCreateUi(data) {
      this.saveJson(this.keys.createUi, data);
    },
  };

  // === SECTION: Quest catalog selectors/getters ===
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

  // === SECTION: UI refs + helpers ===
  const ui = {
    refs: {},
    activeTab: "today",
    createFilter: "all",
    createSort: "recent",
    createSearch: "",
    iconSearch: "",
    selectedIds: new Set(),
    lastCompletedQuestId: null,
    lastHeroXpTotal: null,
    editor: { open: false, mode: "create", questId: null, icon: ICON_CATALOG[0].key },
    bindRefs() {
      this.refs = {
        tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
        tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
        questsList: document.getElementById("quests-list"),
        xp: document.getElementById("xp-value"),
        gold: document.getElementById("gold-value"),
        levelBadge: document.getElementById("level-badge"),
        xpHeroTitle: document.getElementById("xp-hero-title"),
        xpHeroText: document.getElementById("xp-hero-text"),
        xpHeroBar: document.getElementById("xp-hero-bar"),
        xpHeroTrack: document.getElementById("xp-hero-track"),
        xpHeroRemaining: document.getElementById("xp-hero-remaining"),
        sessionText: document.getElementById("session-progress-text"),
        sessionBar: document.getElementById("session-progress-bar"),
        sessionTrack: document.getElementById("session-progress-track"),
        levelText: document.getElementById("level-progress-text"),
        levelBar: document.getElementById("level-progress-bar"),
        levelTrack: document.getElementById("level-progress-track"),
        levelRemain: document.getElementById("level-progress-remaining"),
        dailyTierStatus: document.getElementById("daily-tier-status"),
        dailyTierRule: document.getElementById("daily-tier-rule"),
        streakStatus: document.getElementById("streak-status"),
        streakProtections: document.getElementById("streak-protections"),
        weeklyScoreStatus: document.getElementById("weekly-score-status"),
        weeklyBossStatus: document.getElementById("weekly-boss-status"),
        monthlyYearlyStatus: document.getElementById("monthly-yearly-status"),
        claimWeeklyChestBtn: document.getElementById("claim-weekly-chest-btn"),
        vacationToggle: document.getElementById("vacation-toggle"),
        vacationState: document.getElementById("vacation-state"),
        debugDateToggle: document.getElementById("debug-date-toggle"),
        debugDateState: document.getElementById("debug-date-state"),
        debugDateInput: document.getElementById("debug-date-input"),
        activeDateLabel: document.getElementById("active-date-label"),
        devTechInfo: document.getElementById("dev-tech-info"),
        vacationRemainingLabel: document.getElementById("vacation-remaining-label"),
        developerModeToggle: document.getElementById("developer-mode-toggle"),
        developerModeState: document.getElementById("developer-mode-state"),
        developerSettingsSection: document.getElementById("developer-settings-section"),
        resetBtn: document.getElementById("reset-btn"),
        catalogSearch: document.getElementById("catalog-search-input"),
        filterSelect: document.getElementById("catalog-filter-select"),
        sortSelect: document.getElementById("catalog-sort-select"),
        filterPill: document.getElementById("catalog-filter-pill"),
        hapticsToggle: document.getElementById("haptics-toggle"),
        hapticsToggleState: document.getElementById("haptics-toggle-state"),
        reduceMotionToggle: document.getElementById("reduce-motion-toggle"),
        reduceMotionState: document.getElementById("reduce-motion-state"),
        soundsToggle: document.getElementById("sounds-toggle"),
        soundsToggleState: document.getElementById("sounds-toggle-state"),
        soundsVolumeRange: document.getElementById("sounds-volume-range"),
        soundsVolumeValue: document.getElementById("sounds-volume-value"),
        soundsVolumeRow: document.getElementById("sounds-volume-row"),
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
        levelUpOverlay: document.getElementById("level-up-overlay"),
        levelUpTitle: document.getElementById("level-up-title"),
        levelUpLevel: document.getElementById("level-up-level"),
        levelUpMessage: document.getElementById("level-up-message"),
        levelUpCloseBtn: document.getElementById("level-up-close-btn"),
      };
    },
    showToast(typeOrMessage, titleOrOptions, maybeMessage, maybeOptions) {
      const knownTypes = new Set(["success", "info", "warn", "error"]);
      const toastType = knownTypes.has(typeOrMessage) ? typeOrMessage : "info";
      const title = knownTypes.has(typeOrMessage) ? String(titleOrOptions || "") : String(typeOrMessage || "");
      const message = knownTypes.has(typeOrMessage) ? (typeof maybeMessage === "string" ? maybeMessage : "") : (typeof titleOrOptions === "string" ? titleOrOptions : "");
      const options = knownTypes.has(typeOrMessage) ? (maybeOptions && typeof maybeOptions === "object" ? maybeOptions : {}) : (maybeMessage && typeof maybeMessage === "object" ? maybeMessage : {});
      const duration = Math.max(1200, Number(options.durationMs) || UI_CONFIG.toastDurationMs);
      const maxToasts = Math.max(2, Number(UI_CONFIG.toastMaxStack) || 4);

      if (!title && !message) return;

      const toast = document.createElement("article");
      toast.className = `toast toast-${toastType} toast-enter`;
      toast.setAttribute("role", toastType === "error" ? "alert" : "status");
      toast.setAttribute("aria-live", toastType === "error" ? "assertive" : "polite");

      const iconMap = {
        success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8.6-8.6 1.4 1.4z"/></svg>',
        info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M11 10h2v7h-2zm0-3h2v2h-2z"/></svg>',
        warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20z"/><path d="M11 9h2v6h-2zm0 7h2v2h-2z"/></svg>',
        error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.7 8.7 6.6 6.6m0-6.6-6.6 6.6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
      };

      toast.innerHTML = `
        <div class="toast-icon">${iconMap[toastType] || iconMap.info}</div>
        <div class="toast-copy">
          <strong class="toast-title">${title}</strong>
          ${message ? `<p class="toast-message">${message}</p>` : ""}
        </div>
        <button type="button" class="toast-close" aria-label="Fermer la notification">✕</button>
      `;

      const closeToast = () => {
        if (toast.dataset.closing === "1") return;
        toast.dataset.closing = "1";
        toast.classList.remove("toast-enter");
        toast.classList.add("toast-exit");
        setTimeout(() => toast.remove(), 220);
      };

      toast.querySelector(".toast-close")?.addEventListener("click", closeToast);
      this.refs.toastRoot.prepend(toast);

      const toasts = Array.from(this.refs.toastRoot.querySelectorAll(".toast"));
      if (toasts.length > maxToasts) {
        toasts.slice(maxToasts).forEach((item) => item.remove());
      }

      setTimeout(closeToast, duration);
    },
    closeLevelUpOverlay() {
      this.refs.levelUpOverlay.hidden = true;
      document.body.classList.remove("modal-open");
      renderStats();
    },
    showLevelUpOverlay(level, rewardGold) {
      const overlayConfig = UI_CONFIG.levelUpOverlay || {};
      renderStats();
      this.refs.levelUpTitle.textContent = overlayConfig.title || "LEVEL UP";
      this.refs.levelUpCloseBtn.textContent = overlayConfig.ctaLabel || "Continuer";
      this.refs.levelUpLevel.textContent = `Niveau ${level} atteint !`;
      this.refs.levelUpMessage.textContent = `Récompense: +${rewardGold} Gold`;
      this.refs.levelUpOverlay.hidden = false;
      document.body.classList.add("modal-open");
    },
  };


  function applyMotionPreferences() {
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  }

  // === SECTION: In-memory state bootstrap ===
  let state = {
    game: storage.loadState(),
    customQuests: storage.loadCustomQuests(),
    hiddenQuestIds: storage.loadHiddenIds(),
    questOverrides: storage.loadOverrides(),
    settings: storage.loadSettings(),
    createUi: storage.loadCreateUi(),
  };
  state.game.daily = sanitizeDailyState(state.game.daily);
  state.game.cycles = sanitizeCycles(state.game.cycles);
  state.game.v = clamp(Math.floor(Number(state.game.v) || 1), 1, 999);
  assertState(state.game);

  // === SECTION: Device feedback (haptics/sound) ===
  const haptics = {
    tap() {
      this.play(10);
    },
    complete() {
      this.play([12, 18, 10]);
    },
    undo() {
      this.play([16]);
    },
    error() {
      this.play([34, 18, 34]);
    },
    levelUp() {
      this.play([12, 26, 12, 38]);
    },
    play(pattern) {
      if (!state.settings.hapticsEnabled) return;
      if (!navigator || typeof navigator.vibrate !== "function") return;
      navigator.vibrate(pattern);
    },
  };

  const audioFx = {
    ctx: null,
    unlocked: false,
    ensureContext() {
      if (!window.AudioContext && !window.webkitAudioContext) return null;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
      }
      return this.ctx;
    },
    unlock() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      this.unlocked = true;
    },
    gainValue() {
      return clamp((Number(state.settings.soundsVolume) || 0) / 100, 0, 1);
    },
    play(kind) {
      if (!state.settings.soundsEnabled) return;
      const ctx = this.ensureContext();
      if (!ctx || !this.unlocked) return;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const master = this.gainValue();
      const profiles = {
        pop: { f1: 760, f2: 510, d: 0.09, v: 0.23, type: "sine" },
        coin: { f1: 930, f2: 1180, d: 0.11, v: 0.22, type: "triangle" },
        levelup: { f1: 520, f2: 980, d: 0.2, v: 0.26, type: "sine" },
      };
      const p = profiles[kind] || profiles.pop;
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.f1, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, p.f2), now + p.d);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, p.v * master), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.d);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + p.d + 0.02);
    },
  };

  const FILTER_LABELS = {
    all: "Toutes",
    visible: "Visibles",
    hidden: "Masquées",
    seed: "Seed (de base)",
    custom: "Custom (personnalisées)",
    overrides: "Modifiées (overrides)",
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

  function assertState(gameState) {
    const isDevHost = typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");
    if (!isDevHost) return;

    const errors = [];
    const numericFields = [
      ["currencies.xp", gameState?.currencies?.xp],
      ["currencies.gold", gameState?.currencies?.gold],
      ["currencies.totalXp", gameState?.currencies?.totalXp],
      ["progress.level", gameState?.progress?.level],
      ["progress.streak", gameState?.progress?.streak],
    ];

    numericFields.forEach(([label, value]) => {
      if (!Number.isFinite(value)) {
        errors.push(`${label} must be finite`);
      }
    });

    if ((Number(gameState?.currencies?.xp) || 0) < 0) errors.push("currencies.xp cannot be negative");
    if ((Number(gameState?.currencies?.gold) || 0) < 0) errors.push("currencies.gold cannot be negative");

    if (!gameState?.currencies || !gameState?.progress || !gameState?.quests || !gameState?.claims || !gameState?.daily) {
      errors.push("state is missing required fields");
    }

    if (errors.length) {
      throw new Error(`Invalid state: ${errors.join(" | ")}`);
    }
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

  function xpNeededToReachLevel(level) {
    let total = 0;
    for (let current = 1; current < Math.max(1, level); current += 1) {
      total += xpForNextLevel(current);
    }
    return total;
  }

  function computeLevelProgressAtLevel(totalXp, level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    const floorXp = xpNeededToReachLevel(safeLevel);
    const xpNeeded = xpForNextLevel(safeLevel);
    const xpIntoLevel = Math.max(0, Math.min(xpNeeded, Math.floor(Number(totalXp) || 0) - floorXp));
    return {
      level: safeLevel,
      xpIntoLevel,
      xpNeeded,
      xpRemaining: Math.max(0, xpNeeded - xpIntoLevel),
      ratio: xpNeeded ? xpIntoLevel / xpNeeded : 0,
    };
  }

  function computeClaimedXpTotal(claims) {
    const rewardClaims = claims?.rewardClaims && typeof claims.rewardClaims === "object" ? claims.rewardClaims : {};
    return Object.values(rewardClaims).reduce((acc, claim) => {
      const xp = Math.max(0, Number(claim?.xp) || 0);
      return acc + xp;
    }, 0);
  }

  function recomputeTotalXp() {
    state.game.totalXp = computeClaimedXpTotal(state.game.claims);
    state.game.currencies.totalXp = state.game.totalXp;
  }

  function getActiveDateIso() {
    if (state.game.debug.useDebugDate && state.game.debug.debugDate) {
      return state.game.debug.debugDate;
    }
    return toIsoDate(new Date());
  }

  function computeTier(dailyObjectivesCompleted) {
    const completedCount = Math.max(0, Math.floor(Number(dailyObjectivesCompleted) || 0));
    const tiers = PROGRESSION_CONFIG.dailyTiers;
    if (completedCount >= tiers.gold.minObjectives) return "gold";
    if (completedCount >= tiers.silver.minObjectives) return "silver";
    if (completedCount >= tiers.bronze.minObjectives) return "bronze";
    return "none";
  }

  function getTierBonusGold(tier) {
    if (tier === "none") return 0;
    const tierConfig = PROGRESSION_CONFIG.dailyTiers[tier];
    return Math.max(0, Math.floor(Number(tierConfig?.bonusGold) || 0));
  }

  function countDistinctDailyObjectives(dateKey) {
    if (!dateKey) return 0;
    const prefix = `${dateKey}:`;
    const claimedActions = new Set();
    Object.keys(state.game.claims.rewardClaims).forEach((claimKey) => {
      if (!claimKey.startsWith(prefix)) return;
      claimedActions.add(claimKey.slice(prefix.length));
    });
    return claimedActions.size;
  }

  function ensureDailyProgressState() {
    const dateKey = getActiveDateIso();
    if (state.game.daily.dateKey !== dateKey) {
      state.game.daily.dateKey = dateKey;
      state.game.daily.objectivesCompleted = 0;
      state.game.daily.tier = "none";
      state.game.daily.tierBonusGoldApplied = 0;
    }

    const objectivesCompleted = countDistinctDailyObjectives(dateKey);
    const tier = computeTier(objectivesCompleted);
    const bonusWanted = getTierBonusGold(tier);
    const bonusApplied = Math.max(0, Number(state.game.daily.tierBonusGoldApplied) || 0);
    const bonusDelta = bonusWanted - bonusApplied;

    if (bonusDelta !== 0) {
      applyDelta(0, bonusDelta);
      logEvent("TIER_BONUS_ADJUST", {
        dateKey,
        objectivesCompleted,
        tier,
        goldDelta: bonusDelta,
        bonusWanted,
        bonusAppliedBefore: bonusApplied,
      });
    }

    state.game.daily.objectivesCompleted = objectivesCompleted;
    state.game.daily.tier = tier;
    state.game.daily.tierBonusGoldApplied = bonusWanted;
    state.game.progress.lastTier = tier;
    return state.game.daily;
  }

  function getTierLabel(tier) {
    return { bronze: "Bronze", silver: "Argent", gold: "Or", none: "Aucun" }[tier] || "Aucun";
  }

  function buildRewardClaimKey(dateKey, actionId) {
    return `${dateKey}:${actionId}`;
  }

  function getDailyRewardTotals(dateKey) {
    const safeDateKey = typeof dateKey === "string" ? dateKey : getActiveDateIso();
    const prefix = `${safeDateKey}:`;
    return Object.entries(state.game.claims.rewardClaims).reduce((acc, [claimKey, claim]) => {
      if (!claimKey.startsWith(prefix)) return acc;
      const xp = Math.max(0, Number(claim?.xp) || 0);
      const gold = Math.max(0, Number(claim?.gold) || 0);
      acc.xp += xp;
      acc.gold += gold;
      return acc;
    }, { xp: 0, gold: 0 });
  }

  function applyDailyCaps(dateKey, xpWanted, goldWanted) {
    const caps = PROGRESSION_CONFIG.antiExploit?.caps || {};
    const capXpPerDay = Math.max(0, Math.floor(Number(caps.capXpPerDay) || 0));
    const capGoldPerDay = Math.max(0, Math.floor(Number(caps.capGoldPerDay) || 0));
    const totals = getDailyRewardTotals(dateKey);
    const xpRemaining = Math.max(0, capXpPerDay - totals.xp);
    const goldRemaining = Math.max(0, capGoldPerDay - totals.gold);
    const xpGranted = Math.max(0, Math.min(xpWanted, xpRemaining));
    const goldGranted = Math.max(0, Math.min(goldWanted, goldRemaining));
    return {
      xpGranted,
      goldGranted,
      xpRemaining,
      goldRemaining,
      capXpPerDay,
      capGoldPerDay,
      isCapReached: xpGranted === 0 && goldGranted === 0 && (xpWanted > 0 || goldWanted > 0),
      isPartial: xpGranted < xpWanted || goldGranted < goldWanted,
    };
  }

  function logEvent(type, payload) {
    const maxEntries = Math.max(1, Number(PROGRESSION_CONFIG.antiExploit?.eventLogMaxEntries) || 200);
    state.game.logs.eventLog.push({
      timestamp: new Date().toISOString(),
      type,
      payload: payload && typeof payload === "object" ? payload : {},
    });
    if (state.game.logs.eventLog.length > maxEntries) {
      state.game.logs.eventLog = state.game.logs.eventLog.slice(-maxEntries);
    }
  }

  function tierMeetsStreakRequirement(tier) {
    const order = ["none", "bronze", "silver", "gold"];
    const minTier = PROGRESSION_CONFIG.streakRules?.minTierForStreak || "silver";
    return order.indexOf(tier) >= order.indexOf(minTier);
  }

  function getWeekKey(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return toIsoDate(date);
  }

  function getMonthKey(dateKey) {
    return String(dateKey || "").slice(0, 7);
  }

  function getYearKey(dateKey) {
    return String(dateKey || "").slice(0, 4);
  }

  function getTierPoints(tier) {
    const points = PROGRESSION_CONFIG.weeklyRules?.tierPoints || {};
    return Math.max(0, Number(points[tier]) || 0);
  }

  function getWeeklyChestTier(score) {
    const tiers = Array.isArray(PROGRESSION_CONFIG.weeklyRules?.chestTiers) ? PROGRESSION_CONFIG.weeklyRules.chestTiers : [];
    let match = null;
    tiers.forEach((tier) => {
      if (score >= (Number(tier.minScore) || 0)) match = tier;
    });
    return match;
  }

  function initializeWeeklyCycle(activeDate) {
    const weekKey = getWeekKey(activeDate);
    const weekly = state.game.cycles.weekly;
    if (weekly.weekKey === weekKey) return;
    if (weekly.weekKey) {
      state.game.cycles.weeklyArchives.push({
        weekKey: weekly.weekKey,
        score: weekly.score,
        chestTierId: weekly.chestTierId,
        chestClaimed: weekly.chestClaimed,
        bossDefeated: weekly.bossDefeated,
        bossMaxHp: weekly.bossMaxHp,
      });
      state.game.cycles.weeklyArchives = state.game.cycles.weeklyArchives.slice(-16);
      if (weekly.bossDefeated) state.game.cycles.bossStreak += 1;
      else state.game.cycles.bossStreak = 0;
      logEvent('WEEK_ARCHIVED', { archivedWeekKey: weekly.weekKey, score: weekly.score, bossDefeated: weekly.bossDefeated });
    }

    const bossBaseHp = Math.max(1, Math.floor(Number(PROGRESSION_CONFIG.weeklyRules?.bossRules?.baseHp) || 1));
    const streakBonus = Math.max(0, state.game.cycles.bossStreak * 2);
    state.game.cycles.weekly = {
      weekKey,
      days: {},
      score: 0,
      chestTierId: null,
      chestClaimed: false,
      bossMaxHp: bossBaseHp + streakBonus,
      bossHp: bossBaseHp + streakBonus,
      bossDefeated: false,
    };
    logEvent('WEEK_STARTED', { weekKey, bossHp: state.game.cycles.weekly.bossHp, bossStreak: state.game.cycles.bossStreak });
  }

  function ensureMonthlyCycle(activeDate) {
    const monthKey = getMonthKey(activeDate);
    if (state.game.cycles.monthly.monthKey === monthKey) return;
    state.game.cycles.monthly.monthKey = monthKey;
    state.game.cycles.monthly.points = 0;
    state.game.cycles.monthly.badgeId = null;
    logEvent('MONTH_STARTED', { monthKey });
  }

  function ensureYearlyCycle(activeDate) {
    const yearKey = getYearKey(activeDate);
    if (state.game.cycles.yearly.yearKey === yearKey) return;
    state.game.cycles.yearly.yearKey = yearKey;
    state.game.cycles.yearly.points = 0;
    state.game.cycles.yearly.relicsUnlocked = [];
    state.game.cycles.yearly.milestonesClaimed = [];
    logEvent('YEAR_STARTED', { yearKey });
  }

  function updateLongTermProgress(dateKey, tier) {
    const monthlyPointsCfg = PROGRESSION_CONFIG.monthlyRules?.monthlyPoints || {};
    const monthlyPoints = Math.max(0, Number(monthlyPointsCfg[tier]) || 0);
    state.game.cycles.monthly.points += monthlyPoints;

    const badge = (PROGRESSION_CONFIG.monthlyRules?.badgeThresholds || []).find((item) => state.game.cycles.monthly.points >= (Number(item.minPoints) || 0));
    if (badge && state.game.cycles.monthly.badgeId !== badge.id) {
      state.game.cycles.monthly.badgeId = badge.id;
      if (!state.game.cycles.badgesUnlocked.includes(badge.id)) state.game.cycles.badgesUnlocked.push(badge.id);
      const cosmetics = Array.isArray(PROGRESSION_CONFIG.monthlyRules?.cosmetics) ? PROGRESSION_CONFIG.monthlyRules.cosmetics : [];
      const cosmeticId = cosmetics[Math.min(cosmetics.length - 1, Math.max(0, (badge.id === 'heroic') ? 2 : 1))] || cosmetics[0];
      if (cosmeticId && !state.game.cycles.cosmeticInventory.includes(cosmeticId)) state.game.cycles.cosmeticInventory.push(cosmeticId);
      logEvent('MONTH_BADGE_UNLOCKED', { dateKey, badgeId: badge.id, cosmeticId: cosmeticId || null });
    }

    state.game.cycles.yearly.points += monthlyPoints;
    const relicEvery = Math.max(1, Number(PROGRESSION_CONFIG.yearlyRules?.relicUnlockEveryPoints) || 180);
    const relics = Array.isArray(PROGRESSION_CONFIG.yearlyRules?.relics) ? PROGRESSION_CONFIG.yearlyRules.relics : [];
    const unlockCount = Math.min(relics.length, Math.floor(state.game.cycles.yearly.points / relicEvery));
    for (let idx = 0; idx < unlockCount; idx += 1) {
      const relicId = relics[idx];
      if (relicId && !state.game.cycles.yearly.relicsUnlocked.includes(relicId)) {
        state.game.cycles.yearly.relicsUnlocked.push(relicId);
        logEvent('YEAR_RELIC_UNLOCKED', { dateKey, relicId });
      }
    }

    (PROGRESSION_CONFIG.yearlyRules?.milestoneRewards || []).forEach((milestone) => {
      if (state.game.cycles.yearly.points < (Number(milestone.minPoints) || 0)) return;
      if (state.game.cycles.yearly.milestonesClaimed.includes(milestone.id)) return;
      state.game.cycles.yearly.milestonesClaimed.push(milestone.id);
      const tokens = Math.max(0, Number(milestone.tokens) || 0);
      state.game.currencies.tokens = Math.max(0, Number(state.game.currencies.tokens) || 0) + tokens;
      logEvent('YEAR_MILESTONE_UNLOCKED', { dateKey, milestoneId: milestone.id, tokens });
    });
  }

  function finalizeWeeklyFromTier(dateKey, tier) {
    const weekly = state.game.cycles.weekly;
    if (!weekly || weekly.days[dateKey]) return;
    weekly.days[dateKey] = tier;
    const tierPoints = getTierPoints(tier);
    weekly.score += tierPoints;
    const chestTier = getWeeklyChestTier(weekly.score);
    weekly.chestTierId = chestTier ? chestTier.id : null;

    const bossEnabled = PROGRESSION_CONFIG.weeklyRules?.bossRules?.enabled;
    if (bossEnabled && !weekly.bossDefeated) {
      weekly.bossHp = Math.max(0, weekly.bossHp - tierPoints);
      weekly.bossDefeated = weekly.bossHp <= 0;
    }

    updateLongTermProgress(dateKey, tier);
    logEvent('WEEK_DAY_RECORDED', { dateKey, tier, tierPoints, weeklyScore: weekly.score, chestTierId: weekly.chestTierId, bossHp: weekly.bossHp, bossDefeated: weekly.bossDefeated });
  }

  function claimWeeklyChestReward() {
    const weekly = state.game.cycles.weekly;
    if (weekly.chestClaimed) return { ok: false, reason: 'already_claimed' };
    const chestTier = getWeeklyChestTier(weekly.score);
    if (!chestTier) return { ok: false, reason: 'no_chest' };
    weekly.chestClaimed = true;
    state.game.claims.chestClaims[weekly.weekKey] = { claimedAt: new Date().toISOString(), chestTierId: chestTier.id };
    applyDelta(Math.max(0, Number(chestTier.bonusXp) || 0), Math.max(0, Number(chestTier.bonusGold) || 0));
    logEvent('WEEK_CHEST_CLAIMED', { weekKey: weekly.weekKey, chestTierId: chestTier.id });
    return { ok: true, chestTier };
  }

  function refillMonthlyShieldIfNeeded(activeDate) {
    const monthKey = activeDate.slice(0, 7);
    if (state.game.progress.lastShieldRefillMonth === monthKey) return;
    const refill = Math.max(0, Math.floor(Number(PROGRESSION_CONFIG.streakRules?.shieldMonthlyRefill) || 0));
    if (refill > 0) {
      state.game.progress.streakShield = Math.min(1, state.game.progress.streakShield + refill);
      logEvent("STREAK_SHIELD_REFILL", { monthKey, refill, streakShield: state.game.progress.streakShield });
    }
    state.game.progress.lastShieldRefillMonth = monthKey;
  }

  function finalizePreviousDay(prevDate) {
    const previousTier = state.game.daily.tier || "none";
    finalizeWeeklyFromTier(prevDate, previousTier);
    if (state.game.daily.vacationMode) {
      logEvent("STREAK_DAY_CLOSED", { prevDate, previousTier, result: "vacation_freeze", streak: state.game.progress.streak });
      return;
    }
    if (tierMeetsStreakRequirement(previousTier)) {
      state.game.progress.streak += 1;
      logEvent("STREAK_DAY_CLOSED", { prevDate, previousTier, result: "streak_up", streak: state.game.progress.streak });
      return;
    }

    if (state.game.progress.streakShield > 0) {
      state.game.progress.streakShield = Math.max(0, state.game.progress.streakShield - 1);
      logEvent("STREAK_DAY_CLOSED", { prevDate, previousTier, result: "shield_used", streak: state.game.progress.streak, streakShield: state.game.progress.streakShield });
      return;
    }

    const restRules = PROGRESSION_CONFIG.streakRules?.restDayRules || {};
    const restWeekKey = getWeekKey(prevDate);
    const restUsed = Math.max(0, Number(state.game.progress.restDaysUsedByWeek[restWeekKey]) || 0);
    const restMax = Math.max(0, Number(restRules.maxPerWeek) || 0);
    if (restRules.enabled && restUsed < restMax) {
      state.game.progress.restDaysUsedByWeek[restWeekKey] = restUsed + 1;
      logEvent("STREAK_DAY_CLOSED", { prevDate, previousTier, result: "rest_day_used", streak: state.game.progress.streak, restWeekKey, restUsed: restUsed + 1, restMax });
      return;
    }

    state.game.progress.streak = 0;
    logEvent("STREAK_DAY_CLOSED", { prevDate, previousTier, result: "reset", streak: 0 });
  }

  function handleDayChange() {
    const activeDate = getActiveDateIso();
    refillMonthlyShieldIfNeeded(activeDate);
    initializeWeeklyCycle(activeDate);
    ensureMonthlyCycle(activeDate);
    ensureYearlyCycle(activeDate);
    if (state.game.progress.lastActiveDate === activeDate) return;
    if (state.game.progress.lastActiveDate) {
      finalizePreviousDay(state.game.progress.lastActiveDate);
      state.game.completedQuestIds = [];
      state.game.quests.completedQuestIds = state.game.completedQuestIds;
      ui.showToast(`Nouveau jour détecté (${activeDate})`);
    }
    state.game.progress.lastActiveDate = activeDate;
    state.game.daily.dateKey = activeDate;
    state.game.daily.objectivesCompleted = 0;
    state.game.daily.tier = "none";
    state.game.daily.tierBonusGoldApplied = 0;
    state.game.daily.vacationMode = false;
    storage.saveState(state.game);
  }

  function persistCatalog() {
    storage.saveCustomQuests(state.customQuests);
    storage.saveHiddenIds(state.hiddenQuestIds);
    storage.saveOverrides(state.questOverrides);
  }

  function cleanupCompletedIds() {
    const validIds = new Set(catalog.getAllQuestsMerged().map((quest) => quest.id));
    state.game.completedQuestIds = state.game.completedQuestIds.filter((id) => validIds.has(id));
    state.game.quests.completedQuestIds = state.game.completedQuestIds;
  }

  function getQuestById(id) {
    return catalog.getAllQuestsMerged().find((quest) => quest.id === id);
  }

  function computeLevelUpReward(fromLevel, toLevel) {
    let totalBonus = 0;
    for (let level = fromLevel + 1; level <= toLevel; level += 1) {
      totalBonus += PROGRESSION.LEVEL_UP_GOLD_BASE_BONUS + (level - 1) * PROGRESSION.LEVEL_UP_GOLD_PER_LEVEL;
    }
    return totalBonus;
  }

  function applyDelta(xpDelta, goldDelta) {
    const beforeLevel = Math.max(1, Number(state.game.level) || 1);
    state.game.xp = Math.max(0, state.game.xp + xpDelta);
    state.game.gold = Math.max(0, state.game.gold + goldDelta);
    recomputeTotalXp();
    const progress = computeLevelProgress(state.game.totalXp);
    const nextLevel = Math.max(beforeLevel, progress.level);
    if (nextLevel > beforeLevel) {
      const bonus = computeLevelUpReward(beforeLevel, nextLevel);
      state.game.gold += bonus;
      ui.showToast(`Level up ! +${bonus} Gold`);
      ui.showLevelUpOverlay(nextLevel, bonus);
      haptics.levelUp();
      audioFx.play("levelup");
    }
    state.game.level = nextLevel;
    state.game.currencies.xp = state.game.xp;
    state.game.currencies.totalXp = state.game.totalXp;
    state.game.currencies.gold = state.game.gold;
    state.game.progress.level = state.game.level;
  }

  // === SECTION: Reward / claim engine ===
  function claimReward(params) {
    const actionId = typeof params?.actionId === "string" ? params.actionId : "";
    const dateKey = typeof params?.dateKey === "string" ? params.dateKey : getActiveDateIso();
    const mode = params?.mode === "rollback" ? "rollback" : "claim";
    const claimKey = buildRewardClaimKey(dateKey, actionId);
    const existingClaim = state.game.claims.rewardClaims[claimKey];

    if (!actionId || !dateKey) {
      return { applied: false, xpDelta: 0, goldDelta: 0, reason: "invalid_input" };
    }

    if (mode === "claim") {
      if (existingClaim) {
        return { applied: false, xpDelta: 0, goldDelta: 0, reason: "already_claimed" };
      }

      const xpWanted = Math.max(0, Math.round(Number(params?.xp) || 0));
      const goldWanted = Math.max(0, Math.round(Number(params?.gold) || 0));
      const capResult = applyDailyCaps(dateKey, xpWanted, goldWanted);
      const xpGain = capResult.xpGranted;
      const goldGain = capResult.goldGranted;

      state.game.claims.rewardClaims[claimKey] = {
        claimedAt: new Date().toISOString(),
        xp: xpGain,
        gold: goldGain,
      };

      applyDelta(xpGain, goldGain);
      logEvent("CLAIM", { actionId, dateKey, xpDelta: xpGain, goldDelta: goldGain, xpWanted, goldWanted });

      if (capResult.isPartial) {
        logEvent("CAP_APPLIED", {
          actionId,
          dateKey,
          xpWanted,
          goldWanted,
          xpGranted: xpGain,
          goldGranted: goldGain,
          capXpPerDay: capResult.capXpPerDay,
          capGoldPerDay: capResult.capGoldPerDay,
        });
      }

      if (xpGain < xpWanted || goldGain < goldWanted) {
        logEvent("CLAIM_PARTIAL", {
          actionId,
          dateKey,
          xpWanted,
          goldWanted,
          xpGranted: xpGain,
          goldGranted: goldGain,
        });
      }

      return {
        applied: true,
        xpDelta: xpGain,
        goldDelta: goldGain,
        reason: capResult.isCapReached ? "cap_reached" : (capResult.isPartial ? "claim_partial" : "claimed"),
      };
    }

    if (!existingClaim) {
      return { applied: false, xpDelta: 0, goldDelta: 0, reason: "missing_claim" };
    }

    const xpRollback = Math.max(0, Number(existingClaim.xp) || 0);
    const goldRollback = Math.max(0, Number(existingClaim.gold) || 0);
    applyDelta(-xpRollback, -goldRollback);
    delete state.game.claims.rewardClaims[claimKey];
    logEvent("ROLLBACK", { actionId, dateKey, xpDelta: -xpRollback, goldDelta: -goldRollback });

    if (xpRollback > 0 || goldRollback > 0) {
      logEvent("ROLLBACK_PARTIAL", { actionId, dateKey, xpRolledBack: xpRollback, goldRolledBack: goldRollback });
    }

    return { applied: true, xpDelta: -xpRollback, goldDelta: -goldRollback, reason: "rolled_back" };
  }

  function rollbackCompletedQuest(quest, dateKey) {
    state.game.completedQuestIds = state.game.completedQuestIds.filter((id) => id !== quest.id);
    state.game.quests.completedQuestIds = state.game.completedQuestIds;
    return claimReward({ actionId: quest.id, dateKey, mode: "rollback" });
  }

  function toggleQuestCompletion(questId) {
    const quest = getQuestById(questId);
    if (!quest || quest.isHidden) return;
    handleDayChange();
    const dateKey = getActiveDateIso();
    const completed = state.game.completedQuestIds.includes(questId);

    let rewardResult;
    if (completed) {
      ui.lastCompletedQuestId = null;
      rewardResult = rollbackCompletedQuest(quest, dateKey);
      if (rewardResult.applied) {
        ui.showToast("info", "Quête annulée", `${rewardResult.xpDelta} XP • ${rewardResult.goldDelta} Gold`);
      }
      haptics.undo();
    } else {
      state.game.completedQuestIds.push(questId);
      state.game.quests.completedQuestIds = state.game.completedQuestIds;
      rewardResult = claimReward({
        actionId: quest.id,
        dateKey,
        xp: quest.xp,
        gold: quest.gold,
        mode: "claim",
      });
      if (rewardResult.applied) {
        ui.lastCompletedQuestId = questId;
        if (rewardResult.reason === "cap_reached") {
          ui.showToast("warn", "Cap atteint", "0 gain pour aujourd'hui.");
          haptics.error();
          audioFx.play("pop");
        } else {
          ui.showToast("success", "Quête validée", `+${rewardResult.xpDelta} XP • +${rewardResult.goldDelta} Gold`);
        }
      } else if (rewardResult.reason === "already_claimed") {
        ui.showToast("info", "Déjà récupérée", "Récompense déjà récupérée aujourd'hui.");
      }
      haptics.complete();
      audioFx.play("pop");
    }

    ensureDailyProgressState();
    storage.saveState(state.game);
    renderForActiveTab();
    highlightCatalogCard(questId);
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

  function prefersReducedMotion() {
    if (state.settings.reduceMotion) return true;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function getXpHeroBucket(ratio) {
    if (ratio < 0.3) return "xp-pct-low";
    if (ratio < 0.7) return "xp-pct-mid";
    return "xp-pct-high";
  }

  // === SECTION: UI render ===
  function renderXpHeroBar() {
    if (!ui.refs.xpHeroBar || !ui.refs.xpHeroTrack) return;
    const totalXp = Math.max(0, Math.floor(Number(state.game.totalXp) || 0));
    const level = Math.max(1, Math.floor(Number(state.game.level) || 1));
    const levelProgress = computeLevelProgressAtLevel(totalXp, level);
    const safeRatio = clamp(Number(levelProgress.ratio) || 0, 0, 1);
    const safeInto = Math.max(0, Math.floor(Number(levelProgress.xpIntoLevel) || 0));
    const safeNeed = Math.max(1, Math.floor(Number(levelProgress.xpNeeded) || 1));
    const safeRemain = Math.max(0, Math.floor(Number(levelProgress.xpRemaining) || 0));
    const percent = Math.round(safeRatio * 100);

    ui.refs.xpHeroTrack.classList.remove("xp-pct-low", "xp-pct-mid", "xp-pct-high");
    ui.refs.xpHeroTrack.classList.add(getXpHeroBucket(safeRatio));

    ui.refs.xpHeroTitle.textContent = `Niveau ${Math.max(1, levelProgress.level)}`;
    ui.refs.xpHeroText.textContent = `XP: ${safeInto} / ${safeNeed}`;
    ui.refs.xpHeroBar.style.width = `${percent}%`;
    ui.refs.xpHeroRemaining.textContent = `Reste: ${safeRemain} XP`;
    ui.refs.xpHeroTrack.setAttribute("aria-valuenow", String(safeInto));
    ui.refs.xpHeroTrack.setAttribute("aria-valuemax", String(safeNeed));

    const gainedXp = ui.lastHeroXpTotal !== null && totalXp > ui.lastHeroXpTotal;
    if (gainedXp && !prefersReducedMotion()) {
      ui.refs.xpHeroBar.classList.remove("xp-shine");
      void ui.refs.xpHeroBar.offsetWidth;
      ui.refs.xpHeroBar.classList.add("xp-shine");
    }
    ui.lastHeroXpTotal = totalXp;
  }

  function renderStats() {
    ui.refs.xp.textContent = String(state.game.xp);
    ui.refs.gold.textContent = String(state.game.gold);
    ui.refs.levelBadge.textContent = `Lv ${state.game.level}`;

    const levelProgress = computeLevelProgressAtLevel(state.game.totalXp, state.game.level);
    const safeRatio = clamp(Number(levelProgress.ratio) || 0, 0, 1);
    const safeInto = Math.max(0, Math.floor(Number(levelProgress.xpIntoLevel) || 0));
    const safeNeed = Math.max(1, Math.floor(Number(levelProgress.xpNeeded) || 1));
    const safeRemain = Math.max(0, Math.floor(Number(levelProgress.xpRemaining) || 0));

    renderXpHeroBar();
    ui.refs.levelText.textContent = `XP: ${safeInto} / ${safeNeed}`;
    ui.refs.levelBar.style.width = `${Math.round(safeRatio * 100)}%`;
    ui.refs.levelRemain.textContent = `Reste: ${safeRemain} XP`;

    ui.refs.levelTrack.setAttribute("aria-valuenow", String(safeInto));
    ui.refs.levelTrack.setAttribute("aria-valuemax", String(safeNeed));
  }

  function renderTodayTab() {
    const visibleQuests = catalog.getVisibleQuests();
    ui.refs.questsList.innerHTML = "";
    visibleQuests.forEach((quest) => {
      const isCompleted = state.game.completedQuestIds.includes(quest.id);
      const li = document.createElement("li");
      li.className = "quest";
      if (isCompleted) li.classList.add("is-completed");
      if (ui.lastCompletedQuestId === quest.id && isCompleted) li.classList.add("quest-success");
      li.innerHTML = `
        <div class="quest-main">
          <div class="quest-icon quest-icon-round">${catalog.getIcon(quest.icon).svg}</div>
          <div class="quest-copy">
            <p class="quest-title">${quest.title}</p>
            <p class="quest-subtitle">${isCompleted ? "Quête complétée" : "Objectif quotidien"}</p>
            <div class="reward-chips"><span class="chip chip-xp">+${quest.xp} XP</span><span class="chip chip-gold">+${quest.gold} Gold</span></div>
          </div>
        </div>
        <button class="btn ${isCompleted ? "btn-success btn-completed" : "btn-primary"}" data-action="toggle-complete" data-id="${quest.id}">${isCompleted ? "Annuler" : "Terminer"}</button>
        <span class="quest-spark" aria-hidden="true"></span>`;
      ui.refs.questsList.append(li);
    });

    const completedVisible = visibleQuests.filter((quest) => state.game.completedQuestIds.includes(quest.id)).length;
    ui.refs.sessionText.textContent = `${completedVisible} / ${visibleQuests.length}`;
    const ratio = visibleQuests.length ? completedVisible / visibleQuests.length : 0;
    ui.refs.sessionBar.style.width = `${Math.round(ratio * 100)}%`;
    ui.refs.sessionTrack.setAttribute("aria-valuenow", String(completedVisible));
    ui.refs.sessionTrack.setAttribute("aria-valuemax", String(visibleQuests.length));

    const dailyState = ensureDailyProgressState();
    ui.refs.dailyTierStatus.textContent = `${getTierLabel(dailyState.tier)} • ${dailyState.objectivesCompleted} objectif(s)`;
    ui.refs.dailyTierRule.textContent = `Argent dès ${PROGRESSION_CONFIG.dailyTiers.silver.minObjectives} objectifs • Or dès ${PROGRESSION_CONFIG.dailyTiers.gold.minObjectives} objectifs`;
    ui.refs.streakStatus.textContent = `Streak: ${state.game.progress.streak} jour(s)`;
    ui.refs.streakProtections.textContent = `Shield: ${state.game.progress.streakShield}/1 • Rest cette semaine: ${Math.max(0, Number(state.game.progress.restDaysUsedByWeek[getWeekKey(getActiveDateIso())]) || 0)}/${Math.max(0, Number(PROGRESSION_CONFIG.streakRules?.restDayRules?.maxPerWeek) || 0)} • Vacances restantes: ${state.game.progress.vacationDaysRemaining}`;

    const weekly = state.game.cycles.weekly;
    const chestTier = getWeeklyChestTier(weekly.score);
    ui.refs.weeklyScoreStatus.textContent = `Score hebdo: ${weekly.score} • Coffre: ${chestTier ? chestTier.id : "aucun"}${weekly.chestClaimed ? " (claim)" : ""}`;
    ui.refs.weeklyBossStatus.textContent = `Boss: ${Math.max(0, weekly.bossHp)} / ${weekly.bossMaxHp} • Streak boss: ${state.game.cycles.bossStreak}`;
    ui.refs.monthlyYearlyStatus.textContent = `Badge: ${state.game.cycles.monthly.badgeId || "-"} • Reliques: ${state.game.cycles.yearly.relicsUnlocked.length} • Milestones: ${state.game.cycles.yearly.milestonesClaimed.length}`;
    ui.refs.claimWeeklyChestBtn.disabled = !chestTier || weekly.chestClaimed;

    renderSettingsTab();
    ui.lastCompletedQuestId = null;

    renderStats();
  }


  function renderSettingsTab() {
    ui.refs.hapticsToggleState.textContent = state.settings.hapticsEnabled ? "ON" : "OFF";
    ui.refs.hapticsToggle.checked = state.settings.hapticsEnabled;
    ui.refs.reduceMotionState.textContent = state.settings.reduceMotion ? "ON" : "OFF";
    ui.refs.reduceMotionToggle.checked = state.settings.reduceMotion;
    ui.refs.soundsToggleState.textContent = state.settings.soundsEnabled ? "ON" : "OFF";
    ui.refs.soundsToggle.checked = state.settings.soundsEnabled;
    ui.refs.soundsVolumeRange.value = String(state.settings.soundsVolume);
    ui.refs.soundsVolumeValue.textContent = `${state.settings.soundsVolume}%`;
    ui.refs.soundsVolumeRow.hidden = !state.settings.soundsEnabled;

    ui.refs.vacationState.textContent = state.game.daily.vacationMode ? "ON" : "OFF";
    ui.refs.vacationToggle.checked = state.game.daily.vacationMode;
    ui.refs.vacationRemainingLabel.textContent = `Vacances restantes : ${state.game.progress.vacationDaysRemaining}`;

    ui.refs.developerModeToggle.checked = state.settings.developerModeEnabled;
    ui.refs.developerModeState.textContent = state.settings.developerModeEnabled ? "ON" : "OFF";
    ui.refs.developerSettingsSection.hidden = !state.settings.developerModeEnabled;

    if (!state.settings.developerModeEnabled) {
      ui.refs.debugDateToggle.checked = false;
      ui.refs.debugDateState.textContent = "OFF";
      ui.refs.debugDateInput.disabled = true;
      ui.refs.debugDateInput.value = "";
    } else {
      ui.refs.debugDateToggle.checked = state.game.debug.useDebugDate;
      ui.refs.debugDateState.textContent = state.game.debug.useDebugDate ? "ON" : "OFF";
      ui.refs.debugDateInput.disabled = !state.game.debug.useDebugDate;
      ui.refs.debugDateInput.value = state.game.debug.debugDate || "";
    }

    ui.refs.activeDateLabel.textContent = `Date active : ${getActiveDateIso()}`;
    ui.refs.devTechInfo.textContent = `Clé save: ${storage.keys.save} • Schéma: v${state.game.v}`;
  }

  function getFilteredCatalog() {
    const filtered = catalog.getAllQuestsMerged().filter((quest) => {
      const text = `${quest.title} ${quest.id}`.toLowerCase();
      const searchOk = text.includes(ui.createSearch.toLowerCase());
      if (!searchOk) return false;
      const typeFilterOk = {
        all: true,
        visible: !quest.isHidden,
        hidden: quest.isHidden,
        custom: quest.source === "custom",
        seed: quest.source === "seed",
        overrides: quest.hasOverride,
      }[ui.createFilter];
      return Boolean(typeFilterOk);
    });

    const sorted = [...filtered];
    if (ui.createSort === "az") sorted.sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
    if (ui.createSort === "xpDesc") sorted.sort((a, b) => b.xp - a.xp || a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
    if (ui.createSort === "goldDesc") sorted.sort((a, b) => b.gold - a.gold || a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
    if (ui.createSort === "recent") sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return sorted;
  }

  function renderCreateTab() {
    const list = getFilteredCatalog();
    ui.refs.catalogList.innerHTML = "";
    ui.refs.filterPill.textContent = `Filtre : ${FILTER_LABELS[ui.createFilter] || FILTER_LABELS.all}`;
    list.forEach((quest) => {
      const card = document.createElement("li");
      card.className = `card catalog-card ${quest.isHidden ? "is-hidden" : ""}`;
      card.dataset.questId = quest.id;
      card.innerHTML = `
        <label class="select-check"><input type="checkbox" data-action="select-catalog" data-id="${quest.id}" ${ui.selectedIds.has(quest.id) ? "checked" : ""}/> </label>
        <div class="quest-main">
          <div class="quest-icon">${catalog.getIcon(quest.icon).svg}</div>
          <div>
            <p class="quest-title">${quest.title}</p>
            <div class="reward-chips"><span class="chip chip-xp">+${quest.xp} XP</span><span class="chip chip-gold">+${quest.gold} Gold</span></div>
            <div class="reward-chips"><span class="chip ${quest.source === "seed" ? "chip-seed" : "chip-custom"}">${quest.source === "seed" ? "Seed" : "Custom"}</span><span class="chip ${quest.isHidden ? "chip-hidden" : "chip-visible"}">${quest.isHidden ? "Masquée" : "Visible"}</span>${quest.hasOverride ? '<span class="chip chip-override">Modifiée</span>' : ""}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-ghost" data-action="edit-quest" data-id="${quest.id}">✏️ Éditer</button>
          <button class="btn btn-ghost" data-action="toggle-hidden" data-id="${quest.id}">${quest.isHidden ? "👁️ Afficher" : "🙈 Masquer"}</button>
          ${quest.source === "custom" ? `<button class="btn btn-danger" data-action="delete-quest" data-id="${quest.id}">🗑️ Supprimer</button>` : ""}
          ${quest.hasOverride ? `<button class="btn btn-ghost" data-action="restore-quest" data-id="${quest.id}">↩️ Restaurer</button>` : ""}
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
      const createdId = createQuestId();
      state.customQuests.push({ id: createdId, ...payload, createdAt: Date.now() });
      persistCatalog();
      ui.showToast("Enregistré ✅");
      haptics.complete();
      audioFx.play("pop");
      ui.selectedIds.clear();
      ui.selectedIds.add(createdId);
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
      haptics.complete();
      audioFx.play("pop");
    }

    cleanupCompletedIds();
    closeQuestEditor();
    renderForActiveTab();
    highlightCatalogCard(ui.editor.mode === "edit" ? ui.editor.questId : Array.from(ui.selectedIds)[0]);
  }

  function handleToggleHidden(id) {
    const quest = getQuestById(id);
    if (!quest) return;
    if (!quest.isHidden && state.game.completedQuestIds.includes(id)) {
      const rollback = window.confirm("Cette quête est complétée. La masquer doit-elle annuler ses gains ?\nOK = oui, Annuler = non.");
      if (rollback) rollbackCompletedQuest(quest);
    }
    toggleHidden(id);
    haptics.undo();
    cleanupCompletedIds();
    storage.saveState(state.game);
    renderAllTabs();
    highlightCatalogCard(id);
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
    renderAllTabs();
    ui.showToast("warn", "Catalogue", "Habitude supprimée");
    haptics.error();
  }

  function resetProgressOnly() {
    if (!window.confirm("Restart : réinitialiser XP/Gold/Niveau/progression ?")) return;
    state.game = storage.resetProgress(state.game);
    handleDayChange();
    storage.saveState(state.game);
    renderAllTabs();
    ui.showToast("info", "Réinitialisation", "Progression réinitialisée");
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
    renderAllTabs();
    ui.showToast("info", "Réinitialisation", "Catalogue réinitialisé");
  }


  function highlightCatalogCard(questId) {
    if (!questId) return;
    const card = ui.refs.catalogList.querySelector(`[data-quest-id="${questId}"]`);
    if (!card) return;
    card.classList.add("is-highlighted");
    setTimeout(() => card.classList.remove("is-highlighted"), 700);
  }


  function renderAllTabs() {
    renderTodayTab();
    renderCreateTab();
    renderSettingsTab();
  }

  function renderForActiveTab() {
    if (ui.activeTab === "today") renderTodayTab();
    if (ui.activeTab === "create") renderCreateTab();
    if (ui.activeTab === "settings") renderSettingsTab();
  }

  function setActiveTab(tabId) {
    ui.activeTab = tabId;
    ui.refs.tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tabTarget === ui.activeTab;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    ui.refs.tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== ui.activeTab;
    });
  }

  // === SECTION: Event handlers ===
  function attachEvents() {
    const unlockAudioOnce = () => {
      audioFx.unlock();
      document.removeEventListener("pointerdown", unlockAudioOnce);
      document.removeEventListener("keydown", unlockAudioOnce);
    };
    document.addEventListener("pointerdown", unlockAudioOnce, { once: true });
    document.addEventListener("keydown", unlockAudioOnce, { once: true });

    ui.refs.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTab(button.dataset.tabTarget);
      });
    });

    ui.refs.questsList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='toggle-complete']");
      if (!button) return;
      button.classList.remove("btn-punch");
      button.offsetHeight;
      button.classList.add("btn-punch");
      toggleQuestCompletion(button.dataset.id);
    });

    ui.refs.catalogSearch.addEventListener("input", () => {
      ui.createSearch = ui.refs.catalogSearch.value;
      renderCreateTab();
    });

    ui.refs.filterSelect.addEventListener("change", () => {
      ui.createFilter = ui.refs.filterSelect.value;
      state.createUi.filter = ui.createFilter;
      storage.saveCreateUi(state.createUi);
      renderCreateTab();
    });

    ui.refs.sortSelect.addEventListener("change", () => {
      ui.createSort = ui.refs.sortSelect.value;
      state.createUi.sort = ui.createSort;
      storage.saveCreateUi(state.createUi);
      renderCreateTab();
    });

    ui.refs.hapticsToggle.addEventListener("change", () => {
      state.settings.hapticsEnabled = ui.refs.hapticsToggle.checked;
      ui.refs.hapticsToggleState.textContent = state.settings.hapticsEnabled ? "ON" : "OFF";
      storage.saveSettings(state.settings);
      if (state.settings.hapticsEnabled) haptics.tap();
    });

    ui.refs.reduceMotionToggle.addEventListener("change", () => {
      state.settings.reduceMotion = ui.refs.reduceMotionToggle.checked;
      ui.refs.reduceMotionState.textContent = state.settings.reduceMotion ? "ON" : "OFF";
      applyMotionPreferences();
      storage.saveSettings(state.settings);
      ui.showToast("info", "Animations", state.settings.reduceMotion ? "Animations réduites activées." : "Animations réduites désactivées.");
    });

    ui.refs.soundsToggle.addEventListener("change", () => {
      state.settings.soundsEnabled = ui.refs.soundsToggle.checked;
      ui.refs.soundsToggleState.textContent = state.settings.soundsEnabled ? "ON" : "OFF";
      ui.refs.soundsVolumeRow.hidden = !state.settings.soundsEnabled;
      if (state.settings.soundsEnabled) {
        audioFx.unlock();
        audioFx.play("pop");
      }
      storage.saveSettings(state.settings);
    });

    ui.refs.soundsVolumeRange.addEventListener("input", () => {
      state.settings.soundsVolume = clamp(Math.round(Number(ui.refs.soundsVolumeRange.value) || 0), 0, 100);
      ui.refs.soundsVolumeValue.textContent = `${state.settings.soundsVolume}%`;
      storage.saveSettings(state.settings);
      audioFx.play("pop");
    });

    ui.refs.developerModeToggle.addEventListener("change", () => {
      state.settings.developerModeEnabled = ui.refs.developerModeToggle.checked;
      ui.refs.developerModeState.textContent = state.settings.developerModeEnabled ? "ON" : "OFF";
      if (!state.settings.developerModeEnabled) {
        state.game.debug.useDebugDate = false;
        state.game.debug.debugDate = null;
        handleDayChange();
        storage.saveState(state.game);
      }
      storage.saveSettings(state.settings);
      renderTodayTab();
      renderSettingsTab();
    });

    ui.refs.debugDateToggle.addEventListener("change", () => {
      if (!state.settings.developerModeEnabled) return;
      state.game.debug.useDebugDate = ui.refs.debugDateToggle.checked;
      if (!state.game.debug.useDebugDate) state.game.debug.debugDate = null;
      ui.refs.debugDateInput.disabled = !state.game.debug.useDebugDate;
      if (state.game.debug.useDebugDate && !state.game.debug.debugDate) {
        state.game.debug.debugDate = toIsoDate(new Date());
      }
      ui.refs.debugDateInput.value = state.game.debug.debugDate || "";
      handleDayChange();
      storage.saveState(state.game);
      renderTodayTab();
      renderSettingsTab();
    });

    ui.refs.debugDateInput.addEventListener("change", () => {
      if (!state.settings.developerModeEnabled || !ui.refs.debugDateInput.value) return;
      state.game.debug.debugDate = ui.refs.debugDateInput.value;
      handleDayChange();
      storage.saveState(state.game);
      renderTodayTab();
      renderSettingsTab();
    });

    ui.refs.vacationToggle.addEventListener("change", () => {
      const wantsVacation = ui.refs.vacationToggle.checked;
      const vacationEnabled = PROGRESSION_CONFIG.streakRules?.vacationRules?.enabled;
      if (!vacationEnabled) {
        ui.refs.vacationToggle.checked = false;
        state.game.daily.vacationMode = false;
        return;
      }
      if (wantsVacation && state.game.progress.vacationDaysRemaining < 1) {
        ui.refs.vacationToggle.checked = false;
        state.game.daily.vacationMode = false;
        ui.showToast("warn", "Vacances", "Aucun jour vacances restant.");
        return;
      }
      if (wantsVacation && !state.game.daily.vacationMode) {
        state.game.progress.vacationDaysRemaining = Math.max(0, state.game.progress.vacationDaysRemaining - 1);
        logEvent("VACATION_DAY_ARMED", { dateKey: getActiveDateIso(), vacationDaysRemaining: state.game.progress.vacationDaysRemaining });
      }
      state.game.daily.vacationMode = wantsVacation;
      storage.saveState(state.game);
      renderTodayTab();
      renderSettingsTab();
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
        highlightCatalogCard(id);
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
      haptics.tap();
      ui.selectedIds.clear();
      renderTodayTab();
      renderCreateTab();
    });

    ui.refs.newQuestBtn.addEventListener("click", () => openQuestEditor("create"));
    ui.refs.resetBtn.addEventListener("click", resetProgressOnly);
    ui.refs.catalogResetBtn.addEventListener("click", resetCatalogOnly);
    ui.refs.claimWeeklyChestBtn.addEventListener("click", () => {
      const result = claimWeeklyChestReward();
      if (result.ok) {
        ui.showToast("success", "Coffre hebdo", `${result.chestTier.id} ouvert : +${result.chestTier.bonusXp} XP • +${result.chestTier.bonusGold} Gold`);
        haptics.complete();
        audioFx.play("coin");
      } else if (result.reason === "already_claimed") {
        ui.showToast("info", "Coffre hebdo", "Déjà récupéré.");
      } else {
        ui.showToast("warn", "Coffre hebdo", "Score insuffisant pour le coffre.");
      }
      storage.saveState(state.game);
      renderTodayTab();
      renderSettingsTab();
    });

    ui.refs.editorModal.addEventListener("click", (event) => {
      const close = event.target.closest("[data-action='close-editor']");
      if (close) {
        haptics.tap();
        closeQuestEditor();
      }
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

    ui.refs.levelUpOverlay.addEventListener("click", (event) => {
      if (event.target === ui.refs.levelUpOverlay) ui.closeLevelUpOverlay();
    });

    ui.refs.levelUpCloseBtn.addEventListener("click", () => {
      haptics.tap();
      ui.closeLevelUpOverlay();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (ui.refs.levelUpOverlay.hidden) return;
      ui.closeLevelUpOverlay();
    });
  }

  function init() {
    ui.bindRefs();
    ui.createFilter = FILTER_LABELS[state.createUi.filter] ? state.createUi.filter : "all";
    ui.createSort = ["recent", "az", "xpDesc", "goldDesc"].includes(state.createUi.sort) ? state.createUi.sort : "recent";
    ui.refs.filterSelect.value = ui.createFilter;
    ui.refs.sortSelect.value = ui.createSort;
    renderSettingsTab();
    applyMotionPreferences();
    setActiveTab(ui.activeTab);
    cleanupCompletedIds();
    recomputeTotalXp();
    const computedLevel = computeLevelProgress(state.game.totalXp).level;
    state.game.level = Math.max(state.game.level, computedLevel);
    state.game.progress.level = state.game.level;
    state.game.currencies.totalXp = state.game.totalXp;
    handleDayChange();
    attachEvents();
    storage.saveState(state.game);
    renderAllTabs();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
