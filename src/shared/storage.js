/**
 * Storage management module for Sheet Send.
 * Wraps browser.storage.sync for destinations & global settings,
 * and session/local storage for auth states.
 */

import { STORAGE_KEYS } from "./constants.js";
import { browserApi } from "./browserPolyfillLoader.js";

/**
 * Generates a unique UUID v4.
 * @returns {string}
 */
export function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parses a spreadsheet input string (either full URL or raw ID) and extracts the spreadsheet ID.
 * @param {string} input
 * @returns {string|null}
 */
export function parseSpreadsheetId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check for standard Google Sheets URL format: /d/<ID>/
  const urlMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Bare ID format check: typically 15+ alphanumeric/hyphen/underscore chars
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Retrieves all saved destinations from storage.sync.
 * @returns {Promise<Array<object>>}
 */
export async function getDestinations() {
  try {
    const result = await browserApi.storage.sync.get(STORAGE_KEYS.DESTINATIONS);
    const destinations = result?.[STORAGE_KEYS.DESTINATIONS];
    return Array.isArray(destinations) ? destinations : [];
  } catch (err) {
    console.error("Error loading destinations from sync storage:", err);
    return [];
  }
}

/**
 * Retrieves a single destination by its ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getDestinationById(id) {
  if (!id) return null;
  const destinations = await getDestinations();
  return destinations.find((d) => d.id === id) || null;
}

/**
 * Saves or updates a destination object in storage.sync.
 * If tabName changes, resets headerWritten to false so headers are written to the new tab.
 * @param {object} destData
 * @returns {Promise<object>}
 */
export async function saveDestination(destData) {
  const destinations = await getDestinations();

  const id = destData.id || generateUuid();
  const targetTabName = destData.tabName ? destData.tabName.trim() : "Sheet1";

  const existingIndex = destinations.findIndex((d) => d.id === id);
  const existing = existingIndex >= 0 ? destinations[existingIndex] : null;

  // Reset headerWritten to false if the tab changed
  const tabChanged = existing && existing.tabName !== targetTabName;
  const headerWritten = tabChanged
    ? false
    : destData.headerWritten !== undefined
      ? Boolean(destData.headerWritten)
      : existing
        ? Boolean(existing.headerWritten)
        : false;

  const newDestination = {
    id,
    nickname: destData.nickname ? destData.nickname.trim().slice(0, 40) : "Untitled",
    spreadsheetId: destData.spreadsheetId ? destData.spreadsheetId.trim() : "",
    spreadsheetTitle: destData.spreadsheetTitle || "Google Sheet",
    tabName: targetTabName,
    columns: Array.isArray(destData.columns) && destData.columns.length > 0
      ? destData.columns
      : ["text"],
    headerWritten,
    createdAt: destData.createdAt || (existing ? existing.createdAt : new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    destinations[existingIndex] = {
      ...destinations[existingIndex],
      ...newDestination
    };
  } else {
    destinations.push(newDestination);
  }

  await browserApi.storage.sync.set({ [STORAGE_KEYS.DESTINATIONS]: destinations });
  return newDestination;
}

/**
 * Deletes a destination by ID.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteDestination(id) {
  const destinations = await getDestinations();
  const filtered = destinations.filter((d) => d.id !== id);
  await browserApi.storage.sync.set({ [STORAGE_KEYS.DESTINATIONS]: filtered });

  // Clean up primaryDestinationId if the deleted destination was primary
  const settings = await getGlobalSettings();
  if (settings.primaryDestinationId === id) {
    await setGlobalSettings({ primaryDestinationId: null });
  }

  return true;
}

/**
 * Marks headerWritten as true for a destination after its first header row is written.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function markHeaderWritten(id) {
  const destinations = await getDestinations();
  const dest = destinations.find((d) => d.id === id);
  if (dest) {
    dest.headerWritten = true;
    dest.updatedAt = new Date().toISOString();
    await browserApi.storage.sync.set({ [STORAGE_KEYS.DESTINATIONS]: destinations });
  }
}

/**
 * Retrieves global settings from storage.sync.
 * @returns {Promise<{menuDisplayMode: "all"|"primary", primaryDestinationId: string|null}>}
 */
export async function getGlobalSettings() {
  try {
    const result = await browserApi.storage.sync.get(STORAGE_KEYS.GLOBAL_SETTINGS);
    const settings = result?.[STORAGE_KEYS.GLOBAL_SETTINGS] || {};
    return {
      menuDisplayMode: settings.menuDisplayMode === "primary" ? "primary" : "all",
      primaryDestinationId: typeof settings.primaryDestinationId === "string" ? settings.primaryDestinationId : null
    };
  } catch (err) {
    console.error("Error loading global settings from sync storage:", err);
    return {
      menuDisplayMode: "all",
      primaryDestinationId: null
    };
  }
}

/**
 * Updates global settings in storage.sync.
 * @param {Partial<{menuDisplayMode: "all"|"primary", primaryDestinationId: string|null}>} partial
 * @returns {Promise<{menuDisplayMode: "all"|"primary", primaryDestinationId: string|null}>}
 */
export async function setGlobalSettings(partial = {}) {
  const current = await getGlobalSettings();
  const updated = {
    ...current,
    ...partial
  };
  await browserApi.storage.sync.set({ [STORAGE_KEYS.GLOBAL_SETTINGS]: updated });
  return updated;
}

/**
 * Gets cached account information (email, profile) from local storage.
 * @returns {Promise<object|null>}
 */
export async function getAuthState() {
  try {
    const result = await browserApi.storage.local.get(STORAGE_KEYS.AUTH_STATE);
    return result?.[STORAGE_KEYS.AUTH_STATE] || null;
  } catch {
    return null;
  }
}

/**
 * Sets cached account information.
 * @param {object} authState
 * @returns {Promise<void>}
 */
export async function setAuthState(authState) {
  try {
    await browserApi.storage.local.set({ [STORAGE_KEYS.AUTH_STATE]: authState });
  } catch (err) {
    console.error("Error setting auth state:", err);
  }
}

/**
 * Clears cached account information.
 * @returns {Promise<void>}
 */
export async function clearAuthState() {
  try {
    await browserApi.storage.local.remove(STORAGE_KEYS.AUTH_STATE);
  } catch (err) {
    console.error("Error clearing auth state:", err);
  }
}
