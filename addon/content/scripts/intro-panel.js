"use strict";

/* global sendMessageToChrome */

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(addCustomContent|onChromeListening|showPageActionPanel)" }]*/

const introPanel = document.getElementById("tracking-protection-study-intro-panel-box");
const primaryButton = document.getElementById("tracking-protection-study-primary-button");
const secondaryButton = document.getElementById("tracking-protection-study-secondary-button");
const confirmationPanel = document.getElementById("tracking-protection-study-confirmation-panel-box");
const confirmationCancelButton = document.getElementById("tracking-protection-study-confirmation-default-button");
const confirmationDisableButton = document.getElementById("tracking-protection-study-confirmation-secondary-button");
const pageActionPanel = document.getElementById("tracking-protection-study-page-action-panel-box");
const pageActionButton = document.getElementById("tracking-protection-study-page-action-primary-button");

function addCustomContent(data) {
  // TODO: Update strings by messaging branch.
  console.log(data);
}

function showPageActionPanel() {
  if (document.readyState === "complete") {
    showPanel();
  } else {
    document.addEventListener("load", showPanel);
  }

  function showPanel() {
    pageActionPanel.classList.remove("hidden");
    if (!introPanel.classList.contains("hidden")) {
      introPanel.classList.add("hidden");
    }
    if (!confirmationPanel.classList.contains("hidden")) {
      confirmationPanel.classList.add("hidden");
    }
  }
}

function onChromeListening() {

  if (document.readyState === "complete") {
    handleLoad();
  } else {
    document.addEventListener("load", handleLoad);
  }

  function handleLoad() {
    const dimensions = getPanelDimensions();
    sendMessageToChrome(
      "browser-resize",
      JSON.stringify(dimensions)
    );
  }

  // get width and height of panel after it's loaded
  function getPanelDimensions() {
    // get the DOMRect object of panel element, not JSON-able
    const dimensions = introPanel.getBoundingClientRect();
    return { width: dimensions.width, height: dimensions.height };
  }

  primaryButton.addEventListener("click", handleButtonClick);
  secondaryButton.addEventListener("click", handleButtonClick);
  confirmationCancelButton.addEventListener("click", handleButtonClick);
  confirmationDisableButton.addEventListener("click", handleButtonClick);
  pageActionButton.addEventListener("click", handleButtonClick);


  function handleButtonClick(evt) {
    let event;
    switch (evt.target.id) {
      case "tracking-protection-study-primary-button":
        event = "introduction-accept";
        break;
      case "tracking-protection-study-secondary-button":
        event = "introduction-reject";
        confirmationPanel.classList.remove("hidden");
        introPanel.classList.add("hidden");
        // TODO add call to browserResize for introPanel
        break;
      case "tracking-protection-study-confirmation-default-button":
        event = "introduction-confirmation-cancel";
        confirmationPanel.classList.add("hidden");
        introPanel.classList.remove("hidden");
        // TODO add call to browserResize for introPanel
        break;
      case "tracking-protection-study-confirmation-secondary-button":
        event = "introduction-confirmation-leave-study";
        break;
      case "tracking-protection-study-page-action-primary-button":
        event = "page-action-reject";
        pageActionPanel.classList.add("hidden");
        // TODO unhide pageAction confirmation panel
        // TODO add call to browserResize for pageAction confirmation panel
        break;
      // TODO add case for pageAction confirmation panel buttons (disable and cancel)
      default:
        throw new Error("Unrecognized UI element: ", evt.target);
    }
    sendMessageToChrome(event);
  }
}
