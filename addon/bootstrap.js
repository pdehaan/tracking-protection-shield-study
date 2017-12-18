"use strict";

/* global  __SCRIPT_URI_SPEC__  */
/* global Feature, Services */ // Cu.import
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(startup|shutdown|install|uninstall)" }]*/

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

// Create a new instance of the ConsoleAPI so we can control the maxLogLevel with Config.jsm.
XPCOMUtils.defineLazyGetter(this, "log", () => {
  const ConsoleAPI = Cu.import("resource://gre/modules/Console.jsm", {}).ConsoleAPI;
  const consoleOptions = {
    maxLogLevel: config.log.bootstrap.level,
    prefix: "TPStudy",
  };
  return new ConsoleAPI(consoleOptions);
});

const CONFIGPATH = `${__SCRIPT_URI_SPEC__}/../Config.jsm`;
const { config } = Cu.import(CONFIGPATH, {});

const STUDYUTILSPATH = `${__SCRIPT_URI_SPEC__}/../${config.studyUtilsPath}`;
const { studyUtils } = Cu.import(STUDYUTILSPATH, {});

const REASONS = studyUtils.REASONS;
const UI_AVAILABLE_NOTIFICATION = "browser-delayed-startup-finished";

// Study-specific modules
const BASE = "tracking-protection-messaging";
XPCOMUtils.defineLazyModuleGetter(this, "Feature", `resource://${BASE}/lib/Feature.jsm`);

this.Bootstrap = {
  async startup(addonData, reason) {
    // TODO bdanforth: Turn off TP always just in case before applying treatments

    // Randomize frame script URL due to bug 1051238. TODO bdanforth add ?${Math.random()}
    this.FRAME_SCRIPT_URL = `resource://${BASE}/content/new-tab-variation.js`;
    // validate study config
    studyUtils.setup({...config, addon: { id: addonData.id, version: addonData.version }});
    // TODO bdanforth: patch studyUtils to setLoggingLevel as part of setup method
    studyUtils.setLoggingLevel(config.log.studyUtils.level);

    // choose and set variation
    const variation = await this.selectVariation();

    // if addon was just installed, check if user is eligible as specified in Config.jsm
    if ((REASONS[reason]) === "ADDON_INSTALL" && await !this.isEligible(reason)) {
      return;
    }

    /*
    * Adds the study to the active list of telemetry experiments, and sends the "installed"
    * telemetry ping if applicable
    */
    await studyUtils.startup({reason});

    // log what the study variation and other info is.
    log.debug(`info ${JSON.stringify(studyUtils.info())}`);

    // IFF the study has an embedded webExtension, start it.
    const { webExtension } = addonData;
    if (webExtension) {
      await this.startupWebExtension(webExtension);
    }

    // make sure the UI is available before adding the feature
    if (!Services.wm.getMostRecentWindow("navigator:browser")) {
      Services.obs.addObserver(this, UI_AVAILABLE_NOTIFICATION);
    } else {
      // TODO bdanforth: check if window is private before adding UI
      this.addFeature(variation, reason);
    }
  },

  /** Shutdown needs to distinguish between USER-DISABLE and other
  * times that `endStudy` is called.
  *
  * studyUtils._isEnding means this is a '2nd shutdown'.
  */
  shutdown(addonData, reason) {
    log.debug("shutdown", REASONS[reason] || reason);
    // FRAGILE: handle uninstalls initiated by USER or by addon
    if (reason === REASONS.ADDON_UNINSTALL || reason === REASONS.ADDON_DISABLE) {
      // ensure the frame script is not loaded into any new tabs
      Services.mm.removeDelayedFrameScript(this.FRAME_SCRIPT_URL);
      // TODO bdanforth: disable frame scripts already loaded
      /*
      * There is no mechanism to unload frame scripts which are already loaded.
      * You need to send a message to your frame scripts, telling them to disable
      * themselves; for example, by undoing any changes they've made or removing
      * any event listeners.
      * Note: Frame scripts are automatically unloaded on tab close.
      */

      log.debug("uninstall or disable");
      if (!studyUtils._isEnding) {
        // we are the first 'uninstall' requestor => must be user action.
        log.debug("probably: user requested shutdown");
        studyUtils.endStudy({reason: "user-disable"});
        return;
      }
      // normal shutdown, or 2nd uninstall request

      // QA NOTE:  unload addon specific modules here.
      Cu.unload(`resource://${BASE}/lib/Feature.jsm`);
      this.feature.shutdown();

      // clean up our modules.
      Cu.unload(CONFIGPATH);
      Cu.unload(STUDYUTILSPATH);
    }
  },

  uninstall(addonData, reason) {
    log.debug("uninstall", REASONS[reason] || reason);
  },

  install(addonData, reason) {
    log.debug("install", REASONS[reason] || reason);
    // handle ADDON_UPGRADE (if needful) here
  },

  observe(subject, topic, data) {
    if (topic === UI_AVAILABLE_NOTIFICATION) {
      Services.obs.removeObserver(this, UI_AVAILABLE_NOTIFICATION);
      this.addFeature();
    }
  },

  addFeature(variation, reason) {
    Services.mm.loadFrameScript(this.FRAME_SCRIPT_URL, true);
    // Start up your feature, with specific variation info.
    this.feature = new Feature({variation, studyUtils, reasonName: REASONS[reason]});
  },

  /** addon_install ONLY:
  * - note first seen,
  * - check eligible
  */
  async isEligible() {
    //  telemetry "enter" ONCE
    studyUtils.firstSeen();
    const isEligible = await config.isEligible(); // addon-specific
    if (!isEligible) {
      // 1. uses config.endings.ineligible.url if any,
      // 2. sends UT for "ineligible"
      // 3. then uninstalls addon
      await studyUtils.endStudy({reason: "ineligible"});
    }
    return isEligible;
  },

  async startupWebExtension(webExtension) {
    webExtension.startup().then(api => {
      const {browser} = api;
      /** spec for messages intended for Shield =>
        * {shield:true,msg=[info|endStudy|telemetry],data=data}
        */
      browser.runtime.onMessage.addListener(studyUtils.respondToWebExtensionMessage);
      // other browser.runtime.onMessage handlers for your addon, if any
    });
  },

  // choose the variation for this particular user, then set it.
  async selectVariation() {
    const variation = this.getVariationFromPref(config.weightedVariations) ||
      await studyUtils.deterministicVariation(config.weightedVariations);
    studyUtils.setVariation(variation);
    log.debug(`studyUtils has config and variation.name: ${variation.name}.  Ready to send telemetry`);
    return variation;
  },

  // helper to let Dev or QA set the variation name
  getVariationFromPref(weightedVariations) {
    const key = "shield.test.variation";
    const name = Services.prefs.getCharPref(key, "");
    if (name !== "") {
      const variation = weightedVariations.filter(x => x.name === name)[0];
      if (!variation) {
        throw new Error(`about:config => shield.test.variation set to ${name}, but not variation with that name exists`);
      }
      return variation;
    }
    return name; // undefined
  },
};

// Expose bootstrap methods on the global
for (const methodName of ["install", "startup", "shutdown", "uninstall"]) {
  this[methodName] = Bootstrap[methodName].bind(Bootstrap);
}
