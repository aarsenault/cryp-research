import { CYCLES } from "./config.js";
import {
  loadPriceData,
  buildBearCycles,
  buildBullCycles,
} from "./data-processor.js";
import { computeStats } from "./stats.js";
import { createChart } from "./chart.js";
import { setupControls } from "./controls.js";

async function init() {
  const prices = await loadPriceData();

  const bearCycles = buildBearCycles(prices);
  const bullCycles = buildBullCycles(prices);

  // Set initial visibility
  for (const bc of bearCycles) {
    bc.visible = CYCLES.find((c) => c.name === bc.name).visibleByDefault;
  }
  for (const bc of bullCycles) {
    bc.visible = CYCLES.find((c) => c.name === bc.name).visibleByDefault;
  }

  const bearChart = createChart("bear-chart", {
    title: "Bitcoin Bear Market Comparison",
    xLabel: "Days From ATH",
  });

  const bullChart = createChart("bull-chart", {
    title: "Bitcoin Bull Market Comparison",
    xLabel: "Days From Cycle Bottom",
  });

  let currentMode = "percentage";
  let currentSDLevel = 2;
  let logScale = false;

  function renderAll() {
    const bearValueKey =
      currentMode === "percentage" ? "drawdownPct" : "normalized";
    const bullValueKey =
      currentMode === "percentage" ? "gainPct" : "normalized";

    const bearFormatValue =
      currentMode === "percentage"
        ? (v) => `${v.toFixed(1)}%`
        : (v) => v.toFixed(3);
    const bullFormatValue =
      currentMode === "percentage"
        ? (v) => `${v.toFixed(1)}%`
        : (v) => v.toFixed(2);

    const bearStats = computeStats(bearCycles, bearValueKey);
    const bullStats = computeStats(bullCycles, bullValueKey);

    bearChart.render(bearCycles, bearStats, {
      valueKey: bearValueKey,
      formatValue: bearFormatValue,
      yLabel:
        currentMode === "percentage"
          ? "% Drawdown From ATH"
          : "Price / ATH",
      logScale: false,
    });
    bearChart.showSD(currentSDLevel);

    bullChart.render(bullCycles, bullStats, {
      valueKey: bullValueKey,
      formatValue: bullFormatValue,
      yLabel:
        currentMode === "percentage"
          ? "% Gain From Bottom"
          : "Price / Bottom",
      logScale,
    });
    bullChart.showSD(currentSDLevel);
  }

  setupControls({
    cycles: bearCycles,
    onToggleCycle: () => {
      // Sync visibility between bear and bull
      for (const bc of bearCycles) {
        const bull = bullCycles.find((b) => b.name === bc.name);
        if (bull) bull.visible = bc.visible;
      }
      renderAll();
    },
    onToggleMode: (mode) => {
      currentMode = mode;
      renderAll();
    },
    onToggleSD: (level) => {
      currentSDLevel = level;
      bearChart.showSD(level);
      bullChart.showSD(level);
    },
    onToggleLog: (on) => {
      logScale = on;
      renderAll();
    },
  });

  renderAll();
}

init().catch((err) => {
  console.error("Failed to initialize:", err);
  const errEl = document.createElement("p");
  errEl.style.cssText = "color:red;padding:20px;";
  errEl.textContent = `Error loading chart: ${err.message}. Make sure to run "node fetch-data.js" first and serve via HTTP.`;
  document.body.appendChild(errEl);
});
