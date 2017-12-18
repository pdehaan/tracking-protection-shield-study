"use strict";


/**  What this Feature does: TODO bdanforth: complete
  *
  *  UI:
  *  - during INSTALL only, show an introductory panel with X options
  *    - ((add options))
  *  - ((add other UI features))
  *
  *  This module:
  *  - Implements the 'introduction' to the 'tracking protection messaging' study, via panel.
  *  - ((add other functionality))
  *
  *  Uses `studyUtils` API for:
  *  - `telemetry` to instrument "shown", "accept", and "leave-study" events.
  *  - `endStudy` to send a custom study ending.
  *  - ((add other uses))
  *  - ((get study ending URL(s) from rrayborn))
  **/

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(EXPORTED_SYMBOLS|Feature)" }]*/

const { utils: Cu } = Components;
Cu.import("resource://gre/modules/Console.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const EXPORTED_SYMBOLS = ["Feature"];

XPCOMUtils.defineLazyModuleGetter(this, "RecentWindow",
  "resource:///modules/RecentWindow.jsm");

class Feature {
  /** The study feature.
    *
    *  - variation: study info about particular client study variation
    *  - studyUtils:  the configured studyUtils singleton.
    *  - reasonName: string of bootstrap.js startup/shutdown reason
    *
    */
  constructor({variation, studyUtils, reasonName}) {
    this.variation = variation;
    this.studyUtils = studyUtils;
    this.addListeners();

    // only during INSTALL
    if (reasonName === "ADDON_INSTALL") {
      this.showIntroPanel();
    }
  }

  /**
    *   Display instrumented 'introductory panel' explaining the feature to the user
    *
    *   Telemetry Probes:
    *
    *   - {event: introduction-shown}
    *
    *   - {event: introduction-accept}
    *
    *   - {event: introduction-leave-study}
    *
    *    Note:  Panel WILL NOT SHOW if the only window open is a private window.
    *
    *
  */
  showIntroPanel() {
    // TODO bdanforth: show onboarding TP panel here, if window is not private
  }

  addListeners() {
    // content listener
    Services.mm.addMessageListener(
      "TrackingStudy:OnContentMessage",
      this.handleMessageFromContent.bind(this)
    );
  }

  handleMessageFromContent(msg) {
    switch (msg.data.action) {
      case "get-totals":
        msg.target.messageManager.sendAsyncMessage("TrackingStudy:Totals", {
          type: "totalBlockedResources",
          value: 12, // TODO bdanforth: pass actual value here
        });
        break;
      default:
        throw new Error(`Message type not recognized, ${ msg.data.action }`);
    }
  }

  telemetry(stringStringMap) {
    this.studyUtils.telemetry(stringStringMap);
  }

  /* no-op shutdown */
  shutdown() {}
}



// webpack:`libraryTarget: 'this'`
this.EXPORTED_SYMBOLS = EXPORTED_SYMBOLS;
this.Feature = Feature;
