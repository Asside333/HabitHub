(function initHabitHub() {
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
    };
  }

  function normalizeGameState(rawState) {
    const fallback = createInitialGameState();
    if (!rawState || typeof rawState !== "object") return fallback;

    const legacyCompleted = Array.isArray(rawState.completedQuestIds) ? rawState.completedQuestIds : [];
    const nestedCompleted = rawState.quests && Array.isArray(rawState.quests.completedQuestIds) ? rawState.quests.completedQuestIds : legacyCompleted;
    const completedQuestIds = nestedCompleted.filter((id) => typeof id === "string");

    const totalXp = Math.max(0, Number(rawState.totalXp ?? rawState.currencies?.totalXp ?? rawState.xp ?? rawState.currencies?.xp) || 0);
    const progressData = computeLevelProgress(totalXp);
    const xp = Math.max(0, Number(rawState.xp ?? rawState.currencies?.xp) || 0);
    const gold = Math.max(0, Number(rawState.gold ?? rawState.currencies?.gold) || 0);
    const level = Math.max(progressData.level, Number(rawState.level ?? rawState.progress?.level) || 1);

    const next = {
      v: Number(rawState.v) || 1,
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
        streakShield: Math.max(0, Number(rawState.progress?.streakShield) || 0),
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
    normalized.currencies.xp = Math.max(0, Number(normalized.xp) || 0);
    normalized.currencies.gold = Math.max(0, Number(normalized.gold) || 0);
    normalized.currencies.totalXp = Math.max(0, Number(normalized.totalXp) || 0);
    normalized.progress.level = Math.max(1, Number(normalized.level) || 1);
    normalized.quests.completedQuestIds = Array.isArray(normalized.completedQuestIds) ? normalized.completedQuestIds.filter((id) => typeof id === "string") : [];
    normalized.completedQuestIds = normalized.quests.completedQuestIds;
    normalized.logs.eventLog = sanitizeEventLog(normalized.logs.eventLog);
    normalized.claims.rewardClaims = sanitizeRewardClaims(normalized.claims.rewardClaims);
    normalized.daily = sanitizeDailyState(normalized.daily);
    return normalized;
  }

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
    migrateState(oldState) {
      return normalizeGameState(oldState);
    },
    loadState() {
      const save = this.loadJson(this.keys.save, null);
      if (save && typeof save === "object" && typeof save.schemaVersion === "number") {
        const migrated = this.migrateState(save.state);
        if (save.schemaVersion !== migrated.v) {
          return this.migrateState(migrated);
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
      if (!settings || typeof settings !== "object") return { hapticsEnabled: true };
      return { hapticsEnabled: settings.hapticsEnabled !== false };
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
    createSort: "recent",
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
        dailyTierStatus: document.getElementById("daily-tier-status"),
        dailyTierRule: document.getElementById("daily-tier-rule"),
        debugDateToggle: document.getElementById("debug-date-toggle"),
        debugDateState: document.getElementById("debug-date-state"),
        debugDateInput: document.getElementById("debug-date-input"),
        activeDateLabel: document.getElementById("active-date-label"),
        resetBtn: document.getElementById("reset-btn"),
        catalogSearch: document.getElementById("catalog-search-input"),
        filterSelect: document.getElementById("catalog-filter-select"),
        sortSelect: document.getElementById("catalog-sort-select"),
        filterPill: document.getElementById("catalog-filter-pill"),
        hapticsToggle: document.getElementById("haptics-toggle"),
        hapticsToggleState: document.getElementById("haptics-toggle-state"),
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
      toast.className = "toast toast-enter";
      toast.textContent = message;
      this.refs.toastRoot.append(toast);
      setTimeout(() => {
        toast.classList.add("toast-exit");
        setTimeout(() => toast.remove(), 180);
      }, UI_CONFIG.toastDurationMs);
    },
  };

  let state = {
    game: storage.loadState(),
    customQuests: storage.loadCustomQuests(),
    hiddenQuestIds: storage.loadHiddenIds(),
    questOverrides: storage.loadOverrides(),
    settings: storage.loadSettings(),
    createUi: storage.loadCreateUi(),
  };
  state.game.daily = sanitizeDailyState(state.game.daily);

  const haptics = {
    tap() {
      this.play(10);
    },
    success() {
      this.play([10, 20, 10]);
    },
    warning() {
      this.play([30]);
    },
    levelUp() {
      this.play([12, 24, 12, 20]);
    },
    play(pattern) {
      if (!state.settings.hapticsEnabled) return;
      if (!navigator || typeof navigator.vibrate !== "function") return;
      navigator.vibrate(pattern);
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

  function handleDayChange() {
    const activeDate = getActiveDateIso();
    if (state.game.progress.lastActiveDate === activeDate) return;
    if (state.game.progress.lastActiveDate) {
      state.game.completedQuestIds = [];
      state.game.quests.completedQuestIds = state.game.completedQuestIds;
      ui.showToast(`Nouveau jour détecté (${activeDate})`);
    }
    state.game.progress.lastActiveDate = activeDate;
    state.game.daily.dateKey = activeDate;
    state.game.daily.objectivesCompleted = 0;
    state.game.daily.tier = "none";
    state.game.daily.tierBonusGoldApplied = 0;
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
      haptics.levelUp();
    }
    state.game.level = progress.level;
    state.game.currencies.xp = state.game.xp;
    state.game.currencies.totalXp = state.game.totalXp;
    state.game.currencies.gold = state.game.gold;
    state.game.progress.level = state.game.level;
  }

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
      rewardResult = rollbackCompletedQuest(quest, dateKey);
      if (rewardResult.applied) {
        ui.showToast(`${rewardResult.xpDelta} XP • ${rewardResult.goldDelta} Gold`);
      }
      haptics.tap();
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
        if (rewardResult.reason === "cap_reached") {
          ui.showToast("Cap atteint : 0 gain pour aujourd'hui.");
          haptics.warning();
        } else {
          ui.showToast(`+${rewardResult.xpDelta} XP • +${rewardResult.goldDelta} Gold`);
        }
      } else if (rewardResult.reason === "already_claimed") {
        ui.showToast("Récompense déjà récupérée aujourd'hui.");
      }
      haptics.success();
    }

    ensureDailyProgressState();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
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

    const dailyState = ensureDailyProgressState();
    ui.refs.dailyTierStatus.textContent = `${getTierLabel(dailyState.tier)} • ${dailyState.objectivesCompleted} objectif(s)`;
    ui.refs.dailyTierRule.textContent = `Argent dès ${PROGRESSION_CONFIG.dailyTiers.silver.minObjectives} objectifs • Or dès ${PROGRESSION_CONFIG.dailyTiers.gold.minObjectives} objectifs`;
    ui.refs.debugDateState.textContent = state.game.debug.useDebugDate ? "ON" : "OFF";
    ui.refs.activeDateLabel.textContent = `Date active : ${getActiveDateIso()}`;

    renderStats();
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
      card.className = `catalog-card ${quest.isHidden ? "is-hidden" : ""}`;
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
          <button class="btn btn-secondary" data-action="edit-quest" data-id="${quest.id}">✏️ Éditer</button>
          <button class="btn" data-action="toggle-hidden" data-id="${quest.id}">${quest.isHidden ? "👁️ Afficher" : "🙈 Masquer"}</button>
          ${quest.source === "custom" ? `<button class="btn btn-danger" data-action="delete-quest" data-id="${quest.id}">🗑️ Supprimer</button>` : ""}
          ${quest.hasOverride ? `<button class="btn" data-action="restore-quest" data-id="${quest.id}">↩️ Restaurer</button>` : ""}
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
      haptics.success();
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
      haptics.success();
    }

    cleanupCompletedIds();
    closeQuestEditor();
    renderTodayTab();
    renderCreateTab();
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
    haptics.tap();
    cleanupCompletedIds();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
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
    renderTodayTab();
    renderCreateTab();
    ui.showToast("Habitude supprimée");
    haptics.warning();
  }

  function resetProgressOnly() {
    if (!window.confirm("Restart : réinitialiser XP/Gold/Niveau/progression ?")) return;
    state.game = storage.resetProgress(state.game);
    handleDayChange();
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


  function highlightCatalogCard(questId) {
    if (!questId) return;
    const card = ui.refs.catalogList.querySelector(`[data-quest-id="${questId}"]`);
    if (!card) return;
    card.classList.add("is-highlighted");
    setTimeout(() => card.classList.remove("is-highlighted"), 700);
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

    ui.refs.debugDateToggle.addEventListener("change", () => {
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
    });

    ui.refs.debugDateInput.addEventListener("change", () => {
      if (!ui.refs.debugDateInput.value) return;
      state.game.debug.debugDate = ui.refs.debugDateInput.value;
      handleDayChange();
      storage.saveState(state.game);
      renderTodayTab();
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
  }

  function init() {
    ui.bindRefs();
    ui.createFilter = FILTER_LABELS[state.createUi.filter] ? state.createUi.filter : "all";
    ui.createSort = ["recent", "az", "xpDesc", "goldDesc"].includes(state.createUi.sort) ? state.createUi.sort : "recent";
    ui.refs.filterSelect.value = ui.createFilter;
    ui.refs.sortSelect.value = ui.createSort;
    ui.refs.hapticsToggle.checked = state.settings.hapticsEnabled;
    ui.refs.hapticsToggleState.textContent = state.settings.hapticsEnabled ? "ON" : "OFF";
    ui.refs.debugDateToggle.checked = state.game.debug.useDebugDate;
    ui.refs.debugDateInput.disabled = !state.game.debug.useDebugDate;
    ui.refs.debugDateInput.value = state.game.debug.debugDate || "";
    cleanupCompletedIds();
    handleDayChange();
    attachEvents();
    storage.saveState(state.game);
    renderTodayTab();
    renderCreateTab();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
