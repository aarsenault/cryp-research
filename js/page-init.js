import {
  loadPriceData,
  buildCycles,
  buildMidtermCycles,
  getCyclePoints,
} from "./data-processor.js";
import { computeStats } from "./stats.js";
import { createChart } from "./chart.js";
import { setupControls } from "./controls.js";

export async function initPage({ coinName, coinSymbol, dataFile, cycles: cyclesConfig, midtermYears: midtermYearsConfig }) {
  const RANGE_CONFIG = {
    "top-to-bottom": {
      title: `${coinName} Bear Market: Top \u2192 Bottom`,
      xLabel: "Days From ATH",
      pctValueKey: "drawdownPct",
      pctYLabel: "% Drawdown From ATH",
      normYLabel: "Price / ATH",
    },
    "bottom-to-top": {
      title: `${coinName} Bull Market: Bottom \u2192 Top`,
      xLabel: "Days From Cycle Bottom",
      pctValueKey: "gainPct",
      pctYLabel: "% Gain From Bottom",
      normYLabel: "Multiple From Bottom",
    },
    "full-run": {
      title: `${coinName} Full Cycle: ATH \u2192 ATH`,
      xLabel: "Days From ATH",
      pctValueKey: "drawdownPct",
      pctYLabel: "% Drawdown From ATH",
      normYLabel: "Price / ATH",
    },
  };

  const prices = await loadPriceData(dataFile);
  const allCycles = buildCycles(prices, cyclesConfig);
  const midtermCycles = buildMidtermCycles(prices, midtermYearsConfig);

  // Set initial visibility
  for (const c of allCycles) {
    c.visible = cyclesConfig.find((cfg) => cfg.name === c.name).visibleByDefault;
  }
  for (const c of midtermCycles) {
    c.visible = midtermYearsConfig.find((cfg) => cfg.name === c.name).visibleByDefault;
  }

  // Main cycle chart
  const chart = createChart("chart", {
    title: `${coinName} Bear Market: Top \u2192 Bottom`,
    xLabel: "Days From ATH",
  });

  // Midterm year chart
  const midtermChart = createChart("midterm-chart", {
    title: "Midterm Year Drawdown From Jan 1",
    xLabel: "Days From Jan 1",
  });

  let currentMode = "percentage";
  let currentSDLevel = 2;
  let logScale = false;
  let rangeMode = "top-to-bottom";

  function renderChart() {
    const cfg = RANGE_CONFIG[rangeMode];

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

  function renderMidterm() {
    const useNormalized = currentMode === "normalized";
    const valueKey = useNormalized ? "normalized" : "drawdownPct";
    const formatValue = useNormalized
      ? (v) => v.toFixed(3)
      : (v) => `${v.toFixed(1)}%`;
    const yLabel = useNormalized
      ? "Price / Jan 1 Price"
      : "% Change From Jan 1";

    const stats = computeStats(midtermCycles, valueKey);

    midtermChart.render(midtermCycles, stats, {
      valueKey,
      formatValue,
      yLabel,
      logScale: false,
    });
    midtermChart.showSD(currentSDLevel);
  }

  // Build midterm legend
  const midLegendEl = document.getElementById("midterm-legend");
  for (const cycle of midtermCycles) {
    const item = document.createElement("div");
    item.className = `legend-item${cycle.visible ? "" : " hidden"}`;

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = cycle.color;
    item.appendChild(swatch);

    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = cycle.isCurrent
      ? `${cycle.name} (current)`
      : cycle.name;
    item.appendChild(label);

    item.addEventListener("click", () => {
      cycle.visible = !cycle.visible;
      item.classList.toggle("hidden", !cycle.visible);
      renderMidterm();
    });
    midLegendEl.appendChild(item);
  }

  setupControls({
    cycles: allCycles,
    onToggleCycle: () => {
      renderChart();
    },
    onToggleMode: (mode) => {
      currentMode = mode;
      renderChart();
      renderMidterm();
    },
    onToggleSD: (level) => {
      currentSDLevel = level;
      chart.showSD(level);
      midtermChart.showSD(level);
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
  renderMidterm();
}
