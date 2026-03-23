import { CHART_CONFIG } from "./config.js";

// Compute mean and standard deviation bands across visible completed cycles.
// Excludes 2011 cycle from SD calculation (too early/illiquid).
// At each day offset N, computes the mean value across cycles, then the
// standard deviation of how far each cycle deviates from that mean.
export function computeStats(cycles, valueKey) {
  const completedCycles = cycles.filter(
    (c) => c.visible && c.isComplete && c.name !== "2011",
  );

  if (completedCycles.length < CHART_CONFIG.minCyclesForSD) {
    return null;
  }

  const maxDay = Math.max(
    ...completedCycles.map((c) => c.points[c.points.length - 1].day),
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

    const n = values.length;
    const avg = values.reduce((s, v) => s + v, 0) / n;
    // Sample standard deviation (Bessel's correction) for small sample sizes
    const variance =
      n > 1
        ? values.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)
        : 0;
    const sd = Math.sqrt(variance);

    mean.push({ day, value: avg });
    sd1Upper.push({ day, value: avg + sd });
    sd1Lower.push({ day, value: avg - sd });
    sd2Upper.push({ day, value: avg + 2 * sd });
    sd2Lower.push({ day, value: avg - 2 * sd });
  }

  return { mean, sd1Upper, sd1Lower, sd2Upper, sd2Lower };
}
