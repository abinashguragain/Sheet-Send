/**
 * Sheet Send - Toolbar Action Popup Controller
 * Manages Google OAuth state, menu display modes (all vs primary),
 * quick primary tab switching, and inline destination CRUD.
 */

import { FIELD_LABELS, humanizeError } from "../shared/constants.js";
import {
  getDestinations,
  getDestinationById,
  saveDestination,
  deleteDestination,
  parseSpreadsheetId,
  getAuthState,
  getGlobalSettings,
  setGlobalSettings
} from "../shared/storage.js";
import { getAuthToken, invalidateAuthToken, fetchUserProfile } from "../background/auth.js";
import { getSpreadsheetDetails, createSheetTab } from "../background/sheetsApi.js";
import { browserApi } from "../shared/browserPolyfillLoader.js";

// DOM - Views
const mainView = document.getElementById("mainView");
const addEditView = document.getElementById("addEditView");
const popupToast = document.getElementById("popupToast");

// DOM - Account
const accountEmail = document.getElementById("accountEmail");
const authBtn = document.getElementById("authBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authenticatedContent = document.getElementById("authenticatedContent");

// DOM - Menu Mode & Primary
const modeAll = document.getElementById("modeAll");
const modePrimary = document.getElementById("modePrimary");
const primaryDestSelect = document.getElementById("primaryDestSelect");
const quickTabSection = document.getElementById("quickTabSection");
const quickTabRefreshBtn = document.getElementById("quickTabRefreshBtn");
const quickTabSelect = document.getElementById("quickTabSelect");
const quickTabManualInput = document.getElementById("quickTabManualInput");
const quickTabManualBtn = document.getElementById("quickTabManualBtn");
const quickTabFeedback = document.getElementById("quickTabFeedback");

// DOM - Destinations List
const destinationsContainer = document.getElementById("destinationsContainer");
const emptyDestState = document.getElementById("emptyDestState");
const openAddBtn = document.getElementById("openAddBtn");
const emptyAddBtn = document.getElementById("emptyAddBtn");
const privacyPolicyLink = document.getElementById("privacyPolicyLink");

// DOM - Form
const addEditTitle = document.getElementById("addEditTitle");
const destForm = document.getElementById("destForm");
const formDestId = document.getElementById("formDestId");
const formSpreadsheetTitle = document.getElementById("formSpreadsheetTitle");
const formNickname = document.getElementById("formNickname");
const formSpreadsheetInput = document.getElementById("formSpreadsheetInput");
const formVerifyBtn = document.getElementById("formVerifyBtn");
const formVerifyStatus = document.getElementById("formVerifyStatus");
const formTabSelect = document.getElementById("formTabSelect");
const formTabInput = document.getElementById("formTabInput");

const colText = document.getElementById("colText");
const colTimestamp = document.getElementById("colTimestamp");
const colUrl = document.getElementById("colUrl");
const colTitle = document.getElementById("colTitle");
const backToMainBtn = document.getElementById("backToMainBtn");
const cancelFormBtn = document.getElementById("cancelFormBtn");

// Local Cache
let activeDestinations = [];
let activeSettings = { menuDisplayMode: "all", primaryDestinationId: null };
let inlineDeleteId = null;

/**
 * Escapes HTML entities to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Displays a lightweight toast notification.
 * @param {string} msg
 * @param {"success"|"error"} type
 */
function showToast(msg, type = "success") {
  if (!popupToast) return;
  popupToast.textContent = msg;
  popupToast.style.borderLeftColor = type === "success" ? "var(--color-signal)" : "var(--color-error)";
  popupToast.style.display = "block";

  setTimeout(() => {
    popupToast.style.display = "none";
  }, 2400);
}

/**
 * Switches view between Main View and Add/Edit View.
 * @param {"main"|"addEdit"} viewName
 */
function switchView(viewName) {
  if (viewName === "addEdit") {
    mainView.style.display = "none";
    addEditView.style.display = "flex";
  } else {
    addEditView.style.display = "none";
    mainView.style.display = "flex";
    inlineDeleteId = null;
  }
}

/**
 * Updates the Google Account card and controls visibility of destinations/settings.
 * @param {object|null} profile
 */
function renderAccountState(profile) {
  const isLoggedIn = Boolean(profile && profile.email && profile.email !== "Not connected");

  if (isLoggedIn) {
    accountEmail.textContent = profile.email;
    authBtn.textContent = "Switch";
    authBtn.className = "btn btn-xs btn-outline";
    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    if (authenticatedContent) authenticatedContent.style.display = "block";
  } else {
    accountEmail.textContent = "Not connected";
    authBtn.textContent = "Connect";
    authBtn.className = "btn btn-xs btn-signal";
    if (logoutBtn) logoutBtn.style.display = "none";

    if (authenticatedContent) authenticatedContent.style.display = "none";
  }
}

/**
 * Loads cached account information. If cached token exists, ensures profile is loaded.
 */
async function loadAccount() {
  let cached = await getAuthState();

  if (!cached || !cached.email || cached.email === "Not connected") {
    try {
      const token = await getAuthToken(false);
      if (token) {
        cached = await fetchUserProfile(token);
      }
    } catch {
      // User not authenticated
    }
  }

  renderAccountState(cached);
  return cached;
}

/**
 * Refreshes primary destination selector and quick-tab widget.
 */
async function refreshPrimarySection() {
  const isPrimaryMode = activeSettings.menuDisplayMode === "primary";

  // Mode radio buttons
  modeAll.checked = !isPrimaryMode;
  modePrimary.checked = isPrimaryMode;

  // Primary selector
  primaryDestSelect.disabled = !isPrimaryMode || activeDestinations.length === 0;

  primaryDestSelect.innerHTML = '<option value="">Select a primary destination…</option>' +
    activeDestinations
      .map((d) => `<option value="${d.id}" ${d.id === activeSettings.primaryDestinationId ? "selected" : ""}>${escapeHtml(d.nickname)}</option>`)
      .join("");

  const primaryDest = activeDestinations.find((d) => d.id === activeSettings.primaryDestinationId);

  if (isPrimaryMode && primaryDest) {
    quickTabSection.style.display = "block";
    await loadQuickTabsForDestination(primaryDest);
  } else {
    quickTabSection.style.display = "none";
  }
}

/**
 * Fetches available tabs for the primary spreadsheet and populates quick tab select.
 * Uses cached OAuth token so the user is never prompted.
 * @param {object} dest
 * @param {boolean} showFeedback
 */
async function loadQuickTabsForDestination(dest, showFeedback = false) {
  quickTabFeedback.textContent = "";
  quickTabFeedback.className = "tab-feedback";
  quickTabManualInput.value = "";

  if (!dest || !dest.spreadsheetId) {
    quickTabSelect.innerHTML = `<option value="${escapeHtml(dest.tabName || "Sheet1")}">${escapeHtml(dest.tabName || "Sheet1")}</option>`;
    return;
  }

  quickTabSelect.innerHTML = '<option value="">Loading tabs from Google…</option>';
  quickTabSelect.disabled = true;

  try {
    const token = await getAuthToken(false);
    if (!token) throw new Error("Google account not connected");

    const details = await getSpreadsheetDetails(dest.spreadsheetId, token);
    const tabs = details.tabs || [];

    if (tabs.length === 0) {
      quickTabSelect.innerHTML = `<option value="${escapeHtml(dest.tabName || "Sheet1")}">${escapeHtml(dest.tabName || "Sheet1")}</option>`;
    } else {
      quickTabSelect.innerHTML = tabs
        .map((tab) => `<option value="${escapeHtml(tab)}" ${tab === dest.tabName ? "selected" : ""}>${escapeHtml(tab)}</option>`)
        .join("");

      if (!tabs.includes(dest.tabName)) {
        quickTabSelect.innerHTML = `<option value="${escapeHtml(dest.tabName)}" selected>${escapeHtml(dest.tabName)} (Current)</option>` + quickTabSelect.innerHTML;
      }

      if (showFeedback) {
        quickTabFeedback.textContent = `✓ Synced ${tabs.length} tabs from spreadsheet`;
        quickTabFeedback.className = "tab-feedback success";
      }
    }
  } catch (err) {
    // If not authenticated yet or offline, show current tab
    quickTabSelect.innerHTML = `<option value="${escapeHtml(dest.tabName || "Sheet1")}" selected>${escapeHtml(dest.tabName || "Sheet1")}</option>`;
    if (showFeedback) {
      quickTabFeedback.textContent = humanizeError(err);
      quickTabFeedback.className = "tab-feedback error";
    }
  } finally {
    quickTabSelect.disabled = false;
  }
}

/**
 * Renders the compact list of saved destinations.
 */
function renderDestinationsList() {
  if (!activeDestinations || activeDestinations.length === 0) {
    destinationsContainer.innerHTML = "";
    emptyDestState.style.display = "block";
    return;
  }

  emptyDestState.style.display = "none";

  destinationsContainer.innerHTML = activeDestinations
    .map((dest) => {
      const isPrimary = activeSettings.primaryDestinationId === dest.id;

      // Check if this card is currently showing inline delete confirmation
      if (inlineDeleteId === dest.id) {
        return `
          <div class="inline-delete-box" data-id="${dest.id}">
            <span>Delete "${escapeHtml(dest.nickname)}"?</span>
            <div class="inline-delete-actions">
              <button type="button" class="btn btn-danger-xs confirm-delete-btn" data-id="${dest.id}">Delete</button>
              <button type="button" class="btn btn-xs btn-outline cancel-delete-btn">Cancel</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="dest-card-compact" data-id="${dest.id}">
          <div class="dest-info-compact">
            <div class="dest-name-row">
              <span class="dest-nickname-txt">${escapeHtml(dest.nickname)}</span>
              ${isPrimary ? '<span class="primary-badge">PRIMARY</span>' : ""}
            </div>
            <div class="dest-tab-badge">Tab: ${escapeHtml(dest.tabName || "Sheet1")} &bull; ${escapeHtml(dest.spreadsheetTitle || "Google Sheet")}</div>
          </div>
          <div class="dest-actions-compact">
            <button type="button" class="btn-icon edit-dest-btn" data-id="${dest.id}" title="Edit Destination">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn-icon btn-icon-danger delete-dest-btn" data-id="${dest.id}" title="Delete Destination">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

/**
 * Loads all destinations and settings from storage and refreshes UI.
 */
async function refreshAll() {
  activeDestinations = await getDestinations();
  activeSettings = await getGlobalSettings();

  await refreshPrimarySection();
  renderDestinationsList();
}

/**
 * Opens Add Destination View.
 */
function openAddView() {
  addEditTitle.textContent = "Add Destination";
  formDestId.value = "";
  formSpreadsheetTitle.value = "";
  formNickname.value = "";
  formSpreadsheetInput.value = "";
  formVerifyStatus.textContent = "";
  formVerifyStatus.className = "verify-status";

  formTabSelect.style.display = "none";
  formTabInput.style.display = "block";
  formTabInput.value = "Sheet1";

  colText.checked = true;
  colTimestamp.checked = true;
  colUrl.checked = true;
  colTitle.checked = true;

  switchView("addEdit");
  formNickname.focus();
}

/**
 * Opens Edit Destination View for a given destination ID.
 * @param {string} id
 */
async function openEditView(id) {
  const dest = await getDestinationById(id);
  if (!dest) return;

  addEditTitle.textContent = "Edit Destination";
  formDestId.value = dest.id;
  formSpreadsheetTitle.value = dest.spreadsheetTitle || "";
  formNickname.value = dest.nickname || "";
  formSpreadsheetInput.value = dest.spreadsheetId || "";
  formVerifyStatus.textContent = dest.spreadsheetTitle ? `"${dest.spreadsheetTitle}"` : "";
  formVerifyStatus.className = "verify-status";

  formTabSelect.style.display = "none";
  formTabInput.style.display = "block";
  formTabInput.value = dest.tabName || "Sheet1";

  const cols = dest.columns || ["text"];
  colText.checked = true;
  colTimestamp.checked = cols.includes("timestamp");
  colUrl.checked = cols.includes("url");
  colTitle.checked = cols.includes("title");

  switchView("addEdit");
  formNickname.focus();
}

/**
 * Handles spreadsheet verification in Add/Edit view.
 */
async function handleVerifySpreadsheet() {
  const rawInput = formSpreadsheetInput.value.trim();
  const parsedId = parseSpreadsheetId(rawInput);

  if (!parsedId) {
    formVerifyStatus.textContent = "Enter a valid Google Sheets URL or ID.";
    formVerifyStatus.className = "verify-status error";
    return;
  }

  const btnText = formVerifyBtn.querySelector(".btn-text");
  const spinner = formVerifyBtn.querySelector(".spinner");
  btnText.style.display = "none";
  spinner.style.display = "inline-block";
  formVerifyBtn.disabled = true;
  formVerifyStatus.textContent = "Verifying…";
  formVerifyStatus.className = "verify-status";

  try {
    const token = await getAuthToken(true);
    if (!token) throw new Error("Could not obtain auth token.");

    fetchUserProfile(token).then((profile) => renderAccountState(profile));

    const details = await getSpreadsheetDetails(parsedId, token);

    formSpreadsheetTitle.value = details.title;
    formVerifyStatus.textContent = `✓ "${details.title}" (${details.tabs.length} tabs)`;
    formVerifyStatus.className = "verify-status success";

    formTabSelect.innerHTML = details.tabs
      .map((tab) => `<option value="${escapeHtml(tab)}">${escapeHtml(tab)}</option>`)
      .join("");

    const currentTab = formTabInput.value.trim();
    if (currentTab && details.tabs.includes(currentTab)) {
      formTabSelect.value = currentTab;
    }

    formTabInput.style.display = "none";
    formTabSelect.style.display = "block";
  } catch (err) {
    formSpreadsheetTitle.value = "";
    formVerifyStatus.className = "verify-status error";
    formVerifyStatus.textContent = humanizeError(err);
  } finally {
    btnText.style.display = "inline";
    spinner.style.display = "none";
    formVerifyBtn.disabled = false;
  }
}

/**
 * Handles Add/Edit form submission.
 * @param {Event} e
 */
async function handleSaveDestination(e) {
  e.preventDefault();

  const nickname = formNickname.value.trim();
  const rawSpreadsheet = formSpreadsheetInput.value.trim();
  const spreadsheetId = parseSpreadsheetId(rawSpreadsheet);

  if (!nickname) {
    formNickname.focus();
    return;
  }
  if (!spreadsheetId) {
    formSpreadsheetInput.focus();
    return;
  }

  let tabName = "Sheet1";
  if (formTabSelect.style.display !== "none" && formTabSelect.value) {
    tabName = formTabSelect.value.trim();
  } else {
    tabName = formTabInput.value.trim() || "Sheet1";
  }

  const columns = ["text"];
  if (colTimestamp.checked) columns.push("timestamp");
  if (colUrl.checked) columns.push("url");
  if (colTitle.checked) columns.push("title");

  const destinationData = {
    id: formDestId.value || undefined,
    nickname,
    spreadsheetId,
    spreadsheetTitle: formSpreadsheetTitle.value.trim() || "Google Sheet",
    tabName,
    columns
  };

  try {
    const saved = await saveDestination(destinationData);

    // If this was the very first destination, make it primary automatically
    if (!activeSettings.primaryDestinationId && activeDestinations.length === 0) {
      await setGlobalSettings({ primaryDestinationId: saved.id });
    }

    switchView("main");
    await refreshAll();
    showToast(formDestId.value ? "Destination updated!" : "Destination added!");
  } catch (err) {
    alert("Failed to save: " + err.message);
  }
}

/**
 * Updates primary destination tabName directly from Quick Tab selector.
 * @param {string} newTabName
 */
async function handleQuickTabUpdate(newTabName) {
  const primaryId = activeSettings.primaryDestinationId;
  if (!primaryId || !newTabName) return;

  const dest = activeDestinations.find((d) => d.id === primaryId);
  if (!dest) return;

  if (dest.tabName === newTabName) {
    quickTabFeedback.textContent = `✓ Already using "${newTabName}"`;
    quickTabFeedback.className = "tab-feedback success";
    return;
  }

  try {
    await saveDestination({
      ...dest,
      tabName: newTabName
    });

    quickTabFeedback.textContent = `✓ Switched to tab "${newTabName}"`;
    quickTabFeedback.className = "tab-feedback success";

    await refreshAll();
    showToast(`Primary tab changed to "${newTabName}"`);
  } catch (err) {
    quickTabFeedback.textContent = "Error saving tab";
    quickTabFeedback.className = "tab-feedback error";
  }
}

/**
 * Checks if typed tab name exists in the primary spreadsheet.
 * If it exists, switches to it.
 * If it does not exist, creates the new tab in Google Sheets and switches to it.
 * @param {string} rawTabName
 */
async function handleQuickTabCreateOrSwitch(rawTabName) {
  const tabName = (rawTabName || "").trim();
  if (!tabName) return;

  const primaryId = activeSettings.primaryDestinationId;
  if (!primaryId) {
    showToast("Please select a primary destination first", "error");
    return;
  }

  const dest = activeDestinations.find((d) => d.id === primaryId);
  if (!dest || !dest.spreadsheetId) return;

  // Check if tab exists in dropdown options
  const options = Array.from(quickTabSelect.options).map((opt) => opt.value);
  const matchedOption = options.find((opt) => opt.toLowerCase() === tabName.toLowerCase());

  if (matchedOption) {
    // Tab already exists! Switch directly
    quickTabSelect.value = matchedOption;
    await handleQuickTabUpdate(matchedOption);
    quickTabManualInput.value = "";
    return;
  }

  // Tab does NOT exist: Create it in Google Sheets
  quickTabManualBtn.disabled = true;
  quickTabManualBtn.textContent = "Creating…";
  quickTabFeedback.textContent = `Creating new tab "${tabName}" in Google Sheets…`;
  quickTabFeedback.className = "tab-feedback";

  try {
    const token = await getAuthToken(true);
    if (!token) throw new Error("Google account not connected");

    await createSheetTab(dest.spreadsheetId, tabName, token);

    // Save destination with new tabName (resets headerWritten)
    await saveDestination({
      ...dest,
      tabName
    });

    quickTabManualInput.value = "";
    quickTabFeedback.textContent = `✓ Created and switched to tab "${tabName}"`;
    quickTabFeedback.className = "tab-feedback success";

    await refreshAll();
    showToast(`Created & switched to "${tabName}"`);
  } catch (err) {
    console.error("Failed to create tab:", err);
    quickTabFeedback.textContent = humanizeError(err);
    quickTabFeedback.className = "tab-feedback error";
  } finally {
    quickTabManualBtn.disabled = false;
    quickTabManualBtn.textContent = "Create Tab";
  }
}

/**
 * Handles Account Connect / Switch button click.
 */
async function handleAuthToggle() {
  const currentProfile = await getAuthState();
  const isSwitching = Boolean(currentProfile && currentProfile.email && currentProfile.email !== "Not connected");

  try {
    authBtn.disabled = true;
    authBtn.textContent = "…";

    // If switching, pass switchAccount=true without clearing the old token first
    const token = await getAuthToken(true, isSwitching);

    if (token) {
      const profile = await fetchUserProfile(token);
      renderAccountState(profile);
      showToast(isSwitching ? `Switched to ${profile.email}` : `Connected as ${profile.email}`);
      await refreshAll();
    } else {
      renderAccountState(currentProfile);
    }
  } catch (err) {
    console.warn("Auth flow cancelled or failed:", err);
    // Keep existing logged-in account if the switch was cancelled
    if (isSwitching && currentProfile?.email) {
      renderAccountState(currentProfile);
      showToast("Switch cancelled — remained logged in");
    } else {
      showToast(humanizeError(err), "error");
      await loadAccount();
    }
  } finally {
    authBtn.disabled = false;
  }
}

/**
 * Handles Account Logout button click.
 */
async function handleLogout() {
  try {
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "…";
    }

    await invalidateAuthToken();
    renderAccountState(null);
    showToast("Logged out successfully");
  } catch (err) {
    console.error("Logout error:", err);
  } finally {
    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.textContent = "Logout";
    }
  }
}

/**
 * Event Listeners Setup
 */
function initEventListeners() {
  // Account Actions
  authBtn.addEventListener("click", handleAuthToggle);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

  // Menu Mode Radio Changes
  modeAll.addEventListener("change", async () => {
    if (modeAll.checked) {
      activeSettings = await setGlobalSettings({ menuDisplayMode: "all" });
      await refreshPrimarySection();
      renderDestinationsList();
      showToast("Menu Mode: Show all destinations");
    }
  });

  modePrimary.addEventListener("change", async () => {
    if (modePrimary.checked) {
      // If no primary destination is selected yet, default to first available
      let primaryId = activeSettings.primaryDestinationId;
      if (!primaryId && activeDestinations.length > 0) {
        primaryId = activeDestinations[0].id;
      }

      activeSettings = await setGlobalSettings({
        menuDisplayMode: "primary",
        primaryDestinationId: primaryId
      });

      await refreshPrimarySection();
      renderDestinationsList();
      showToast("Menu Mode: Show primary destination only");
    }
  });

  // Primary Destination Dropdown Change
  primaryDestSelect.addEventListener("change", async () => {
    const selectedId = primaryDestSelect.value;
    activeSettings = await setGlobalSettings({ primaryDestinationId: selectedId || null });
    await refreshPrimarySection();
    renderDestinationsList();
    if (selectedId) {
      const found = activeDestinations.find((d) => d.id === selectedId);
      showToast(`Primary: ${found ? found.nickname : "Selected"}`);
    }
  });

  // Quick Tab Refresh Button
  if (quickTabRefreshBtn) {
    quickTabRefreshBtn.addEventListener("click", async () => {
      const primaryDest = activeDestinations.find((d) => d.id === activeSettings.primaryDestinationId);
      if (primaryDest) {
        quickTabRefreshBtn.classList.add("spinning");
        await loadQuickTabsForDestination(primaryDest, true);
        quickTabRefreshBtn.classList.remove("spinning");
        showToast("Sheet tabs refreshed!");
      }
    });
  }

  // Quick Tab Dropdown Change
  quickTabSelect.addEventListener("change", () => {
    const tab = quickTabSelect.value.trim();
    if (tab) {
      handleQuickTabUpdate(tab);
    }
  });

  // Quick Tab Manual Input Typing & Auto-Match
  quickTabManualInput.addEventListener("input", () => {
    const val = quickTabManualInput.value.trim().toLowerCase();
    if (!val) {
      quickTabFeedback.textContent = "";
      return;
    }

    const options = Array.from(quickTabSelect.options).map((opt) => opt.value);
    const matched = options.find((opt) => opt.toLowerCase() === val);

    if (matched) {
      quickTabSelect.value = matched;
      quickTabFeedback.textContent = `Matches existing tab: "${matched}" (will switch)`;
      quickTabFeedback.className = "tab-feedback success";
    } else {
      quickTabFeedback.textContent = `Will create new tab "${quickTabManualInput.value.trim()}" in Google Sheets`;
      quickTabFeedback.className = "tab-feedback";
    }
  });

  // Quick Tab Create / Switch Button Submit
  quickTabManualBtn.addEventListener("click", () => {
    const manualTab = quickTabManualInput.value.trim();
    if (manualTab) {
      handleQuickTabCreateOrSwitch(manualTab);
    }
  });

  quickTabManualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      quickTabManualBtn.click();
    }
  });

  // View Navigation
  openAddBtn.addEventListener("click", openAddView);
  emptyAddBtn.addEventListener("click", openAddView);
  backToMainBtn.addEventListener("click", () => switchView("main"));
  cancelFormBtn.addEventListener("click", () => switchView("main"));

  // Destination List Clicks (Edit / Delete / Confirm)
  destinationsContainer.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".edit-dest-btn");
    if (editBtn) {
      const id = editBtn.dataset.id;
      openEditView(id);
      return;
    }

    const deleteBtn = e.target.closest(".delete-dest-btn");
    if (deleteBtn) {
      inlineDeleteId = deleteBtn.dataset.id;
      renderDestinationsList();
      return;
    }

    const confirmBtn = e.target.closest(".confirm-delete-btn");
    if (confirmBtn) {
      const id = confirmBtn.dataset.id;
      await deleteDestination(id);
      inlineDeleteId = null;
      await refreshAll();
      showToast("Destination deleted.");
      return;
    }

    const cancelDelete = e.target.closest(".cancel-delete-btn");
    if (cancelDelete) {
      inlineDeleteId = null;
      renderDestinationsList();
      return;
    }
  });

  // Add/Edit Form Handlers
  formVerifyBtn.addEventListener("click", handleVerifySpreadsheet);
  destForm.addEventListener("submit", handleSaveDestination);

  // Footer Privacy Policy Link
  if (privacyPolicyLink) {
    privacyPolicyLink.addEventListener("click", (e) => {
      e.preventDefault();
      const privacyUrl = browserApi.runtime?.getURL ? browserApi.runtime.getURL("PRIVACY_POLICY.md") : "PRIVACY_POLICY.md";
      if (browserApi.tabs?.create) {
        browserApi.tabs.create({ url: privacyUrl });
      } else {
        window.open(privacyUrl, "_blank");
      }
    });
  }
}

/**
 * Initialize Popup on DOM ready
 */
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  await loadAccount();
  await refreshAll();
});
