"use strict";

/* global sendMessageToChrome */

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(onChromeListening|updateTPNumbers)" }]*/

const pageActionPanel = document.getElementById("tracking-protection-study-page-action-panel-box");
const pageActionButton = document.getElementById("tracking-protection-study-page-action-primary-button");
const pageActionConfirmationPanel = document.getElementById("tracking-protection-study-page-action-confirmation-panel-box");
const pageActionConfirmationCancelButton = document.getElementById("tracking-protection-study-confirmation-default-button");
const pageActionConfirmationDisableButton = document.getElementById("tracking-protection-study-confirmation-secondary-button");
const pageActionFirstQuantity = document.getElementById("tracking-protection-study-page-action-num-trackers-blocked");
const pageActionSecondQuantity = document.getElementById("tracking-protection-study-page-action-second-quantity");
const pageActionMessage = document.getElementById("tracking-protection-study-page-action-message");
let msgParsed;

function onChromeListening(msg) {
  msgParsed = JSON.parse(msg);

  if (document.readyState === "complete") {
    handleLoad();
  } else {
    document.addEventListener("load", handleLoad);
  }

  function handleLoad() {
    addCustomContent();
    resizeBrowser(pageActionPanel);
  }

  // This is only called when the pageAction panel goes from not showing to showing
  // it does not live update the values
  function addCustomContent() {
    // get timeSaved to seconds
    const timeSaved = Math.round(msgParsed.state.totalTimeSaved / 1000);
    pageActionFirstQuantity.innerText = msgParsed.state.totalBlockedResources;
    let secondQuantity = msgParsed.pageActionQuantities;
    secondQuantity = secondQuantity.replace("${blockedAds}", msgParsed.state.totalBlockedAds);
    secondQuantity = secondQuantity.replace("${timeSaved}", timeSaved);
    pageActionSecondQuantity.innerHTML = secondQuantity;
    pageActionMessage.textContent = msgParsed.pageActionMessage;
  }

  function resizeBrowser(panel) {
    const dimensions = getPanelDimensions(panel);
    sendMessageToChrome(
      "browser-resize",
      JSON.stringify(dimensions)
    );
  }

  // get width and height of panel after it's loaded
  function getPanelDimensions(panel) {
    // get the DOMRect object of panel element, not JSON-able
    const dimensions = panel.getBoundingClientRect();
    return { width: dimensions.width, height: dimensions.height };
  }

  pageActionButton.addEventListener("click", handleButtonClick);
  pageActionConfirmationCancelButton.addEventListener("click", handleButtonClick);
  pageActionConfirmationDisableButton.addEventListener("click", handleButtonClick);

  function handleButtonClick(evt) {
    let event;
    switch (evt.target.id) {
      case "tracking-protection-study-page-action-primary-button":
        event = "page-action-reject";
        pageActionPanel.classList.add("hidden");
        pageActionConfirmationPanel.classList.remove("hidden");
        resizeBrowser(pageActionConfirmationPanel);
        break;
      case "tracking-protection-study-confirmation-default-button":
        event = "page-action-confirmation-cancel";
        pageActionConfirmationPanel.classList.add("hidden");
        pageActionPanel.classList.remove("hidden");
        resizeBrowser(pageActionPanel);
        break;
      case "tracking-protection-study-confirmation-secondary-button":
        event = "page-action-confirmation-leave-study";
        break;
      default:
        throw new Error("Unrecognized UI element: ", evt.target);
    }
    sendMessageToChrome(event);
  }
}

// Update quantities dynamically without refreshing the pageAction panel
function updateTPNumbers(state) {
  state = JSON.parse(state);
  const timeSaved = Math.round(state.totalTimeSaved / 1000);
  pageActionFirstQuantity.innerText = state.totalBlockedResources;
  let secondQuantity = msgParsed.pageActionQuantities;
  secondQuantity = secondQuantity.replace("${blockedAds}", state.totalBlockedAds);
  secondQuantity = secondQuantity.replace("${timeSaved}", timeSaved);
  pageActionSecondQuantity.innerHTML = secondQuantity;
}
