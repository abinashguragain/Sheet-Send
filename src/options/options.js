/**
 * Sheet Send Options Page Logic
 */

import { FIELD_LABELS, humanizeError } from "../shared/constants.js";
import {
  getDestinations,
  getDestinationById,
  saveDestination,
  deleteDestination,
  parseSpreadsheetId,
  getAuthState
} from "../shared/storage.js";
import { getAuthToken, invalidateAuthToken, fetchUserProfile } from "../background/auth.js";
import { getSpreadsheetDetails } from "../background/sheetsApi.js";

// DOM Elements
const destinationsList = document.getElementById("destinationsList");
const emptyState = document.getElementById("emptyState");
const accountEmail = document.getElementById("accountEmail");
const authBtn = document.getElementById("authBtn");
const openAddModalBtn = document.getElementById("openAddModalBtn");
const emptyStateAddBtn = document.getElementById("emptyStateAddBtn");

// Modal Elements
const destinationModal = document.getElementById("destinationModal");
const modalTitle = document.getElementById("modalTitle");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const destinationForm = document.getElementById("destinationForm");

const destIdInput = document.getElementById("destId");
const spreadsheetTitleInput = document.getElementById("spreadsheetTitle");
const destNickname = document.getElementById("destNickname");
const destSpreadsheetInput = document.getElementById("destSpreadsheetInput");
const verifySpreadsheetBtn = document.getElementById("verifySpreadsheetBtn");
const verifyStatus = document.getElementById("verifyStatus");
const destTabSelect = document.getElementById("destTabSelect");
const destTabInput = document.getElementById("destTabInput");

const colText = document.getElementById("colText");
const colTimestamp = document.getElementById("colTimestamp");
const colUrl = document.getElementById("colUrl");
const colTitle = document.getElementById("colTitle");

// Delete Modal Elements
const deleteConfirmModal = document.getElementById("deleteConfirmModal");
const deleteDestMsg = document.getElementById("deleteDestMsg");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Global Toast Element
const optionsToast = document.getElementById("optionsToast");

let pendingDeleteId = null;

/**
 * Displays a lightweight toast in the options page.
 * @param {string} message
 * @param {"success"|"error"} type
 */
function showToast(message, type = "success") {
  if (!optionsToast) return;
  optionsToast.textContent = message;
  optionsToast.style.borderLeftColor = type === "success" ? "var(--color-signal)" : "var(--color-error)";
  optionsToast.style.display = "block";

  setTimeout(() => {
    optionsToast.style.display = "none";
  }, 2500);
}

/**
 * Updates the Google Account status card UI.
 * @param {object|null} profile
 */
function renderAccountState(profile) {
  if (profile && profile.email && profile.email !== "Not connected") {
    accountEmail.textContent = profile.email;
    authBtn.textContent = "Switch Account";
    authBtn.className = "btn btn-outline btn-sm";
  } else {
    accountEmail.textContent = "Not connected";
    authBtn.textContent = "Connect Account";
    authBtn.className = "btn btn-secondary btn-sm";
  }
}

/**
 * Initializes and refreshes account state.
 */
async function loadAccountState() {
  const cached = await getAuthState();
  if (cached) {
    renderAccountState(cached);
  }
}

/**
 * Renders the list of saved destinations.
 */
async function renderDestinations() {
  const destinations = await getDestinations();

  if (!destinations || destinations.length === 0) {
    destinationsList.innerHTML = "";
    emptyState.style.display = "flex";
    return;
  }

  emptyState.style.display = "none";
  destinationsList.innerHTML = destinations
    .map((dest) => {
      const columnPills = (dest.columns || ["text"])
        .map((c) => `<span class="col-pill">${FIELD_LABELS[c] || c}</span>`)
        .join("");

      return `
        <div class="dest-card" data-id="${dest.id}">
          <div class="dest-card-main">
            <div class="dest-card-header">
              <span class="dest-nickname">${escapeHtml(dest.nickname)}</span>
              <span class="dest-badge-tab">Tab: ${escapeHtml(dest.tabName || "Sheet1")}</span>
            </div>
            <div class="dest-meta">
              <span class="dest-sheet-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                ${escapeHtml(dest.spreadsheetTitle || "Google Sheet")}
              </span>
            </div>
            <div class="dest-columns-pills">
              ${columnPills}
            </div>
          </div>
          <div class="dest-card-actions">
            <button type="button" class="btn btn-icon edit-dest-btn" data-id="${dest.id}" title="Edit Destination">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn btn-icon btn-icon-danger delete-dest-btn" data-id="${dest.id}" data-nickname="${escapeHtml(dest.nickname)}" title="Delete Destination">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
 * Resets and opens the destination modal in Add mode.
 */
function openAddModal() {
  modalTitle.textContent = "Add Destination";
  destIdInput.value = "";
  spreadsheetTitleInput.value = "";
  destNickname.value = "";
  destSpreadsheetInput.value = "";
  verifyStatus.textContent = "";
  verifyStatus.className = "verify-status";

  // Reset tab selection fields
  destTabSelect.innerHTML = '<option value="">Select a tab…</option>';
  destTabSelect.style.display = "none";
  destTabInput.style.display = "block";
  destTabInput.value = "Sheet1";

  // Reset column checkboxes
  colText.checked = true;
  colTimestamp.checked = true;
  colUrl.checked = true;
  colTitle.checked = true;

  destinationModal.style.display = "flex";
  destNickname.focus();
}

/**
 * Populates and opens the destination modal in Edit mode.
 * @param {string} id
 */
async function openEditModal(id) {
  const dest = await getDestinationById(id);
  if (!dest) return;

  modalTitle.textContent = "Edit Destination";
  destIdInput.value = dest.id;
  spreadsheetTitleInput.value = dest.spreadsheetTitle || "";
  destNickname.value = dest.nickname || "";
  destSpreadsheetInput.value = dest.spreadsheetId || "";
  verifyStatus.textContent = dest.spreadsheetTitle ? `Spreadsheet: "${dest.spreadsheetTitle}"` : "";
  verifyStatus.className = "verify-status";

  // Fallback / tab selection
  destTabSelect.style.display = "none";
  destTabInput.style.display = "block";
  destTabInput.value = dest.tabName || "Sheet1";

  // Columns
  const cols = dest.columns || ["text"];
  colText.checked = true;
  colTimestamp.checked = cols.includes("timestamp");
  colUrl.checked = cols.includes("url");
  colTitle.checked = cols.includes("title");

  destinationModal.style.display = "flex";
  destNickname.focus();
}

/**
 * Closes the destination modal.
 */
function closeModal() {
  destinationModal.style.display = "none";
}

/**
 * Handles the Spreadsheet Verify button click.
 */
async function handleVerifySpreadsheet() {
  const rawInput = destSpreadsheetInput.value.trim();
  const parsedId = parseSpreadsheetId(rawInput);

  if (!parsedId) {
    verifyStatus.textContent = "Please enter a valid Google Sheets URL or ID.";
    verifyStatus.className = "verify-status error";
    return;
  }

  // Show loading spinner
  const btnText = verifySpreadsheetBtn.querySelector(".btn-text");
  const spinner = verifySpreadsheetBtn.querySelector(".spinner");
  btnText.style.display = "none";
  spinner.style.display = "inline-block";
  verifySpreadsheetBtn.disabled = true;
  verifyStatus.textContent = "Verifying access with Google Sheets API…";
  verifyStatus.className = "verify-status";

  try {
    const token = await getAuthToken(true);
    if (!token) {
      throw new Error("Could not obtain Google authentication token.");
    }

    // Refresh profile display
    fetchUserProfile(token).then((profile) => renderAccountState(profile));

    const details = await getSpreadsheetDetails(parsedId, token);

    // Success! Update UI
    spreadsheetTitleInput.value = details.title;
    verifyStatus.textContent = `✓ Connected: "${details.title}" (${details.tabs.length} tabs found)`;
    verifyStatus.className = "verify-status success";

    // Populate Tab select dropdown
    destTabSelect.innerHTML = details.tabs
      .map((tab) => `<option value="${escapeHtml(tab)}">${escapeHtml(tab)}</option>`)
      .join("");

    // Preserve previously typed/selected tab if present
    const currentTab = destTabInput.value.trim();
    if (currentTab && details.tabs.includes(currentTab)) {
      destTabSelect.value = currentTab;
    }

    destTabInput.style.display = "none";
    destTabSelect.style.display = "block";
  } catch (err) {
    console.error("Verification failed:", err);
    spreadsheetTitleInput.value = "";
    verifyStatus.className = "verify-status error";

    if (err.status === 404) {
      verifyStatus.textContent = "Cannot access this spreadsheet — check the ID and sharing settings.";
    } else if (err.status === 403) {
      verifyStatus.textContent = "Cannot access this spreadsheet — check the ID and sharing settings.";
    } else if (err.status === 400) {
      verifyStatus.textContent = "Invalid spreadsheet ID format.";
    } else {
      verifyStatus.textContent = humanizeError(err);
    }
  } finally {
    btnText.style.display = "inline";
    spinner.style.display = "none";
    verifySpreadsheetBtn.disabled = false;
  }
}

/**
 * Handles destination form submission.
 * @param {Event} e
 */
async function handleSaveDestination(e) {
  e.preventDefault();

  const nickname = destNickname.value.trim();
  const rawSpreadsheetInput = destSpreadsheetInput.value.trim();
  const spreadsheetId = parseSpreadsheetId(rawSpreadsheetInput);

  if (!nickname) {
    alert("Please provide a nickname for this destination.");
    destNickname.focus();
    return;
  }

  if (!spreadsheetId) {
    alert("Please provide a valid Google Spreadsheet URL or ID.");
    destSpreadsheetInput.focus();
    return;
  }

  let tabName = "";
  if (destTabSelect.style.display !== "none" && destTabSelect.value) {
    tabName = destTabSelect.value.trim();
  } else {
    tabName = destTabInput.value.trim() || "Sheet1";
  }

  // Construct enabled columns in fixed order
  const columns = ["text"];
  if (colTimestamp.checked) columns.push("timestamp");
  if (colUrl.checked) columns.push("url");
  if (colTitle.checked) columns.push("title");

  const destinationData = {
    id: destIdInput.value || undefined,
    nickname,
    spreadsheetId,
    spreadsheetTitle: spreadsheetTitleInput.value.trim() || "Google Sheet",
    tabName,
    columns
  };

  try {
    await saveDestination(destinationData);
    closeModal();
    await renderDestinations();
    showToast(destIdInput.value ? "Destination updated successfully!" : "Destination added successfully!");
  } catch (err) {
    console.error("Failed to save destination:", err);
    alert("Failed to save destination: " + err.message);
  }
}

/**
 * Opens delete confirmation modal.
 * @param {string} id
 * @param {string} nickname
 */
function openDeleteModal(id, nickname) {
  pendingDeleteId = id;
  deleteDestMsg.textContent = `Are you sure you want to remove "${nickname}" from your context menu?`;
  deleteConfirmModal.style.display = "flex";
}

/**
 * Confirms deletion of destination.
 */
async function confirmDelete() {
  if (!pendingDeleteId) return;

  try {
    await deleteDestination(pendingDeleteId);
    pendingDeleteId = null;
    deleteConfirmModal.style.display = "none";
    await renderDestinations();
    showToast("Destination deleted.");
  } catch (err) {
    console.error("Error deleting destination:", err);
    alert("Error deleting destination: " + err.message);
  }
}

/**
 * Handles Connect/Switch Account button click.
 */
async function handleAuthToggle() {
  try {
    authBtn.disabled = true;
    authBtn.textContent = "Connecting…";

    // Invalidate existing to allow account switching
    await invalidateAuthToken();
    const token = await getAuthToken(true);

    if (token) {
      const profile = await fetchUserProfile(token);
      renderAccountState(profile);
      showToast(`Connected as ${profile.email}`);
    } else {
      renderAccountState(null);
    }
  } catch (err) {
    console.error("Auth action error:", err);
    showToast(humanizeError(err), "error");
    loadAccountState();
  } finally {
    authBtn.disabled = false;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  renderDestinations();
  loadAccountState();

  openAddModalBtn.addEventListener("click", openAddModal);
  emptyStateAddBtn.addEventListener("click", openAddModal);
  closeModalBtn.addEventListener("click", closeModal);
  cancelModalBtn.addEventListener("click", closeModal);
  destinationForm.addEventListener("submit", handleSaveDestination);

  verifySpreadsheetBtn.addEventListener("click", handleVerifySpreadsheet);
  destSpreadsheetInput.addEventListener("blur", () => {
    const raw = destSpreadsheetInput.value.trim();
    if (raw && !verifyStatus.textContent) {
      const parsed = parseSpreadsheetId(raw);
      if (parsed) {
        verifyStatus.textContent = `Parsed ID: ${parsed} (Click Verify to check access)`;
        verifyStatus.className = "verify-status";
      }
    }
  });

  authBtn.addEventListener("click", handleAuthToggle);

  // Delegation for dynamically rendered destination cards
  destinationsList.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-dest-btn");
    if (editBtn) {
      const id = editBtn.getAttribute("data-id");
      openEditModal(id);
      return;
    }

    const deleteBtn = e.target.closest(".delete-dest-btn");
    if (deleteBtn) {
      const id = deleteBtn.getAttribute("data-id");
      const nickname = deleteBtn.getAttribute("data-nickname");
      openDeleteModal(id, nickname);
      return;
    }
  });

  cancelDeleteBtn.addEventListener("click", () => {
    pendingDeleteId = null;
    deleteConfirmModal.style.display = "none";
  });

  confirmDeleteBtn.addEventListener("click", confirmDelete);

  // Close modals on backdrop click
  window.addEventListener("click", (e) => {
    if (e.target === destinationModal) {
      closeModal();
    }
    if (e.target === deleteConfirmModal) {
      pendingDeleteId = null;
      deleteConfirmModal.style.display = "none";
    }
  });
});
