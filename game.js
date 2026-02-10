(function initHabitHub() {
  // === SECTION: Config access ===
  const { BASE_QUESTS, ICON_CATALOG, initialGameState: INITIAL_GAME_STATE, progressionConfig: PROGRESSION_CONFIG, levelingConfig: LEVELING_CONFIG, progression: PROGRESSION, features: FEATURES, economyConfig: ECONOMY_CONFIG, ui: UI_CONFIG } = HRPG.CONFIG;

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


  function getEffortScaleConfig() {
    const scale = ECONOMY_CONFIG?.effortScale || {};
    const min = clamp(Math.floor(Number(scale.min) || 1), 1, 10);
    const max = clamp(Math.floor(Number(scale.max) || 10), min, 10);
    const defaultEffort = clamp(Math.floor(Number(scale.default) || 5), min, max);
    return { min, max, defaultEffort };
  }

  function getEconomyCapRanges() {
    const ranges = ECONOMY_CONFIG?.dailyCapRanges || {};
    const xpMin = Math.max(0, Math.floor(Number(ranges.xp?.min) || 0));
    const xpMax = Math.max(xpMin, Math.floor(Number(ranges.xp?.max) || 400));
    const xpStep = Math.max(1, Math.floor(Number(ranges.xp?.step) || 1));
    const goldMin = Math.max(0, Math.floor(Number(ranges.gold?.min) || 0));
    const goldMax = Math.max(goldMin, Math.floor(Number(ranges.gold?.max) || 250));
    const goldStep = Math.max(1, Math.floor(Number(ranges.gold?.step) || 1));
    return {
      xp: { min: xpMin, max: xpMax, step: xpStep },
      gold: { min: goldMin, max: goldMax, step: goldStep },
    };
  }

  function isGoldFeatureEnabled() {
    return FEATURES?.goldEnabled === true;
  }

  function isGoldEnabled() {
    if (!isGoldFeatureEnabled()) return false;
    return ECONOMY_CONFIG.goldEnabled !== false;
  }

  function formatRewardText(xpValue, goldValue, withPlusPrefix = true) {
    const safeXp = Math.max(0, Math.floor(Number(xpValue) || 0));
    const safeGold = Math.max(0, Math.floor(Number(goldValue) || 0));
    const prefix = withPlusPrefix ? "+" : "";
    if (!isGoldEnabled()) return `${prefix}${safeXp} XP`;
    return `${prefix}${safeXp} XP • ${prefix}${safeGold} Gold`;
  }

  function getEconomyPresets() {
    const presets = ECONOMY_CONFIG?.smoothingPresets;
    if (!presets || typeof presets !== "object") return {};
    return presets;
  }

  function getPresetLabel(presetKey) {
    return { relax: "Relax", standard: "Standard", strict: "Strict" }[presetKey] || presetKey;
  }

  function getConfiguredDefaultPreset() {
    const configured = typeof ECONOMY_CONFIG.smoothingPreset === "string" ? ECONOMY_CONFIG.smoothingPreset : "standard";
    return getEconomyPresets()[configured] ? configured : "standard";
  }

  function resolveEconomyOverrides(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const ranges = getEconomyCapRanges();
    const xpDefault = Math.floor(Number(ECONOMY_CONFIG.dailyXpCapBase) || 0);
    const goldDefault = Math.floor(Number(ECONOMY_CONFIG.dailyGoldCapBase) || 0);
    const fallbackGoldEnabled = ECONOMY_CONFIG.goldEnabledDefault !== false;
    const smoothingPreset = typeof source.smoothingPreset === "string" && getEconomyPresets()[source.smoothingPreset]
      ? source.smoothingPreset
      : getConfiguredDefaultPreset();
    return {
      goldEnabled: isGoldFeatureEnabled() && (source.goldEnabled !== undefined ? source.goldEnabled !== false : fallbackGoldEnabled),
      dailyXpCapBase: clamp(Math.floor(Number(source.dailyXpCapBase ?? xpDefault) || 0), ranges.xp.min, ranges.xp.max),
      dailyGoldCapBase: clamp(Math.floor(Number(source.dailyGoldCapBase ?? goldDefault) || 0), ranges.gold.min, ranges.gold.max),
      smoothingPreset,
    };
  }

  function ensureEconomySettingsShape(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const overrides = resolveEconomyOverrides(safe.economyOverrides ?? safe.economy);
    const economy = {
      goldEnabled: overrides.goldEnabled,
      dailyXpCap: overrides.dailyXpCapBase,
      dailyGoldCap: overrides.dailyGoldCapBase,
    };
    return {
      ...safe,
      economy,
      economyOverrides: {
        ...overrides,
        dailyXpCapBase: economy.dailyXpCap,
        dailyGoldCapBase: economy.dailyGoldCap,
      },
    };
  }

  function applyEconomySettingsToConfig(settings) {
    const normalizedSettings = ensureEconomySettingsShape(settings);
    const overrides = normalizedSettings.economyOverrides;
    ECONOMY_CONFIG.goldEnabled = isGoldFeatureEnabled() && overrides.goldEnabled;
    ECONOMY_CONFIG.dailyXpCapBase = overrides.dailyXpCapBase;
    ECONOMY_CONFIG.dailyGoldCapBase = overrides.dailyGoldCapBase;
    ECONOMY_CONFIG.smoothingPreset = overrides.smoothingPreset;
  }

  function sanitizeRewardInput(value) {
    if (!value || typeof value !== "object") return undefined;
    const rewardInput = {};
    if (value.xp !== undefined) rewardInput.xp = clamp(Math.round(Number(value.xp) || 0), 0, 999);
    if (value.gold !== undefined) rewardInput.gold = clamp(Math.round(Number(value.gold) || 0), 0, 999);
    return Object.keys(rewardInput).length ? rewardInput : undefined;
  }

  function estimateEffortFromXp(xpValue) {
    const scale = getEffortScaleConfig();
    const xpTable = Array.isArray(ECONOMY_CONFIG?.effortXpTable) ? ECONOMY_CONFIG.effortXpTable : [];
    const safeXp = Math.max(0, Math.round(Number(xpValue) || 0));
    let bestEffort = scale.defaultEffort;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let effort = scale.min; effort <= scale.max; effort += 1) {
      const tableXp = Math.max(0, Math.round(Number(xpTable[effort - 1]) || 0));
      const delta = Math.abs(tableXp - safeXp);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestEffort = effort;
      }
    }

    return clamp(bestEffort, scale.min, scale.max);
  }

  function sanitizeEffort(value, xpFallback) {
    const scale = getEffortScaleConfig();
    const numericValue = Number(value);
    const hasExplicitEffort = Number.isFinite(numericValue);
    if (hasExplicitEffort) {
      return clamp(Math.round(numericValue), scale.min, scale.max);
    }
    if (Number.isFinite(Number(xpFallback))) {
      return estimateEffortFromXp(xpFallback);
    }
    return scale.defaultEffort;
  }

  function sanitizeQuestOverride(override) {
    if (!override || typeof override !== "object") return {};
    const next = { ...override };
    if (override.title !== undefined) next.title = sanitizeTitle(override.title);
    if (override.xp !== undefined) next.xp = clamp(Math.round(Number(override.xp) || 0), 1, 200);
    if (override.gold !== undefined) next.gold = clamp(Math.round(Number(override.gold) || 0), 0, 200);
    if (override.effort !== undefined || override.xp !== undefined) {
      next.effort = sanitizeEffort(override.effort, override.xp);
    }
    if (!catalog.iconMap.has(override.icon)) delete next.icon;
    const rewardInput = sanitizeRewardInput(override.rewardInput);
    if (rewardInput) next.rewardInput = rewardInput;
    else delete next.rewardInput;
    return next;
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
      const xp = Math.max(0, Number(claim.xpGranted ?? claim.xp) || 0);
      const gold = Math.max(0, Number(claim.goldGranted ?? claim.gold) || 0);
      const claimedAt = typeof claim.claimedAt === "string" ? claim.claimedAt : new Date().toISOString();
      acc[key] = { claimedAt, xp, gold, xpGranted: xp, goldGranted: gold };
      return acc;
    }, {});
  }

  function getClaimGrantedValue(claim, currency) {
    if (!claim || typeof claim !== "object") return 0;
    const grantedKey = currency === "gold" ? "goldGranted" : "xpGranted";
    const fallbackKey = currency === "gold" ? "gold" : "xp";
    return Math.max(0, Math.floor(Number(claim[grantedKey] ?? claim[fallbackKey]) || 0));
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
    hasPendingCatalogMigration: false,
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
        const hadState = save.state && typeof save.state === "object";
        const stateChanged = hadState ? JSON.stringify(save.state) !== JSON.stringify(migrated) : true;
        const metadataChanged = Number(save.schemaVersion) !== migrated.v || typeof save.updatedAt !== "string";
        if (stateChanged || metadataChanged) {
          this.saveJson(this.keys.save, {
            schemaVersion: migrated.v,
            updatedAt: new Date().toISOString(),
            state: migrated,
          });
        }
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

      let hasMigration = false;
      const sanitized = list
        .filter((entry) => entry && typeof entry.id === "string")
        .map((entry) => {
          const normalized = sanitizeQuest(entry);
          if (!normalized) return null;
          const sourceEffort = Number(entry.effort);
          const effortNeedsMigration = entry.effort === undefined || !Number.isInteger(sourceEffort) || sourceEffort !== normalized.effort;
          const rewardInputNeedsMigration = entry.rewardInput !== undefined && JSON.stringify(entry.rewardInput) !== JSON.stringify(normalized.rewardInput);
          if (effortNeedsMigration || rewardInputNeedsMigration) hasMigration = true;
          return normalized;
        })
        .filter(Boolean);

      this.hasPendingCatalogMigration = this.hasPendingCatalogMigration || hasMigration;
      return sanitized;
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
      if (!obj || typeof obj !== "object") return {};

      let hasMigration = false;
      const sanitized = Object.entries(obj).reduce((acc, [id, override]) => {
        if (typeof id !== "string") return acc;
        const normalized = sanitizeQuestOverride(override);
        if (!Object.keys(normalized).length) return acc;
        if (JSON.stringify(override) !== JSON.stringify(normalized)) hasMigration = true;
        acc[id] = normalized;
        return acc;
      }, {});

      this.hasPendingCatalogMigration = this.hasPendingCatalogMigration || hasMigration;
      return sanitized;
    },
    saveOverrides(overrides) {
      this.saveJson(this.keys.overrides, overrides);
    },
    loadSettings() {
      const settings = this.loadJson(this.keys.settings, {});
      const safeSettings = settings && typeof settings === "object" ? settings : {};
      const normalizedSettings = ensureEconomySettingsShape(safeSettings);
      return {
        hapticsEnabled: safeSettings.hapticsEnabled !== false,
        developerModeEnabled: safeSettings.developerModeEnabled === true,
        reduceMotion: safeSettings.reduceMotion === true,
        soundsEnabled: safeSettings.soundsEnabled === true,
        soundsVolume: clamp(Math.round(Number(safeSettings.soundsVolume) || 70), 0, 100),
        economy: normalizedSettings.economy,
        economyOverrides: normalizedSettings.economyOverrides,
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
        effort: sanitizeEffort(override.effort ?? quest.effort, override.xp ?? quest.xp),
        icon: this.iconMap.has(override.icon) ? override.icon : quest.icon,
        source: isSeed ? "seed" : "custom",
        isHidden: state.hiddenQuestIds.includes(quest.id),
        hasOverride: Boolean(state.questOverrides[quest.id]),
        rewardInput: sanitizeRewardInput(override.rewardInput ?? quest.rewardInput),
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
    progressRatios: {},
    editor: { open: false, mode: "create", questId: null, icon: ICON_CATALOG[0].key },
    bindRefs() {
      this.refs = {
        tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
        tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
        questsList: document.getElementById("quests-list"),
        todayOpenProgressionBtn: document.getElementById("today-open-progression-btn"),
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
        streakStatus: document.getElementById("streak-status"),
        streakProtections: document.getElementById("streak-protections"),
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
        economyGoldToggle: document.getElementById("economy-gold-toggle"),
        economyGoldState: document.getElementById("economy-gold-state"),
        economyXpCapRange: document.getElementById("economy-xp-cap-range"),
        economyXpCapValue: document.getElementById("economy-xp-cap-value"),
        economyGoldCapRow: document.getElementById("economy-gold-cap-row"),
        economyGoldCapRange: document.getElementById("economy-gold-cap-range"),
        economyGoldCapValue: document.getElementById("economy-gold-cap-value"),
        economyPresetButtons: Array.from(document.querySelectorAll("[data-economy-preset]")),
        economyAuditStatus: document.getElementById("economy-audit-status"),
        economyAuditPotentialXp: document.getElementById("economy-audit-potential-xp"),
        economyAuditMaxXp: document.getElementById("economy-audit-max-xp"),
        economyAuditLevelTime: document.getElementById("economy-audit-level-time"),
        economyAuditSource: document.getElementById("economy-audit-source"),
        economyAuditRecommendBtn: document.getElementById("economy-audit-recommend-btn"),
        economyAuditRecommendText: document.getElementById("economy-audit-recommend-text"),
        goldStatCard: document.getElementById("gold-stat-card"),
        goldSortOption: document.getElementById("sort-gold-desc-option"),
        progressionBossStreak: document.getElementById("progression-boss-streak"),
        progressionYearMilestones: document.getElementById("progression-year-milestones"),
        catalogList: document.getElementById("catalog-list"),
        bulkHideBtn: document.getElementById("bulk-hide-btn"),
        catalogResetBtn: document.getElementById("catalog-reset-btn"),
        newQuestBtn: document.getElementById("new-quest-btn"),
        editorModal: document.getElementById("quest-editor-modal"),
        editorTitle: document.getElementById("editor-title"),
        editorForm: document.getElementById("quest-editor-form"),
        editorName: document.getElementById("editor-title-input"),
        editorEffort: document.getElementById("editor-effort-input"),
        editorEffortLabel: document.getElementById("editor-effort-label"),
        editorRewardPreview: document.getElementById("editor-reward-preview"),
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
      this.refs.levelUpMessage.textContent = isGoldEnabled() ? `Récompense: +${rewardGold} Gold` : "Récompense: progression XP";
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
  applyEconomySettingsToConfig(state.settings);
  state.game.daily = sanitizeDailyState(state.game.daily);
  state.game.cycles = sanitizeCycles(state.game.cycles);
  state.game.v = clamp(Math.floor(Number(state.game.v) || 1), 1, 999);
  normalizeRewardClaimsState();
  assertState(state.game);

  if (storage.hasPendingCatalogMigration) {
    persistCatalog();
  }

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
    const xp = clamp(Math.round(Number(quest.xp) || 0), 1, 200);
    const rewardInput = sanitizeRewardInput(quest.rewardInput);
    const sanitizedQuest = {
      id: typeof quest.id === "string" ? quest.id : createQuestId(),
      title,
      xp,
      gold: clamp(Math.round(Number(quest.gold) || 0), 0, 200),
      effort: sanitizeEffort(quest.effort, xp),
      icon: catalog.iconMap.has(quest.icon) ? quest.icon : ICON_CATALOG[0].key,
      createdAt: Number(quest.createdAt) || Date.now(),
    };
    if (rewardInput) sanitizedQuest.rewardInput = rewardInput;
    return sanitizedQuest;
  }

  function createQuestId() {
    return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getProgressPalette(variant, ratio) {
    const safeRatio = clamp(Number(ratio) || 0, 0, 1);
    if (variant === "risk") {
      if (safeRatio < 0.5) return { accent: "#57d17f", glow: "rgba(87, 209, 127, 0.34)", bucket: "low" };
      if (safeRatio < 0.8) return { accent: "#f59c4a", glow: "rgba(245, 156, 74, 0.35)", bucket: "mid" };
      return { accent: "#ff5e57", glow: "rgba(255, 94, 87, 0.4)", bucket: "high" };
    }
    if (variant === "neutral") {
      if (safeRatio < 0.5) return { accent: "#6fa8ff", glow: "rgba(111, 168, 255, 0.28)", bucket: "low" };
      if (safeRatio < 0.8) return { accent: "#8198ff", glow: "rgba(129, 152, 255, 0.3)", bucket: "mid" };
      return { accent: "#7eb1ff", glow: "rgba(126, 177, 255, 0.3)", bucket: "high" };
    }
    if (safeRatio < 0.5) return { accent: "#63a7ff", glow: "rgba(99, 167, 255, 0.33)", bucket: "low" };
    if (safeRatio < 0.8) return { accent: "#9a86ff", glow: "rgba(154, 134, 255, 0.34)", bucket: "mid" };
    return { accent: "#f4cb57", glow: "rgba(244, 203, 87, 0.42)", bucket: "high" };
  }

  function renderProgressBar(options) {
    const config = options && typeof options === "object" ? options : {};
    const value = Math.max(0, Number(config.value) || 0);
    const max = Math.max(1, Number(config.max) || 1);
    const ratio = clamp(value / max, 0, 1);
    const variant = ["reward", "risk", "neutral"].includes(config.variant) ? config.variant : "neutral";
    const palette = getProgressPalette(variant, ratio);
    const label = typeof config.label === "string" ? config.label : "Progression";
    const percent = Math.round(ratio * 100);
    const showPercent = config.showPercent === true;
    const showNumbers = config.showNumbers !== false;
    const sublabel = typeof config.sublabel === "string" && config.sublabel.trim() ? config.sublabel.trim() : "";
    const safeValue = Math.floor(value);
    const safeMax = Math.floor(max);
    const numbers = showNumbers ? `${safeValue} / ${safeMax}${showPercent ? ` • ${percent}%` : ""}` : `${percent}%`;
    const ariaText = `${label} ${safeValue} sur ${safeMax}${showPercent ? ` (${percent}%)` : ""}`;

    const classes = ["pbar", `pbar--${variant}`, `is-${palette.bucket}`];
    if (config.glow !== false && ratio >= 0.85 && !prefersReducedMotion()) classes.push("pbar--glow");
    const markup = `
      <div class="${classes.join(" ")}" role="group" aria-label="${label}">
        <div class="pbar-meta">
          <div><span class="pbar-label">${label}</span>${sublabel ? `<span class="pbar-sub">${sublabel}</span>` : ""}</div>
          <span class="pbar-numbers">${numbers}</span>
        </div>
        <div class="pbar-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${safeMax}" aria-valuenow="${safeValue}" aria-valuetext="${ariaText}">
          <div class="pbar-fill"></div>
        </div>
      </div>`;

    if (!config.id) return markup;
    const host = document.getElementById(config.id);
    if (!host) return markup;
    host.innerHTML = markup;
    const node = host.querySelector(".pbar");
    if (!node) return markup;
    node.style.setProperty("--bar-ratio", String(ratio));
    node.style.setProperty("--bar-accent", palette.accent);
    node.style.setProperty("--bar-glow", palette.glow);
    const ratioKey = typeof config.pulseKey === "string" ? config.pulseKey : config.id;
    const previousRatio = Number(ui.progressRatios[ratioKey]);
    if (config.pulseOnIncrease !== false && !prefersReducedMotion() && Number.isFinite(previousRatio) && ratio > previousRatio) {
      node.classList.remove("pbar-pulse");
      void node.offsetWidth;
      node.classList.add("pbar-pulse");
    }
    ui.progressRatios[ratioKey] = ratio;
    return markup;
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

  function getLevelingConfig() {
    const baseXpToLevel2 = Math.max(1, Math.floor(Number(LEVELING_CONFIG?.baseXpToLevel2) || 120));
    const growth = clamp(Number(LEVELING_CONFIG?.growth) || 1.3, 1.05, 2);
    return { baseXpToLevel2, growth };
  }

  function xpForNextLevel(level) {
    const { baseXpToLevel2, growth } = getLevelingConfig();
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(1, Math.round(baseXpToLevel2 * growth ** (safeLevel - 1)));
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
      return acc + getClaimGrantedValue(claim, "xp");
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
      acc.xp += getClaimGrantedValue(claim, "xp");
      acc.gold += getClaimGrantedValue(claim, "gold");
      return acc;
    }, { xp: 0, gold: 0 });
  }

  function normalizeRewardClaimRecord(claim, claimKey) {
    if (!claim || typeof claim !== "object") return { changed: false, claim };
    const xpGranted = getClaimGrantedValue(claim, "xp");
    const goldGranted = getClaimGrantedValue(claim, "gold");
    const xpComputed = Math.max(xpGranted, Math.floor(Number(claim.xpComputed) || 0));
    const goldComputed = Math.max(goldGranted, Math.floor(Number(claim.goldComputed) || 0));
    const normalized = {
      ...claim,
      xp: xpGranted,
      gold: goldGranted,
      xpGranted,
      goldGranted,
      xpComputed,
      goldComputed,
    };
    const changed = Number(claim.xp) !== xpGranted
      || Number(claim.gold) !== goldGranted
      || Number(claim.xpGranted) !== xpGranted
      || Number(claim.goldGranted) !== goldGranted
      || Number(claim.xpComputed) !== xpComputed
      || Number(claim.goldComputed) !== goldComputed;
    if (changed) {
      logEvent("CLAIM_CORRECTION", {
        claimKey,
        reason: "normalize_granted_reward",
        before: {
          xp: Number(claim.xp) || 0,
          gold: Number(claim.gold) || 0,
          xpGranted: Number(claim.xpGranted) || 0,
          goldGranted: Number(claim.goldGranted) || 0,
        },
        after: { xp: xpGranted, gold: goldGranted, xpGranted, goldGranted, xpComputed, goldComputed },
      });
    }
    return { changed, claim: normalized };
  }

  function normalizeRewardClaimsState() {
    const entries = Object.entries(state.game.claims.rewardClaims || {});
    let changed = false;
    entries.forEach(([claimKey, claim]) => {
      const normalized = normalizeRewardClaimRecord(claim, claimKey);
      if (!normalized.changed) return;
      state.game.claims.rewardClaims[claimKey] = normalized.claim;
      changed = true;
    });
    return changed;
  }

  function logCapSnapshot(dateKey, reason, actionId = null) {
    const caps = getDailyCaps(state.game.level);
    const totals = getDailyRewardTotals(dateKey);
    logEvent("CAP_RECALCULATED", {
      reason,
      actionId,
      dateKey,
      totalXpGranted: totals.xp,
      totalGoldGranted: totals.gold,
      xpRemaining: Math.max(0, caps.capXpPerDay - totals.xp),
      goldRemaining: Math.max(0, caps.capGoldPerDay - totals.gold),
      capXpPerDay: caps.capXpPerDay,
      capGoldPerDay: caps.capGoldPerDay,
    });
  }

  function getDailyCaps(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    const levelOffset = Math.max(0, safeLevel - 1);
    const fallbackCaps = PROGRESSION_CONFIG.antiExploit?.caps || {};
    const capXpPerDay = Math.max(0, Math.floor(Number(ECONOMY_CONFIG.dailyXpCapBase ?? fallbackCaps.capXpPerDay) || 0) + (Math.max(0, Math.floor(Number(ECONOMY_CONFIG.dailyXpCapPerLevel) || 0)) * levelOffset));
    const capGoldPerDayRaw = Math.max(0, Math.floor(Number(ECONOMY_CONFIG.dailyGoldCapBase ?? fallbackCaps.capGoldPerDay) || 0) + (Math.max(0, Math.floor(Number(ECONOMY_CONFIG.dailyGoldCapPerLevel) || 0)) * levelOffset));
    const capGoldPerDay = isGoldEnabled() ? capGoldPerDayRaw : 0;
    return { capXpPerDay, capGoldPerDay };
  }

  function getDateKeyOffsetFromActive(offsetDays) {
    const safeOffset = Math.max(0, Math.floor(Number(offsetDays) || 0));
    const date = new Date(`${getActiveDateIso()}T00:00:00`);
    date.setDate(date.getDate() - safeOffset);
    return toIsoDate(date);
  }

  function getRecentDailyXpAverage(daysWindow = 7) {
    const safeWindow = Math.max(1, Math.floor(Number(daysWindow) || 7));
    const totals = [];
    for (let index = 0; index < safeWindow; index += 1) {
      const dayKey = getDateKeyOffsetFromActive(index);
      totals.push(getDailyRewardTotals(dayKey).xp);
    }
    const activeDays = totals.filter((xp) => xp > 0);
    if (!activeDays.length) {
      return { averageXp: 0, activeDays: 0, windowDays: safeWindow };
    }
    const averageXp = activeDays.reduce((sum, xp) => sum + xp, 0) / activeDays.length;
    return { averageXp, activeDays: activeDays.length, windowDays: safeWindow };
  }

  function computeEconomyAudit() {
    const visibleQuests = catalog.getVisibleQuests();
    const potentialXp = visibleQuests.reduce((sum, quest) => sum + getRewardPreviewFromEffort(quest).xp, 0);
    const todayKey = getActiveDateIso();
    const todayTotals = getDailyRewardTotals(todayKey);
    const dailyCaps = getDailyCaps(state.game.level);
    const xpRemainingFromCap = Math.max(0, dailyCaps.capXpPerDay - todayTotals.xp);
    const maxXpToday = Math.max(0, Math.min(potentialXp, xpRemainingFromCap));

    const levelProgress = computeLevelProgressAtLevel(state.game.totalXp, state.game.level);
    const xpRemainingForLevel = Math.max(0, levelProgress.xpRemaining);
    const rollingAverage = getRecentDailyXpAverage(7);
    const dailyXpUsed = rollingAverage.activeDays > 0 ? rollingAverage.averageXp : Math.max(0, dailyCaps.capXpPerDay);
    const sourceLabel = rollingAverage.activeDays > 0
      ? `Base estimation : moyenne ${rollingAverage.activeDays}/${rollingAverage.windowDays} jours actifs`
      : "Base estimation : cap XP/jour";

    const daysToLevel = dailyXpUsed > 0 ? xpRemainingForLevel / dailyXpUsed : Number.POSITIVE_INFINITY;
    const stableRange = ECONOMY_CONFIG.economyAudit?.stableDaysToLevel || {};
    const minDays = Math.max(1, Number(stableRange.min) || 5);
    const maxDays = Math.max(minDays, Number(stableRange.max) || 14);

    let status = "stable";
    let statusText = "Vert • progression stable";
    if (Number.isFinite(daysToLevel) && daysToLevel < minDays) {
      status = "too_fast";
      statusText = "Orange • progression trop rapide";
    }
    if (!Number.isFinite(daysToLevel) || daysToLevel > maxDays) {
      status = "too_slow";
      statusText = "Orange • progression trop lente";
    }

    return {
      potentialXp,
      maxXpToday,
      daysToLevel,
      sourceLabel,
      status,
      statusText,
      xpRemainingForLevel,
      capXpPerDay: dailyCaps.capXpPerDay,
    };
  }

  function computeEconomyAuditRecommendation(audit) {
    const recommendation = ECONOMY_CONFIG.economyAudit?.recommendation || {};
    const capRanges = getEconomyCapRanges();
    const targetDays = Math.max(1, Number(recommendation.targetDaysToLevel) || 9);
    const roundTo = Math.max(1, Number(recommendation.roundTo) || capRanges.xp.step || 5);
    const tooFastMultiplier = Math.max(0.1, Number(recommendation.tooFastMultiplier) || 0.8);
    const tooSlowMultiplier = Math.max(0.1, Number(recommendation.tooSlowMultiplier) || 1.2);

    let suggested = audit.capXpPerDay;
    if (audit.status === "too_fast") suggested = Math.floor(audit.capXpPerDay * tooFastMultiplier);
    if (audit.status === "too_slow") suggested = Math.ceil(audit.capXpPerDay * tooSlowMultiplier);

    const targetFromLevel = targetDays > 0 ? Math.ceil(Math.max(0, audit.xpRemainingForLevel) / targetDays) : audit.capXpPerDay;
    suggested = Math.max(suggested, targetFromLevel);
    suggested = Math.round(suggested / roundTo) * roundTo;
    suggested = clamp(suggested, capRanges.xp.min, capRanges.xp.max);

    return {
      suggestedCapXp: suggested,
      targetDays,
      roundTo,
    };
  }

  function applyDailyCaps(dateKey, xpWanted, goldWanted, level) {
    const caps = getDailyCaps(level);
    const totals = getDailyRewardTotals(dateKey);
    const xpRemaining = Math.max(0, caps.capXpPerDay - totals.xp);
    const goldRemaining = Math.max(0, caps.capGoldPerDay - totals.gold);
    const xpGranted = Math.max(0, Math.min(Math.max(0, Math.floor(Number(xpWanted) || 0)), xpRemaining));
    const goldGranted = Math.max(0, Math.min(Math.max(0, Math.floor(Number(goldWanted) || 0)), goldRemaining));
    return {
      xpGranted,
      goldGranted,
      xpRemaining,
      goldRemaining,
      capXpPerDay: caps.capXpPerDay,
      capGoldPerDay: caps.capGoldPerDay,
      isCapReached: xpGranted === 0 && goldGranted === 0 && (xpWanted > 0 || goldWanted > 0),
      isPartial: xpGranted < xpWanted || goldGranted < goldWanted,
    };
  }

  function computeEffectiveReward(habit, gameState, dateKey, options = {}) {
    const effortScale = getEffortScaleConfig();
    const effort = sanitizeEffort(habit?.effort, habit?.xp);
    const tableIndex = clamp(effort - 1, 0, effortScale.max - 1);
    const xpTable = Array.isArray(ECONOMY_CONFIG.effortXpTable) ? ECONOMY_CONFIG.effortXpTable : [];

    const xpComputed = Math.max(0, Math.round(Number(xpTable[tableIndex]) || 0));
    const goldRatio = Math.max(0, Number(ECONOMY_CONFIG.goldFromXpRatio ?? ECONOMY_CONFIG.goldRatio) || 0);
    const goldComputedRaw = Math.max(0, Math.round(xpComputed * goldRatio));
    const goldComputed = isGoldEnabled() ? goldComputedRaw : 0;

    const capResult = applyDailyCaps(dateKey, xpComputed, goldComputed, gameState?.level);
    const preview = options?.preview === true;
    const xpGranted = preview ? capResult.xpGranted : capResult.xpGranted;
    const goldGranted = preview ? capResult.goldGranted : capResult.goldGranted;

    return {
      xpComputed,
      goldComputed,
      xpGranted,
      goldGranted,
      xp: xpGranted,
      gold: goldGranted,
      meta: {
        effort,
        preview,
        xpComputed,
        goldComputed,
        xpRemainingBeforeClaim: capResult.xpRemaining,
        goldRemainingBeforeClaim: capResult.goldRemaining,
        capXpPerDay: capResult.capXpPerDay,
        capGoldPerDay: capResult.capGoldPerDay,
        isCapReached: capResult.isCapReached,
        isPartial: capResult.isPartial,
      },
    };
  }

  function getRewardPreviewFromEffort(habit) {
    const effortScale = getEffortScaleConfig();
    const effort = sanitizeEffort(habit?.effort, habit?.xp);
    const index = clamp(effort - 1, 0, effortScale.max - 1);
    const xpTable = Array.isArray(ECONOMY_CONFIG.effortXpTable) ? ECONOMY_CONFIG.effortXpTable : [];
    const xp = Math.max(0, Math.round(Number(xpTable[index]) || 0));
    const goldRatio = Math.max(0, Number(ECONOMY_CONFIG.goldFromXpRatio ?? ECONOMY_CONFIG.goldRatio) || 0);
    const gold = isGoldEnabled() ? Math.max(0, Math.round(xp * goldRatio)) : 0;
    return { xp, gold };
  }

  function getEffortLabel(effort) {
    const scale = getEffortScaleConfig();
    const safeEffort = sanitizeEffort(effort);
    const labels = Array.isArray(ECONOMY_CONFIG?.effortScale?.labels) ? ECONOMY_CONFIG.effortScale.labels : [];
    const index = clamp(safeEffort - scale.min, 0, Math.max(0, labels.length - 1));
    const fallback = safeEffort >= 9 ? "Boss" : (safeEffort >= 7 ? "Difficile" : (safeEffort >= 4 ? "Moyen" : "Facile"));
    return typeof labels[index] === "string" && labels[index].trim() ? labels[index] : fallback;
  }

  function updateEditorEffortUi() {
    if (!ui.refs.editorEffort) return;
    const effort = sanitizeEffort(ui.refs.editorEffort.value);
    ui.refs.editorEffort.value = String(effort);
    const reward = computeEffectiveReward({ effort }, state.game, getActiveDateIso(), { preview: true });
    const scale = getEffortScaleConfig();
    ui.refs.editorEffortLabel.textContent = `${effort}/${scale.max} • ${getEffortLabel(effort)}`;
    ui.refs.editorRewardPreview.textContent = ECONOMY_CONFIG.goldEnabled === false
      ? `Gains effectifs : +${reward.xp} XP`
      : `Gains effectifs : ${formatRewardText(reward.xp, reward.gold, true)}`;
    const ratio = ((effort - scale.min) / Math.max(1, scale.max - scale.min)) * 100;
    ui.refs.editorEffort.style.setProperty("--range-progress", `${clamp(ratio, 0, 100)}%`);
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
    const safeXpDelta = Math.floor(Number(xpDelta) || 0);
    const safeGoldDelta = isGoldEnabled() ? Math.floor(Number(goldDelta) || 0) : 0;
    state.game.xp = Math.max(0, state.game.xp + safeXpDelta);
    state.game.gold = Math.max(0, state.game.gold + safeGoldDelta);
    recomputeTotalXp();
    const progress = computeLevelProgress(state.game.totalXp);
    const nextLevel = Math.max(beforeLevel, progress.level);
    if (nextLevel > beforeLevel) {
      const bonus = isGoldEnabled() ? computeLevelUpReward(beforeLevel, nextLevel) : 0;
      state.game.gold += bonus;
      ui.showToast(isGoldEnabled() ? `Level up ! +${bonus} Gold` : "Level up !");
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

      const reward = computeEffectiveReward(params?.habit, state.game, dateKey);
      const xpGain = Math.max(0, Math.floor(Number(reward.xpGranted) || 0));
      const goldGain = Math.max(0, Math.floor(Number(reward.goldGranted) || 0));

      state.game.claims.rewardClaims[claimKey] = {
        claimedAt: new Date().toISOString(),
        ts: new Date().toISOString(),
        xp: xpGain,
        gold: goldGain,
        xpGranted: xpGain,
        goldGranted: goldGain,
        xpComputed: reward.xpComputed,
        goldComputed: reward.goldComputed,
      };

      const normalizedNewClaim = normalizeRewardClaimRecord(state.game.claims.rewardClaims[claimKey], claimKey);
      if (normalizedNewClaim.changed) {
        state.game.claims.rewardClaims[claimKey] = normalizedNewClaim.claim;
      }
      applyDelta(xpGain, goldGain);
      logEvent("CLAIM_REWARD", {
        actionId,
        dateKey,
        xpDelta: xpGain,
        goldDelta: goldGain,
        xpComputed: reward.meta.xpComputed,
        goldComputed: reward.meta.goldComputed,
        effort: reward.meta.effort,
      });

      if (reward.meta.isPartial) {
        logEvent("CAP_APPLIED", {
          actionId,
          dateKey,
          xpComputed: reward.meta.xpComputed,
          goldComputed: reward.meta.goldComputed,
          xpGranted: xpGain,
          goldGranted: goldGain,
          capXpPerDay: reward.meta.capXpPerDay,
          capGoldPerDay: reward.meta.capGoldPerDay,
        });
      }
      logCapSnapshot(dateKey, "claim", actionId);

      return {
        applied: true,
        xpDelta: xpGain,
        goldDelta: goldGain,
        reason: reward.meta.isCapReached ? "cap_reached" : (reward.meta.isPartial ? "claim_partial" : "claimed"),
      };
    }

    if (!existingClaim) {
      return { applied: false, xpDelta: 0, goldDelta: 0, reason: "missing_claim" };
    }

    const normalizedExisting = normalizeRewardClaimRecord(existingClaim, claimKey);
    if (normalizedExisting.changed) {
      state.game.claims.rewardClaims[claimKey] = normalizedExisting.claim;
    }

    const xpRollback = getClaimGrantedValue(state.game.claims.rewardClaims[claimKey], "xp");
    const goldRollback = getClaimGrantedValue(state.game.claims.rewardClaims[claimKey], "gold");
    applyDelta(-xpRollback, -goldRollback);
    delete state.game.claims.rewardClaims[claimKey];
    logEvent("ROLLBACK_REWARD", { actionId, dateKey, xpDelta: -xpRollback, goldDelta: -goldRollback });

    if (xpRollback > 0 || goldRollback > 0) {
      logEvent("ROLLBACK_PARTIAL", { actionId, dateKey, xpRolledBack: xpRollback, goldRolledBack: goldRollback });
    }
    logCapSnapshot(dateKey, "rollback", actionId);

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
        ui.showToast("info", "Quête annulée", formatRewardText(rewardResult.xpDelta, rewardResult.goldDelta, false));
      }
      haptics.undo();
    } else {
      state.game.completedQuestIds.push(questId);
      state.game.quests.completedQuestIds = state.game.completedQuestIds;
      rewardResult = claimReward({
        actionId: quest.id,
        dateKey,
        habit: quest,
        mode: "claim",
      });
      if (rewardResult.applied) {
        ui.lastCompletedQuestId = questId;
        if (rewardResult.reason === "cap_reached") {
          ui.showToast("info", "Cap atteint", "0 gain pour aujourd'hui.");
          haptics.error();
          audioFx.play("pop");
        } else if (rewardResult.reason === "claim_partial") {
          ui.showToast("info", "Quête validée (cap)", formatRewardText(rewardResult.xpDelta, rewardResult.goldDelta, true));
        } else {
          ui.showToast("success", "Quête validée", formatRewardText(rewardResult.xpDelta, rewardResult.goldDelta, true));
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
    ui.refs.xpHeroText.textContent = `XP du niveau : ${safeInto} / ${safeNeed}`;
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

  function renderRewardChips(reward) {
    const safeReward = reward && typeof reward === "object" ? reward : { xp: 0, gold: 0 };
    const xpChip = `<span class="chip chip-xp">+${Math.max(0, Math.floor(Number(safeReward.xp) || 0))} XP</span>`;
    if (!isGoldEnabled()) return xpChip;
    const gold = Math.max(0, Math.floor(Number(safeReward.gold) || 0));
    return `${xpChip}<span class="chip chip-gold">+${gold} Gold</span>`;
  }

  function applyGoldVisibility() {
    const goldVisible = isGoldEnabled();
    if (ui.refs.goldStatCard) ui.refs.goldStatCard.hidden = !goldVisible;
    if (ui.refs.economyGoldCapRow) ui.refs.economyGoldCapRow.hidden = !goldVisible;
    if (ui.refs.goldSortOption) ui.refs.goldSortOption.hidden = !goldVisible;
    if (!goldVisible && ui.createSort === "goldDesc") {
      ui.createSort = "recent";
      state.createUi.sort = "recent";
      storage.saveCreateUi(state.createUi);
      if (ui.refs.sortSelect) ui.refs.sortSelect.value = "recent";
    }
  }

  function renderStats() {
    ui.refs.xp.textContent = String(state.game.xp);
    if (ui.refs.gold) ui.refs.gold.textContent = String(state.game.gold);
    ui.refs.levelBadge.textContent = `Lv ${state.game.level}`;
    applyGoldVisibility();

    const levelProgress = computeLevelProgressAtLevel(state.game.totalXp, state.game.level);
    const safeRatio = clamp(Number(levelProgress.ratio) || 0, 0, 1);
    const safeInto = Math.max(0, Math.floor(Number(levelProgress.xpIntoLevel) || 0));
    const safeNeed = Math.max(1, Math.floor(Number(levelProgress.xpNeeded) || 1));
    const safeRemain = Math.max(0, Math.floor(Number(levelProgress.xpRemaining) || 0));

    renderXpHeroBar();
    ui.refs.levelText.textContent = `XP du niveau : ${safeInto} / ${safeNeed}`;
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
            <div class="reward-chips">${renderRewardChips(getRewardPreviewFromEffort(quest))}</div>
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
    ui.refs.streakStatus.textContent = `Streak: ${state.game.progress.streak} jour(s)`;
    ui.refs.streakProtections.textContent = `Shield: ${state.game.progress.streakShield}/1 • Rest cette semaine: ${Math.max(0, Number(state.game.progress.restDaysUsedByWeek[getWeekKey(getActiveDateIso())]) || 0)}/${Math.max(0, Number(PROGRESSION_CONFIG.streakRules?.restDayRules?.maxPerWeek) || 0)} • Vacances restantes: ${state.game.progress.vacationDaysRemaining}`;

    const weekly = state.game.cycles.weekly;
    const chestTier = getWeeklyChestTier(weekly.score);
    const dailyTiers = PROGRESSION_CONFIG.dailyTiers || {};
    const silverMin = Math.max(1, Number(dailyTiers.silver?.minObjectives) || 1);
    const goldMin = Math.max(silverMin, Number(dailyTiers.gold?.minObjectives) || silverMin);
    const nextTierMin = dailyState.tier === "none" ? Math.max(1, Number(dailyTiers.bronze?.minObjectives) || 1) : (dailyState.tier === "bronze" ? silverMin : goldMin);
    const dayTarget = dailyState.tier === "gold" ? Math.max(goldMin, dailyState.objectivesCompleted) : nextTierMin;
    const daySublabel = dailyState.tier === "gold"
      ? "Or atteint"
      : `Prochain palier: ${dailyState.tier === "none" ? "Bronze" : (dailyState.tier === "bronze" ? "Argent" : "Or")}`;
    renderProgressBar({
      id: "today-progress-day-bar",
      label: "Jour",
      value: dailyState.objectivesCompleted,
      max: dayTarget,
      variant: "reward",
      sublabel: daySublabel,
      showPercent: true,
      showNumbers: true,
    });

    const chestTiers = Array.isArray(PROGRESSION_CONFIG.weeklyRules?.chestTiers) ? PROGRESSION_CONFIG.weeklyRules.chestTiers : [];
    const weeklyChestMax = chestTiers.reduce((max, tier) => Math.max(max, Number(tier?.minScore) || 0), 0);
    const weeklyMotivatingTarget = Math.max(1, weeklyChestMax, Math.max(0, Number(weekly.bossMaxHp) || 0));
    renderProgressBar({
      id: "today-progress-week-bar",
      label: "Semaine",
      value: Math.max(0, weekly.score),
      max: weeklyMotivatingTarget,
      variant: "reward",
      sublabel: chestTier ? `Coffre: ${chestTier.id}${weekly.chestClaimed ? " (claim)" : ""}` : "Objectif hebdo",
      showPercent: true,
      showNumbers: true,
    });

    const bossGoal = Math.max(1, Number(weekly.bossMaxHp) || 1);
    const bossProgress = Math.max(0, bossGoal - Math.max(0, Number(weekly.bossHp) || 0));
    renderProgressBar({
      id: "today-progress-boss-bar",
      label: "Boss",
      value: bossProgress,
      max: bossGoal,
      variant: "reward",
      sublabel: `Streak boss: ${state.game.cycles.bossStreak}`,
      showPercent: true,
      showNumbers: true,
    });

    ui.refs.claimWeeklyChestBtn.disabled = !chestTier || weekly.chestClaimed;

    renderSettingsTab();
    ui.lastCompletedQuestId = null;

    renderStats();
  }

  function renderProgressionTab() {
    const dailyState = ensureDailyProgressState();
    const weekly = state.game.cycles.weekly;
    const chestTiers = Array.isArray(PROGRESSION_CONFIG.weeklyRules?.chestTiers) ? PROGRESSION_CONFIG.weeklyRules.chestTiers : [];
    const maxChestScore = chestTiers.reduce((max, tier) => Math.max(max, Number(tier?.minScore) || 0), 0);
    const dailyTotals = getDailyRewardTotals(getActiveDateIso());
    const dailyCaps = getDailyCaps(state.game.level);
    const bronzeMin = Math.max(1, Number(PROGRESSION_CONFIG.dailyTiers?.bronze?.minObjectives) || 1);
    const silverMin = Math.max(bronzeMin, Number(PROGRESSION_CONFIG.dailyTiers?.silver?.minObjectives) || bronzeMin);
    const goldMin = Math.max(silverMin, Number(PROGRESSION_CONFIG.dailyTiers?.gold?.minObjectives) || silverMin);
    const tierTarget = dailyState.tier === "gold" ? Math.max(goldMin, dailyState.objectivesCompleted) : (dailyState.tier === "silver" ? goldMin : (dailyState.tier === "bronze" ? silverMin : bronzeMin));

    renderProgressBar({
      id: "progression-day-tier-bar",
      label: "Palier du jour",
      value: dailyState.objectivesCompleted,
      max: tierTarget,
      variant: "reward",
      sublabel: `Tier actuel: ${getTierLabel(dailyState.tier)}`,
      showPercent: true,
      showNumbers: true,
    });
    renderProgressBar({
      id: "progression-day-cap-bar",
      label: "Cap XP du jour",
      value: dailyTotals.xp,
      max: Math.max(1, dailyCaps.capXpPerDay),
      variant: "risk",
      sublabel: "Approche du cap quotidien",
      showPercent: true,
      showNumbers: true,
    });

    renderProgressBar({
      id: "progression-week-chest-bar",
      label: "Score hebdo / coffre max",
      value: Math.max(0, weekly.score),
      max: Math.max(1, maxChestScore),
      variant: "reward",
      sublabel: "Objectif coffre",
      showPercent: true,
      showNumbers: true,
    });
    if (Number(weekly.bossMaxHp) > 0) {
      renderProgressBar({
        id: "progression-week-boss-threshold-bar",
        label: "Score hebdo / seuil boss",
        value: Math.max(0, weekly.score),
        max: Math.max(1, Number(weekly.bossMaxHp) || 1),
        variant: "reward",
        sublabel: "Rythme pour le boss",
        showPercent: true,
        showNumbers: true,
      });
    } else {
      const host = document.getElementById("progression-week-boss-threshold-bar");
      if (host) host.innerHTML = '<p class="progress-subtext">À activer bientôt</p>';
    }
    renderProgressBar({
      id: "progression-week-days-bar",
      label: "Jours validés",
      value: Object.keys(weekly.days || {}).length,
      max: 7,
      variant: "reward",
      sublabel: "Sur 7 jours",
      showPercent: true,
      showNumbers: true,
    });

    const bossGoal = Math.max(1, Number(weekly.bossMaxHp) || 1);
    const bossProgress = Math.max(0, bossGoal - Math.max(0, Number(weekly.bossHp) || 0));
    renderProgressBar({
      id: "progression-boss-main-bar",
      label: "Boss hebdo",
      value: bossProgress,
      max: bossGoal,
      variant: "reward",
      sublabel: weekly.bossDefeated ? "Boss vaincu" : "Dégâts cumulés",
      showPercent: true,
      showNumbers: true,
    });
    if (ui.refs.progressionBossStreak) {
      ui.refs.progressionBossStreak.textContent = `Streak boss: ${state.game.cycles.bossStreak}`;
    }

    const badges = Array.isArray(PROGRESSION_CONFIG.monthlyRules?.badgeThresholds) ? PROGRESSION_CONFIG.monthlyRules.badgeThresholds : [];
    const monthTarget = badges.reduce((max, badge) => Math.max(max, Number(badge?.minPoints) || 0), 0);
    const monthBadge = state.game.cycles.monthly.badgeId;
    renderProgressBar({
      id: "progression-month-bar",
      label: "Points du mois",
      value: Math.max(0, state.game.cycles.monthly.points),
      max: Math.max(1, monthTarget),
      variant: "reward",
      sublabel: monthBadge ? `Badge obtenu: ${monthBadge}` : "Badge à débloquer",
      showPercent: true,
      showNumbers: true,
    });

    const relicGoal = 12;
    const relicCount = Array.isArray(state.game.cycles.yearly.relicsUnlocked) ? state.game.cycles.yearly.relicsUnlocked.length : 0;
    renderProgressBar({
      id: "progression-year-bar",
      label: "Reliques annuelles",
      value: relicCount,
      max: relicGoal,
      variant: "reward",
      sublabel: "Milestones: 6 / 10 / 12",
      showPercent: true,
      showNumbers: true,
    });
    if (ui.refs.progressionYearMilestones) {
      const milestones = Array.isArray(state.game.cycles.yearly.milestonesClaimed) ? state.game.cycles.yearly.milestonesClaimed : [];
      ui.refs.progressionYearMilestones.textContent = milestones.length
        ? `Milestones obtenus: ${milestones.join(", ")}`
        : "Milestones: À activer bientôt";
    }
  }


  function renderEconomyAuditSection() {
    if (!ui.refs.economyAuditStatus) return;
    const audit = computeEconomyAudit();
    ui.refs.economyAuditPotentialXp.textContent = `${Math.floor(audit.potentialXp)} XP`;
    ui.refs.economyAuditMaxXp.textContent = `${Math.floor(audit.maxXpToday)} XP`;
    ui.refs.economyAuditLevelTime.textContent = Number.isFinite(audit.daysToLevel)
      ? `${Math.max(0.1, audit.daysToLevel).toFixed(1)} jour(s)`
      : "∞ (aucun gain XP)";
    ui.refs.economyAuditSource.textContent = audit.sourceLabel;
    ui.refs.economyAuditStatus.textContent = audit.statusText;
    ui.refs.economyAuditStatus.classList.toggle("audit-indicator-stable", audit.status === "stable");
    ui.refs.economyAuditStatus.classList.toggle("audit-indicator-warning", audit.status !== "stable");
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

    applyGoldVisibility();
    if (ui.refs.economyGoldToggle) ui.refs.economyGoldToggle.checked = isGoldEnabled();
    if (ui.refs.economyGoldState) ui.refs.economyGoldState.textContent = isGoldEnabled() ? "ON" : "OFF";
    const capRanges = getEconomyCapRanges();
    ui.refs.economyXpCapRange.min = String(capRanges.xp.min);
    ui.refs.economyXpCapRange.max = String(capRanges.xp.max);
    ui.refs.economyXpCapRange.step = String(capRanges.xp.step);
    ui.refs.economyXpCapRange.value = String(Math.floor(Number(ECONOMY_CONFIG.dailyXpCapBase) || capRanges.xp.min));
    ui.refs.economyXpCapValue.textContent = `${ui.refs.economyXpCapRange.value} XP`;
    ui.refs.economyXpCapRange.style.setProperty("--range-progress", `${((Number(ui.refs.economyXpCapRange.value) - capRanges.xp.min) / Math.max(1, capRanges.xp.max - capRanges.xp.min)) * 100}%`);

    if (ui.refs.economyGoldCapRange && ui.refs.economyGoldCapValue) {
      ui.refs.economyGoldCapRange.min = String(capRanges.gold.min);
      ui.refs.economyGoldCapRange.max = String(capRanges.gold.max);
      ui.refs.economyGoldCapRange.step = String(capRanges.gold.step);
      ui.refs.economyGoldCapRange.value = String(Math.floor(Number(ECONOMY_CONFIG.dailyGoldCapBase) || capRanges.gold.min));
      ui.refs.economyGoldCapValue.textContent = `${ui.refs.economyGoldCapRange.value} Gold`;
      ui.refs.economyGoldCapRange.style.setProperty("--range-progress", `${((Number(ui.refs.economyGoldCapRange.value) - capRanges.gold.min) / Math.max(1, capRanges.gold.max - capRanges.gold.min)) * 100}%`);
    }

    const activePreset = typeof ECONOMY_CONFIG.smoothingPreset === "string" ? ECONOMY_CONFIG.smoothingPreset : getConfiguredDefaultPreset();
    ui.refs.economyPresetButtons.forEach((button) => {
      const isActive = button.dataset.economyPreset === activePreset;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    renderEconomyAuditSection();

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
    if (ui.createSort === "xpDesc") sorted.sort((a, b) => getRewardPreviewFromEffort(b).xp - getRewardPreviewFromEffort(a).xp || a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
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
            <div class="reward-chips">${renderRewardChips(getRewardPreviewFromEffort(quest))}</div>
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
    const effortScale = getEffortScaleConfig();
    ui.refs.editorTitle.textContent = mode === "create" ? "Nouvelle habitude" : `Éditer: ${quest.title}`;
    ui.refs.editorName.value = quest ? quest.title : "";
    ui.refs.editorEffort.min = String(effortScale.min);
    ui.refs.editorEffort.max = String(effortScale.max);
    ui.refs.editorEffort.value = String(quest ? sanitizeEffort(quest.effort, quest.xp) : effortScale.defaultEffort);
    ui.editor.icon = quest ? quest.icon : ICON_CATALOG[0].key;
    ui.refs.editorRestore.hidden = !(quest && quest.hasOverride);
    ui.refs.editorDelete.hidden = !(quest && quest.source === "custom");
    ui.refs.editorError.textContent = "";
    ui.refs.editorModal.hidden = false;
    document.body.classList.add("modal-open");
    updateEditorEffortUi();
    renderIconGrid();
  }

  function closeQuestEditor() {
    ui.refs.editorModal.hidden = true;
    document.body.classList.remove("modal-open");
    ui.editor.open = false;
  }

  function validateEditorForm() {
    const title = sanitizeTitle(ui.refs.editorName.value);
    const effort = sanitizeEffort(ui.refs.editorEffort.value);
    const reward = computeEffectiveReward({ effort }, state.game, getActiveDateIso(), { preview: true });
    if (title.length < 2 || title.length > 40) return { error: "Le nom doit faire entre 2 et 40 caractères." };
    return { value: { title, effort, xp: reward.xp, gold: reward.gold, icon: ui.editor.icon } };
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
    if (!window.confirm("Restart : réinitialiser XP/Niveau/progression ?")) return;
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
    renderProgressionTab();
    renderSettingsTab();
  }

  function renderForActiveTab() {
    if (ui.activeTab === "today") renderTodayTab();
    if (ui.activeTab === "catalogue") renderCreateTab();
    if (ui.activeTab === "progression") renderProgressionTab();
    if (ui.activeTab === "settings") renderSettingsTab();
  }

  function setActiveTab(tabId) {
    const allowedTabs = new Set(["today", "catalogue", "progression", "settings"]);
    ui.activeTab = allowedTabs.has(tabId) ? tabId : "today";
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

    ui.refs.todayOpenProgressionBtn?.addEventListener("click", () => {
      setActiveTab("progression");
      renderProgressionTab();
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

    ui.refs.economyGoldToggle?.addEventListener("change", () => {
      state.settings.economyOverrides.goldEnabled = isGoldFeatureEnabled() && ui.refs.economyGoldToggle.checked;
      state.settings.economy.goldEnabled = isGoldFeatureEnabled() && ui.refs.economyGoldToggle.checked;
      applyEconomySettingsToConfig(state.settings);
      storage.saveSettings(state.settings);
      renderAllTabs();
      const message = isGoldEnabled() ? "Gold réactivé." : "Gold désactivé (gains à 0).";
      ui.showToast("info", "Économie", message);
    });

    ui.refs.economyXpCapRange.addEventListener("input", () => {
      const ranges = getEconomyCapRanges();
      const next = clamp(Math.floor(Number(ui.refs.economyXpCapRange.value) || 0), ranges.xp.min, ranges.xp.max);
      ui.refs.economyXpCapRange.value = String(next);
      ui.refs.economyXpCapValue.textContent = `${next} XP`;
      ui.refs.economyXpCapRange.style.setProperty("--range-progress", `${((next - ranges.xp.min) / Math.max(1, ranges.xp.max - ranges.xp.min)) * 100}%`);
      state.settings.economyOverrides.dailyXpCapBase = next;
      state.settings.economy.dailyXpCap = next;
      applyEconomySettingsToConfig(state.settings);
      storage.saveSettings(state.settings);
      renderEconomyAuditSection();
    });

    ui.refs.economyGoldCapRange?.addEventListener("input", () => {
      if (!ui.refs.economyGoldCapValue) return;
      const ranges = getEconomyCapRanges();
      const next = clamp(Math.floor(Number(ui.refs.economyGoldCapRange.value) || 0), ranges.gold.min, ranges.gold.max);
      ui.refs.economyGoldCapRange.value = String(next);
      ui.refs.economyGoldCapValue.textContent = `${next} Gold`;
      ui.refs.economyGoldCapRange.style.setProperty("--range-progress", `${((next - ranges.gold.min) / Math.max(1, ranges.gold.max - ranges.gold.min)) * 100}%`);
      state.settings.economyOverrides.dailyGoldCapBase = next;
      state.settings.economy.dailyGoldCap = next;
      applyEconomySettingsToConfig(state.settings);
      storage.saveSettings(state.settings);
    });

    ui.refs.economyPresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const presetKey = button.dataset.economyPreset;
        const preset = getEconomyPresets()[presetKey];
        if (!preset) return;
        const overrides = state.settings.economyOverrides;
        if (preset.dailyXpCapBase !== undefined) overrides.dailyXpCapBase = preset.dailyXpCapBase;
        if (preset.dailyGoldCapBase !== undefined) overrides.dailyGoldCapBase = preset.dailyGoldCapBase;
        overrides.smoothingPreset = presetKey;
        applyEconomySettingsToConfig(state.settings);
        storage.saveSettings(state.settings);
        renderSettingsTab();
        renderTodayTab();
        renderCreateTab();
        ui.showToast("success", "Économie", `Preset ${getPresetLabel(presetKey)} appliqué.`);
      });
    });

    ui.refs.economyAuditRecommendBtn?.addEventListener("click", () => {
      const audit = computeEconomyAudit();
      const suggestion = computeEconomyAuditRecommendation(audit);
      if (!ui.refs.economyAuditRecommendText) return;
      ui.refs.economyAuditRecommendText.textContent = `Suggestion de cap: ${suggestion.suggestedCapXp} XP/jour (objectif ~${suggestion.targetDays} jours / niveau)`;
      ui.showToast("info", "Audit économie", `Suggestion: ${suggestion.suggestedCapXp} XP/jour (non appliqué).`);
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
        ui.showToast("success", "Coffre hebdo", `${result.chestTier.id} ouvert : ${formatRewardText(result.chestTier.bonusXp, result.chestTier.bonusGold, true)}`);
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

    ui.refs.editorEffort.addEventListener("input", () => {
      updateEditorEffortUi();
      haptics.tap();
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
    ui.createSort = ["recent", "az", "xpDesc"].includes(state.createUi.sort) ? state.createUi.sort : "recent";
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
    storage.saveSettings(state.settings);
    storage.saveState(state.game);
    renderAllTabs();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
