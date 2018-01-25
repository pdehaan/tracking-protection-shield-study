"use strict";

/* global sendMessageToChrome */

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(addCustomContent|onChromeListening|showPageActionPanel)" }]*/

const pageActionPanel = document.getElementById("tracking-protection-study-page-action-panel-box");
const pageActionButton = document.getElementById("tracking-protection-study-page-action-primary-button");
const pageActionConfirmationPanel = document.getElementById("tracking-protection-study-page-action-confirmation-panel-box");
const pageActionConfirmationCancelButton = document.getElementById("tracking-protection-study-confirmation-default-button");
const pageActionConfirmationDisableButton = document.getElementById("tracking-protection-study-confirmation-secondary-button");

function addCustomContent(data) {
  // TODO: Update strings by messaging branch.
  console.log(data);
}

function onChromeListening() {

  if (document.readyState === "complete") {
    handleLoad();
  } else {
    document.addEventListener("load", handleLoad);
  }

  function handleLoad() {
    resizeBrowser(pageActionPanel);
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
