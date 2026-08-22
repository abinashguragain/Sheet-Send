/**
 * WebExtension browser API polyfill for cross-browser compatibility (Chrome, Edge, Firefox).
 * Wraps chrome.* callback APIs in standard Promise-returning browser.* interface where needed.
 */
(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define("webextension-polyfill", ["module"], factory);
  } else if (typeof exports !== "undefined") {
    factory(module);
  } else {
    var mod = { exports: {} };
    factory(mod);
    global.browser = mod.exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (module) {
  "use strict";

  if (typeof browser !== "undefined" && browser?.runtime) {
    module.exports = browser;
    return;
  }

  if (typeof chrome === "undefined" || !chrome || !chrome.runtime) {
    module.exports = {};
    return;
  }

  const wrapAsync = (fn, context) => {
    return (...args) => {
      return new Promise((resolve, reject) => {
        try {
          fn.call(context, ...args, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    };
  };

  const createProxy = (target) => {
    return new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) {
          const val = obj[prop];
          if (typeof val === "function") {
            // Check if standard async callback method
            return wrapAsync(val, obj);
          }
          if (typeof val === "object" && val !== null) {
            return createProxy(val);
          }
          return val;
        }
        return undefined;
      }
    });
  };

  const polyfill = {
    runtime: {
      id: chrome.runtime?.id,
      openOptionsPage: wrapAsync(chrome.runtime.openOptionsPage, chrome.runtime),
      sendMessage: wrapAsync(chrome.runtime.sendMessage, chrome.runtime),
      onMessage: chrome.runtime.onMessage,
      onInstalled: chrome.runtime.onInstalled,
      onStartup: chrome.runtime.onStartup,
      getURL: (path) => chrome.runtime.getURL(path),
      lastError: chrome.runtime.lastError
    },
    storage: {
      sync: {
        get: wrapAsync(chrome.storage?.sync?.get, chrome.storage?.sync),
        set: wrapAsync(chrome.storage?.sync?.set, chrome.storage?.sync),
        remove: wrapAsync(chrome.storage?.sync?.remove, chrome.storage?.sync),
        clear: wrapAsync(chrome.storage?.sync?.clear, chrome.storage?.sync)
      },
      local: {
        get: wrapAsync(chrome.storage?.local?.get, chrome.storage?.local),
        set: wrapAsync(chrome.storage?.local?.set, chrome.storage?.local),
        remove: wrapAsync(chrome.storage?.local?.remove, chrome.storage?.local),
        clear: wrapAsync(chrome.storage?.local?.clear, chrome.storage?.local)
      },
      session: chrome.storage?.session ? {
        get: wrapAsync(chrome.storage.session.get, chrome.storage.session),
        set: wrapAsync(chrome.storage.session.set, chrome.storage.session),
        remove: wrapAsync(chrome.storage.session.remove, chrome.storage.session),
        clear: wrapAsync(chrome.storage.session.clear, chrome.storage.session)
      } : {
        // Fallback for browsers without storage.session
        get: wrapAsync(chrome.storage?.local?.get, chrome.storage?.local),
        set: wrapAsync(chrome.storage?.local?.set, chrome.storage?.local),
        remove: wrapAsync(chrome.storage?.local?.remove, chrome.storage?.local),
        clear: wrapAsync(chrome.storage?.local?.clear, chrome.storage?.local)
      },
      onChanged: chrome.storage?.onChanged
    },
    contextMenus: {
      create: (props, callback) => {
        return chrome.contextMenus.create(props, callback);
      },
      update: wrapAsync(chrome.contextMenus?.update, chrome.contextMenus),
      remove: wrapAsync(chrome.contextMenus?.remove, chrome.contextMenus),
      removeAll: wrapAsync(chrome.contextMenus?.removeAll, chrome.contextMenus),
      onClicked: chrome.contextMenus?.onClicked
    },
    scripting: chrome.scripting ? {
      executeScript: wrapAsync(chrome.scripting.executeScript, chrome.scripting),
      insertCSS: wrapAsync(chrome.scripting.insertCSS, chrome.scripting),
      removeCSS: wrapAsync(chrome.scripting.removeCSS, chrome.scripting)
    } : undefined,
    tabs: {
      query: wrapAsync(chrome.tabs?.query, chrome.tabs),
      get: wrapAsync(chrome.tabs?.get, chrome.tabs),
      sendMessage: wrapAsync(chrome.tabs?.sendMessage, chrome.tabs)
    },
    action: chrome.action ? {
      setIcon: wrapAsync(chrome.action.setIcon, chrome.action),
      setBadgeText: wrapAsync(chrome.action.setBadgeText, chrome.action),
      setBadgeBackgroundColor: wrapAsync(chrome.action.setBadgeBackgroundColor, chrome.action),
      setTitle: wrapAsync(chrome.action.setTitle, chrome.action)
    } : undefined,
    identity: chrome.identity ? {
      getAuthToken: wrapAsync(chrome.identity.getAuthToken, chrome.identity),
      removeCachedAuthToken: wrapAsync(chrome.identity.removeCachedAuthToken, chrome.identity),
      launchWebAuthFlow: wrapAsync(chrome.identity.launchWebAuthFlow, chrome.identity),
      getProfileUserInfo: wrapAsync(chrome.identity.getProfileUserInfo, chrome.identity),
      getRedirectURL: (path) => chrome.identity.getRedirectURL(path)
    } : undefined,
    notifications: chrome.notifications ? {
      create: wrapAsync(chrome.notifications.create, chrome.notifications),
      clear: wrapAsync(chrome.notifications.clear, chrome.notifications)
    } : undefined
  };

  module.exports = polyfill;
});
