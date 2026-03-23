import { CHART_CONFIG } from "./config.js";

export function createChart(containerId, { title, xLabel }) {
  const container = document.getElementById(containerId);
  const width = container.clientWidth;
  const height = 500;
  const { margin } = CHART_CONFIG;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = d3
    .select(`#${containerId}`)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().range([0, innerW]);
  let yScale = d3.scaleLinear().range([innerH, 0]);

  const xGrid = g
    .append("g")
    .attr("class", "grid x-grid")
    .attr("transform", `translate(0,${innerH})`);
  const yGrid = g.append("g").attr("class", "grid y-grid");

  const xAxisG = g
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerH})`);
  const yAxisG = g.append("g").attr("class", "axis y-axis");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .text(xLabel);

  const yLabelEl = svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + innerH / 2))
    .attr("y", 15)
    .attr("text-anchor", "middle");

  svg
    .append("text")
    .attr("class", "chart-title")
    .attr("x", margin.left + innerW / 2)
    .attr("y", 24)
    .attr("text-anchor", "middle")
    .text(title);

  const bandGroup = g.append("g").attr("class", "bands");
  const sd2Area = bandGroup.append("path").attr("class", "sd2-band");
  const sd1Area = bandGroup.append("path").attr("class", "sd1-band");
  const meanLinePath = bandGroup.append("path").attr("class", "mean-line");

  const linesGroup = g.append("g").attr("class", "cycle-lines");

  const crosshair = g
    .append("line")
    .attr("class", "crosshair")
    .attr("y1", 0)
    .attr("y2", innerH)
    .style("display", "none");

  const tooltipEl = d3
    .select(`#${containerId}`)
    .append("div")
    .attr("class", "tooltip")
    .style("display", "none");

  const overlay = g
    .append("rect")
    .attr("class", "overlay")
    .attr("width", innerW)
    .attr("height", innerH)
    .style("fill", "none")
    .style("pointer-events", "all");

  let currentSDLevel = 2;

  function render(cycles, stats, { valueKey, formatValue, yLabel, logScale }) {
    const visibleCycles = cycles.filter((c) => c.visible);

    yLabelEl.text(yLabel);

    const maxDay = visibleCycles.length > 0
      ? Math.max(...visibleCycles.map((c) => c.points[c.points.length - 1].day))
      : 100;

    let allValues = visibleCycles.flatMap((c) =>
      c.points.map((p) => p[valueKey])
    );
    if (stats) {
      allValues = allValues.concat(
        stats.sd2Upper.map((p) => p.value),
        stats.sd2Lower.map((p) => p.value)
      );
    }

    const yMin = allValues.length > 0 ? d3.min(allValues) : 0;
    const yMax = allValues.length > 0 ? d3.max(allValues) : 1;
    const yPad = (yMax - yMin) * 0.05;

    xScale.domain([0, maxDay]);

    if (logScale && yMin > 0) {
      yScale = d3
        .scaleLog()
        .domain([Math.max(yMin * 0.9, 0.01), yMax * 1.1])
        .range([innerH, 0]);
    } else {
      yScale = d3
        .scaleLinear()
        .domain([yMin - yPad, yMax + yPad])
        .range([innerH, 0]);
    }

    xAxisG.call(d3.axisBottom(xScale).ticks(10));
    yAxisG.call(
      d3
        .axisLeft(yScale)
        .ticks(8)
        .tickFormat((d) => formatValue(d))
    );

    xGrid.call(
      d3.axisBottom(xScale).ticks(10).tickSize(-innerH).tickFormat("")
    );
    yGrid.call(
      d3.axisLeft(yScale).ticks(8).tickSize(-innerW).tickFormat("")
    );

    const line = d3
      .line()
      .x((d) => xScale(d.day))
      .y((d) => yScale(d[valueKey]))
      .defined((d) => d[valueKey] != null);

    const lines = linesGroup
      .selectAll(".cycle-line")
      .data(visibleCycles, (d) => d.name);
    lines.exit().remove();
    lines
      .enter()
      .append("path")
      .attr("class", "cycle-line")
      .merge(lines)
      .attr("d", (d) => line(d.points))
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", (d) => (d.isCurrent ? 2.5 : 1.5))
      .attr("fill", "none")
      .attr("opacity", 0.9);

    // SD bands (separate area generators to avoid mutation issues)
    if (stats && currentSDLevel > 0) {
      const sd1AreaGen = d3.area()
        .x((d) => xScale(d.day))
        .y0((d) => yScale(d.lower))
        .y1((d) => yScale(d.upper));

      const sd2AreaGen = d3.area()
        .x((d) => xScale(d.day))
        .y0((d) => yScale(d.lower))
        .y1((d) => yScale(d.upper));

      sd1Area
        .datum(
          stats.sd1Upper.map((u, i) => ({
            day: u.day,
            upper: u.value,
            lower: stats.sd1Lower[i].value,
          }))
        )
        .attr("d", sd1AreaGen)
        .attr("fill", CHART_CONFIG.sd1Color)
        .style("display", currentSDLevel >= 1 ? null : "none");

      sd2Area
        .datum(
          stats.sd2Upper.map((u, i) => ({
            day: u.day,
            upper: u.value,
            lower: stats.sd2Lower[i].value,
          }))
        )
        .attr("d", sd2AreaGen)
        .attr("fill", CHART_CONFIG.sd2Color)
        .style("display", currentSDLevel >= 2 ? null : "none");

      const meanLineGen = d3
        .line()
        .x((d) => xScale(d.day))
        .y((d) => yScale(d.value));

      meanLinePath
        .datum(stats.mean)
        .attr("d", meanLineGen)
        .attr("stroke", CHART_CONFIG.meanLineColor)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("fill", "none")
        .style("display", currentSDLevel >= 1 ? null : "none");
    } else {
      sd1Area.style("display", "none");
      sd2Area.style("display", "none");
      meanLinePath.style("display", "none");
    }

    // Hover behavior
    overlay
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const day = Math.round(xScale.invert(mx));
        if (day < 0) return;

        crosshair
          .attr("x1", xScale(day))
          .attr("x2", xScale(day))
          .style("display", null);

        let tooltipContent = `<strong>Day ${day}</strong><br/>`;
        for (const cycle of visibleCycles) {
          if (day < cycle.points.length) {
            const pt = cycle.points[day];
            tooltipContent += `<span style="color:${cycle.color}">${cycle.name}:</span> ${formatValue(pt[valueKey])} ($${pt.price.toLocaleString()})<br/>`;
          }
        }
        if (stats) {
          const meanPt = stats.mean.find((p) => p.day === day);
          if (meanPt) {
            tooltipContent += `<span style="color:${CHART_CONFIG.meanLineColor}">Mean:</span> ${formatValue(meanPt.value)}<br/>`;
          }
        }

        tooltipEl
          .html(tooltipContent)
          .style("display", "block")
          .style("left", `${event.offsetX + 15}px`)
          .style("top", `${event.offsetY - 10}px`);
      })
      .on("mouseleave", function () {
        crosshair.style("display", "none");
        tooltipEl.style("display", "none");
      });
  }

  function showSD(level) {
    currentSDLevel = level;
    sd2Area.style("display", level >= 2 ? null : "none");
    sd1Area.style("display", level >= 1 ? null : "none");
    meanLinePath.style("display", level >= 1 ? null : "none");
  }

  return { render, showSD };
}
