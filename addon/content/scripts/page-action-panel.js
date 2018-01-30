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
    pageActionFirstQuantity.innerText = msgParsed.firstQuantity;
    let secondQuantityMessage = msgParsed.pageActionQuantities;
    // convert time units
    const { timeSaved, timeUnit } = getHumanReadableTime(msgParsed.secondQuantity);
    const blockedAds = msgParsed.secondQuantity;
    secondQuantityMessage = secondQuantityMessage.replace("${blockedAds}", blockedAds);
    secondQuantityMessage = secondQuantityMessage.replace("${timeSaved}", timeSaved);
    secondQuantityMessage = secondQuantityMessage.replace("${timeUnit}", timeUnit);
    pageActionSecondQuantity.innerHTML = secondQuantityMessage;
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

function getHumanReadableTime(perPageTimeSaved) {
  let timeSaved = "";
  let timeUnit = "";
  const timeSeconds = perPageTimeSaved / 1000;
  if (timeSeconds >= 60) {
    const timeMinutes = timeSeconds / 60;
    timeSaved += `${timeMinutes.toFixed(2)}`;
    timeUnit += "minute";
    if (timeMinutes > 1) {
      timeUnit += "s";
    }
  } else {
    timeSaved += `${Math.round(timeSeconds)}`;
    timeUnit += "second";
    if (Math.round(timeSeconds) !== 1) {
      timeUnit += "s";
    }
  }
  return { timeSaved, timeUnit };
}

// Update quantities dynamically without refreshing the pageAction panel
function updateTPNumbers(quantities) {
  quantities = JSON.parse(quantities);
  const firstQuantity = quantities.firstQuantity;
  const { timeSaved, timeUnit } = getHumanReadableTime(quantities.secondQuantity);
  const blockedAds = quantities.secondQuantity;
  pageActionFirstQuantity.innerText = firstQuantity;
  let secondQuantityHTML = msgParsed.pageActionQuantities;
  secondQuantityHTML = secondQuantityHTML.replace("${blockedAds}", blockedAds);
  secondQuantityHTML = secondQuantityHTML.replace("${timeSaved}", timeSaved);
  secondQuantityHTML = secondQuantityHTML.replace("${timeUnit}", timeUnit);
  pageActionSecondQuantity.innerHTML = secondQuantityHTML;
}
