/**
 * Cross-browser extension API loader.
 * Exports a unified `browserApi` object that conforms to standard WebExtension promises.
 */
export const browserApi = (typeof globalThis.browser !== "undefined" && globalThis.browser?.runtime)
  ? globalThis.browser
  : (typeof chrome !== "undefined" && chrome?.runtime)
    ? (globalThis.browser || chrome)
    : {};
