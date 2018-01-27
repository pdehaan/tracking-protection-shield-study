"use strict";

/* global sendMessageToChrome */

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(onChromeListening)" }]*/

function onChromeListening(copy) {
  const introPanel = document.getElementById("tracking-protection-study-intro-panel-box");
  const introPanelHeading = document.getElementById("tracking-protection-study-heading");
  const introPanelMessage = document.getElementById("tracking-protection-study-intro-message");
  const primaryButton = document.getElementById("tracking-protection-study-primary-button");
  const secondaryButton = document.getElementById("tracking-protection-study-secondary-button");
  const confirmationPanel = document.getElementById("tracking-protection-study-confirmation-panel-box");
  const confirmationCancelButton = document.getElementById("tracking-protection-study-confirmation-default-button");
  const confirmationDisableButton = document.getElementById("tracking-protection-study-confirmation-secondary-button");

  if (document.readyState === "complete") {
    handleLoad();
  } else {
    document.addEventListener("load", handleLoad);
  }

  function handleLoad() {
    addCustomContent();
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

  function addCustomContent() {
    const copyParsed = JSON.parse(copy);
    introPanelHeading.textContent = copyParsed.introHeader;
    introPanelMessage.textContent = copyParsed.introMessage;
  }

  primaryButton.addEventListener("click", handleButtonClick);
  secondaryButton.addEventListener("click", handleButtonClick);
  confirmationCancelButton.addEventListener("click", handleButtonClick);
  confirmationDisableButton.addEventListener("click", handleButtonClick);


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
      default:
        throw new Error("Unrecognized UI element: ", evt.target);
    }
    sendMessageToChrome(event);
  }
}
