import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

const DATA_DIR = "data";
const DATA_FILE = `${DATA_DIR}/btc-daily.json`;
const BLOCKCHAIN_URL = "https://api.blockchain.info/charts/market-price";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const CHUNK_DELAY_MS = 1500;

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

function toUTCDate(timestampSec) {
  return new Date(timestampSec * 1000).toISOString().split("T")[0];
}

function parseBlockchainData(values) {
  return values.map(({ x, y }) => ({
    date: toUTCDate(x),
    close: Math.round(y * 100) / 100,
  }));
}

function parseCoinGeckoData(prices) {
  const byDate = new Map();
  for (const [tsMs, price] of prices) {
    const date = new Date(tsMs).toISOString().split("T")[0];
    byDate.set(date, price);
  }
  return Array.from(byDate.entries())
    .map(([date, close]) => ({ date, close: Math.round(close * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBlockchainChunks(startDate, endDate) {
  const allEntries = [];
  let currentYear = new Date(startDate + "T00:00:00Z").getUTCFullYear();
  const endYear = new Date(endDate + "T00:00:00Z").getUTCFullYear();
  let chunkNum = 0;

  while (currentYear <= endYear) {
    const chunkStart = `${currentYear}-01-01`;
    chunkNum++;
    console.log(`  Chunk ${chunkNum}: ${chunkStart} (1 year)...`);

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

async function fetchCoinGeckoDaily(days) {
  console.log(`  Fetching last ${days} days from CoinGecko (daily close)...`);
  const url = `${COINGECKO_URL}?vs_currency=usd&days=${days}&interval=daily`;
  const data = await fetchWithRetry(url);
  if (data.prices?.length > 0) {
    const entries = parseCoinGeckoData(data.prices);
    console.log(`    Got ${entries.length} daily data points from CoinGecko`);
    return entries;
  }
  return [];
}

// Merge two arrays, with "priority" entries overwriting "base" for same dates
function mergeWithPriority(base, priority) {
  const dateMap = new Map();
  for (const entry of base) {
    dateMap.set(entry.date, entry);
  }
  // Priority overwrites base for the same date
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

  // Always refetch CoinGecko data (365 days) to fix blockchain.info inaccuracies
  // Blockchain.info is only used for data older than 365 days
  const forceRefresh = process.argv.includes("--force");

  let existing = [];
  let lastDate = "2011-01-01";

  if (!forceRefresh && existsSync(DATA_FILE)) {
    try {
      existing = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      if (existing.length > 0) {
        lastDate = existing[existing.length - 1].date;
        console.log(`Cache has ${existing.length} entries, last: ${lastDate}`);
      }
    } catch (err) {
      console.error("Cache corrupted, refetching all:", err.message);
      existing = [];
      lastDate = "2011-01-01";
    }
  } else if (forceRefresh) {
    console.log("Force refresh: rebuilding entire cache...");
  } else {
    console.log("No cache found, fetching full history...");
  }

  const today = new Date().toISOString().split("T")[0];

  // Step 1: Fetch old data from blockchain.info if needed
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 365);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  let blockchainEntries = [];
  if (lastDate < cutoff || forceRefresh) {
    const fetchStart = forceRefresh ? "2011-01-01" : lastDate;
    console.log(
      `Fetching historical data from blockchain.info (${fetchStart} to ${cutoff})...`,
    );
    blockchainEntries = await fetchBlockchainChunks(fetchStart, cutoff);
    // Filter to only dates before the CoinGecko cutoff
    blockchainEntries = blockchainEntries.filter(
      (e) => e.date <= cutoff && e.date > (forceRefresh ? "2010-01-01" : lastDate),
    );
  }

  // Step 2: Fetch last 365 days from CoinGecko (accurate daily close prices)
  let coinGeckoEntries = [];
  try {
    await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    coinGeckoEntries = await fetchCoinGeckoDaily(365);
  } catch (err) {
    console.warn(`CoinGecko fetch failed: ${err.message}`);
    console.warn("Falling back to blockchain.info for recent data too");
    // Fallback: fetch recent from blockchain.info
    const recentBlockchain = await fetchBlockchainChunks(cutoff, today);
    blockchainEntries.push(
      ...recentBlockchain.filter((e) => e.date > cutoff),
    );
  }

  // Step 3: Merge — CoinGecko takes priority over blockchain.info for overlapping dates
  // For existing cache, CoinGecko also takes priority (fixes old bad data)
  let merged;
  if (forceRefresh) {
    // Start fresh: blockchain for old, CoinGecko for recent
    merged = mergeWithPriority(blockchainEntries, coinGeckoEntries);
  } else {
    // Incremental: start with cache, add new blockchain data, overlay CoinGecko
    const withBlockchain = mergeWithPriority(existing, blockchainEntries);
    merged = mergeWithPriority(withBlockchain, coinGeckoEntries);
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
