// Modified from https://github.com/rhelmer/tracking-protection-study/

/* global addMessageListener sendAsyncMessage*/

"use strict";

const ABOUT_HOME_URL = "about:home";
const ABOUT_NEWTAB_URL = "about:newtab";
const NEW_TAB_CONTAINER_DIV_ID = "tracking-protection-messaging-study-container";
const NEW_TAB_MESSAGE_DIV_ID = "tracking-protection-messaging-study-message";

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
    const time = this.getHumanReadableTimeVals(state.totalTimeSaved);

    // if we haven't blocked anything yet, don't modify the page
    if (state.totalBlockedResources) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedAds}", state.totalBlockedAds);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${time}", time);

      // Check if the study UI has already been added to this page
      const tpContent = doc.getElementById(`${NEW_TAB_CONTAINER_DIV_ID}`);
      if (tpContent) {
        // if already on the page, just update the message
        const spanEle = tpContent.getElementsByTagName("div")[0];
        spanEle.innerHTML = message;
        return;
      }

      const div = doc.createElement("div");
      div.id = `${NEW_TAB_MESSAGE_DIV_ID}`;
      div.innerHTML = message;

      const newContainer = doc.createElement("div");
      newContainer.id = `${NEW_TAB_CONTAINER_DIV_ID}`;
      newContainer.append(div);

      // There's only one <main> element on the new tab page
      const mainEle = doc.getElementsByTagName("main")[0];
      const searchDiv = mainEle.children[0];
      const parentNode = searchDiv.parentElement;
      parentNode.insertBefore(newContainer, searchDiv.nextSibling);
    }
  }

  // timeSaved comes in as ms
  getHumanReadableTimeVals(timeSaved) {
    let timeStr = "";
    let timeSeconds,
      timeMinutes,
      timeHours;
    timeSeconds = timeSaved / 1000;
    if (timeSeconds >= 60) {
      timeMinutes = timeSeconds / 60;
      timeSeconds = (timeMinutes % 1) * 60;
      timeMinutes = Math.floor(timeMinutes);
      if (timeMinutes >= 60) {
        timeHours = timeMinutes / 60;
        timeMinutes = (timeHours % 1) * 60;
        timeHours = Math.floor(timeHours);
      }
    }
    if (timeHours > 0) {
      timeStr += `<span class='tracking-protection-messaging-study-message-quantity'>${ Math.round(timeHours) }</span> hour`;
      if (Math.round(timeHours) > 1) {
        timeStr += "s";
      }
    }
    if (timeMinutes > 0) {
      timeStr += `${timeHours > 0 ? (timeSeconds > 0 ? "," : " and") : ""} <span class='tracking-protection-messaging-study-message-quantity'>${ Math.round(timeMinutes) }</span> minute`;
      if (Math.round(timeMinutes) > 1) {
        timeStr += "s";
      }
    }
    if (timeSeconds > 0) {
      timeStr += `${timeMinutes > 0 ? " and" : ""} <span class='tracking-protection-messaging-study-message-quantity'>${ Math.round(timeSeconds) }</span> second`;
      if (Math.round(timeSeconds) > 1) {
        timeStr += "s";
      }
    }
    return timeStr;
  }

  updateTPNumbers(state, doc) {
    const time = this.getHumanReadableTimeVals(state.totalTimeSaved);
    const span = doc.getElementById(`${NEW_TAB_MESSAGE_DIV_ID}`);
    if (span) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedAds}", state.totalBlockedAds);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${time}", time);
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
