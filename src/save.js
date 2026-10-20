import { STAGES, createProgress } from "./engine.js";

const STORAGE_KEY = "hand-magic-save-v1";

export function loadProgress(getStorage = () => localStorage) {
  try {
    const stored = getStorage().getItem(STORAGE_KEY);
    if (!stored) return { progress: createProgress(), error: null };
    const data = JSON.parse(stored);
    const defaults = createProgress();
    const upgrades = { ...defaults.upgrades };
    for (const key of Object.keys(upgrades)) {
      const level = Number(data.upgrades?.[key]);
      upgrades[key] = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
    }
    const crystals = Number(data.crystals);
    return {
      progress: {
        ...defaults,
        unlocked: Math.max(0, Math.min(STAGES.length - 1, Number(data.unlocked) || 0)),
        cleared: Array.isArray(data.cleared) ? data.cleared.filter((n) => Number.isInteger(n) && n >= 0 && n < STAGES.length) : [],
        crystals: Number.isFinite(crystals) ? Math.max(0, crystals) : 0,
        upgrades,
      },
      error: null,
    };
  } catch (error) {
    return { progress: createProgress(), error: `セーブデータを読み込めませんでした: ${error.message}` };
  }
}

export function saveProgress(progress, getStorage = () => localStorage) {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(progress));
    return null;
  } catch (error) {
    return `セーブに失敗しました: ${error.message}`;
  }
}
