/**
 * In-page Toast Notification for Sheet Send.
 * Renders a lightweight, non-intrusive 2-second floating toast on the active page.
 * Injected dynamically or called via chrome.scripting.executeScript.
 */

export function displayInPageToast(type, message) {
  const TOAST_ID = "sheet-send-in-page-toast-root";
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = TOAST_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    animation: sheetSendSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  // Attach Shadow DOM to prevent page stylesheet interference
  const shadow = container.attachShadow({ mode: "open" });

  const isSuccess = type === "success";
  const bgColor = isSuccess ? "#21242e" : "#21242e";
  const accentColor = isSuccess ? "#10b981" : "#e60012";
  const iconSvg = isSuccess
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  shadow.innerHTML = `
    <style>
      @keyframes sheetSendSlideIn {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes sheetSendFadeOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(6px) scale(0.98);
        }
      }
      .toast-card {
        display: flex;
        align-items: center;
        gap: 10px;
        background: ${bgColor};
        color: #ffffff;
        padding: 10px 16px;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-left: 4px solid ${accentColor};
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        max-width: 380px;
        backdrop-filter: blur(12px);
      }
      .toast-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .toast-text {
        word-break: break-word;
      }
    </style>
    <div class="toast-card">
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-text">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </div>
  `;

  document.body.appendChild(container);

  setTimeout(() => {
    container.style.animation = "sheetSendFadeOut 0.25s ease-out forwards";
    setTimeout(() => {
      container.remove();
    }, 250);
  }, 2000);
}
