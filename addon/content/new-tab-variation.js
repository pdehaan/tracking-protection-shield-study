// Modified from https://github.com/rhelmer/tracking-protection-study/

/* global addMessageListener sendAsyncMessage removeMessageListener */

"use strict";

const ABOUT_HOME_URL = "about:home";
const ABOUT_NEWTAB_URL = "about:newtab";
const NEW_TAB_CONTAINER_DIV_ID = "tracking-protection-messaging-study-container";
const NEW_TAB_MESSAGE_DIV_ID = "tracking-protection-messaging-study-message";

class TrackingProtectionStudy {
  constructor(contentWindow) {
    this.contentWindow = contentWindow;
    this.init();
  }

  async init() {
    addMessageListener("TrackingStudy:InitialContent", this);
    addMessageListener("TrackingStudy:UpdateContent", this);
    addMessageListener("TrackingStudy:ShuttingDown", this);
    addMessageListener("TrackingStudy:Uninstalling", this);
  }

  receiveMessage(msg) {
    const doc = this.contentWindow.document;
    switch (msg.name) {
      case "TrackingStudy:ShuttingDown":
        this.onShutdown();
        break;
      case "TrackingStudy:Uninstalling":
        this.onUninstall();
        break;
      case "TrackingStudy:InitialContent":
        // check if document has already loaded
        if (doc.readyState === "complete") {
          this.addContentToNewTab(msg.data.state, doc);
        } else {
          doc.addEventListener("DOMContentLoaded", () => this.addContentToNewTab(msg.data.state, doc));
        }
        break;
      case "TrackingStudy:UpdateContent":
        this.updateTPNumbers(msg.data.state, doc);
        break;
      default:
        throw new Error(`Message name not recognized: ${msg.name}`);
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

  onShutdown() {
    removeMessageListener("TrackingStudy:InitialContent", this);
    removeMessageListener("TrackingStudy:UpdateContent", this);
    removeMessageListener("TrackingStudy:ShuttingDown", this);
    removeMessageListener("TrackingStudy:Uninstalling", this);
  }

  onUninstall() {
    const doc = this.contentWindow.document;
    const tpContent = doc.getElementById(`${NEW_TAB_CONTAINER_DIV_ID}`);
    if (tpContent) {
      tpContent.remove();
    }
  }
}

addEventListener("load", function onLoad(evt) {
  const window = evt.target.defaultView;
  const location = window.location.href;
  if (location === ABOUT_NEWTAB_URL || location === ABOUT_HOME_URL) {
    // queues a function to be called during a browser's idle periods
    window.requestIdleCallback(() => {
      new TrackingProtectionStudy(window);
      sendAsyncMessage("TrackingStudy:InitialContent");
    });
  }
}, true);
