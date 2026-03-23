import { CHART_CONFIG } from "./config.js";

export function computeStats(cycles, valueKey) {
  const completedCycles = cycles.filter(
    (c) => c.visible && c.isComplete
  );

  if (completedCycles.length < CHART_CONFIG.minCyclesForSD) {
    return null;
  }

  const maxDay = Math.max(
    ...completedCycles.map((c) => c.points[c.points.length - 1].day)
  );

  const mean = [];
  const sd1Upper = [];
  const sd1Lower = [];
  const sd2Upper = [];
  const sd2Lower = [];

  for (let day = 0; day <= maxDay; day++) {
    const values = [];
    for (const cycle of completedCycles) {
      if (day < cycle.points.length) {
        values.push(cycle.points[day][valueKey]);
      }
    }

    if (values.length < CHART_CONFIG.minCyclesForSD) continue;

    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);

    mean.push({ day, value: avg });
    sd1Upper.push({ day, value: avg + sd });
    sd1Lower.push({ day, value: avg - sd });
    sd2Upper.push({ day, value: avg + 2 * sd });
    sd2Lower.push({ day, value: avg - 2 * sd });
  }

  return { mean, sd1Upper, sd1Lower, sd2Upper, sd2Lower };
}
