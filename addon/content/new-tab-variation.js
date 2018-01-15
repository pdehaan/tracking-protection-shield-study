// Modified from https://github.com/rhelmer/tracking-protection-study/

/* global addMessageListener sendAsyncMessage*/

"use strict";

const ABOUT_HOME_URL = "about:home";
const ABOUT_NEWTAB_URL = "about:newtab";

class TrackingProtectionStudy {
  constructor(contentWindow) {
    this.init(contentWindow);
  }

  async init(contentWindow) {
    addMessageListener("TrackingStudy:Totals", (msg) => {
      this.handleMessageFromChrome(msg, contentWindow);
    });
  }

  handleMessageFromChrome(msg, contentWindow) {
    const doc = contentWindow.document;
    switch (msg.data.type) {
      case "newTabContent":
        // check if document has already loaded
        if (doc.readyState === "complete") {
          this.addContentToNewTab(msg.data.state, doc);
        } else {
          doc.addEventListener("DOMContentLoaded", () => this.addContentToNewTab(msg.data.state, doc));
        }
        break;
      case "updateTPNumbers":
        this.updateTPNumbers(msg.data.state, doc);
        break;
      default:
        throw new Error(`Message type not recognized, ${ msg.data.type }`);
    }
  }

  addContentToNewTab(state, doc) {
    const minutes = state.totalTimeSaved / 1000 / 60;
    // FIXME commented out for testing
    // if we haven't blocked anything yet, don't modify the page
    if (true/*state.totalBlockedResources && minutes >= 1*/) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedCompanies}", state.totalBlockedCompanies);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${minutes}", minutes.toFixed(2));

      // Check if the study UI has already been added to this page
      const tpContent = doc.getElementById("tracking-protection-message");
      if (tpContent) {
        // if already on the page, just update the message
        const spanEle = tpContent.getElementsByTagName("span")[0];
        spanEle.innerHTML = message;
        return;
      }

      const logo = doc.createElement("img");
      logo.src = "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled";
      logo.style.height = 48;
      logo.style.width = 48;

      const span = doc.createElement("span");
      span.id = "tracking-protection-numbers";
      span.style.fontSize = "24px";
      span.style.fontWeight = "lighter";
      span.style.marginLeft = "20px";
      span.innerHTML = message;

      const newContainer = doc.createElement("div");
      newContainer.id = "tracking-protection-message";
      newContainer.style.display = "flex";
      newContainer.style.alignItems = "center";
      newContainer.style.justifyContent = "flex-start";
      newContainer.style.marginBottom = "40px";
      newContainer.append(logo);
      newContainer.append(span);

      // There's only one <main> element on the new tab page
      const mainEle = doc.getElementsByTagName("main")[0];
      mainEle.prepend(newContainer);
    }
  }

  updateTPNumbers(state, doc) {
    const minutes = state.totalTimeSaved / 1000 / 60;
    const span = doc.getElementById("tracking-protection-numbers");
    if (span) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedCompanies}", state.totalBlockedCompanies);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${minutes}", minutes.toFixed(2));
      span.innerHTML = message;
    }
  }
}

// estimate the amount of per page load time saved in minutes
function getTimeSaved(loadTime) {
  // TP estimated to save 44% page load time: https://tinyurl.com/l4mnbol
  const timeSaved = 0.44 * loadTime;
  return timeSaved; // in ms
}

let prevLoadTime = 0;
let prevLocation;

addEventListener("load", function onLoad(evt) {
  const window = evt.target.defaultView;
  const location = window.location.href;
  const protocol = window.location.protocol;
  if (location === ABOUT_NEWTAB_URL || location === ABOUT_HOME_URL) {
    // queues a function to be called during a browser's idle periods
    window.requestIdleCallback(() => {
      new TrackingProtectionStudy(window);
      sendAsyncMessage("TrackingStudy:OnContentMessage", {action: "get-totals"});
    });
  } else if (protocol === "http:" || protocol === "https:") {
    // only want pages user navigates to directly
    if (evt.target.referrer === "") {
      if (!prevLocation) {
        prevLocation = location;
      }
      // see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceTiming
      const loadTime = window.performance.timing.loadEventStart - window.performance.timing.domLoading;
      // some sites (e.g. nytimes.com) have multiple "load" events in the frame script for the same site
      if (loadTime > prevLoadTime) {
        prevLoadTime = loadTime;
        const timeSaved = getTimeSaved(loadTime);
        sendAsyncMessage("TrackingStudy:OnContentMessage",
          {
            action: "update-time-saved",
            timeSaved,
          }
        );
      } else if (prevLocation !== location) {
        prevLoadTime = 0;
        prevLocation = location;
        const timeSaved = getTimeSaved(loadTime);
        sendAsyncMessage("TrackingStudy:OnContentMessage",
          {
            action: "update-time-saved",
            timeSaved,
          }
        );
      }
    }
  }
}, true);
