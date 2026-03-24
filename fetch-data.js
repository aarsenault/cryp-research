import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

const DATA_DIR = "data";
const DATA_FILE = `${DATA_DIR}/btc-daily.json`;
const BINANCE_URL = "https://api.binance.com/api/v3/klines";
const BLOCKCHAIN_URL = "https://api.blockchain.info/charts/market-price";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const CHUNK_DELAY_MS = 500;
// Binance max 1000 candles per request = ~2.7 years of daily data
const BINANCE_CHUNK_DAYS = 1000;

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.error(`Attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, i);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

function toUTCDate(timestampMs) {
  return new Date(timestampMs).toISOString().split("T")[0];
}

function parseCoinGeckoData(prices) {
  const byDate = new Map();
  for (const [tsMs, price] of prices) {
    const date = toUTCDate(tsMs);
    byDate.set(date, price);
  }
  return Array.from(byDate.entries())
    .map(([date, close]) => ({ date, close: Math.round(close * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
function parseBinanceKlines(klines) {
  return klines.map((k) => ({
    date: toUTCDate(k[0]),
    close: Math.round(parseFloat(k[4]) * 100) / 100,
  }));
}

function parseBlockchainData(values) {
  return values.map(({ x, y }) => ({
    date: new Date(x * 1000).toISOString().split("T")[0],
    close: Math.round(y * 100) / 100,
  }));
}

// Fetch daily candles from Binance in chunks (max 1000 per request)
async function fetchBinanceChunks(startDate, endDate) {
  const allEntries = [];
  let currentMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T23:59:59Z").getTime();
  let chunkNum = 0;

  while (currentMs < endMs) {
    chunkNum++;
    const fromDate = toUTCDate(currentMs);
    console.log(`  Binance chunk ${chunkNum}: from ${fromDate}...`);

    const url = `${BINANCE_URL}?symbol=BTCUSDT&interval=1d&startTime=${currentMs}&limit=${BINANCE_CHUNK_DAYS}`;
    const data = await fetchWithRetry(url);

    if (Array.isArray(data) && data.length > 0) {
      const entries = parseBinanceKlines(data);
      allEntries.push(...entries);
      console.log(`    Got ${entries.length} daily candles`);
      // Move past the last candle
      currentMs = data[data.length - 1][0] + 86400000;
    } else {
      break;
    }

    if (currentMs < endMs) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  return allEntries;
}

// Blockchain.info for pre-Binance data (before ~2017)
async function fetchBlockchainChunks(startDate, endDate) {
  const allEntries = [];
  let currentYear = new Date(startDate + "T00:00:00Z").getUTCFullYear();
  const endYear = new Date(endDate + "T00:00:00Z").getUTCFullYear();
  let chunkNum = 0;

  while (currentYear <= endYear) {
    const chunkStart = `${currentYear}-01-01`;
    chunkNum++;
    console.log(`  Blockchain.info chunk ${chunkNum}: ${chunkStart} (1 year)...`);

    const url = `${BLOCKCHAIN_URL}?timespan=1year&start=${chunkStart}&format=json`;
    const data = await fetchWithRetry(url);

    if (data.values?.length > 0) {
      const entries = parseBlockchainData(data.values);
      allEntries.push(...entries);
      console.log(`    Got ${entries.length} data points`);
    }

    currentYear++;
    if (currentYear <= endYear) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  return allEntries;
}

function mergeWithPriority(base, priority) {
  const dateMap = new Map();
  for (const entry of base) {
    dateMap.set(entry.date, entry);
  }
  for (const entry of priority) {
    dateMap.set(entry.date, entry);
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function checkGaps(entries) {
  for (let i = 1; i < entries.length; i++) {
    const diffDays =
      (new Date(entries[i].date) - new Date(entries[i - 1].date)) / 86400000;
    if (diffDays > 3) {
      console.warn(
        `Warning: ${diffDays}-day gap between ${entries[i - 1].date} and ${entries[i].date}`,
      );
    }
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const forceRefresh = process.argv.includes("--force");
  let existing = [];

  if (!forceRefresh && existsSync(DATA_FILE)) {
    try {
      existing = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      if (existing.length > 0) {
        console.log(
          `Cache has ${existing.length} entries, last: ${existing[existing.length - 1].date}`,
        );
      }
    } catch (err) {
      console.error("Cache corrupted, refetching all:", err.message);
      existing = [];
    }
  } else if (forceRefresh) {
    console.log("Force refresh: rebuilding entire cache...");
  } else {
    console.log("No cache found, fetching full history...");
  }

  const today = new Date().toISOString().split("T")[0];

  // Binance BTCUSDT starts around 2017-08-17
  const binanceStart = "2017-08-17";

  // Step 1: Pre-Binance data from blockchain.info (2011 - 2017-08-16)
  let blockchainEntries = [];
  const needOldData = forceRefresh || existing.length === 0;
  if (needOldData) {
    console.log("Fetching pre-2017 data from blockchain.info...");
    blockchainEntries = await fetchBlockchainChunks("2011-01-01", "2017-08-16");
    blockchainEntries = blockchainEntries.filter(
      (e) => e.date < binanceStart,
    );
  }

  // Step 2: Fetch recent data — try Binance first, fall back to CoinGecko
  // (Binance blocks US IPs used by GitHub Actions)
  const lastCachedDate = existing.length > 0 && !forceRefresh
    ? existing[existing.length - 1].date
    : null;

  let recentEntries = [];

  let binanceStartDate = binanceStart;
  if (lastCachedDate && lastCachedDate >= binanceStart && !forceRefresh) {
    binanceStartDate = lastCachedDate;
  }

  try {
    console.log("Fetching from Binance (daily close candles)...");
    recentEntries = await fetchBinanceChunks(binanceStartDate, today);
  } catch (err) {
    console.warn(`Binance failed (${err.message}), falling back to CoinGecko...`);
    try {
      const cgUrl = `${COINGECKO_URL}?vs_currency=usd&days=30&interval=daily`;
      const cgData = await fetchWithRetry(cgUrl);
      if (cgData.prices?.length > 0) {
        recentEntries = parseCoinGeckoData(cgData.prices);
        console.log(`  Got ${recentEntries.length} days from CoinGecko`);
      }
    } catch (cgErr) {
      console.error(`CoinGecko also failed: ${cgErr.message}`);
    }
  }

  // Step 3: Merge — recent data takes priority over everything for overlapping dates
  let merged;
  if (forceRefresh || existing.length === 0) {
    merged = mergeWithPriority(blockchainEntries, recentEntries);
  } else {
    merged = mergeWithPriority(existing, recentEntries);
  }

  merged = merged.filter((e) => e.date <= today);

  if (merged.length === 0) {
    console.log("No data available.");
    return;
  }

  checkGaps(merged);

  writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} total entries to ${DATA_FILE}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
