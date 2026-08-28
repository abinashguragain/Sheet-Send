# Sheet Send — Build Specification

**Working name:** Sheet Send
**Purpose:** A free, public, cross-browser extension. User highlights text on any webpage, right-clicks, selects a saved destination from a submenu, and the text is appended as a new row to a specific Google Sheet tab — with optional timestamp, source URL, and page title columns. No backend server. Each user authenticates with their own Google account. Chrome, Edge, and Firefox from one shared codebase.

This document is the single source of truth. Build exactly to this spec. Where a decision was deferred, it is marked `OPEN` — stop and ask rather than guessing.

---

## 1. Product Requirements (confirmed decisions)

| Area | Decision |
|---|---|
| Backend | None. 100% client-side. No server, no hosting cost, ever. |
| Auth | OAuth 2.0, user's own Google account. No service accounts, no JSON keys in code. |
| Destinations | User can configure multiple named destinations (nickname + spreadsheet + tab + column layout) in an options page. Right-click submenu lists all saved destinations. |
| Spreadsheet input | User pastes either a full Google Sheets URL or a raw Spreadsheet ID. Extension must parse either and extract the ID. |
| Tab identification | User types tab name OR clicks "Verify" to fetch real tab (sheet) names from the API and pick from a dropdown. Verify is required functionality, not optional. |
| Missing spreadsheet/tab | If spreadsheet ID invalid/inaccessible → show "Cannot access this spreadsheet — check the ID and sharing settings." If spreadsheet accessible but named tab doesn't exist → show "Tab '<name>' not found in this spreadsheet." No auto-creation of tabs, ever. |
| Row placement | Always append — first empty row after existing data. User never manages row numbers. |
| Column mapping | User checks which fields to include: Selected text (always on, cannot disable), Timestamp, Source URL, Page title. Columns are written left-to-right (A, B, C…) in the order the fields are listed/enabled in the options UI. |
| Header row | On, by default, per destination. First time a destination is used (sheet/tab has no header row written yet by this extension), write a header row (e.g. `Text | Timestamp | Source URL | Page Title`) before appending the data row. Track "header already written" per destination in storage so it's not rewritten every time. |
| Long text selections | If selected text exceeds a defined limit (see §6.4), do NOT send silently and do NOT silently truncate. Show an in-page confirm dialog: "You selected N characters. Send full text anyway?" User must confirm before it's sent. If declined, abort silently (no row written). |
| Feedback | On send: small 2-second toast/notification confirming success or failure. Also change the extension toolbar icon briefly (e.g. green check overlay for success, red for failure) as a secondary signal. |
| Storage | `storage.sync` (Chrome/Edge) and `browser.storage.sync` (Firefox) — destinations sync across a user's own signed-in browser instances within each browser's own ecosystem. Chrome sync and Firefox sync are separate; that's expected and fine. |
| Distribution | Public. Chrome Web Store, Microsoft Edge Add-ons, Firefox Add-ons (AMO). Free to publish and free to install, forever, for everyone. |
| Cost | $0 hosting. One-time $5 Chrome Web Store developer registration fee (one-time per developer account, not per extension). Edge and Firefox stores are free to publish on. |
| OAuth mode | MUST go through Google's OAuth verification process (see §8) before public launch, because distribution is public, not limited to a fixed test-user list. Testing mode is only for development/internal testing before that. |
| Privacy policy | Required. Host a plain page at abinashg.com.np (e.g. `abinashg.com.np/sheet-send/privacy`) — content spec in §9. |
| Naming | "Sheet Send" for now. NOTE: two existing unrelated extensions are named "Send to Sheets" (different apps, different scope — one for LinkedIn profile capture, one for CSV/Excel file import). Not a blocking conflict, but flag to the user again before final store submission in case they want a more distinct name to avoid confusion in store search results and reduce risk of a Google review naming objection. Do not silently rename — ask first. |
| Repo | No git repo yet. Build in a local project folder. Structure it so `git init` is trivial to add later (i.e. still include a sensible `.gitignore` from the start). |
| Content scope | Text only. No image capture, no link-only capture, no page-scraping automations. Keep scope exactly to: select text → send to configured destination. |

---

## 2. Explicitly Out of Scope (do not build)

- No backend/proxy server of any kind.
- No service-account / JSON-key auth path.
- No auto-creation of spreadsheets or tabs.
- No image or link capture (text only).
- No analytics, tracking, or telemetry of any kind embedded in the extension.
- No storing of user data anywhere except the user's own `storage.sync` (their destination configs) and their own Google Sheet (the actual captured text). Sheet Send's developer never sees or receives user data — no exceptions, no "anonymous usage stats," nothing.

---

## 3. Architecture Overview

```
sheet-send/
├── manifest.chrome.json        # MV3 manifest for Chrome/Edge (Chromium)
├── manifest.firefox.json       # MV3 manifest for Firefox
├── src/
│   ├── background/
│   │   ├── background.js       # Service worker: context menu, message routing
│   │   ├── auth.js             # Per-browser OAuth token logic (branches by browser)
│   │   └── sheetsApi.js        # Google Sheets API calls (append, get tabs, verify access)
│   ├── content/
│   │   └── confirmDialog.js    # Injected script for long-selection confirm prompt
│   ├── options/
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   ├── shared/
│   │   ├── storage.js          # Wrapper around storage.sync get/set, destination CRUD
│   │   ├── constants.js        # Char limits, scope strings, API base URLs
│   │   └── browserPolyfillLoader.js
│   └── icons/
│       ├── icon-16.png / icon-32.png / icon-48.png / icon-128.png
│       ├── icon-success-badge overlay (generated at runtime via canvas or swapped icon set)
│       └── icon-error-badge overlay
├── vendor/
│   └── browser-polyfill.js     # webextension-polyfill, bundled (no CDN dependency)
├── .gitignore
├── README.md                   # Human-facing project readme
└── PRIVACY_POLICY.md           # Source content to publish on abinashg.com.np
```

Build tooling: keep it dependency-light. Plain JS (no framework needed for an options page this simple), bundled if needed with esbuild only if the agent finds it necessary for import ergonomics — otherwise plain `<script>` tags are fine given the small size. Do not introduce React/webpack for this — it adds build complexity with no real benefit at this scope.

---

## 4. Manifest Requirements

### 4.1 Shared (both manifests must include)
- `manifest_version: 3`
- `name`: "Sheet Send"
- `permissions`: `contextMenus`, `storage`, `scripting`, `notifications`
- `host_permissions`: `https://sheets.googleapis.com/*`, `https://www.googleapis.com/*`
- `action`: toolbar icon with default popup unset (icon-only, used for success/fail badge feedback, not a persistent popup UI)
- `options_page` (Chrome) / `options_ui` (Firefox uses `options_ui` with `open_in_tab: true`) pointing to `src/options/options.html`
- `background.service_worker` for Chrome; Firefox MV3 background needs `background.scripts` fallback handling — confirm current Firefox MV3 background requirements at build time (this has been in flux across Firefox versions; verify against current Firefox extension docs before finalizing, don't assume from training data).

### 4.2 Chrome/Edge-specific (`manifest.chrome.json`)
- `oauth2` key with `client_id` (placeholder until Google Cloud setup done) and `scopes: ["https://www.googleapis.com/auth/spreadsheets"]`
- Uses `chrome.identity.getAuthToken` — requires the `identity` permission.

### 4.3 Firefox-specific (`manifest.firefox.json`)
- No native `chrome.identity.getAuthToken` equivalent. Use `identity.launchWebAuthFlow` manually with the same OAuth client ID (Firefox needs a "Web application" or appropriately configured OAuth client type — confirm exact required type against current Google/Firefox docs at build time).
- `browser_specific_settings.gecko.id`: a stable extension ID string (e.g. `sheet-send@abinashg.com.np`) — required by AMO for a persistent identity across updates.

### 4.4 Context Menu Behavior
- Menu item(s) created with `contexts: ["selection"]` — only appears when text is selected, on every page (`"documentUrlPatterns": ["<all_urls>"]` or omit to default to all).
- If zero destinations are configured: single menu item "Sheet Send: Set up a destination" → on click, opens the options page (`runtime.openOptionsPage()`), does NOT attempt to send anything.
- If one or more destinations exist: parent item "Sheet Send" with a submenu, one entry per destination, labeled by nickname. Rebuild the submenu (`contextMenus.removeAll()` + recreate) whenever destinations change in storage, and once on install/startup.

---

## 5. OAuth & Auth Flow

### 5.1 Chrome/Edge
```js
chrome.identity.getAuthToken({ interactive: true }, (token) => { ... })
```
Handles refresh automatically. Token is short-lived; call this fresh before each API call rather than caching long-term — `getAuthToken` returns a cached valid token instantly if one exists, so this is cheap.

### 5.2 Firefox
Use `browser.identity.launchWebAuthFlow` with the standard OAuth 2.0 authorization-code-with-PKCE flow (implicit flow is deprecated by Google — confirm PKCE is the required approach at build time against current Google Identity docs). Extract token from redirect URL. Store token + expiry in-memory (background) and refresh as needed; do not persist raw tokens to `storage.sync` (sync storage is not the right place for credentials — keep tokens in `storage.session` if persistence across service-worker restarts is needed, never in `storage.sync`/`storage.local` long-term).

### 5.3 Scope
Single scope: `https://www.googleapis.com/auth/spreadsheets` (read/write). This is a Google-classified **sensitive** scope (not restricted). Required for both the Verify feature (reading tab names) and the append operation (writing rows).

### 5.4 Revocation / Reauth Handling
If an API call returns 401, attempt one silent token refresh, then if that also fails, surface a clear "Reconnect your Google account" state in the options page and fail the pending send with an explanatory toast — do not retry indefinitely.

---

## 6. Options Page Spec

### 6.1 Layout
- Header: "Sheet Send — Destinations"
- List of existing destinations (cards), each showing nickname, spreadsheet name (fetched, not just raw ID), tab name, and enabled columns — with Edit / Delete actions.
- "+ Add destination" button opens a form (inline or modal, agent's choice, keep it simple).
- "Connect Google Account" state indicator (connected email shown once authorized; button to disconnect/switch account).

### 6.2 Add/Edit Destination Form
Fields:
1. **Nickname** (free text, required, shown in the context submenu) — enforce reasonable length (e.g. max 40 chars) so submenu doesn't overflow.
2. **Spreadsheet URL or ID** (free text, required) — parse on blur/verify: accept either a full `https://docs.google.com/spreadsheets/d/<ID>/edit...` URL or a bare ID, extract `<ID>` via regex (`/\/d\/([a-zA-Z0-9-_]+)/` for URLs; if no match, treat the whole trimmed input as a raw ID).
3. **Verify button** — calls Sheets API `spreadsheets.get` with the parsed ID. On success: show spreadsheet title, populate a **Tab dropdown** from `sheets[].properties.title` in the response, let user pick one. On failure: show specific reason — not found / no access / invalid ID format, distinguished by HTTP status (404 vs 403 vs malformed request).
4. **Tab** — dropdown (populated after Verify) rather than free text, once Verify has succeeded. Before verifying, allow a plain text fallback field so the form isn't blocked, but recommend Verify.
5. **Columns to include** — checkboxes, in display order = write order:
   - [x] Selected text (locked on, not uncheckable)
   - [ ] Timestamp
   - [ ] Source URL
   - [ ] Page title
6. **Save** button — writes destination object to `storage.sync` via `shared/storage.js`.

### 6.3 Destination Data Model (stored in `storage.sync`)
```js
{
  id: "uuid-v4",
  nickname: "Research notes",
  spreadsheetId: "1AbC...",
  spreadsheetTitle: "My Research",   // cached from Verify, for display only
  tabName: "Clippings",
  columns: ["text", "timestamp", "url", "title"], // order = column order, "text" always present and always first unless user reorders — see note below
  headerWritten: false,              // flips true after first successful append with header
  createdAt: "ISO8601",
}
```
Note on column order: spec allows the simplest implementation — order of the checkboxes as listed in the form (text, timestamp, url, title) is the fixed order for v1. Do not build drag-to-reorder unless asked; it wasn't requested and adds UI complexity for a v1 build. Flag this as a possible v2 enhancement in the README, not a blocker now.

### 6.4 Constants (`shared/constants.js`)
```js
export const MAX_CHARS_NO_CONFIRM = 500; // above this, confirm dialog required before send
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
```
`500` is a reasonable default; note it in code as easily adjustable, not hardcoded in multiple places.

---

## 7. Background Script Logic (`background.js`)

Pseudocode for the click handler:

```
on contextMenus.onClicked(info, tab):
  if clicked item is "setup-prompt":
    runtime.openOptionsPage()
    return

  destination = storage.getDestinationById(info.menuItemId)
  selectedText = info.selectionText

  if selectedText.length > MAX_CHARS_NO_CONFIRM:
    confirmed = await scripting.executeScript(tab.id, showConfirmDialog, [selectedText.length])
    if not confirmed:
      return  // abort silently, no toast, no row written

  token = await auth.getToken()  // per-browser implementation
  if !token:
    showToast(tab.id, "error", "Google account not connected — open Sheet Send settings")
    return

  try:
    if !destination.tabExistsVerified:
      # defensive re-check not required every send if already verified at save-time;
      # rely on the API call itself to surface 400/404 if the tab was deleted since
    row = buildRow(destination.columns, selectedText, tab.url, tab.title)
    if !destination.headerWritten:
      await sheetsApi.appendRow(destination, HEADER_LABELS_FOR(destination.columns))
      storage.markHeaderWritten(destination.id)
    await sheetsApi.appendRow(destination, row)
    setToolbarIcon("success")
    showToast(tab.id, "success", `Added to ${destination.nickname}`)
  catch (err):
    setToolbarIcon("error")
    showToast(tab.id, "error", humanizeError(err))  // distinguish 403/404/401/network
  finally:
    setTimeout(resetToolbarIcon, 2000)
```

`humanizeError` must map: 404 → "Spreadsheet or tab not found — check destination settings", 403 → "No access to this spreadsheet — check sharing settings", 401 → "Google account needs reconnecting", network/other → "Something went wrong — try again".

The confirm dialog (`scripting.executeScript` injecting a function that calls `window.confirm(...)` in the page context) is the correct MV3-compatible way to get a synchronous yes/no from the user without a custom popup UI; document this choice in code comments since it's a slightly non-obvious pattern.

---

## 8. Google Cloud / OAuth Setup Steps (for the human, document these in README.md)

1. Go to Google Cloud Console → create new project ("Sheet Send").
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → OAuth consent screen:
   - User type: **External** (required for public users outside one Workspace org).
   - App name: Sheet Send. Support email: sheetsend@abinashg.com.np. App logo: use the 128px icon.
   - Scopes: add `https://www.googleapis.com/auth/spreadsheets`.
   - Add a few test users (your own accounts + any early testers) while still in Testing.
4. Credentials → Create Credentials → OAuth Client ID:
   - Chrome/Edge: type "Chrome Extension," needs the extension's ID (Chrome assigns this once the unpacked extension is first loaded — grab it from `chrome://extensions`, then create the credential, then paste the resulting client_id back into `manifest.chrome.json`).
   - Firefox: type will need to be confirmed against current Google/Mozilla docs at build time (Firefox extension OAuth typically uses a "Web application" type client with the `https://<extension-id>.extensions.allizom.org/` or moz-extension redirect pattern registered — verify exact current requirement, this has changed over time).
5. Test end-to-end in Testing mode first (works for up to 100 test-user emails, no review).
6. Before public launch: submit for **verification** (App capabilities → Prepare for verification). Required once public: privacy policy URL, and Google's review of the sensitive scope justification. Typical turnaround days to a few weeks; expect at least one round of clarifying questions from Google's review team. Do not publish the store listing as public/live until this verification is approved — an unverified public app will show scary "unverified app" warnings to every user at sign-in, which will tank trust and adoption.

---

## 9. Privacy Policy — Required Content (host at abinashg.com.np/sheet-send/privacy)

Must plainly state, in non-legalese:
- What data Sheet Send accesses: the text you highlight and choose to send, plus (only if you enable them) the source page URL, page title, and a timestamp.
- Where that data goes: directly from your browser to the Google Sheet you configured, using your own Google account's permission. Sheet Send's developer does not receive, see, store, or have access to this data at any point.
- What's stored locally: your destination configurations (nicknames, spreadsheet IDs, tab names, column choices) are stored in your browser's own sync storage tied to your browser account (Google/Mozilla), not on any server operated by Sheet Send.
- No analytics, no tracking, no ads, no third-party data sharing.
- Google OAuth scope used and why (`spreadsheets` — needed to read tab names for the Verify feature and to append rows).
- Contact/support email.
- Last updated date.

---

## 10. Store Listing Requirements Checklist

- [ ] Icon set: 16/32/48/128px PNGs, clean and distinct (avoid visual similarity to existing "Send to Sheets" / "Add to Sheets" icons — check store screenshots before finalizing art direction).
- [ ] 2–5 screenshots per store (1280x800 or 640x400 for Chrome) showing: right-click menu in action, options page, success toast.
- [ ] Short description (~132 char limit for Chrome).
- [ ] Full description.
- [ ] Privacy policy URL (live, before submission).
- [x] Support email: `sheetsend@abinashg.com.np`.
- [ ] Category: Productivity / Workflow & Planning.
- [ ] Chrome Web Store $5 one-time developer fee paid.
- [ ] OAuth verification approved (see §8) — must complete before or alongside store submission; a store listing can be pending review while OAuth verification is also pending, but do not flip the extension to "public" visibility until both are cleared.

---

## 11. Testing Checklist (before any public submission)

- [ ] Fresh install, zero destinations → context menu shows setup prompt → opens options.
- [ ] Add a destination with a valid spreadsheet URL (not ID) → Verify succeeds, tabs populate.
- [ ] Add a destination with an invalid/inaccessible spreadsheet → Verify shows correct specific error.
- [ ] Add a destination pointing to a tab name that doesn't exist → correct error at send time.
- [ ] Send short text → row appended correctly, correct column order, header written once only on first send.
- [ ] Send text >500 chars → confirm dialog appears; Cancel aborts with no row written; Confirm proceeds.
- [ ] Disconnect Google account mid-session → next send shows reconnect prompt, doesn't crash.
- [ ] Multiple destinations → submenu lists all, correct one is used on click.
- [ ] Test in Chrome, Edge, and Firefox separately — especially the auth flow, which differs.
- [ ] Confirm `storage.sync` values appear on a second Chrome profile signed into the same account (sync verification).
- [ ] Toolbar icon changes correctly on success/failure and resets after ~2s.

---

## 12. Open Items to Flag Back to the User (not for the agent to silently decide)

- Final public-facing name, if "Sheet Send" is reconsidered before store submission (naming-collision risk noted in §1).
- Support email address: `sheetsend@abinashg.com.np` (configured).
- Whether column reordering (drag-and-drop) is wanted for v1 or deferred to v2 (currently deferred per §6.3).
- Icon/logo design direction — not specified, needs actual visual design input or an agreed simple placeholder approach before store screenshots are produced.
