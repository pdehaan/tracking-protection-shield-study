/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// @QUESTION: What would you say is done/left to do? (let's go through the TODOs left by rhelmer)
// @QUESTION: (If I get a chance to look into it in advance) Why is Issue #6 (counter resetting) happening?

"use strict";

/* global blocklists */

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

// Import Firefox modules and services
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
// TODO bdanforth: set up log using Console API as in bootstrap.js
Cu.import("resource://gre/modules/Console.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "WebRequest",
  "resource://gre/modules/WebRequest.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "styleSheetService",
  "@mozilla.org/content/style-sheet-service;1", "nsIStyleSheetService");

// Import URL Web API into module
Cu.importGlobalProperties(["URL"]);

// Import addon-specific modules
const BASE = "tracking-protection-messaging";
XPCOMUtils.defineLazyModuleGetter(this, "canonicalizeHost",
  `resource://${BASE}/lib/Canonicalize.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "blocklists",
  `resource://${BASE}/lib/BlockLists.jsm`);

const EXPORTED_SYMBOLS = ["Feature"];

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

// TODO bdanforth: disable built-in tracking protection
// const TRACKING_PROTECTION_PREF = "privacy.trackingprotection.enabled";
// const TRACKING_PROTECTION_UI_PREF = "privacy.trackingprotection.ui.enabled";
const DOORHANGER_ID = "onboarding-trackingprotection-notification";
const DOORHANGER_ICON = "chrome://browser/skin/tracking-protection-16.svg#enabled";
const STYLESHEET_URL = `resource://${BASE}/skin/tracking-protection-study.css`;

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
    // TODO bdanforth: merge rhelmer's init() method with constructor method
    // this.addListeners();

    // only during INSTALL
    if (reasonName === "ADDON_INSTALL") {
      this.showIntroPanel();
    }
  }

  /**
   *  TODO bdanforth: merge with showIntroPanel method
   * change this to be the intro doorhanger
   * (has different content than the doorhanger that shows when
   * the user clicks the pageAction button).
   * Open doorhanger-style notification on desired chrome window.
   * Note: this doorhanger is different (id=DOORHANGER_ID)
   * than the doorhanger that appears when the pageAction button
   * is clicked in the `showPageAction` method.
   * (id="tracking-protection-study-panel")
   * Note: This method is currently called on Feature.init() IFF
   * the treatment is "doorhanger".
   *
   * @param {ChromeWindow} win
   * @param {String} message
   * @param {String} url
   */
  openDoorhanger(win, message, url) {
    const options = {
      popupIconURL: DOORHANGER_ICON,
      learnMoreURL: url,
      persistent: true,
      persistWhileVisible: true,
    };

    const action = {
      label: "Got it!",
      accessKey: "G",
      callback: function() {
        console.log(`You clicked the button.`);
      },
    };

    // Note: With "npm run firefox", panel does not open correctly without a delay
    // @QUESTION rhelmer: Why?
    win.requestIdleCallback(() => {
      win.PopupNotifications.show(
        win.gBrowser.selectedBrowser,
        DOORHANGER_ID,
        message,
        null,
        action,
        [],
        options
      );
    });
  }

  // @QUESTION rhelmer: This method is called if event occurs from:
  // Services.wm.addListener(this) in init()
  // Adds event listeners to newly created windows
  onOpenWindow(xulWindow) {
    var win = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    win.addEventListener("load", () => this.addEventListeners(win), {once: true});
  }

  // @QUESTION rhelmer: This method is called if event occurs from:
  // Services.wm.addListener(this) in init()
  // What is the "if" statement checking for?
  onLocationChange(browser, progress, request, uri, flags) {
    if (this.state.blockedResources.has(browser)) {
      this.showPageAction(browser.getRootNode(), 0);
      this.setPageActionCounter(browser.getRootNode(), 0);
      this.state.blockedResources.set(browser, 0);
    }
  }

  /**
  * Called when the browser is about to make a network request.
  * @returns {BlockingResponse} object (determines whether or not
  * the request should be cancelled)
  */
  onBeforeRequest(details) {
    if (details && details.url && details.browser) {
      const browser = details.browser;
      const currentURI = browser.currentURI;

      if (!currentURI) {
        return {};
      }

      if (!details.originUrl) {
        return {};
      }

      if (currentURI.scheme !== "http" && currentURI.scheme !== "https") {
        return {};
      }

      const currentHost = currentURI.host;
      const host = new URL(details.originUrl).host;

      // Block third-party requests only.
      if (currentHost !== host && blocklists.hostInBlocklist(this.state.blocklist, host)) {
        let counter;
        if (this.state.blockedResources.has(details.browser)) {
          counter = this.state.blockedResources.get(details.browser);
          counter++;
        } else {
          counter = 1;
        }

        // TODO enable allowed hosts.
        if (this.state.allowedHosts.has(currentHost)) {
          this.state.totalAllowedResources += 1;
        } else {
          this.state.totalBlockedResources += 1;
        }

        const domain = host.split(".");
        domain.shift();
        const rootDomain = domain.join(".");
        for (const entity in this.state.entityList) {
          if (this.state.entityList[entity].resources.includes(rootDomain)) {
            this.state.totalBlockedEntities.add(entity);
          }
        }

        this.state.blockedResources.set(details.browser, counter);

        const enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
          const win = enumerator.getNext();
          // Mac OS has an application window that keeps running even if all
          // normal Firefox windows are closed.
          if (win === Services.appShell.hiddenDOMWindow) {
            continue;
          }

          if (details.browser === win.gBrowser.selectedBrowser) {
            this.showPageAction(browser.getRootNode(), counter);
            this.setPageActionCounter(browser.getRootNode(), counter);
          }
        }
        return {cancel: true};
      }
    }
    return {};
  }

  /**
   * Shows the page action button.
   *
   * @param {document} doc - the browser.xul document for the page action.
   * @param {number} counter - blocked count for the current page.
   */
  showPageAction(doc, counter) {
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    const currentHost = win.gBrowser.currentURI.host;

    let button = doc.getElementById("tracking-protection-study-button");
    if (button) {
      button.parentElement.removeChild(button);
    }
    doc.getElementById("tracking");
    const urlbar = doc.getElementById("page-action-buttons");

    const panel = doc.createElementNS(XUL_NS, "panel");
    panel.setAttribute("id", "tracking-protection-study-panel");
    panel.setAttribute("type", "arrow");
    panel.setAttribute("level", "parent");
    const panelBox = doc.createElementNS(XUL_NS, "vbox");

    const header = doc.createElementNS(XUL_NS, "label");
    header.setAttribute("value", `Firefox is blocking ${counter} elements on this page`);

    const controls = doc.createElementNS(XUL_NS, "hbox");

    const group = doc.createElementNS(XUL_NS, "radiogroup");
    const enabled = doc.createElementNS(XUL_NS, "radio");
    enabled.setAttribute("label", "Enable on this site");
    enabled.addEventListener("click", () => {
      if (this.state.allowedHosts.has(currentHost)) {
        this.state.allowedHosts.delete(currentHost);
      }
      win.gBrowser.reload();
    });
    const disabled = doc.createElementNS(XUL_NS, "radio");
    disabled.setAttribute("label", "Disable on this site");
    disabled.addEventListener("click", () => {
      this.state.allowedHosts.add(currentHost);
      win.gBrowser.reload();
    });
    if (this.state.allowedHosts.has(currentHost)) {
      disabled.setAttribute("selected", true);
    } else {
      enabled.setAttribute("selected", true);
    }
    group.append(enabled);
    group.append(disabled);
    controls.append(group);

    const footer = doc.createElementNS(XUL_NS, "label");
    footer.setAttribute("value", "If the website appears broken, consider" +
                                 " disabling tracking protection and" +
                                 " refreshing the page.");

    panelBox.append(header);
    panelBox.append(controls);
    panelBox.append(footer);

    panel.append(panelBox);

    button = doc.createElementNS(XUL_NS, "toolbarbutton");
    if (this.state.allowedHosts.has(currentHost)) {
      button.style.backgroundColor = "yellow";
    } else {
      button.style.backgroundColor = "green";
    }
    button.setAttribute("id", "tracking-protection-study-button");
    button.setAttribute("image", "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled");
    button.append(panel);
    button.addEventListener("command", event => {
      doc.getElementById("panel");
      panel.openPopup(button);
    });

    urlbar.append(button);
  }

  setPageActionCounter(doc, counter) {
    const toolbarButton = doc.getElementById("tracking-protection-study-button");
    if (toolbarButton) {
      toolbarButton.setAttribute("label", counter);
    }
  }

  hidePageAction(doc) {
    const button = doc.getElementById("tracking-protection-study-button");
    if (button) {
      button.parentElement.removeChild(button);
    }
  }

  /**
  * Called when a non-focused tab is selected.
  * @QUESTION rhelmer: What does this method do exactly?
  */
  onTabChange(evt) {
    const win = evt.target.ownerGlobal;
    const currentURI = win.gBrowser.currentURI;
    if (currentURI.scheme !== "http" && currentURI.scheme !== "https") {
      this.hidePageAction(win.document);
      return;
    }

    const currentWin = Services.wm.getMostRecentWindow("navigator:browser");

    // @QUESTION rhelmer: What is this "if" statement telling us here? That the
    // window that was changed to is of type "navigator:browser"?
    if (win === currentWin) {
      this.hidePageAction(win.document);
      const counter = this.state.blockedResources.get(win.gBrowser.selectedBrowser);

      if (counter) {
        this.showPageAction(win.document, counter);
        this.setPageActionCounter(win.document, counter);
      }
    }
  }

  /**
  * Called when any page loads
  * Loads content into a new tab page with tracking protection data that
  * varies by which treatment/messaging the user should be receiving.
  */
  onPageLoad(evt) {
    const win = evt.target.ownerGlobal;
    const currentURI = win.gBrowser.currentURI;
    if (currentURI.spec === "about:newtab" || currentURI.spec === "about:home") {
      const doc = win.gBrowser.contentDocument;
      if (doc.getElementById("tracking-protection-message")) {
        return;
      }
      const minutes = this.state.timeSaved / 1000 / 60;
      // FIXME commented out for testing
      // if (minutes >= 1 && this.blockedRequests) {
      if (this.state.totalBlockedResources) {
        let message = this.newtab_message;
        message = message.replace("${blockedRequests}", this.state.totalBlockedResources);
        message = message.replace("${blockedEntities}", this.state.totalBlockedEntities.size);
        message = message.replace("${blockedSites}", this.state.totalBlockedSites);
        message = message.replace("${minutes}", minutes.toPrecision(3));

        const logo = doc.createElement("img");
        logo.src = "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled";
        logo.style.height = 48;
        logo.style.width = 48;
        logo.style.float = "left";
        logo.style.padding = "5px";

        const span = doc.createElement("span");
        span.style.fontSize = "24px";
        span.style.fontWeight = "lighter";
        span.style.float = "right";
        span.style.padding = "5px";
        span.textContent = message;

        const newContainer = doc.createElement("div");
        newContainer.id = "tracking-protection-message";
        newContainer.style.padding = "24px";
        newContainer.append(logo);
        newContainer.append(span);

        const container = doc.getElementById("onboarding-overlay-button");
        container.append(newContainer);
      }
    }
  }

  /**
   * Open URL in new tab on desired chrome window.
   * TODO bdanforth: Remove this method; as we are no longer
   * using a first-run page first run page
   * Currently opens at "resource://tracking-protection-study/firstrun.html"
   *
   * @param {ChromeWindow} win
   * @param {String} message
   * @param {String} url
   * @param {bool} foreground - true if this tab should open in the foreground.
   */
  openURL(win, message, url, foreground = true) {
    const tab = win.gBrowser.addTab(url);
    if (foreground) {
      win.gBrowser.selectedTab = tab;
    }
  }

  async init() {
    // TODO bdanforth: get treatment(s) from bootstrap/studyUtils
    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      doorhanger: this.openDoorhanger, // opens a doorhanger on addon startup
      opentab: this.openURL, // opens a focused new tab at a specified URL on addon startup
    };

    // TODO bdanforth: hardcode for the moment, but get from studyUtils instead
    // TODO bdanforth: remove distribution_id, firstrun, and other UI we are not implementing
    this.treatment = "doorhanger";
    this.distribution_id = "test123";
    let newtab_messages = [
      "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedEntities} companies that track your browsing",
      "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
      "Firefox blocked ${blockedRequests} ads today from<br/> ${blockedSites} different websites"
    ];
    let firstrun_urls = [
      "resource://tracking-protection-study/firstrun.html",
    ];
    this.newtab_message = newtab_messages[0];
    this.message = "ok";
    this.url = firstrun_urls[0];

    // run once now on the most recent window.
    let win = Services.wm.getMostRecentWindow("navigator:browser");

    if (this.treatment === "ALL") {
      Object.keys(this.TREATMENTS).forEach((key, index) => {
        if (Object.prototype.hasOwnProperty.call(this.TREATMENTS, key)) {
          this.TREATMENTS[key](win, this.message, this.url);
        }
      });
    } else if (this.treatment in this.TREATMENTS) {
      this.TREATMENTS[this.treatment](win, this.message, this.url);
    }

    this.state = {
      timeSave: 0,
      blocklist: new Map(),
      allowedHosts: new Set(),
      reportedHosts: {},
      entityList: {},
      blockedResources: new Map(),
      totalBlockedResources: 0,
      totalAllowedResources: 0,
      totalBlockedEntities: new Set(),
    };

    await blocklists.loadLists(this.state);

    const filter = {urls: new win.MatchPatternSet(["*://*/*"])};
    this.onBeforeRequest = this.onBeforeRequest.bind(this);

    WebRequest.onBeforeRequest.addListener(this.onBeforeRequest, filter, ["blocking"]);

    const uri = Services.io.newURI(STYLESHEET_URL);
    styleSheetService.loadAndRegisterSheet(uri, styleSheetService.AGENT_SHEET);

    // Add listeners to all open windows.
    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }

      this.addEventListeners(win);
    }

    // Attach to any new windows.
    // Depending on which event happens (ex: onOpenWindow, onLocationChange),
    // it will call that listener method that exists on "this"
    Services.wm.addListener(this);
  }

  addEventListeners(win) {
    this.onTabChange = this.onTabChange.bind(this);
    this.onPageLoad = this.onPageLoad.bind(this);

    if (win && win.gBrowser) {
      win.gBrowser.addTabsProgressListener(this);
      win.gBrowser.tabContainer.addEventListener("TabSelect", this.onTabChange);
      win.addEventListener("load", this.onPageLoad);
    }
  }

  /**
   * Listen and process events from content.
   * TODO bdanforth: merge with "handleMessageFromContent" method
   */
  initContentMessageListener() {
    Services.mm.addMessageListener("TrackingStudy:OnContentMessage", msg => {
      switch (msg.data.action) {
        case "get-totals":
          msg.target.messageManager.sendAsyncMessage("TrackingStudy:Totals", {
            totalBlockedResources: this.state.totalBlockedResources,
          });
          break;
      }
    });
  }

  uninit() {
    // Remove listeners from all open windows.
    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }

      const button = win.document.getElementById("tracking-protection-study");
      if (button) {
        button.parentElement.removeChild(button);
      }

      WebRequest.onBeforeRequest.removeListener(this.onBeforeRequest);
      win.gBrowser.removeTabsProgressListener(this);
      win.gBrowser.tabContainer.removeEventListener("TabSelect", this.onTabChange);
      win.removeEventListener("load", this.onPageLoad);

      Services.wm.removeListener(this);
    }

    const uri = Services.io.newURI(STYLESHEET_URL);
    styleSheetService.unregisterSheet(uri, styleSheetService.AGENT_SHEET);

    Cu.unload("resource://tracking-protection-study/Canonicalize.jsm");
    Cu.unload("resource://tracking-protection-study/BlockLists.jsm");
  }

  /**
    * TODO bdanforth: merge with openDoorhanger method
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
