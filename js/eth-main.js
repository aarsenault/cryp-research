import { initPage } from "./page-init.js";
import { COIN_NAME, COIN_SYMBOL, DATA_FILE, CYCLES, MIDTERM_YEARS } from "./coins/eth.js";

initPage({ coinName: COIN_NAME, coinSymbol: COIN_SYMBOL, dataFile: DATA_FILE, cycles: CYCLES, midtermYears: MIDTERM_YEARS })
  .catch((err) => {
    console.error("Failed to initialize:", err);
    const errEl = document.createElement("p");
    errEl.style.cssText = "color:red;padding:20px;";
    errEl.textContent = `Error loading chart: ${err.message}. Make sure to run "node fetch-data.js" first and serve via HTTP.`;
    document.body.appendChild(errEl);
  });
