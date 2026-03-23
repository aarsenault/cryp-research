import { CYCLES } from "./config.js";
import { loadPriceData, buildCycles, getCyclePoints } from "./data-processor.js";
import { computeStats } from "./stats.js";
import { createChart } from "./chart.js";
import { setupControls } from "./controls.js";

const RANGE_CONFIG = {
  "top-to-bottom": {
    title: "Bitcoin Bear Market: Top \u2192 Bottom",
    xLabel: "Days From ATH",
    pctValueKey: "drawdownPct",
    pctYLabel: "% Drawdown From ATH",
    normYLabel: "Price / ATH",
  },
  "bottom-to-top": {
    title: "Bitcoin Bull Market: Bottom \u2192 Top",
    xLabel: "Days From Cycle Bottom",
    pctValueKey: "gainPct",
    pctYLabel: "% Gain From Bottom",
    normYLabel: "Multiple From Bottom",
  },
  "full-run": {
    title: "Bitcoin Full Cycle: ATH \u2192 ATH",
    xLabel: "Days From ATH",
    pctValueKey: "drawdownPct",
    pctYLabel: "% Drawdown From ATH",
    normYLabel: "Price / ATH",
  },
};

async function init() {
  const prices = await loadPriceData();
  const allCycles = buildCycles(prices);

  // Set initial visibility
  for (const c of allCycles) {
    c.visible = CYCLES.find((cfg) => cfg.name === c.name).visibleByDefault;
  }

  const chart = createChart("chart", {
    title: "Bitcoin Bear Market: Top \u2192 Bottom",
    xLabel: "Days From ATH",
  });

  let currentMode = "percentage";
  let currentSDLevel = 2;
  let logScale = false;
  let rangeMode = "top-to-bottom";

  function renderChart() {
    const cfg = RANGE_CONFIG[rangeMode];

    // Set active points on each cycle based on range mode
    for (const c of allCycles) {
      c.points = getCyclePoints(c, rangeMode);
    }

    const useNormalized = logScale || currentMode === "normalized";
    let valueKey;
    if (useNormalized) {
      valueKey = "normalized";
    } else {
      valueKey = cfg.pctValueKey;
    }

    let formatValue;
    if (useNormalized && rangeMode === "bottom-to-top") {
      formatValue = (v) => `${v.toFixed(1)}x`;
    } else if (useNormalized) {
      formatValue = (v) => v.toFixed(3);
    } else {
      formatValue = (v) => `${v.toFixed(1)}%`;
    }

    const yLabel = useNormalized ? cfg.normYLabel : cfg.pctYLabel;

    const stats = computeStats(allCycles, valueKey);

    chart.updateTitle(cfg.title);
    chart.updateXLabel(cfg.xLabel);

    chart.render(allCycles, stats, {
      valueKey,
      formatValue,
      yLabel,
      logScale: logScale && rangeMode === "bottom-to-top",
    });
    chart.showSD(currentSDLevel);
  }

  setupControls({
    cycles: allCycles,
    onToggleCycle: () => renderChart(),
    onToggleMode: (mode) => {
      currentMode = mode;
      renderChart();
    },
    onToggleSD: (level) => {
      currentSDLevel = level;
      chart.showSD(level);
    },
    onToggleLog: (on) => {
      logScale = on;
      renderChart();
    },
    onToggleRange: (mode) => {
      rangeMode = mode;
      chart.resetZoom();
      renderChart();
    },
  });

  renderChart();
}

init().catch((err) => {
  console.error("Failed to initialize:", err);
  const errEl = document.createElement("p");
  errEl.style.cssText = "color:red;padding:20px;";
  errEl.textContent = `Error loading chart: ${err.message}. Make sure to run "node fetch-data.js" first and serve via HTTP.`;
  document.body.appendChild(errEl);
});
