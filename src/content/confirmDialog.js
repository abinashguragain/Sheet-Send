/**
 * In-page confirmation dialog for long text selections (>500 characters).
 * Injected into the active tab via chrome.scripting.executeScript.
 * 
 * DESIGN NOTE: Calling window.confirm() in the active page's execution context
 * is the standard Manifest V3 pattern for obtaining a blocking, synchronous Yes/No
 * decision from the user without needing to inject heavy custom DOM or open a popup.
 * 
 * @param {number} charCount Length of the selected text
 * @returns {boolean} True if confirmed, false if cancelled
 */
export function showConfirmPrompt(charCount) {
  return window.confirm(
    `Sheet Send:\nYou selected ${charCount.toLocaleString()} characters.\n\nSend full text anyway?`
  );
}
