/**
 * Sheet Send Background Service Worker
 * Handles context menu creation, text capture, OAuth coordination,
 * Sheets API appending, and user feedback dispatching.
 */

import { MAX_CHARS_NO_CONFIRM, FIELD_LABELS, humanizeError } from "../shared/constants.js";
import { browserApi } from "../shared/browserPolyfillLoader.js";
import { getDestinations, getDestinationById, markHeaderWritten, getGlobalSettings } from "../shared/storage.js";
import { getAuthToken, invalidateAuthToken } from "./auth.js";
import { appendRowToSheet } from "./sheetsApi.js";
import { showConfirmPrompt } from "../content/confirmDialog.js";
import { displayInPageToast } from "../content/toast.js";

const SETUP_MENU_ID = "sheet_send_setup_prompt";
const PARENT_MENU_ID = "sheet_send_parent";

let isRebuildingMenus = false;
let pendingRebuild = false;

function createMenuItemSafe(props) {
  return new Promise((resolve) => {
    try {
      if (chrome?.contextMenus?.create) {
        chrome.contextMenus.create(props, () => {
          if (chrome.runtime.lastError) {
            // Benign error swallowed
          }
          resolve();
        });
      } else if (browserApi.contextMenus?.create) {
        browserApi.contextMenus.create(props, () => resolve());
      } else {
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

function removeAllMenusSafe() {
  return new Promise((resolve) => {
    try {
      if (chrome?.contextMenus?.removeAll) {
        chrome.contextMenus.removeAll(() => {
          if (chrome.runtime.lastError) {
            // Benign error swallowed
          }
          resolve();
        });
      } else if (browserApi.contextMenus?.removeAll) {
        browserApi.contextMenus.removeAll().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

/**
 * Rebuilds context menus dynamically based on saved destinations & global settings in sync storage.
 */
export async function rebuildContextMenus() {
  if (isRebuildingMenus) {
    pendingRebuild = true;
    return;
  }
  isRebuildingMenus = true;

  try {
    await removeAllMenusSafe();

    const destinations = await getDestinations();
    const settings = await getGlobalSettings();

    if (!destinations || destinations.length === 0) {
      // Zero destinations configured: show setup prompt item
      await createMenuItemSafe({
        id: SETUP_MENU_ID,
        title: "Sheet Send: Set up a destination…",
        contexts: ["selection"]
      });
      return;
    }

    // If primary mode is active and primary destination exists, show single direct item
    if (settings.menuDisplayMode === "primary" && settings.primaryDestinationId) {
      const primaryDest = destinations.find((d) => d.id === settings.primaryDestinationId);
      if (primaryDest) {
        await createMenuItemSafe({
          id: primaryDest.id,
          title: `Send to ${primaryDest.nickname}`,
          contexts: ["selection"]
        });
        return;
      }
    }

    if (destinations.length === 1) {
      // Single destination: show direct click item
      const dest = destinations[0];
      await createMenuItemSafe({
        id: dest.id,
        title: `Send to ${dest.nickname}`,
        contexts: ["selection"]
      });
      return;
    }

    // Multiple destinations: create parent menu with nested submenu items
    await createMenuItemSafe({
      id: PARENT_MENU_ID,
      title: "Sheet Send",
      contexts: ["selection"]
    });

    for (const dest of destinations) {
      await createMenuItemSafe({
        id: dest.id,
        parentId: PARENT_MENU_ID,
        title: dest.nickname,
        contexts: ["selection"]
      });
    }
  } catch (err) {
    console.error("Error updating context menus:", err);
  } finally {
    isRebuildingMenus = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      rebuildContextMenus();
    }
  }
}

/**
 * Triggers a temporary 2-second visual feedback on the extension action icon.
 * @param {"success"|"error"} status
 * @param {number} [tabId]
 */
async function setToolbarFeedback(status, tabId) {
  if (!browserApi.action) return;

  try {
    const text = status === "success" ? "✓" : "!";
    const color = status === "success" ? "#10b981" : "#e60012";

    await browserApi.action.setBadgeText({ text, tabId });
    await browserApi.action.setBadgeBackgroundColor({ color, tabId });

    setTimeout(async () => {
      try {
        await browserApi.action.setBadgeText({ text: "", tabId });
      } catch {
        // Tab might be closed
      }
    }, 2000);
  } catch (err) {
    console.warn("Could not set action badge feedback:", err);
  }
}

/**
 * Displays an in-page toast on the target tab via scripting.executeScript.
 * Falls back to native notifications if scripting is unavailable or restricted.
 * @param {number} tabId
 * @param {"success"|"error"} type
 * @param {string} message
 */
async function showFeedbackToast(tabId, type, message) {
  if (tabId && browserApi.scripting?.executeScript) {
    try {
      console.log("Attempting injection into tab:", tabId);
      await browserApi.scripting.executeScript({
        target: { tabId },
        func: displayInPageToast,
        args: [type, message]
      });
      return;
    } catch (err) {
      console.warn("In-page toast execution failed (likely restricted URL like chrome://):", err);
    }
  }

  // Fallback to browser desktop notification
  if (browserApi.notifications?.create) {
    try {
      browserApi.notifications.create({
        type: "basic",
        iconUrl: browserApi.runtime.getURL("src/icons/icon-48.png"),
        title: type === "success" ? "Sheet Send" : "Sheet Send Error",
        message
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Builds the array of cell values according to destination column configuration.
 * @param {Array<string>} columnsConfig
 * @param {string} text
 * @param {string} url
 * @param {string} title
 * @returns {Array<string>}
 */
function buildRowValues(columnsConfig, text, url, title) {
  const now = new Date();
  const timestampStr = now.toLocaleString("sv-SE", { timeZoneName: "short" }); // e.g. 2026-08-21 17:05:00 UTC

  const valueMap = {
    text: text || "",
    timestamp: timestampStr,
    url: url || "",
    title: title || ""
  };

  const columns = Array.isArray(columnsConfig) && columnsConfig.length > 0
    ? columnsConfig
    : ["text"];

  return columns.map((col) => valueMap[col] ?? "");
}

/**
 * Generates header row labels from column keys.
 * @param {Array<string>} columnsConfig
 * @returns {Array<string>}
 */
function buildHeaderValues(columnsConfig) {
  const columns = Array.isArray(columnsConfig) && columnsConfig.length > 0
    ? columnsConfig
    : ["text"];

  return columns.map((col) => FIELD_LABELS[col] || col);
}

/**
 * Context menu click listener.
 */
browserApi.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = info.menuItemId;

  // Case 1: Setup Prompt clicked
  if (menuItemId === SETUP_MENU_ID) {
    browserApi.runtime.openOptionsPage();
    return;
  }

  // Case 2: Specific Destination clicked
  const destination = await getDestinationById(menuItemId);
  if (!destination) {
    console.warn("Destination not found for menu item ID:", menuItemId);
    return;
  }

  const selectedText = info.selectionText || "";
  const tabId = tab?.id;

  // 1. Long text selection safety check
  if (selectedText.length > MAX_CHARS_NO_CONFIRM && tabId && browserApi.scripting?.executeScript) {
    try {
      const results = await browserApi.scripting.executeScript({
        target: { tabId },
        func: showConfirmPrompt,
        args: [selectedText.length]
      });

      const confirmed = results?.[0]?.result;
      if (!confirmed) {
        // User aborted, exit silently without writing or toast
        return;
      }
    } catch (err) {
      console.warn("Could not inject confirmation prompt:", err);
    }
  }

  // 2. Obtain OAuth Token
  let token;
  try {
    token = await getAuthToken(true);
  } catch (err) {
    console.error("Auth error:", err);
    await setToolbarFeedback("error", tabId);
    await showFeedbackToast(tabId, "error", "Google account not connected — open Sheet Send settings");
    return;
  }

  if (!token) {
    await setToolbarFeedback("error", tabId);
    await showFeedbackToast(tabId, "error", "Google account not connected — open Sheet Send settings");
    return;
  }

  // 3. Prepare row data
  const tabUrl = tab?.url || "";
  const tabTitle = tab?.title || "";
  const rowData = buildRowValues(destination.columns, selectedText, tabUrl, tabTitle);

  // 4. Send to Google Sheets (with single 401 retry)
  try {
    // If destination header has not been written yet, write header row first
    if (!destination.headerWritten) {
      const headerRow = buildHeaderValues(destination.columns);
      await appendRowToSheet(destination, headerRow, token);
      await markHeaderWritten(destination.id);
    }

    // Append data row
    await appendRowToSheet(destination, rowData, token);

    await setToolbarFeedback("success", tabId);
    await showFeedbackToast(tabId, "success", `Added to ${destination.nickname}`);
  } catch (firstErr) {
    // Check for 401 Unauthorized -> attempt silent refresh once
    if (firstErr.status === 401) {
      console.warn("401 Unauthorized encountered. Invalidating token and retrying once...");
      try {
        await invalidateAuthToken(token);
        const refreshedToken = await getAuthToken(true);

        if (refreshedToken) {
          if (!destination.headerWritten) {
            const headerRow = buildHeaderValues(destination.columns);
            await appendRowToSheet(destination, headerRow, refreshedToken);
            await markHeaderWritten(destination.id);
          }
          await appendRowToSheet(destination, rowData, refreshedToken);

          await setToolbarFeedback("success", tabId);
          await showFeedbackToast(tabId, "success", `Added to ${destination.nickname}`);
          return;
        }
      } catch (retryErr) {
        console.error("Retry after 401 failed:", retryErr);
        await setToolbarFeedback("error", tabId);
        await showFeedbackToast(tabId, "error", humanizeError(retryErr));
        return;
      }
    }

    // Handle standard errors
    console.error("Failed to append row:", firstErr);
    await setToolbarFeedback("error", tabId);
    await showFeedbackToast(tabId, "error", humanizeError(firstErr));
  }
});

// Rebuild menus on install, update, and browser startup
browserApi.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

browserApi.runtime.onStartup?.addListener(() => {
  rebuildContextMenus();
});

// Reactively rebuild context menus whenever destinations change in sync storage
browserApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") {
    rebuildContextMenus();
  }
});

// Initial invocation on service worker spin-up
rebuildContextMenus();
