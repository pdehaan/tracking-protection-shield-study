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
    const seconds = state.totalTimeSaved / 1000;
    // if we haven't blocked anything yet, don't modify the page
    if (state.totalBlockedResources) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedAds}", state.totalBlockedAds);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${seconds}", Math.ceil(seconds));

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

  updateTPNumbers(state, doc) {
    const seconds = state.totalTimeSaved / 1000;
    const span = doc.getElementById(`${NEW_TAB_MESSAGE_DIV_ID}`);
    if (span) {
      let message = state.newTabMessage;
      message = message.replace("${blockedRequests}", state.totalBlockedResources);
      message = message.replace("${blockedAds}", state.totalBlockedAds);
      message = message.replace("${blockedSites}", state.totalBlockedWebsites);
      message = message.replace("${seconds}", Math.ceil(seconds));
      span.innerHTML = message;
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
      sendAsyncMessage("TrackingStudy:OnContentMessage", {action: "get-totals"});
    });
  }
}, true);
