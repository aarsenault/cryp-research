import { CYCLES } from "./config.js";

export async function loadPriceData() {
  const res = await fetch("data/btc-daily.json");
  if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
  const data = await res.json();
  return data.map((d) => ({ date: d.date, close: d.close }));
}

function findDateIndex(prices, dateStr) {
  for (let i = 0; i < prices.length; i++) {
    if (prices[i].date >= dateStr) return i;
  }
  return prices.length - 1;
}

function findBottom(prices, fromIndex, toIndex) {
  let minPrice = Infinity;
  let minIndex = fromIndex;
  for (let i = fromIndex; i <= toIndex; i++) {
    if (prices[i].close < minPrice) {
      minPrice = prices[i].close;
      minIndex = i;
    }
  }
  return minIndex;
}

function findRecoveryIndex(prices, athIndex, athPrice, maxIndex) {
  const bottomIdx = findBottom(prices, athIndex, maxIndex);
  for (let i = bottomIdx + 1; i <= maxIndex; i++) {
    if (prices[i].close >= athPrice) return i;
  }
  return maxIndex;
}

// Build cycle data with all segments pre-computed for each range mode
export function buildCycles(prices) {
  const cycles = [];
  for (let i = 0; i < CYCLES.length; i++) {
    const cycle = CYCLES[i];
    const athIndex = findDateIndex(prices, cycle.athDate);
    const athPrice = prices[athIndex].close;

    // Max boundary: next cycle's ATH or end of data
    let maxIndex;
    if (i < CYCLES.length - 1) {
      maxIndex = findDateIndex(prices, CYCLES[i + 1].athDate);
    } else {
      maxIndex = prices.length - 1;
    }

    const bottomIndex = findBottom(prices, athIndex, maxIndex);
    const bottomPrice = prices[bottomIndex].close;

    const recoveryIndex = cycle.isCurrent
      ? maxIndex
      : findRecoveryIndex(prices, athIndex, athPrice, maxIndex);

    // Pre-compute points for each range mode:

    // "top-to-bottom": ATH → cycle bottom
    const topToBottom = [];
    for (let j = athIndex; j <= bottomIndex; j++) {
      const day = j - athIndex;
      topToBottom.push({
        day,
        drawdownPct: ((prices[j].close - athPrice) / athPrice) * 100,
        normalized: prices[j].close / athPrice,
        price: prices[j].close,
        date: prices[j].date,
      });
    }

    // "bottom-to-top": bottom → recovery to ATH (or next ATH / current)
    const bottomToTop = [];
    const btEnd = cycle.isCurrent ? maxIndex : recoveryIndex;
    for (let j = bottomIndex; j <= btEnd; j++) {
      const day = j - bottomIndex;
      bottomToTop.push({
        day,
        gainPct: ((prices[j].close - bottomPrice) / bottomPrice) * 100,
        normalized: prices[j].close / bottomPrice,
        price: prices[j].close,
        date: prices[j].date,
      });
    }

    // "full-run": ATH → next ATH (full cycle)
    const fullRun = [];
    for (let j = athIndex; j <= maxIndex; j++) {
      const day = j - athIndex;
      fullRun.push({
        day,
        drawdownPct: ((prices[j].close - athPrice) / athPrice) * 100,
        normalized: prices[j].close / athPrice,
        price: prices[j].close,
        date: prices[j].date,
      });
    }

    cycles.push({
      ...cycle,
      athPrice,
      athIndex,
      bottomPrice,
      bottomIndex,
      bottomDate: prices[bottomIndex].date,
      recoveryIndex,
      maxIndex,
      topToBottom,
      bottomToTop,
      fullRun,
      isComplete: !cycle.isCurrent,
    });
  }
  return cycles;
}

// Get the active points array for a cycle given the current range mode
export function getCyclePoints(cycle, rangeMode) {
  switch (rangeMode) {
    case "top-to-bottom":
      return cycle.topToBottom;
    case "bottom-to-top":
      return cycle.bottomToTop;
    case "full-run":
      return cycle.fullRun;
    default:
      return cycle.topToBottom;
  }
}
