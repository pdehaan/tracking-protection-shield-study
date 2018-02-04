/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Modified from: https://hg.mozilla.org/mozilla-central/file/tip/browser/extensions/shield-recipe-client/lib/CleanupManager.jsm to include a log.

"use strict";

/* global config */

const {utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(
  this,
  "AsyncShutdown",
  "resource://gre/modules/AsyncShutdown.jsm"
);

const STUDY = "tracking-protection-messaging-study";
XPCOMUtils.defineLazyModuleGetter(this, "config",
  `resource://${STUDY}/lib/Config.jsm`);

this.EXPORTED_SYMBOLS = ["CleanupManager"];

class CleanupManagerClass {
  constructor() {
    this.handlers = new Set();
    this.cleanupPromise = null;
    this.initLog();
  }

  initLog() {
    XPCOMUtils.defineLazyGetter(this, "log", () => {
      const ConsoleAPI =
        Cu.import("resource://gre/modules/Console.jsm", {}).ConsoleAPI;
      const consoleOptions = {
        maxLogLevel: config.log.bootstrap.level,
        prefix: "TPStudy",
      };
      return new ConsoleAPI(consoleOptions);
    });
  }

  addCleanupHandler(handler) {
    this.handlers.add(handler);
  }

  removeCleanupHandler(handler) {
    this.handlers.delete(handler);
  }

  async cleanup() {
    if (this.cleanupPromise === null) {
      this.cleanupPromise = (async () => {
        for (const handler of this.handlers) {
          try {
            await handler();
          } catch (ex) {
            Cu.reportError(ex);
          }
        }
      })();

      // Block shutdown to ensure any cleanup tasks that write data are
      // finished.
      AsyncShutdown.profileBeforeChange.addBlocker(
        "TrackingProtectionMessagingStudy: Cleaning up",
        this.cleanupPromise,
      );
    }

    return this.cleanupPromise;
  }
}

this.CleanupManager = new CleanupManagerClass();
