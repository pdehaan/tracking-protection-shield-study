"use strict";

/* global config, studyUtils, Feature */
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(startup|shutdown|install|uninstall)" }]*/

const { utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Preferences",
  "resource://gre/modules/Preferences.jsm");
const STUDY = "tracking-protection-messaging";
XPCOMUtils.defineLazyModuleGetter(this, "config",
  `resource://${STUDY}/Config.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "studyUtils",
  `resource://${STUDY}/StudyUtils.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "Feature",
  `resource://${STUDY}/lib/Feature.jsm`);

this.Bootstrap = {

  UI_AVAILABLE_NOTIFICATION: "browser-delayed-startup-finished",
  EXPIRATION_DATE_STRING_PREF:
    "extensions.tracking_protection_messaging_study.expiration_date_string",
  STUDY_DURATION_WEEKS: 2,

  async startup(addonData, reason) {

    // can't access resource:// modules until addon startup()
    this.REASONS = studyUtils.REASONS;

    this.initLog();

    this.initStudyUtils(addonData.id, addonData.version);

    // choose and set variation
    const variation = await this.selectVariation();

    // if addon was just installed, check if user is eligible
    if ((this.REASONS[reason]) === "ADDON_INSTALL"
      && await !this.isEligible(reason)) {
      return;
    }

    /*
    * Adds the study to the active list of telemetry experiments,
    * and sends the "installed" telemetry ping if applicable
    */
    await studyUtils.startup({reason});

    this.initStudyDuration();

    if (this.isStudyExpired()) {
      studyUtils.endStudy({ reason: "expired" });
    }

    // log what the study variation and other info is.
    this.log.debug(`info ${JSON.stringify(studyUtils.info())}`);

    // make sure the UI is available before adding the feature
    if (!Services.wm.getMostRecentWindow("navigator:browser")) {
      Services.obs.addObserver(this, this.UI_AVAILABLE_NOTIFICATION);
    } else {
      // TODO bdanforth: check if window is private before adding UI
      this.addFeature(variation, reason);
    }
  },

  /*
  * Create a new instance of the ConsoleAPI, so we can control
  * the maxLogLevel with Config.jsm.
  */
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
  },

  initStudyUtils(id, version) {
    // validate study config
    studyUtils.setup({...config, addon: { id, version }});
    // TODO bdanforth: patch studyUtils to setLoggingLevel as part of setup method
    studyUtils.setLoggingLevel(config.log.studyUtils.level);
  },

  // choose the variation for this particular user, then set it.
  async selectVariation() {
    const variation = this.getVariationFromPref(config.weightedVariations) ||
      await studyUtils.deterministicVariation(config.weightedVariations);
    studyUtils.setVariation(variation);
    this.log.debug(`studyUtils has config and variation.name: ${variation.name}.
      Ready to send telemetry`);
    return variation;
  },

  // helper to let Dev or QA set the variation name
  getVariationFromPref(weightedVariations) {
    const key = "shield.test.variation";
    const name = Services.prefs.getCharPref(key, "");
    if (name !== "") {
      const variation = weightedVariations.filter(x => x.name === name)[0];
      if (!variation) {
        throw new Error(`about:config => shield.test.variation set to ${name},
          but no variation with that name exists`);
      }
      return variation;
    }
    return name; // undefined
  },

  /**
  * addon_install ONLY:
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

  initStudyDuration() {
    if (!Preferences.has(this.EXPIRATION_DATE_STRING_PREF)) {
      const now = Date.now();
      // ms = weeks * 7 days/week * 24 hours/day * 60 minutes/hour
      // * 60 seconds/minute * 1000 milliseconds/second
      const studyDurationInMs =
        this.STUDY_DURATION_WEEKS * 7 * 24 * 60 * 60 * 1000;
      const expirationDateInt = now + studyDurationInMs;
      Preferences.set(
        this.EXPIRATION_DATE_STRING_PREF,
        new Date(expirationDateInt).toISOString());
    }
  },

  isStudyExpired() {
    const expirationDateInt =
      Date.parse(Preferences.get(this.EXPIRATION_DATE_STRING_PREF));
    if (Date.now() > expirationDateInt) {
      return true;
    }
    return false;
  },

  observe(subject, topic, data) {
    if (topic === this.UI_AVAILABLE_NOTIFICATION) {
      Services.obs.removeObserver(this, this.UI_AVAILABLE_NOTIFICATION);
      this.addFeature();
    }
  },

  addFeature(variation, reason) {
    // Start up your feature, with specific variation info.
    this.feature = new Feature({
      variation,
      studyUtils,
      reasonName: this.REASONS[reason],
      logLevel: config.log.bootstrap.level,
    });
  },

  /**
  * Shutdown needs to distinguish between USER-DISABLE and other
  * times that `endStudy` is called.
  */
  async shutdown(addonData, reason) {
    this.log.debug("shutdown", this.REASONS[reason] || reason);

    const isUninstall = (reason === this.REASONS.ADDON_UNINSTALL
      || reason === this.REASONS.ADDON_DISABLE);
    if (isUninstall) {
      // Send this before the ShuttingDown event to ensure that message handlers
      // are still registered and receive it.
      Services.mm.broadcastAsyncMessage("TPStudy:Uninstalling");
      // TODO bdanforth: process this message on the other end,
      // see pioneer-enrollment-study
    }

    Services.mm.broadcastAsyncMessage("TPStudy:ShuttingDown");
    // TODO bdanforth: process this message on the other end.

    if (isUninstall && !studyUtils._isEnding) {
      // we are the first 'uninstall' requestor => must be user action.

      // remove custom pref for study duration
      Services.prefs.clearUserPref(this.EXPIRATION_DATE_STRING_PREF);
      // TODO bdanforth: also remove treatment override pref (Issue #37)

      // passing through Feature.jsm to also reset TP to default setting
      // TODO/QUESTION: Do we need to feature.uninit() & Cu.unload here too?
      // In general, am I shutting everything down properly (ex: clearUserPref)
      await this.feature.endStudy("user-disable");
    }

    // normal shutdown, or 2nd uninstall request

    // Unload addon-specific modules
    this.feature.uninit();
    Cu.unload(`resource://${STUDY}/lib/Feature.jsm`);
    Cu.unload(`resource://${STUDY}/Config.jsm`);
    Cu.unload(`resource://${STUDY}/StudyUtils.jsm`);
  },

  uninstall() {
  },

  install() {
  },
};

// Expose bootstrap methods on the global
for (const methodName of ["install", "startup", "shutdown", "uninstall"]) {
  this[methodName] = Bootstrap[methodName].bind(Bootstrap);
}
