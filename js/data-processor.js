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

// Find where price first recovers back to ATH after the bottom
function findRecoveryIndex(prices, athIndex, athPrice, maxIndex) {
  // First find the bottom
  const bottomIdx = findBottom(prices, athIndex, maxIndex);
  // Then find first day after bottom where price >= ATH
  for (let i = bottomIdx + 1; i <= maxIndex; i++) {
    if (prices[i].close >= athPrice) return i;
  }
  return maxIndex; // never recovered within range
}

export function buildBearCycles(prices) {
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

    // Bear cycle ends when price recovers to ATH (or at max boundary for current cycle)
    let endIndex;
    if (cycle.isCurrent) {
      endIndex = maxIndex;
    } else {
      endIndex = findRecoveryIndex(prices, athIndex, athPrice, maxIndex);
    }

    const points = [];
    for (let j = athIndex; j <= endIndex; j++) {
      const day = j - athIndex;
      const drawdownPct = ((prices[j].close - athPrice) / athPrice) * 100;
      const normalized = prices[j].close / athPrice;
      points.push({ day, drawdownPct, normalized, price: prices[j].close, date: prices[j].date });
    }

    cycles.push({ ...cycle, athPrice, athIndex, endIndex, points, isComplete: !cycle.isCurrent });
  }
  return cycles;
}

export function buildBullCycles(prices) {
  const cycles = [];
  for (let i = 0; i < CYCLES.length; i++) {
    const cycle = CYCLES[i];
    const athIndex = findDateIndex(prices, cycle.athDate);

    let endIndex;
    if (i < CYCLES.length - 1) {
      endIndex = findDateIndex(prices, CYCLES[i + 1].athDate);
    } else {
      endIndex = prices.length - 1;
    }

    const bottomIndex = findBottom(prices, athIndex, endIndex);
    const bottomPrice = prices[bottomIndex].close;

    const points = [];
    for (let j = bottomIndex; j <= endIndex; j++) {
      const day = j - bottomIndex;
      const gainPct = ((prices[j].close - bottomPrice) / bottomPrice) * 100;
      const normalized = prices[j].close / bottomPrice;
      points.push({ day, gainPct, normalized, price: prices[j].close, date: prices[j].date });
    }

    cycles.push({
      ...cycle, bottomPrice, bottomIndex, bottomDate: prices[bottomIndex].date,
      endIndex, points, isComplete: !cycle.isCurrent,
    });
  }
  return cycles;
}
