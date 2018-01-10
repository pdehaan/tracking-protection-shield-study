/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

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
    this.reasonName = reasonName;
    this.addContentMessageListeners();
    this.init(variation.name);
  }

  async init(treatment) {
    console.log(treatment);
    // TODO bdanforth: get treatment(s) from bootstrap/studyUtils
    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      fast: this.showIntroPanel.bind(this), // opens a doorhanger on addon install only
      private: this.showIntroPanel.bind(this),
    };

    this.treatment = treatment;
    // TODO bdanforth: update newtab messages copy
    const newtab_messages = {
      fast: "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
      private: "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedCompanies} companies that track your browsing",
    };
    // TODO bdanforth: update with final URLs
    const learnMore_urls = [
      "http://www.mozilla.com",
    ];
    // TODO bdanforth: update intro panel message copy
    this.message = "Tracking protection is great! Would you like to participate in a study?";
    this.url = learnMore_urls[0];

    // run once now on the most recent window.
    let win = Services.wm.getMostRecentWindow("navigator:browser");

    // TODO bdanforth: remove if there is no "ALL" treatment, ultimately
    if (this.treatment === "ALL") {
      Object.keys(this.TREATMENTS).forEach((key, index) => {
        if (Object.prototype.hasOwnProperty.call(this.TREATMENTS, key)) {
          this.TREATMENTS[key](win, this.message, this.url);
        }
      });
    } else if (this.treatment in this.TREATMENTS) {
      this.TREATMENTS[this.treatment](win, this.message, this.url);
    }

    // TODO bdanforth: include a doc block with format/content for each list/map/set in
    // this.lists and this.state
    this.lists = {
      // a map with each key a domain name of a known tracker and each value 
      // the domain name of the owning entity (ex: "facebook.de" -> "facebook.com")
      blocklist: new Map(),
      // An object where top level keys are owning company names; each company key points
      // to an object with a property and resource key.
      entityList: {},
    };

    this.state = {
      // TODO bdanforth: choose message based on treatment branch
      newTabMessage: newtab_messages[this.treatment],
      totalTimeSaved: 0,
      // a <browser>:counter map for the number of blocked resources for a particular browser
      // Why is this mapped with <browser>?
      // You may have the same site in multiple tabs; should you use the same counter for both?
      // the <browser> element is per tab. Fox News in two different tabs wouldn't share the same counter.
      // if didn't do this, you might get two tabs loading the same page trying to update the same counter.
      blockedResources: new Map(),
      // TODO bdanforth: reset to 0 after testing
      totalBlockedResources: 1,
      blockedCompanies: new Set(),
      totalBlockedCompanies: 0,
      blockedWebsites: new Set(),
      totalBlockedWebsites: 0,
    };

    // populate lists in this.state: blocklist, entityList, etc.
    await blocklists.loadLists(this.lists);

    const filter = {urls: new win.MatchPatternSet(["*://*/*"])};

    // Tracking protection implementation
    WebRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      // listener will only be called for requests whose targets match the filter
      filter,
      ["blocking"]
    );

    const uri = Services.io.newURI(STYLESHEET_URL);
    styleSheetService.loadAndRegisterSheet(uri, styleSheetService.AGENT_SHEET);

    // Add listeners to all open windows.
    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }

      this.addWindowEventListeners(win);
    }

    // Attach to any new windows.
    // Depending on which event happens (ex: onOpenWindow, onLocationChange),
    // it will call that listener method that exists on "this"
    Services.wm.addListener(this);
  }

  /**
  *   Display instrumented 'introductory panel' explaining the feature to the user
  *   Telemetry Probes: (TODO bdanforth: add telemetry probes)
  *   - {event: introduction-shown}
  *   - {event: introduction-accept}
  *   - {event: introduction-leave-study}
  *    Note:  Panel WILL NOT SHOW if the only window open is a private window.
  *
  * Shows the intro doorhanger
  * (has different content than the doorhanger that shows when
  * the user clicks the pageAction button).
  * Open doorhanger-style notification on desired chrome window.
  * Note: this doorhanger is different (id=DOORHANGER_ID)
  * than the doorhanger that appears when the pageAction button
  * is clicked in the `showPageAction` method.
  * (id="tracking-protection-study-panel")
  * Note: This method is currently called on Feature.init()
  *
  * @param {ChromeWindow} win
  * @param {String} message
  * @param {String} url
  */
  showIntroPanel(win, message, url) {
    // Only show intro panel when the addon was just installed
    if (this.reasonName !== "ADDON_INSTALL") {
      return;
    }

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
    // Without delay, the panel flashes briefly toward the bottom of the screen before being removed. Why?
    // This likely has something to do with how the Selenium WebDriver script at "npm run firefox" starts up Firefox.
    // rhelmer's recommendation: Try running this in mozilla-central (use MochiTest equivalent instead of Selenium WebDriver),
    // where we have custom CI/test runners that are maintained by Mozilla and much more thorough than any one-off set-up.
    win.setTimeout(() => {
      win.PopupNotifications.show(
        win.gBrowser.selectedBrowser,
        DOORHANGER_ID,
        message,
        null,
        action,
        [],
        options
      );
    }, 1000);
  }

  // This method is called if event occurs from:
  // Services.wm.addListener(this) in init()
  // Adds event listeners to newly created windows (browser application window)
  // This method is NOT called when opening a new tab.
  onOpenWindow(xulWindow) {
    var win = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    win.addEventListener("load", () => this.addWindowEventListeners(win), {once: true});
  }

  // This method is called when opening a new tab among many other times.
  // This is a listener for the addTabsProgressListener
  // Not appropriate for modifying the page itself because the page hasn't finished
  // loading yet. https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIWebProgressListener
  onLocationChange(browser, progress, request, uri, flags) {
    const LOCATION_CHANGE_SAME_DOCUMENT = 1;
    // ensure the location change event is occuring in the top frame (not an iframe for example)
    // and also that a different page is being loaded
    if (progress.isTopLevel && flags !== LOCATION_CHANGE_SAME_DOCUMENT) {
      // if tracking protection has already blocked any resources for this tab,
      // reset the counter on the pageAction
      if (this.state.blockedResources.has(browser)) {
        this.showPageAction(browser.getRootNode(), 0);
        this.setPageActionCounter(browser.getRootNode(), 0);
        this.state.blockedResources.set(browser, 0);
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
      // nsIURI object with attributes to set and query the basic components of the browser's current URI
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

      const currentHost = currentURI.host; // the domain name for the current page (e.g. www.nytimes.com)
      const host = new URL(details.originUrl).host; // the domain name for the entity making the request

      // Block third-party requests only.
      if (currentHost !== host && blocklists.hostInBlocklist(this.lists.blocklist, host)) {
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
        // see https://github.com/mozilla/blok/blob/master/src/js/requests.js#L18-L27
        // for a much more efficient implementation
        for (const entity in this.lists.entityList) {
          if (this.lists.entityList[entity].resources.includes(rootDomainHost)) {
            // This just means that this "host" is contained in the entity list
            // and owned by "entity"
            // but we have to check and see if the "currentHost" is also owned by
            // "entity"
            // if it is, don't block the request; if it isn't, block the request and
            // add the entity to the list of "blockedCompanies" 
            if (this.lists.entityList[entity].resources.includes(rootDomainCurrentHost)
              || this.lists.entityList[entity].properties.includes(rootDomainCurrentHost)) {
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
      win.gBrowser.reload();
    });
    const disabled = doc.createElementNS(XUL_NS, "radio");
    disabled.setAttribute("label", "Disable on this site");
    disabled.addEventListener("click", () => {
      win.gBrowser.reload();
    });
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
    button.style.backgroundColor = "green";
    button.setAttribute("id", "tracking-protection-study-button");
    button.setAttribute("image", "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled");
    button.append(panel);
    button.addEventListener("command", () => {
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
  * If have CNN in one tab (with blocked elements) and Fox in another, go to Fox tab and back to CNN, you want
  * counter to change back to CNN count.
  * Only one icon in URL across all tabs, have to update it per page.
  */
  onTabChange(evt) {
    const win = evt.target.ownerGlobal;
    const currentURI = win.gBrowser.currentURI;
    // Don't show the page action if page is not http or https
    if (currentURI.scheme !== "http" && currentURI.scheme !== "https") {
      this.hidePageAction(win.document);
      return;
    }

    const currentWin = Services.wm.getMostRecentWindow("navigator:browser");

    // If user changes tabs but stays within current window we want to update the status
    // of the pageAction, then reshow it if the new page has had any resources blocked.
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
  * Three cases of user looking at diff page:
      - switched windows (onOpenWindow)
      - loading new pages in the same tab (onPageLoad/Frame script)
      - switching tabs but not switching windows (tabSelect)
    Each one needs its own separate handler, because each one is detected by its own
    separate event.
  * @param {ChromeWindow} win
  */
  addWindowEventListeners(win) {
    if (win && win.gBrowser) {
      win.gBrowser.addTabsProgressListener(this);
      win.gBrowser.tabContainer.addEventListener("TabSelect", this.onTabChange.bind(this));
      // TODO bdanforth: ask in #fx-team:
      // This "load" event is not firing on page loads; how can we listen for this event in a JSM?
      // Does each webpages load event bubble up to parent window?
      // At this point, when the parent window has loaded, what is the appropriate listener
      // to register to say when a page in this browser has finished loading and can be modified?
      // I currently do this in the frame script, since this method was not firing as expected.
      // onPageLoad function was removed, but it can be found here: https://tinyurl.com/y8kh9g6r
      // win.addEventListener("load", () => this.onPageLoad);
    }
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

  addContentMessageListeners() {
    // content listener
    Services.mm.addMessageListener(
      "TrackingStudy:OnContentMessage",
      this.handleMessageFromContent.bind(this)
    );
  }

  handleMessageFromContent(msg) {
    switch (msg.data.action) {
      case "get-totals":
      // TODO bdanforth: update what text is shown based on treatment branch
        msg.target.messageManager.sendAsyncMessage("TrackingStudy:Totals", {
          type: "newTabContent",
          state: this.state,
        });
        break;
      case "update-time-saved":
        this.state.totalTimeSaved += Number.parseFloat(msg.data.timeSaved);
        // TODO bdanforth: minimize number of decimal places after 0.
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
