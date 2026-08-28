# Sheet Send

Highlight text on any webpage, right-click, and send it straight to a Google Sheet. No backend, no server, no cost. Each user signs in with their own Google account.

## What it does

Sheet Send is a browser extension for Chrome, Edge, Brave, and Firefox. Select text on any page, right-click, choose a destination, and the text lands as a new row in the Google Sheet you configured. Optional columns capture a timestamp, the source page URL, and the page title.

Everything runs client-side. There is no server component. The extension talks directly from the browser to the Google Sheets API, using an OAuth token scoped to the signed-in user's own account. The developer of this extension never sees, stores, or has access to any user's data.

## Features

- Right-click "Send to Sheets" on any selected text, on any page
- A popup interface (click the toolbar icon) for account switching, adding and editing destinations, choosing a primary destination, switching tabs, and toggling between "show all destinations" and "show only my primary destination" in the right-click menu
- A "Verify" step that checks spreadsheet access and lists real tab names, avoiding typos
- Create a new tab directly from the popup if the one you want does not exist yet
- Optional columns: timestamp, source URL, page title, written in a fixed order alongside the selected text
- An automatic header row, written once per destination
- A confirmation prompt before sending unusually long selections
- Cross-browser OAuth: `chrome.identity.getAuthToken` where supported (Chrome, Edge), with a PKCE authorization-code fallback for browsers that lack it (Brave, Firefox, Opera), including silent token refresh with no repeated sign-in prompts
- Built to be resource-light: the background service worker is event-driven and unloads when idle, with no polling, no keepalive tricks, and no persistent background process

## Tech stack

- Manifest V3, vanilla JavaScript (ES modules), no framework
- `webextension-polyfill`, bundled locally
- Google Sheets API v4 (`spreadsheets.get`, `spreadsheets.values.append`, `spreadsheets.batchUpdate` for tab creation)
- Google OAuth 2.0, two client types: a Chrome Extension client for `chrome.identity.getAuthToken` (Chrome, Edge), and a Web application client for `launchWebAuthFlow` (Brave, Firefox, Opera), using the implicit grant with silent `prompt=none` re-authentication to avoid repeated sign-in prompts without requiring a stored client secret
- `chrome.storage.sync` for destination configuration, `chrome.storage.local` for session/token persistence

## Project structure

```
sheet-send/
├── manifest.chrome.json
├── manifest.firefox.json
├── src/
│   ├── background/       # service worker: context menu, auth, Sheets API calls
│   ├── content/           # in-page confirm dialog and toast
│   ├── popup/              # toolbar popup: account, destinations, settings
│   ├── options/            # fallback/advanced settings page
│   ├── shared/             # storage helpers, constants, browser polyfill loader
│   └── icons/
├── PRIVACY_POLICY.md
├── VISION.md
├── BUILD_NOTES.md          # full build and debugging writeup
├── LICENSE
└── README.md
```

## Where This Is Headed

The right-click text capture is the foundation, not the end goal. The extension's intended core use case is lead collection — visiting a profile on a platform like Instagram, LinkedIn, TikTok, or Facebook and capturing structured profile data with a single pre-configured click, no text selection required. See `VISION.md` for the full roadmap, including custom column names, domain-based destination routing, and a planned "Save Link" reading-list feature.

## Setup for local development

1. Clone this repository.
2. Create a Google Cloud project, enable the Google Sheets API.
3. Configure the OAuth consent screen (External, add the `https://www.googleapis.com/auth/spreadsheets` scope, add yourself as a test user while unpublished).
4. Create two OAuth clients in that project:
   - A **Chrome Extension** type client, with its Item ID matching the extension ID Chrome assigns after loading it unpacked.
   - A **Web application** type client, with `https://<extension-id>.chromiumapp.org/` registered as both an Authorized JavaScript origin (no trailing slash) and an Authorized redirect URI (with trailing slash).
5. Paste both client IDs into `manifest.chrome.json` (`oauth2.client_id`) and `src/shared/constants.js` (`WEB_AUTH_FLOW_CLIENT_ID`).
6. Load the extension unpacked: `chrome://extensions` (or the Brave/Edge equivalent) → enable Developer mode → Load unpacked → select this folder.
7. For Firefox: load `manifest.firefox.json` via `about:debugging` → This Firefox → Load Temporary Add-on, using the same Web application OAuth client with a Firefox-appropriate redirect URI.

Full narrative of everything that went wrong during this setup, and why, is in `BUILD_NOTES.md` — worth reading if you hit an OAuth error that looks unfamiliar, since most of the sharp edges here are already documented.

## Support & Contact

For questions, feedback, or support inquiries, contact `sheetsend@abinashg.com.np`.

## License

MIT. See `LICENSE`.

## Contributing

Issues and pull requests are welcome. This is a small, deliberately dependency-light codebase — plain JS over a framework, a client-side-only architecture over a backend — and contributions that preserve that shape are easiest to review and merge.
