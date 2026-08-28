# Privacy Policy — Sheet Send

*Last Updated: August 21, 2026*  
*Hosted at:* `https://abinashg.com.np/sheet-send/privacy`

Sheet Send is committed to protecting your privacy. This extension is built with a **100% client-side, zero-telemetry architecture**. We do not operate any backend servers, databases, or intermediary proxies.

---

## 1. What Data Sheet Send Accesses

Sheet Send only accesses data that you explicitly choose to capture:
- **Selected Text:** The exact text snippet you highlight on a webpage and send via the right-click context menu.
- **Optional Metadata (if enabled by you in settings):**
  - **Timestamp:** The date and time the text was clipped.
  - **Source URL:** The web address of the active tab where the text was selected.
  - **Page Title:** The title tag of the active tab where the text was selected.

---

## 2. Where Your Data Goes

Your captured data is sent **directly from your browser to your Google Sheet** using the official Google Sheets API v4.
- All requests are authenticated using **your own Google account's OAuth credentials**.
- **Sheet Send's developers never see, collect, store, intercept, or have access to your data or your spreadsheets at any point.**
- There is no middleman or backend server involved in data transfer.

---

## 3. Local & Sync Storage

Sheet Send stores only your configuration preferences in your browser's native storage (`chrome.storage.sync` and `browser.storage.sync`):
- Destination configurations (custom nicknames, spreadsheet IDs, sheet tab names, and column choices).
- These settings are synchronized exclusively through your personal browser account (Google or Mozilla Firefox sync services) across your own signed-in devices.
- No configuration data is transmitted to Sheet Send or any third party.

---

## 4. Google OAuth 2.0 & Permissions

Sheet Send requests access to the following Google OAuth scope:
- `https://www.googleapis.com/auth/spreadsheets`: Required solely to:
  1. Read tab (sheet) names when you click the "Verify" button in the options page.
  2. Append your selected text and metadata rows to the specific Google Sheet and tab you choose.

Sheet Send complies strictly with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

---

## 5. No Analytics, Tracking, or Third Parties

- **Zero Analytics:** Sheet Send does not include Google Analytics, Mixpanel, telemetry scripts, or diagnostic trackers.
- **Zero Ads:** Sheet Send contains no advertising or sponsored links.
- **No Data Sharing:** We do not sell, trade, or share user data with any third parties.

---

## 6. Data Retention & Deletion

Since Sheet Send stores no data on any server:
- You can delete any saved destination directly from the Sheet Send Options page.
- You can revoke Sheet Send's Google OAuth permissions at any time by visiting your [Google Account Permissions](https://myaccount.google.com/permissions).
- Uninstalling the extension removes all locally stored preferences immediately.

---

## 7. Contact & Support

If you have questions regarding this Privacy Policy or Sheet Send, please contact:
- **Developer:** Abinash Guragain
- **Website:** [abinashg.com.np](https://abinashg.com.np)
- **Support Email:** `sheetsend@abinashg.com.np`
