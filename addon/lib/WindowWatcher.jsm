/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Modified from https://github.com/Mardak/restartless/blob/watchWindows/bootstrap.js

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(EXPORTED_SYMBOLS|WindowWatcher)" }]*/

const {utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

const EXPORTED_SYMBOLS = ["WindowWatcher"];

/*
The WindowWatcher is a helper object that iterates over open browser windows
and fires a callback, allowing code to be loaded into each window. It also
listens for the creation of new windows, and fires a callback when the new
window is loaded.

Most of the contents are boilerplate copied from the MDN docs for the
WindowManager and WindowWatcher XPCOM services.

The WindowWatcher is used by the main Feature module to manage the
add-on lifecycle.
*/

const WindowWatcher = {
  _isActive: false,

  _loadCallback: null,

  _unloadCallback: null,

  _errback: null,

  // It is expected that loadCallback, unloadCallback, and errback are bound
  // to a `this` value.
  start(loadCallback, unloadCallback, errback) {
    this.initLog("debug");

    if (this._isActive) {
      this._onError("Called start, but WindowWatcher was already running");
      return;
    }

    this._isActive = true;
    this._loadCallback = loadCallback;
    this._unloadCallback = unloadCallback;
    this._errback = errback;

    // Add loadCallback to existing windows
    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      try {
        this._loadCallback(win);
      } catch (ex) {
        this._onError("WindowWatcher code loading callback failed: ", ex);
      }
    }

    // Add loadCallback to future windows
    // This will call the observe method on WindowWatcher
    Services.ww.registerNotification(this);
  },

  stop() {
    if (!this._isActive) {
      this._onError("Called stop, but WindowWatcher was already stopped");
      return;
    }

    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      try {
        this._unloadCallback(win);
      } catch (ex) {
        this._onError("WindowWatcher code unloading callback failed: ", ex);
      }
    }

    // This will call the observe method on WindowWatcher
    Services.ww.unregisterNotification(this);

    this._loadCallback = null;
    this._unloadCallback = null;
    this._errback = null;
    this._isActive = false;
  },

  observe(win, topic) {
    switch (topic) {
      case "domwindowopened":
        this._onWindowOpened(win);
        break;
      case "domwindowclosed":
        this._onWindowClosed(win);
        break;
      default:
        break;
    }
  },

  _onWindowOpened(win) {
    this._onWindowLoaded = this._onWindowLoaded.bind(this, win);
    win.addEventListener("load", this._onWindowLoaded);
  },

  _onWindowLoaded(win) {
    // const win = evt.target.ownerGlobal;
    win.removeEventListener("load", this._onWindowLoaded);

    // This is a way of checking if the just loaded window is a DOMWindow.
    // We don't want to load our code into other types of windows.
    // There may be cleaner / more reliable approaches.
    if (win.location.href === "chrome://browser/content/browser.xul") {
      this._loadCallback(win);
    }
  },

  _onWindowClosed(win) {
    if (win.location.href === "chrome://browser/content/browser.xul") {
      this._unloadCallback(win);
    }
  },

  _onError(msg) {
    this._errback(msg);
  },

  /*
  * Create a new instance of the ConsoleAPI, so we can control
  * the maxLogLevel with Config.jsm.
  */
  initLog(logLevel) {
    XPCOMUtils.defineLazyGetter(this, "log", () => {
      const ConsoleAPI =
        Cu.import("resource://gre/modules/Console.jsm", {}).ConsoleAPI;
      const consoleOptions = {
        maxLogLevel: logLevel,
        prefix: "TPStudy",
      };
      return new ConsoleAPI(consoleOptions);
    });
  },
};
