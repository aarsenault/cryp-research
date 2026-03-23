export function setupControls({
  cycles,
  onToggleCycle,
  onToggleMode,
  onToggleSD,
  onToggleLog,
  onToggleRange,
}) {
  const legendEl = document.getElementById("legend");
  const modeToggle = document.getElementById("mode-toggle");
  const sdToggle = document.getElementById("sd-toggle");
  const logToggle = document.getElementById("log-toggle");
  const rangeToggle = document.getElementById("range-toggle");

  // Build clickable legend
  legendEl.textContent = "";
  for (const cycle of cycles) {
    const item = document.createElement("div");
    item.className = `legend-item${cycle.visible ? "" : " hidden"}`;
    item.dataset.cycle = cycle.name;

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
      onToggleCycle();
    });
    legendEl.appendChild(item);
  }

  // Y-axis mode toggle
  let mode = "percentage";
  modeToggle.textContent = "Percentage";
  modeToggle.addEventListener("click", () => {
    mode = mode === "percentage" ? "normalized" : "percentage";
    modeToggle.textContent =
      mode === "percentage" ? "Percentage" : "Normalized";
    onToggleMode(mode);
  });

  // SD band toggle: Off -> +/-1 -> +/-1&2 -> Off
  let sdLevel = 2;
  const sdLabels = ["SD: Off", "SD: \u00b11", "SD: \u00b11 & \u00b12"];
  sdToggle.textContent = sdLabels[sdLevel];
  sdToggle.addEventListener("click", () => {
    sdLevel = (sdLevel + 1) % 3;
    sdToggle.textContent = sdLabels[sdLevel];
    onToggleSD(sdLevel);
  });

  // Log scale toggle
  let logOn = false;
  logToggle.textContent = "Scale: Linear";
  logToggle.addEventListener("click", () => {
    logOn = !logOn;
    logToggle.textContent = logOn ? "Scale: Log" : "Scale: Linear";
    onToggleLog(logOn);
  });

  // Range mode toggle: Top→Bottom -> Bottom→Top -> Full Run
  let rangeIdx = 0;
  const rangeModes = ["top-to-bottom", "bottom-to-top", "full-run"];
  const rangeLabels = [
    "Range: Top \u2192 Bottom",
    "Range: Bottom \u2192 Top",
    "Range: Full Run",
  ];
  rangeToggle.textContent = rangeLabels[rangeIdx];
  rangeToggle.addEventListener("click", () => {
    rangeIdx = (rangeIdx + 1) % 3;
    rangeToggle.textContent = rangeLabels[rangeIdx];
    onToggleRange(rangeModes[rangeIdx]);
  });

  return {
    getMode: () => mode,
    getSDLevel: () => sdLevel,
    getRangeMode: () => rangeModes[rangeIdx],
  };
}
