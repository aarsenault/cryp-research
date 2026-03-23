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

async function fetchRecentFromCoinGecko() {
  console.log("  Fetching recent data from CoinGecko (last 30 days)...");
  const url = `${COINGECKO_URL}?vs_currency=usd&days=30&interval=daily`;
  const data = await fetchWithRetry(url);
  if (data.prices?.length > 0) {
    const entries = parseCoinGeckoData(data.prices);
    console.log(`    Got ${entries.length} recent data points`);
    return entries;
  }
  return [];
}

function mergeEntries(existing, newEntries) {
  const dateSet = new Set(existing.map((e) => e.date));
  const merged = [...existing];
  for (const entry of newEntries) {
    if (!dateSet.has(entry.date)) {
      merged.push(entry);
      dateSet.add(entry.date);
    }
  }
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return merged;
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
  let existing = [];
  let lastDate = "2011-01-01";

  if (existsSync(DATA_FILE)) {
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
  } else {
    console.log("No cache found, fetching full history...");
  }

  const today = new Date().toISOString().split("T")[0];
  const nextDay = new Date(lastDate + "T00:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const startDate = nextDay.toISOString().split("T")[0];

  if (startDate > today) {
    console.log("Cache is up to date.");
    return;
  }

  console.log(`Fetching from ${startDate} to ${today}...`);

  // Fetch historical data from blockchain.info (1-year chunks, daily granularity)
  console.log("Fetching from blockchain.info...");
  const blockchainEntries = await fetchBlockchainChunks(startDate, today);

  // Supplement with CoinGecko for the most recent days (blockchain.info can lag a few days)
  let recentEntries = [];
  try {
    await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    recentEntries = await fetchRecentFromCoinGecko();
  } catch (err) {
    console.warn(
      `CoinGecko supplemental fetch failed (non-fatal): ${err.message}`,
    );
  }

  const allNew = mergeEntries(blockchainEntries, recentEntries);
  // Filter to only entries after lastDate
  const filtered = allNew.filter((e) => e.date > lastDate && e.date <= today);

  if (filtered.length === 0) {
    console.log("No new data returned.");
    return;
  }

  console.log(`Fetched ${filtered.length} new daily entries`);
  const merged = mergeEntries(existing, filtered);
  checkGaps(merged);

  writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} total entries to ${DATA_FILE}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
