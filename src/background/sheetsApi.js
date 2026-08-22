/**
 * Google Sheets REST API v4 client for Sheet Send.
 */

import { SHEETS_API_BASE } from "../shared/constants.js";

/**
 * Encodes a sheet/tab title for Google Sheets API A1 range notation.
 * If the sheet name contains spaces or special characters, it must be enclosed in single quotes,
 * and internal single quotes must be doubled.
 * @param {string} tabName
 * @returns {string}
 */
export function formatTabRange(tabName) {
  if (!tabName) return "Sheet1!A1";
  const escapedName = tabName.replace(/'/g, "''");
  return `'${escapedName}'!A1`;
}

/**
 * Verifies spreadsheet access and fetches sheet title + tab names.
 * @param {string} spreadsheetId
 * @param {string} token
 * @returns {Promise<{title: string, tabs: string[]}>}
 */
export async function getSpreadsheetDetails(spreadsheetId, token) {
  if (!spreadsheetId) {
    const error = new Error("Spreadsheet ID is required");
    error.status = 400;
    throw error;
  }

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || "";
    } catch {
      // response is not json
    }

    const err = new Error(errorDetail || `HTTP error ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const title = data.properties?.title || "Untitled Spreadsheet";
  const tabs = (data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);

  return { title, tabs };
}

/**
 * Creates a brand-new sheet tab inside a Google Spreadsheet via batchUpdate.
 * @param {string} spreadsheetId
 * @param {string} newTabTitle
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function createSheetTab(spreadsheetId, newTabTitle, token) {
  if (!spreadsheetId || !newTabTitle) {
    const error = new Error("Spreadsheet ID and Tab Title are required");
    error.status = 400;
    throw error;
  }

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: newTabTitle
            }
          }
        }
      ]
    })
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || "";
    } catch {
      // ignore
    }

    const err = new Error(errorDetail || `HTTP error ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Appends a row of values to the configured spreadsheet and tab.
 * @param {object} destination Destination object { spreadsheetId, tabName }
 * @param {Array<string>} rowValues Array of string values to write
 * @param {string} token OAuth Access Token
 * @returns {Promise<object>}
 */
export async function appendRowToSheet(destination, rowValues, token) {
  const { spreadsheetId, tabName } = destination;

  if (!spreadsheetId) {
    const error = new Error("Destination is missing spreadsheet ID");
    error.status = 400;
    throw error;
  }

  const range = formatTabRange(tabName || "Sheet1");
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [rowValues]
    })
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || "";
    } catch {
      // response is not json
    }

    const err = new Error(errorDetail || `HTTP error ${response.status}`);
    err.status = response.status;

    // Detect missing tab specifically
    if (response.status === 400 && errorDetail.toLowerCase().includes("unable to parse range")) {
      err.message = `Tab '${tabName}' not found in this spreadsheet.`;
    }

    throw err;
  }

  return await response.json();
}
