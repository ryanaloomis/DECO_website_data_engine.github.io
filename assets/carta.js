(() => {
  "use strict";

  const requestEndpoint = "https://deco-carta-proxy.ryan-a-loomis.workers.dev/?file=";
  const buttons = [...document.querySelectorAll(".carta-data-button")];
  const status = document.getElementById("cartaStatus");
  const viewer = document.getElementById("cartaViewer");
  const frame = document.getElementById("cartaFrame");
  let requestNumber = 0;

  function setButtonsDisabled(disabled) {
    buttons.forEach(button => { button.disabled = disabled; });
  }

  function validCartaUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "carta.almascience.nrao.edu") {
      throw new Error("ALMA returned an unexpected CARTA URL.");
    }
    return url.href;
  }

  async function launchCarta(button) {
    const filename = button.dataset.file;
    const label = button.textContent.trim();
    const currentRequest = ++requestNumber;

    setButtonsDisabled(true);
    viewer.hidden = true;
    frame.removeAttribute("src");
    status.textContent = `Requesting a CARTA session for ${label}…`;

    try {
      const response = await fetch(`${requestEndpoint}${encodeURIComponent(filename)}`);
      if (!response.ok) {
        throw new Error(`ALMA returned HTTP ${response.status}.`);
      }

      const cartaUrl = validCartaUrl((await response.text()).trim());
      if (currentRequest !== requestNumber) return;

      frame.src = cartaUrl;
      viewer.hidden = false;
      status.textContent = `CARTA session ready for ${label}.`;
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      console.error(error);
      const message = error instanceof TypeError
        ? "ALMA blocked the browser request (CORS); a same-origin backend proxy is required."
        : error.message;
      status.textContent = `Could not start CARTA for ${label}: ${message}`;
    } finally {
      if (currentRequest === requestNumber) setButtonsDisabled(false);
    }
  }

  buttons.forEach(button => button.addEventListener("click", () => launchCarta(button)));
})();
