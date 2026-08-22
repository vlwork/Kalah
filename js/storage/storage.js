import { KalahGame } from '../core/game.js';
import { validateStatistics } from '../statistics/statistics.js';

export const SAVE_SCHEMA_VERSION = 1;
const SAVE_KEY = 'kalah:v1:saves'; const STATS_KEY = 'kalah:v1:statistics'; const SETTINGS_KEY = 'kalah:v1:settings';
export const DEFAULT_SETTINGS = Object.freeze({ soundEnabled: true, volume: 65 });
export class MemoryAdapter { constructor() { this.data = new Map(); } get(key) { return this.data.get(key) ?? null; } set(key, value) { this.data.set(key, value); } }
export class BrowserAdapter { get(key) { try { return localStorage.getItem(key); } catch { return null; } } set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage can be unavailable */ } } }
function parse(adapter, key, fallback) { try { const value = adapter.get(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function write(adapter, key, value) { adapter.set(key, JSON.stringify(value)); }
function emptySlots() { return Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, save: null })); }
export function getSlots(adapter) { const raw = parse(adapter, SAVE_KEY, emptySlots()); return Array.isArray(raw) && raw.length === 5 ? raw.map((item, i) => ({ slot: i + 1, save: validateSave(item?.save) ? item.save : null })) : emptySlots(); }
export function saveSlot(adapter, slot, payload) { if (!Number.isInteger(slot) || slot < 1 || slot > 5) throw new Error('Invalid slot'); const validated = validateSave(payload); if (!validated) throw new Error('Invalid save'); const slots = getSlots(adapter); slots[slot - 1].save = validated; write(adapter, SAVE_KEY, slots); return slots[slot - 1]; }
export function loadSlot(adapter, slot) { const item = getSlots(adapter)[slot - 1]; return item?.save ? structuredClone(item.save) : null; }
export function clearSlot(adapter, slot) { const slots = getSlots(adapter); if (slots[slot - 1]) slots[slot - 1].save = null; write(adapter, SAVE_KEY, slots); }
export function createSave(match, game, statistics) { return { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: new Date().toISOString(), game: game.toJSON(), match: structuredClone(match), statistics: structuredClone(statistics) }; }
export function validateSave(save) {
  try {
    if (!save || save.schemaVersion !== SAVE_SCHEMA_VERSION || typeof save.savedAt !== 'string' || !save.match || !['pvp', 'ai'].includes(save.match.mode) || typeof save.match.player1 !== 'string' || typeof save.match.player2 !== 'string' || !validateStatistics(save.statistics)) return null;
    KalahGame.fromJSON(save.game); return structuredClone(save);
  } catch { return null; }
}
export function getHistory(adapter) { const value = parse(adapter, STATS_KEY, []); return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.matchId === 'string') : []; }
export function recordHistory(adapter, entry) { const history = getHistory(adapter); if (!history.some((item) => item.matchId === entry.matchId)) { history.unshift(entry); write(adapter, STATS_KEY, history); } return history; }
export function getSettings(adapter) {
  return normalizeSettings(parse(adapter, SETTINGS_KEY, DEFAULT_SETTINGS));
}
export function saveSettings(adapter, settings) { const value = normalizeSettings(settings); write(adapter, SETTINGS_KEY, value); return value; }
function normalizeSettings(value) {
  return {
    soundEnabled: typeof value?.soundEnabled === 'boolean' ? value.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    volume: Number.isFinite(value?.volume) ? Math.round(Math.min(100, Math.max(0, value.volume))) : DEFAULT_SETTINGS.volume,
  };
}
