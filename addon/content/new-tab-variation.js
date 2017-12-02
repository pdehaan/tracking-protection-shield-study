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
    const root = contentWindow.document.getElementById("root");
    let message = contentWindow.document.getElementById("tracking-study-message");
    if (!message) {
      message = contentWindow.document.createElement("span");
      message.id = "tracking-study-message";
    }
    let value;
    switch (msg.data.type) {
      case "totalBlockedResources":
        value = msg.data.value;
        message.innerHTML = `Hello from Tracking Protection Study! Total blocked resources: ${ value }`;
        root.parentElement.prepend(message);
        break;
      default:
        throw new Error(`Message type not recognized, ${ msg.data.type }`);
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
