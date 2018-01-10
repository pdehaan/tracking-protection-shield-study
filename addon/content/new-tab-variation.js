// Modified from https://github.com/rhelmer/tracking-protection-study/

/* global addMessageListener sendAsyncMessage*/

"use strict";

const ABOUT_HOME_URL = "about:home";
const ABOUT_NEWTAB_URL = "about:newtab";
// for calculating time saved per page
const LOAD_START_TIME = Date.now() / 1000 / 60;

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
          doc.addEventListener("DOMContentLoaded", () => this.addMessageToNewTab(msg.data.state, doc));
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
    // TODO bdanforth: Ideally: Update numbers dynamically on page even without refresh?
    const minutes = state.totalTimeSaved;
    // FIXME commented out for testing
    // if (minutes >= 1 && this.blockedRequests) {
    // if we haven't blocked anything yet, don't modify the page
    if (state.totalBlockedResources) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedCompanies}", state.totalBlockedCompanies);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${minutes}", minutes.toPrecision(3));

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
    const minutes = state.totalTimeSaved;
    console.log(minutes);
    const span = doc.getElementById("tracking-protection-numbers");
    if (span) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedCompanies}", state.totalBlockedCompanies);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${minutes}", minutes);
      span.innerHTML = message;
    }
  }
}

// estimate the amount of per page load time saved in minutes
function getTimeSaved(pageStartTime) {
  const pageEndTime = Date.now() / 1000 / 60;
  // TP estimated to save 44% page load time: https://tinyurl.com/l4mnbol
  const timeSaved = 0.44 * (pageEndTime - pageStartTime);
  return timeSaved.toFixed(4);
}

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
      const timeSaved = getTimeSaved(LOAD_START_TIME);
      sendAsyncMessage("TrackingStudy:OnContentMessage",
        {
          action: "update-time-saved",
          timeSaved,
        }
      );
    }
  }
}, true);
