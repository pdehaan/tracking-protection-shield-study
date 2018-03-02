"use strict";

let pageActionPanel;

/* global sendMessageToChrome */

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(onChromeListening|updateTPNumbers|onShutdown)" }]*/

function onChromeListening(msg) {
  const msgParsed = JSON.parse(msg);
  pageActionPanel = new PageActionPanel(msgParsed);
}

class PageActionPanel {
  constructor(msg) {
    this.msg = msg;
    this.handleLoadRef = this.handleLoad.bind(this);
    this.handleButtonClickRef = this.handleButtonClick.bind(this);

    if (document.readyState === "complete") {
      this.handleLoad();
    } else {
      document.addEventListener("load", this.handleLoadRef);
    }
  }

  handleLoad() {
    this.pageActionPanel = document.getElementById("tracking-protection-study-page-action-panel-box");
    this.pageActionButton = document.getElementById("tracking-protection-study-page-action-primary-button");
    this.pageActionConfirmationPanel = document.getElementById("tracking-protection-study-page-action-confirmation-panel-box");
    this.pageActionConfirmationCancelButton = document.getElementById("tracking-protection-study-confirmation-default-button");
    this.pageActionConfirmationDisableButton = document.getElementById("tracking-protection-study-confirmation-secondary-button");
    this.pageActionFirstQuantity = document.getElementById("tracking-protection-study-page-action-num-trackers-blocked");
    this.pageActionSecondQuantity = document.getElementById("tracking-protection-study-page-action-second-quantity");
    this.pageActionMessage = document.getElementById("tracking-protection-study-page-action-message");
    this.addCustomContent();
    this.resizeBrowser(this.pageActionPanel);
    this.addClickListeners();
  }

  resizeBrowser(panel) {
    const dimensions = this.getPanelDimensions(panel);
    sendMessageToChrome(
      "browser-resize",
      JSON.stringify(dimensions)
    );
  }

  // get width and height of panel after it's loaded
  getPanelDimensions(panel) {
    // get the DOMRect object of panel element, not JSON-able
    const dimensions = panel.getBoundingClientRect();
    return { width: dimensions.width, height: dimensions.height };
  }

  // This is only called when the pageAction panel goes from not showing to showing
  // it does not live update the values
  addCustomContent() {
    this.pageActionFirstQuantity.innerText = this.msg.firstQuantity;
    let secondQuantityMessage = this.msg.pageActionQuantities;
    // convert time units
    const { timeSaved, timeUnit } = this.getHumanReadableTime(this.msg.secondQuantity);
    const blockedAds = this.msg.secondQuantity;
    secondQuantityMessage = secondQuantityMessage.replace("${blockedAds}", blockedAds);
    secondQuantityMessage = secondQuantityMessage.replace("${timeSaved}", timeSaved);
    secondQuantityMessage = secondQuantityMessage.replace("${timeUnit}", timeUnit);
    // eslint-disable-next-line no-unsanitized/property
    this.pageActionSecondQuantity.innerHTML = secondQuantityMessage;
    this.pageActionMessage.textContent = this.msg.pageActionMessage;
  }

  addClickListeners() {
    this.pageActionButton.addEventListener("click", this.handleButtonClickRef);
    this.pageActionConfirmationCancelButton.addEventListener("click", this.handleButtonClickRef);
    this.pageActionConfirmationDisableButton.addEventListener("click", this.handleButtonClickRef);
  }

  handleButtonClick(evt) {
    let event;
    switch (evt.target.id) {
      case "tracking-protection-study-page-action-primary-button":
        event = "page-action-reject";
        this.pageActionPanel.classList.add("hidden");
        this.pageActionConfirmationPanel.classList.remove("hidden");
        this.resizeBrowser(this.pageActionConfirmationPanel);
        break;
      case "tracking-protection-study-confirmation-default-button":
        event = "page-action-confirmation-cancel";
        this.pageActionConfirmationPanel.classList.add("hidden");
        this.pageActionPanel.classList.remove("hidden");
        this.resizeBrowser(this.pageActionPanel);
        break;
      case "tracking-protection-study-confirmation-secondary-button":
        event = "page-action-confirmation-leave-study";
        break;
      default:
        throw new Error("Unrecognized UI element: ", evt.target);
    }
    sendMessageToChrome(event);
  }

  getHumanReadableTime(perPageTimeSaved) {
    let timeSaved = "";
    let timeUnit = "";
    const timeSeconds = Math.ceil(perPageTimeSaved / 1000);
    if (timeSeconds >= 60) {
      const timeMinutes = timeSeconds / 60;
      timeSaved += `${timeMinutes.toFixed(2)}`;
      timeUnit += "minute";
      if (timeMinutes > 1) {
        timeUnit += "s";
      }
    } else {
      timeSaved += timeSeconds;
      timeUnit += "second";
      if (timeSeconds !== 1) {
        timeUnit += "s";
      }
    }
    return { timeSaved, timeUnit };
  }

  updateNumbers(quantities) {
    quantities = JSON.parse(quantities);
    const firstQuantity = quantities.firstQuantity;
    const { timeSaved, timeUnit } = this.getHumanReadableTime(quantities.secondQuantity);
    const blockedAds = quantities.secondQuantity;
    this.pageActionFirstQuantity.innerText = firstQuantity;
    let secondQuantityHTML = this.msg.pageActionQuantities;
    secondQuantityHTML = secondQuantityHTML.replace("${blockedAds}", blockedAds);
    secondQuantityHTML = secondQuantityHTML.replace("${timeSaved}", timeSaved);
    secondQuantityHTML = secondQuantityHTML.replace("${timeUnit}", timeUnit);
    // eslint-disable-next-line no-unsanitized/property
    this.pageActionSecondQuantity.innerHTML = secondQuantityHTML;
  }

  onShutdown() {
    document.removeEventListener("load", this.handleLoadRef);
    this.removeClickListeners();
  }

  removeClickListeners() {
    this.pageActionButton.removeEventListener("click", this.handleButtonClickRef);
    this.pageActionConfirmationCancelButton.removeEventListener("click", this.handleButtonClickRef);
    this.pageActionConfirmationDisableButton.removeEventListener("click", this.handleButtonClickRef);
  }
}

// Update quantities dynamically without refreshing the pageAction panel
function updateTPNumbers(quantities) {
  pageActionPanel.updateNumbers(quantities);
}

function onShutdown() {
  pageActionPanel.onShutdown();
}
