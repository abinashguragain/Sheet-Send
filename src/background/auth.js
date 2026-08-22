/**
 * Cross-browser OAuth 2.0 authentication service for Sheet Send.
 * Supports chrome.identity.getAuthToken for Chromium browsers and
 * falls back to PKCE Authorization Code flow + refresh tokens with layered fallback
 * for Brave, Opera, Vivaldi, Firefox, etc.
 * Avoids any embedded client secret.
 */

import {
  SHEETS_SCOPE,
  USERINFO_EMAIL_SCOPE,
  USERINFO_ENDPOINT,
  GOOGLE_OAUTH_AUTH_URL,
  STORAGE_KEYS,
  WEB_AUTH_FLOW_CLIENT_ID
} from "../shared/constants.js";
import { browserApi } from "../shared/browserPolyfillLoader.js";
import { setAuthState, getAuthState, clearAuthState } from "../shared/storage.js";

// In-memory token cache for current session
let inMemoryToken = null;
let inMemoryRefreshToken = null;
let inMemoryTokenExpiresAt = 0;

// Cache whether getAuthToken is known to work in this browser, per session
let getAuthTokenSupported = null;

/**
 * Checks local storage for a valid, cached session.
 * @returns {Promise<{token: string|null, refreshToken: string|null, expiresAt: number}|null>}
 */
async function getCachedSession() {
  const now = Date.now();
  if (inMemoryToken && inMemoryTokenExpiresAt > now + 60000) {
    return {
      token: inMemoryToken,
      refreshToken: inMemoryRefreshToken,
      expiresAt: inMemoryTokenExpiresAt
    };
  }

  try {
    const stored = await browserApi.storage.local.get(STORAGE_KEYS.AUTH_SESSION);
    const session = stored?.[STORAGE_KEYS.AUTH_SESSION];
    if (session?.token) {
      inMemoryToken = session.token;
      inMemoryRefreshToken = session.refreshToken || null;
      inMemoryTokenExpiresAt = session.expiresAt || 0;

      return {
        token: inMemoryToken,
        refreshToken: inMemoryRefreshToken,
        expiresAt: inMemoryTokenExpiresAt
      };
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Saves token to in-memory and local storage cache.
 * @param {string} accessToken
 * @param {number} expiresIn
 * @param {string|null} [refreshToken]
 */
async function cacheToken(accessToken, expiresIn = 3600, refreshToken = null) {
  inMemoryToken = accessToken;
  inMemoryTokenExpiresAt = Date.now() + expiresIn * 1000;
  if (refreshToken) {
    inMemoryRefreshToken = refreshToken;
  }

  try {
    await browserApi.storage.local.set({
      [STORAGE_KEYS.AUTH_SESSION]: {
        token: accessToken,
        refreshToken: inMemoryRefreshToken,
        expiresAt: inMemoryTokenExpiresAt
      }
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Generates a high-entropy cryptographic random string for PKCE.
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join("");
}

/**
 * Generates PKCE code challenge from verifier using SHA-256.
 * @param {string} codeVerifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Exchanges authorization code for access and refresh tokens using PKCE.
 * Deliberately no client_secret — PKCE public-client flow.
 * @param {string} code
 * @param {string} codeVerifier
 * @param {string} redirectUri
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_in?: number}>}
 */
async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: WEB_AUTH_FLOW_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`TOKEN_EXCHANGE_FAILED:${errBody.error || response.status}`);
  }

  return await response.json();
}

/**
 * Silently refreshes access token using stored refresh token.
 * @param {string} refreshToken
 * @returns {Promise<{access_token: string, expires_in?: number}>}
 */
async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: WEB_AUTH_FLOW_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`REFRESH_FAILED:${errBody.error || response.status}`);
  }

  return await response.json();
}

/**
 * Gets the OAuth Client ID from manifest or storage.
 * @returns {Promise<string>}
 */
async function getClientId() {
  const manifest = (typeof chrome !== "undefined" && chrome.runtime?.getManifest)
    ? chrome.runtime.getManifest()
    : (typeof browser !== "undefined" && browser.runtime?.getManifest)
      ? browser.runtime.getManifest()
      : {};

  if (manifest.oauth2?.client_id && !manifest.oauth2.client_id.includes("PLACEHOLDER")) {
    return manifest.oauth2.client_id;
  }

  try {
    const customConfig = await browserApi.storage.local.get("custom_oauth_client_id");
    if (customConfig?.custom_oauth_client_id) {
      return customConfig.custom_oauth_client_id;
    }
  } catch {
    // Ignore
  }

  return manifest.oauth2?.client_id || "OAUTH_CLIENT_ID_PLACEHOLDER.apps.googleusercontent.com";
}

/**
 * Authenticates using chrome.identity.getAuthToken (Chromium).
 * @param {boolean} interactive
 * @param {boolean} switchAccount
 * @returns {Promise<string>}
 */
async function getChromiumAuthToken(interactive = true, switchAccount = false) {
  if (!switchAccount) {
    const session = await getCachedSession();
    if (session?.token && session.expiresAt > Date.now() + 60000) {
      return session.token;
    }
  }

  return new Promise((resolve, reject) => {
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      reject(new Error("chrome.identity.getAuthToken is not available in this environment"));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, async (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error("No OAuth token returned from Google"));
        return;
      }
      await cacheToken(token, 3600);
      resolve(token);
    });
  });
}

/**
 * Authenticates using launchWebAuthFlow with PKCE Authorization Code flow
 * and layered fallback. Avoids embedded client secret.
 * @param {boolean} interactive
 * @param {boolean} switchAccount
 * @returns {Promise<string|null>}
 */
async function getWebAuthFlowToken(interactive = true, switchAccount = false) {
  const now = Date.now();
  const session = await getCachedSession();

  // 1. If not switching and cached token is still valid (>60s remaining), return it immediately
  if (!switchAccount && session?.token && session.expiresAt > now + 60000) {
    return session.token;
  }

  // 2. If token is expired but we have a refresh_token, try refreshing silently first
  if (!switchAccount && session?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken);
      if (refreshed.access_token) {
        const expiresIn = parseInt(refreshed.expires_in || "3600", 10);
        await cacheToken(refreshed.access_token, expiresIn, session.refreshToken);
        return refreshed.access_token;
      }
    } catch (err) {
      console.warn("PKCE refreshAccessToken failed, attempting fallback...", err.message);
    }
  }

  const redirectUri = browserApi.identity.getRedirectURL();

  // 3. If non-interactive and no refresh token or refresh failed, try silent implicit re-auth
  if (!interactive) {
    try {
      const silentAuthUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
      silentAuthUrl.searchParams.set("client_id", WEB_AUTH_FLOW_CLIENT_ID);
      silentAuthUrl.searchParams.set("redirect_uri", redirectUri);
      silentAuthUrl.searchParams.set("response_type", "token");
      silentAuthUrl.searchParams.set("scope", `${SHEETS_SCOPE} ${USERINFO_EMAIL_SCOPE}`);
      silentAuthUrl.searchParams.set("prompt", "none");

      const silentResponseUrl = await browserApi.identity.launchWebAuthFlow({
        url: silentAuthUrl.toString(),
        interactive: false
      });

      if (silentResponseUrl) {
        const parsed = new URL(silentResponseUrl);
        const hashParams = new URLSearchParams(parsed.hash.slice(1));
        const token = hashParams.get("access_token");
        const exp = parseInt(hashParams.get("expires_in") || "3600", 10);
        if (token) {
          await cacheToken(token, exp);
          return token;
        }
      }
    } catch {
      // Silent auth not possible without user interaction
    }
    return null;
  }

  // 4. Interactive flow: Primary path is PKCE Authorization Code Flow
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const pkceAuthUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
  pkceAuthUrl.searchParams.set("client_id", WEB_AUTH_FLOW_CLIENT_ID);
  pkceAuthUrl.searchParams.set("redirect_uri", redirectUri);
  pkceAuthUrl.searchParams.set("response_type", "code");
  pkceAuthUrl.searchParams.set("code_challenge", codeChallenge);
  pkceAuthUrl.searchParams.set("code_challenge_method", "S256");
  pkceAuthUrl.searchParams.set("access_type", "offline"); // Required for refresh_token
  pkceAuthUrl.searchParams.set("scope", `${SHEETS_SCOPE} ${USERINFO_EMAIL_SCOPE}`);
  pkceAuthUrl.searchParams.set("state", state);
  pkceAuthUrl.searchParams.set("prompt", switchAccount ? "select_account" : "consent");

  try {
    const responseUrl = await browserApi.identity.launchWebAuthFlow({
      url: pkceAuthUrl.toString(),
      interactive: true
    });

    if (!responseUrl) {
      throw new Error("Authorization was cancelled or returned empty response");
    }

    const parsedUrl = new URL(responseUrl);
    const code = parsedUrl.searchParams.get("code");

    if (code) {
      try {
        const tokenData = await exchangeCodeForToken(code, codeVerifier, redirectUri);
        if (tokenData.access_token) {
          const expiresIn = parseInt(tokenData.expires_in || "3600", 10);
          await cacheToken(tokenData.access_token, expiresIn, tokenData.refresh_token || null);
          return tokenData.access_token;
        }
      } catch (exchangeErr) {
        console.warn("PKCE code exchange failed, falling back to implicit grant:", exchangeErr.message);
      }
    }
  } catch (err) {
    if (err.message && (err.message.includes("cancelled") || err.message.includes("User closed"))) {
      throw err;
    }
    console.warn("PKCE authorization flow failed, attempting implicit grant fallback:", err.message);
  }

  // 5. Fallback path: Implicit Flow (response_type=token)
  const implicitAuthUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
  implicitAuthUrl.searchParams.set("client_id", WEB_AUTH_FLOW_CLIENT_ID);
  implicitAuthUrl.searchParams.set("redirect_uri", redirectUri);
  implicitAuthUrl.searchParams.set("response_type", "token");
  implicitAuthUrl.searchParams.set("scope", `${SHEETS_SCOPE} ${USERINFO_EMAIL_SCOPE}`);
  implicitAuthUrl.searchParams.set("state", state);
  implicitAuthUrl.searchParams.set("prompt", switchAccount ? "select_account" : "consent");

  const fallbackResponseUrl = await browserApi.identity.launchWebAuthFlow({
    url: implicitAuthUrl.toString(),
    interactive: true
  });

  if (!fallbackResponseUrl) {
    throw new Error("Authorization was cancelled or returned empty response");
  }

  const parsedFallback = new URL(fallbackResponseUrl);
  const hashParams = new URLSearchParams(parsedFallback.hash.slice(1));
  const queryParams = parsedFallback.searchParams;

  const accessToken = hashParams.get("access_token") || queryParams.get("access_token");
  const expiresIn = parseInt(hashParams.get("expires_in") || queryParams.get("expires_in") || "3600", 10);

  if (!accessToken) {
    const errorParam = hashParams.get("error") || queryParams.get("error");
    throw new Error(`Google Auth Error: ${errorParam || "Failed to parse access token"}`);
  }

  await cacheToken(accessToken, expiresIn);
  return accessToken;
}

/**
 * Detects Brave specifically using Brave's own official navigator API.
 * @returns {Promise<boolean>}
 */
async function isBrave() {
  try {
    return !!(navigator.brave && (await navigator.brave.isBrave()));
  } catch {
    return false;
  }
}

/**
 * Main token getter.
 * @param {boolean} interactive
 * @param {boolean} switchAccount
 * @returns {Promise<string>}
 */
export async function getAuthToken(interactive = true, switchAccount = false) {
  if (!switchAccount) {
    const session = await getCachedSession();
    if (session?.token && session.expiresAt > Date.now() + 60000) {
      return session.token;
    }
  }

  if (getAuthTokenSupported === false) {
    return await getWebAuthFlowToken(interactive, switchAccount);
  }

  const brave = await isBrave();
  if (brave) {
    getAuthTokenSupported = false;
    return await getWebAuthFlowToken(interactive, switchAccount);
  }

  if (typeof chrome !== "undefined" && chrome?.identity?.getAuthToken) {
    try {
      const token = await getChromiumAuthToken(interactive, switchAccount);
      getAuthTokenSupported = true;
      return token;
    } catch (err) {
      console.warn("chrome.identity.getAuthToken failed, falling back to launchWebAuthFlow.", err.message);
      getAuthTokenSupported = false;
      return await getWebAuthFlowToken(interactive, switchAccount);
    }
  }

  getAuthTokenSupported = false;
  return await getWebAuthFlowToken(interactive, switchAccount);
}

/**
 * Invalidates and removes cached token (used when 401 is encountered or user disconnects).
 * @param {string} [token] Specific token to invalidate
 * @returns {Promise<void>}
 */
export async function invalidateAuthToken(token) {
  const tokenToClear = token || inMemoryToken;
  const refreshTokenToClear = inMemoryRefreshToken;

  inMemoryToken = null;
  inMemoryRefreshToken = null;
  inMemoryTokenExpiresAt = 0;

  try {
    await browserApi.storage.local.remove(STORAGE_KEYS.AUTH_SESSION);
  } catch {
    // Ignore
  }

  if (chrome?.identity?.removeCachedAuthToken && tokenToClear) {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: tokenToClear }, () => {
        resolve();
      });
    });
  }

  // Revoke from Google server if possible
  if (tokenToClear) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToClear)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
    } catch {
      // Non-blocking
    }
  }

  if (refreshTokenToClear) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshTokenToClear)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
    } catch {
      // Non-blocking
    }
  }

  await clearAuthState();
}

/**
 * Fetches user profile (email, name) for authenticated user.
 * @param {string} token
 * @returns {Promise<{email: string, picture?: string}>}
 */
export async function fetchUserProfile(token) {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Profile fetch failed: ${response.status}`);
    }
    const data = await response.json();
    const profile = {
      email: data.email || "Connected",
      name: data.name || "",
      picture: data.picture || ""
    };
    await setAuthState(profile);
    return profile;
  } catch (err) {
    console.warn("Could not fetch user profile info:", err);
    const fallbackProfile = { email: "Connected Google Account" };
    await setAuthState(fallbackProfile);
    return fallbackProfile;
  }
}
