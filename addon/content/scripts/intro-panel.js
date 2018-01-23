const introPanel = document.getElementById("tracking-protection-study-intro-panel-box");

// get width and height of panel after it's loaded
function getPanelDimensions() {
  // get the DOMRect object of panel element, not JSON-able
  const dimensions = introPanel.getBoundingClientRect();
  return { width: dimensions.width, height: dimensions.height };
}

function addCustomContent(data) {
  console.log(data);
}

function onChromeListening() {
  console.log("TPStudy: JSM ready to receive messages from page script.");
  if (document.readyState === "complete") {
    handleLoad();
  } else {
    document.addEventListener("load", handleLoad);
  }

  function handleLoad() {
    const dimensions = getPanelDimensions();
    sendMessageToChrome(
      "FocusedCFR::browserResize",
      JSON.stringify(dimensions)
    );
  }
}
