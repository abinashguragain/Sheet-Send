/**
 * Sheet Send constants and configuration values.
 */

// Selections exceeding this character count require explicit in-page confirmation
export const MAX_CHARS_NO_CONFIRM = 500;

// Google API scopes & endpoints
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
export const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// OAuth endpoints for browsers requiring manual auth flow (e.g. Firefox WebAuthFlow)
export const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Web application-type OAuth client, used ONLY for launchWebAuthFlow
// (Brave, Opera, Firefox) — separate from the Chrome Extension-type
// client used by chrome.identity.getAuthToken, because launchWebAuthFlow
// requires a different registered client type in Google Cloud Console.
export const WEB_AUTH_FLOW_CLIENT_ID = "908374240384-bmmk79ri27rfghe7vjsc7bev602th0ud.apps.googleusercontent.com";

// Standard column identifiers and human-readable header names
export const FIELD_LABELS = {
  text: "Selected Text",
  timestamp: "Timestamp",
  url: "Source URL",
  title: "Page Title"
};

// Storage keys
export const STORAGE_KEYS = {
  DESTINATIONS: "sheet_send_destinations",
  GLOBAL_SETTINGS: "sheet_send_global_settings",
  AUTH_STATE: "sheet_send_auth_state",
  AUTH_SESSION: "sheet_send_auth_session"
};

/**
 * Humanizes HTTP/API errors into clear, actionable messages for user toasts.
 * @param {Error|object|number} err
 * @returns {string}
 */
export function humanizeError(err) {
  if (!err) return "Something went wrong — try again";

  const status = typeof err === "number" ? err : err.status || err.code || (err.message && parseInt(err.message.match(/\b\d{3}\b/)?.[0] || "0", 10));

  if (status === 404) {
    return "Spreadsheet or tab not found — check destination settings";
  }
  if (status === 403) {
    return "No access to this spreadsheet — check sharing settings";
  }
  if (status === 401) {
    return "Google account needs reconnecting";
  }
  if (status === 400) {
    if (err.message && err.message.toLowerCase().includes("parse")) {
      return "Cannot access spreadsheet — invalid ID format";
    }
    return "Tab not found or invalid range in this spreadsheet";
  }
  if (err.message) {
    if (err.message.includes("network") || err.message.includes("Failed to fetch")) {
      return "Network error — please check your internet connection";
    }
    if (err.message.includes("Google account not connected")) {
      return "Google account not connected — open Sheet Send settings";
    }
    if (err.message.includes("did not approve access") || err.message.includes("canceled") || err.message.includes("cancelled")) {
      return "Google sign-in was cancelled or access was not approved.";
    }
    return err.message;
  }

  return "Something went wrong — try again";
}
