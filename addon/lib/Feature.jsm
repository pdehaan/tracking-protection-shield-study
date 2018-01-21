/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global blocklists */
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(EXPORTED_SYMBOLS|Feature)" }]*/

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

// Import Firefox modules
const { interfaces: Ci, utils: Cu } = Components;
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
const STUDY = "tracking-protection-messaging";
XPCOMUtils.defineLazyModuleGetter(this, "canonicalizeHost",
  `resource://${STUDY}/lib/Canonicalize.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "blocklists",
  `resource://${STUDY}/lib/BlockLists.jsm`);

const EXPORTED_SYMBOLS = ["Feature"];

class Feature {
  /** The study feature.
    *  - variation: study info about particular client study variation
    *  - studyUtils:  the configured studyUtils singleton.
    *  - reasonName: string of bootstrap.js startup/shutdown reason
    *  - logLevel: the log level from Config.jsm ( uses same level as bootstrap.js)
    */
  constructor({variation, studyUtils, reasonName, logLevel}) {
    this.treatment = variation.name;
    this.studyUtils = studyUtils;
    this.reasonName = reasonName;
    this.IsStudyEnding = false;
    // Randomize frame script URL due to bug 1051238.
    this.FRAME_SCRIPT_URL =
    `resource://${STUDY}/content/new-tab-variation.js?${Math.random()}`,
    this.XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    this.DOORHANGER_ID = "onboarding-trackingprotection-notification";
    this.DOORHANGER_ICON = "chrome://browser/skin/tracking-protection-16.svg#enabled";
    this.STYLESHEET_URL = `resource://${STUDY}/skin/tracking-protection-study.css`;
    this.PREF_TP_UI_ENABLED = "privacy.trackingprotection.ui.enabled";
    this.TP_ENABLED_GLOBALLY = (this.treatment === "pseudo-control");
    this.TP_ENABLED_IN_PRIVATE_WINDOWS = (this.treatment === "control");
    this.PREF_TP_ENABLED_GLOBALLY = "privacy.trackingprotection.enabled";
    this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS = "privacy.trackingprotection.pbmode.enabled";
    this.init(logLevel);
  }

  async init(logLevel) {

    this.initLog(logLevel);

    this.addContentMessageListeners();

    this.disableBuiltInTrackingProtectionUI();

    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      "control": this.applyControlTreatment.bind(this),
      "pseudo-control": this.applyPseudoControlTreatment.bind(this),
      // "fast" and "private" treatments are exactly the same except for copy
      "fast": this.applyExperimentalTreatment.bind(this),
      "private": this.applyExperimentalTreatment.bind(this),
    };

    // TODO bdanforth: update newtab messages copy
    this.newTabMessages = {
      fast: "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
      private: "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedCompanies} companies that track your browsing",
    };
    // TODO bdanforth: update with final URLs
    this.learnMoreUrls = {
      fast: "http://www.mozilla.com",
      private: "http://www.mozilla.com",
    };

    // TODO bdanforth: update intro panel message copy
    this.introPanelMessages = {
      fast: "Tracking protection is great! Would you like to participate in a study?",
      private: "Tracking protection is great! Would you like to participate in a study?",
    };

    // run once now on the most recent window.
    const win = Services.wm.getMostRecentWindow("navigator:browser");

    this.state = {
      totalTimeSaved: 0,
      // a <browser>:counter map for the number of milliseconds saved for a particular browser
      timeSaved: new Map(),
      // a <browser>:counter map for the number of blocked resources for a particular browser
      // Why is this mapped with <browser>?
      // You may have the same site in multiple tabs; should you use the same counter for both?
      // the <browser> element is per tab. Fox News in two different tabs wouldn't share the same counter.
      // if didn't do this, you might get two tabs loading the same page trying to update the same counter.
      blockedResources: new Map(),
      totalBlockedResources: 0,
      blockedCompanies: new Set(),
      totalBlockedCompanies: 0,
      blockedWebsites: new Set(),
      totalBlockedWebsites: 0,
    };

    if (this.treatment in this.TREATMENTS) {
      await this.TREATMENTS[this.treatment](win);
    }

    // if user toggles built-in TP on/off, end the study
    // Note: This listener can't be added until after the treatment has been applied,
    // since we are initializing built-in TP based on the treatment.
    this.addBuiltInTrackingProtectionListeners();
  }

  addContentMessageListeners() {
    // content listener
    Services.mm.addMessageListener(
      "TrackingStudy:OnContentMessage",
      this.handleMessageFromContent.bind(this)
    );
  }

  handleMessageFromContent(msg) {
    let counter;
    let browser;
    switch (msg.data.action) {
      case "get-totals":
      // TODO bdanforth: update what text is shown based on treatment branch
      // msg.target is the <browser> element
        msg.target.messageManager.sendAsyncMessage("TrackingStudy:Totals", {
          type: "newTabContent",
          state: this.state,
        });
        break;
      case "update-time-saved":
        // TODO bdanforth: control how to update timeSaved counter when:
        //  - the same page is refreshed (reset timeSaved counter)
        //  - the user visits another page in the same tab (reset timeSaved counter)
        //  - other cases? See how rhelmer handles updating this.state.blockedResources
        counter = Number.parseInt(msg.data.timeSaved);
        browser = msg.target;
        this.state.totalTimeSaved += counter;
        this.state.timeSaved.set(browser, counter);
        if (this.treatment === "fast") {
          this.showPageAction(browser.getRootNode(), counter);
          this.setPageActionCounter(browser.getRootNode(), counter);
        }
        break;
      default:
        throw new Error(`Message type not recognized, ${ msg.data.action }`);
    }
  }

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
  }

  disableBuiltInTrackingProtectionUI() {
    Services.prefs.setBoolPref(this.PREF_TP_UI_ENABLED, false);
  }

  addBuiltInTrackingProtectionListeners() {
    Services.prefs.addObserver(this.PREF_TP_ENABLED_GLOBALLY, this);
    Services.prefs.addObserver(this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS, this);
  }

  async observe(subject, topic, data) {
    let reason;
    switch (topic) {
      case "nsPref:changed":
        if (this.isStudyEnding) {
          break;
        }
        if (data === this.PREF_TP_ENABLED_GLOBALLY
          || this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS) {
          const prevState = this.getPreviousTrackingProtectionState();
          const nextState = this.getNextTrackingProtectionState();
          this.log.debug(prevState, nextState);
          // Rankings -
          // TP ON globally: 3, TP ON private windows only: 2, TP OFF globally: 1
          reason = (nextState > prevState) ? "ended-positive" : "ended-negative";
          this.log.debug(`Ending study, treatment: ${ this.treatment },
            reason: ${ reason }`);
          await this.endStudy(reason, false);
        }
        break;
    }
  }

  getPreviousTrackingProtectionState() {
    // Built-in TP has three possible states:
    //   1) OFF globally, 2) ON for private windows only, 3) ON globally
    let prevState;
    if (this.TP_ENABLED_GLOBALLY) {
      prevState = 3;
    } else if (this.TP_ENABLED_IN_PRIVATE_WINDOWS) {
      prevState = 2;
    } else {
      prevState = 1;
    }
    return prevState;
  }

  getNextTrackingProtectionState() {
    // Built-in TP has three possible states:
    //   1) OFF globally, 2) ON for private windows only, 3) ON globally
    let nextState;
    const enabledGlobally = Services.prefs.getBoolPref(
      this.PREF_TP_ENABLED_GLOBALLY
    );
    const enabledInPrivateWindows = Services.prefs.getBoolPref(
      this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS
    );
    if (enabledGlobally) {
      nextState = 3;
    } else if (enabledInPrivateWindows) {
      nextState = 2;
    } else {
      nextState = 1;
    }
    return nextState;
  }

  applyControlTreatment() {
    // 1. Initialize built-in Tracking Protection, ON in private windows only
    //    - "control" does not change the default setting
  }

  applyPseudoControlTreatment() {
    // 1. Initialize built-in Tracking Protection, ON globally
    Services.prefs.setBoolPref(this.PREF_TP_ENABLED_GLOBALLY, true);
  }

  // "fast" and "private" treatments differ only in copy
  async applyExperimentalTreatment(win) {
    // 1. Initialize built-in Tracking Protection, OFF globally
    Services.prefs.setBoolPref(this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS, false);

    // 2. Show intro panel if addon was just installed
    if (this.reasonName === "ADDON_INSTALL") {
      this.shouldShowIntroPanel = true;
    }

    // 3. Add new tab variation
    this.state.newTabMessage = this.newTabMessages[this.treatment];
    Services.mm.loadFrameScript(this.FRAME_SCRIPT_URL, true);

    // 4. Add pageAction icon and pageAction panel; this is the complicated part
    await this.addPageActionAndPanel(win);
  }

  async addPageActionAndPanel(win) {
    // 4.1 Re-implement Tracking Protection to get number of blocked resources
    await this.reimplementTrackingProtection(win);
    // 4.2 load stylesheet for pageAction panel
    const uri = Services.io.newURI(this.STYLESHEET_URL);
    styleSheetService.loadAndRegisterSheet(uri, styleSheetService.AGENT_SHEET);
    // 4.3 Add listeners to all open windows to know when to update pageAction
    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      this.addWindowEventListeners(win);
    }
    // 4.4 Add listeners to all new windows to know when to update pageAction.
    // Depending on which event happens (ex: onOpenWindow, onLocationChange),
    // it will call that listener method that exists on "this"
    Services.wm.addListener(this);
  }

  /**
  * Display instrumented 'introductory panel' explaining the feature to the user
  * Telemetry Probes: (TODO bdanforth: add telemetry probes)
  *   - {event: introduction-shown}
  *   - {event: introduction-accept}
  *   - {event: introduction-leave-study}
  * Note:  Panel WILL NOT SHOW if the only window open is a private window.
  *
  * @param {ChromeWindow} win
  * @param {String} message
  * @param {String} url
  */
  showIntroPanel(win, message, url) {
    const doc = win.document;
    const button = doc.getElementById("tracking-protection-study-button");

    const introPanel = doc.createElementNS(this.XUL_NS, "panel");
    introPanel.setAttribute("id", "tracking-protection-study-intro-panel");
    introPanel.setAttribute("type", "arrow");
    introPanel.setAttribute("level", "parent");
    const introPanelBox = doc.createElementNS(this.XUL_NS, "vbox");

    const header = doc.createElementNS(this.XUL_NS, "label");
    header.setAttribute(
      "value",
      `Bleepity bloopity`
    );

    const body = doc.createElementNS(this.XUL_NS, "hbox");

    const footer = doc.createElementNS(this.XUL_NS, "label");
    footer.setAttribute("value", "Testy McTesterson");

    introPanelBox.append(header);
    introPanelBox.append(body);
    introPanelBox.append(footer);

    introPanel.append(introPanelBox);

    button.append(introPanel);

    introPanel.openPopup(button);

  }

  async reimplementTrackingProtection(win) {
    // 1. get blocklist and allowlist
    // TODO bdanforth: include a doc block with format/content for each
    // list/map/set in this.lists and this.state
    this.lists = {
      // a map with each key a domain name of a known tracker and each value 
      // the domain name of the owning entity
      // (ex: "facebook.de" -> "facebook.com")
      blocklist: new Map(),
      // An object where top level keys are owning company names; each company
      // key points to an object with a property and resource key.
      entityList: {},
    };

    // populate lists
    await blocklists.loadLists(this.lists);

    const filter = {urls: new win.MatchPatternSet(["*://*/*"])};

    WebRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      // listener will only be called for requests whose targets match the filter
      filter,
      ["blocking"]
    );
  }

  /**
  * Three cases of user looking at diff page:
      - switched windows (onOpenWindow)
      - loading new pages in the same tab (onPageLoad/Frame script)
      - switching tabs but not switching windows (tabSelect)
    Each one needs its own separate handler, because each one is detected by its
    own separate event.
  * @param {ChromeWindow} win
  */
  addWindowEventListeners(win) {
    if (win && win.gBrowser) {
      win.gBrowser.addTabsProgressListener(this);
      win.gBrowser.tabContainer.addEventListener(
        "TabSelect",
        this.onTabChange.bind(this)
      );
    }
  }

  // This method is called if event occurs from:
  // Services.wm.addListener(this)
  // Adds event listeners to newly created windows (browser application window)
  // This method is NOT called when opening a new tab.
  onOpenWindow(xulWindow) {
    var win = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    win.addEventListener(
      "load",
      () => this.addWindowEventListeners(win),
      {once: true}
    );
  }

  // This method is called when opening a new tab among many other times.
  // This is a listener for the addTabsProgressListener
  // Not appropriate for modifying the page itself because the page hasn't
  // finished loading yet. More info: https://tinyurl.com/lpzfbpj
  onLocationChange(browser, progress, request, uri, flags) {
    const LOCATION_CHANGE_SAME_DOCUMENT = 1;
    // ensure the location change event is occuring in the top frame (not an
    // iframe for example) and also that a different page is being loaded
    if (progress.isTopLevel && flags !== LOCATION_CHANGE_SAME_DOCUMENT) {
      this.showPageAction(browser.getRootNode(), 0);
      this.setPageActionCounter(browser.getRootNode(), 0);
      this.state.blockedResources.set(browser, 0);
      this.state.timeSaved.set(browser, 0);
      if (this.shouldShowIntroPanel
        && (uri.scheme === "http" || uri.scheme === "https")) {
        const win = Services.wm.getMostRecentWindow("navigator:browser");
        this.showIntroPanel(
          win,
          this.introPanelMessages[this.treatment],
          this.learnMoreUrls[this.treatment]
        );
        this.shouldShowIntroPanel = false;
      }
    }
  }

  /**
  * Called when the browser is about to make a network request.
  * @returns {BlockingResponse} object (determines whether or not
  * the request should be cancelled)
  * If this method returns {}, the request will not be blocked;
  * if it returns { cancel: true }, the request will be blocked.
  */
  onBeforeRequest(details) {
    // details.url is the target url for the request
    if (details && details.url && details.browser) {
      const browser = details.browser;
      // nsIURI object with attributes to set and query the basic components of
      // the browser's current URI
      const currentURI = browser.currentURI;

      if (!currentURI) {
        return {};
      }

      // the URL for the entity making the request
      if (!details.originUrl) {
        return {};
      }

      if (currentURI.scheme !== "http" && currentURI.scheme !== "https") {
        return {};
      }

      // the domain name for the current page (e.g. www.nytimes.com)
      const currentHost = currentURI.host;
      // the domain name for the entity making the request
      const host = new URL(details.originUrl).host;

      // Block third-party requests only.
      if (currentHost !== host
        && blocklists.hostInBlocklist(this.lists.blocklist, host)) {
        let counter = 0;
        if (this.state.blockedResources.has(details.browser)) {
          counter = this.state.blockedResources.get(details.browser);
        }
        counter++;
        this.state.totalBlockedResources += 1;
        Services.mm.broadcastAsyncMessage("TrackingStudy:Totals", {
          type: "updateTPNumbers",
          state: this.state,
        });

        const rootDomainHost = this.getRootDomain(host);
        const rootDomainCurrentHost = this.getRootDomain(currentHost);

        // check if host entity is in the entity list;
        // TODO bdanforth: improve effeciency of this algo
        // https://github.com/mozilla/blok/blob/master/src/js/requests.js#L18-L27
        // for a much more efficient implementation
        for (const entity in this.lists.entityList) {
          if (this.lists.entityList[entity].resources.includes(rootDomainHost)) {
            const resources = this.lists.entityList[entity].resources;
            const properties = this.lists.entityList[entity].properties;
            // This just means that this "host" is contained in the entity list
            // and owned by "entity" but we have to check and see if the
            // "currentHost" is also owned by "entity"
            // if it is, don't block the request; if it isn't, block the request
            // and add the entity to the list of "blockedCompanies" 
            if (resources.includes(rootDomainCurrentHost)
              || properties.includes(rootDomainCurrentHost)) {
              return {};
            }
            this.state.blockedCompanies.add(entity);
            this.state.totalBlockedCompanies = this.state.blockedCompanies.size;
            Services.mm.broadcastAsyncMessage("TrackingStudy:Totals", {
              type: "updateTPNumbers",
              state: this.state,
            });
          }
        }

        // If we get this far, we're going to block the request.

        // Add host to blockedWebsites if not already present
        if (!this.state.blockedWebsites.has(host)) {
          this.state.blockedWebsites.add(host);
          this.state.totalBlockedWebsites = this.state.blockedWebsites.size;
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

          // only update pageAction with new blocked requests if we're in the
          // "private" treatment branch, otherwise we want to display timeSaved
          // for the "fast" treatment branch
          if (details.browser === win.gBrowser.selectedBrowser
            && this.treatment === "private") {
            this.showPageAction(browser.getRootNode(), counter);
            this.setPageActionCounter(browser.getRootNode(), counter);
          }
        }
        return { cancel: true };
      }
    }
    return {};
  }

  // e.g. takes "www.mozilla.com", and turns it into "mozilla.com"
  getRootDomain(host) {
    const domain = host.split(".");
    domain.shift();
    return domain.join(".");
  }

  /**
   * Shows the page action button.
   *
   * @param {document} doc - the browser.xul document for the page action.
   * @param {number} counter - blocked count for the current page.
   */
  showPageAction(doc, counter) {

    const win = Services.wm.getMostRecentWindow("navigator:browser");

    doc.getElementById("tracking");
    const urlbar = doc.getElementById("page-action-buttons");

    const panel = doc.createElementNS(this.XUL_NS, "panel");
    panel.setAttribute("id", "tracking-protection-study-panel");
    panel.setAttribute("type", "arrow");
    panel.setAttribute("level", "parent");
    const panelBox = doc.createElementNS(this.XUL_NS, "vbox");

    const header = doc.createElementNS(this.XUL_NS, "label");
    header.setAttribute(
      "value",
      `Firefox is blocking ${counter} elements on this page`
    );

    const controls = doc.createElementNS(this.XUL_NS, "hbox");

    const group = doc.createElementNS(this.XUL_NS, "radiogroup");
    const enabled = doc.createElementNS(this.XUL_NS, "radio");
    enabled.setAttribute("label", "Enable on this site");
    enabled.addEventListener("click", () => {
      win.gBrowser.reload();
    });
    const disabled = doc.createElementNS(this.XUL_NS, "radio");
    disabled.setAttribute("label", "Disable on this site");
    disabled.addEventListener("click", () => {
      win.gBrowser.reload();
    });
    group.append(enabled);
    group.append(disabled);
    controls.append(group);

    const footer = doc.createElementNS(this.XUL_NS, "label");
    footer.setAttribute("value", "If the website appears broken, consider" +
                                 " disabling tracking protection and" +
                                 " refreshing the page.");

    panelBox.append(header);
    panelBox.append(controls);
    panelBox.append(footer);

    panel.append(panelBox);

    let button = doc.getElementById("tracking-protection-study-button");
    if (!button) {
      button = doc.createElementNS(this.XUL_NS, "toolbarbutton");
      button.style.backgroundColor = "green";
      button.setAttribute("id", "tracking-protection-study-button");
      button.setAttribute(
        "image",
        "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled");
      button.append(panel);
      button.addEventListener("command", () => {
        doc.getElementById("panel");
        panel.openPopup(button);
      });

      urlbar.append(button);
    }
  }

  setPageActionCounter(doc, counter) {
    const toolbarButton = doc.getElementById("tracking-protection-study-button");
    if (toolbarButton) {
      // if "fast" treatment, convert counter from ms to seconds and add unit "s"
      const label = this.treatment === "private" ? counter
        : `${Math.round(counter / 1000)}s`;
      toolbarButton.setAttribute("label", label);
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
  * If have CNN in one tab (with blocked elements) and Fox in another, go to 
  * Fox tab and back to CNN, you want counter to change back to CNN count.
  * Only one icon in URL across all tabs, have to update it per page.
  */
  onTabChange(evt) {
    const win = evt.target.ownerGlobal;
    const currentURI = win.gBrowser.currentURI;

    const currentWin = Services.wm.getMostRecentWindow("navigator:browser");

    // If user changes tabs but stays within current window we want to update
    // the status of the pageAction, then reshow it if the new page has had any
    // resources blocked.
    if (win === currentWin) {
      // depending on the treatment branch, we want the count of timeSaved
      // ("fast") or blockedResources ("private")
      let counter = this.treatment === "private" ?
        this.state.blockedResources.get(win.gBrowser.selectedBrowser) :
        this.state.timeSaved.get(win.gBrowser.selectedBrowser);
      if (!counter) {
        counter = 0;
      }
      this.showPageAction(win.document, counter);
      this.setPageActionCounter(win.document, counter);
    }
  }

  async endStudy(reason, shouldResetTP = true) {
    this.isStudyEnding = true;
    if (shouldResetTP) {
      this.resetBuiltInTrackingProtection();
    }
    await this.studyUtils.endStudy({ reason });
  }

  uninit() {
    // ensure the frame script is not loaded into any new tabs
    Services.mm.removeDelayedFrameScript(this.FRAME_SCRIPT_URL);
    // TODO bdanforth: disable frame scripts already loaded (Issue #39)

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

    const uri = Services.io.newURI(this.STYLESHEET_URL);
    styleSheetService.unregisterSheet(uri, styleSheetService.AGENT_SHEET);

    Cu.unload("resource://tracking-protection-study/Canonicalize.jsm");
    Cu.unload("resource://tracking-protection-study/BlockLists.jsm");

    this.removeBuiltInTrackingProtectionListeners();

    this.reenableBuiltInTrackingProtectionUI();
  }

  reenableBuiltInTrackingProtectionUI() {
    Services.prefs.setBoolPref(this.PREF_TP_UI_ENABLED, true);
  }

  resetBuiltInTrackingProtection() {
    Services.prefs.setBoolPref(this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS, true);
  }

  removeBuiltInTrackingProtectionListeners() {
    Services.prefs.removeObserver(this.PREF_TP_ENABLED_GLOBALLY, this);
    Services.prefs.removeObserver(this.PREF_TP_ENABLED_IN_PRIVATE_WINDOWS, this);
  }

  telemetry(stringStringMap) {
    this.studyUtils.telemetry(stringStringMap);
  }
}
