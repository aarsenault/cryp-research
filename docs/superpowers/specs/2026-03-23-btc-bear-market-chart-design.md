# BTC Bear Market Comparison Chart — Design Spec

## Overview

A standalone HTML + D3.js visualization that overlays Bitcoin's historical bear market cycles, normalized by days from each cycle's all-time high (ATH). Inspired by Benjamin Cowen's "Into the Cryptoverse" bear market comparison chart. A second chart shows the inverse — bull market rallies normalized by days from cycle bottom.

## Project Structure

```
cryp-research/
├── index.html          # Main page with both charts rendered via D3.js
├── fetch-data.js       # Node script for incremental CoinGecko data fetching
├── data/
│   └── btc-daily.json  # Cached daily BTC close prices
```

## Cycle Definitions

Hardcoded cycle ATH dates and prices. The 2011 cycle is available but hidden by default (too early/illiquid to be representative).

| Cycle | ATH Price | ATH Date | Bottom Date (approx) |
|-------|-----------|----------|---------------------|
| 2011  | ~$31      | Jun 8, 2011  | Nov 18, 2011 (~$2) |
| 2013  | ~$1,150   | Nov 30, 2013 | Jan 14, 2015 (~$170) |
| 2017  | ~$19,783  | Dec 17, 2017 | Dec 15, 2018 (~$3,200) |
| 2021  | ~$68,789  | Nov 10, 2021 | Nov 21, 2022 (~$15,500) |
| 2025  | ~$126,198 | Oct 6, 2025  | TBD (current cycle) |

Bottom dates are auto-detected from the data as the lowest daily close between one cycle's ATH and the next cycle's ATH. If BTC surpasses $126,198, the 2025 ATH should be manually updated in the cycle config.

## Data Pipeline

### `fetch-data.js` (Node script)

1. Read `data/btc-daily.json` if it exists
2. Determine the last cached date
3. Fetch only new days from CoinGecko's free API (`/coins/bitcoin/market_chart/range`)
4. **Downsample to daily:** CoinGecko returns hourly data for ranges <90 days. The script must take the last data point per UTC day to ensure consistent daily granularity.
5. Append new daily entries (date + close price) to the cache file
6. If no cache exists, fetch the full history from 2011-01-01
7. **Error handling:** Retry with exponential backoff on API failure (max 3 retries). Validate JSON integrity before writing. Log a warning if fetched data has date gaps. Respect CoinGecko free-tier rate limits (10-30 calls/min).

### `data/btc-daily.json` format

```json
[
  { "date": "2011-01-01", "close": 0.30 },
  { "date": "2011-01-02", "close": 0.31 },
  ...
]
```

## Chart 1: ATH → Next ATH (Bear Market Drawdown & Recovery)

### Titles & Labels
- **Chart title:** "Bitcoin Bear Market Comparison"
- **X-axis label:** "Days From ATH"
- **Y-axis label:** "% Drawdown From ATH" or "Price / ATH" depending on toggle

### X-Axis
- Days since cycle ATH (0, 1, 2, ... N)
- Each cycle extends until the next cycle's ATH date (or current date for the 2025 cycle)

### Y-Axis (togglable)
- **Mode A — Percentage:** 0% at ATH, negative values for drawdown (e.g., -80%)
  - Formula: `(price_on_day_N - ATH_price) / ATH_price * 100`
- **Mode B — Normalized:** 1.0 at ATH, 0.2 = 80% drawdown
  - Formula: `price_on_day_N / ATH_price`

### Lines
- One line per cycle, daily granularity (one data point per day)
- Each cycle gets a distinct color:
  - 2011: gray (#888888, hidden by default)
  - 2013: yellow (#facc15)
  - 2017: orange (#fb923c)
  - 2021: red (#f87171)
  - 2025: cyan (#22d3ee) — current cycle, partial line
- Clickable legend toggles each line on/off

### Statistical Overlays
- **Mean line:** At each day offset N, compute the mean drawdown across all visible completed cycles
- **±1 SD band:** Shaded region around the mean
- **±2 SD band:** Lighter shaded region outside ±1 SD
- SD band toggle: off / ±1 only / ±1 & ±2
- SD bands recalculate when cycles are toggled on/off
- Only completed cycles contribute to SD calculation (not the 2025 partial cycle)
- **Note:** With only 3-4 completed cycles, SD bands are illustrative rather than statistically robust. Require at least 2 visible completed cycles to show bands.

### Hover Interaction
- **Vertical crosshair line** tracks the mouse across the chart
- **Tooltip** shows: day number, each visible cycle's value at that day, mean and SD values

## Chart 2: Cycle Bottom → Next ATH (Bull Market Rally)

### Titles & Labels
- **Chart title:** "Bitcoin Bull Market Comparison"
- **X-axis label:** "Days From Cycle Bottom"
- **Y-axis label:** "% Gain From Bottom" or "Price / Bottom" depending on toggle

### X-Axis
- Days since cycle bottom (0, 1, 2, ... N)

### Y-Axis (togglable)
- **Mode A — Percentage:** 0% at bottom, positive values for recovery
  - Formula: `(price_on_day_N - bottom_price) / bottom_price * 100`
- **Mode B — Normalized:** 1.0 at bottom, values rise toward the next ATH multiple
  - Formula: `price_on_day_N / bottom_price`
- **Log scale toggle** for this chart — bull rallies span 10x-100x, linear compresses early recovery

### Cycle Boundaries
- Each cycle's bull rally runs from that cycle's bottom to the **next** cycle's ATH date
  - 2011 bottom → 2013 ATH
  - 2013 bottom → 2017 ATH
  - 2017 bottom → 2021 ATH
  - 2021 bottom → 2025 ATH
  - 2025 bottom → current date (ongoing)
- Bottoms are auto-detected as the lowest daily close between each cycle's ATH and the next cycle's ATH
- For the 2025 cycle: lowest daily close between Oct 6, 2025 and current date

### Lines, Overlays, Tooltip
- Same behavior as Chart 1 (clickable legend, SD bands, vertical crosshair, hover tooltip)

## UI Controls

Shared control bar above the charts:

1. **Y-Axis Toggle:** "Percentage" ↔ "Normalized" (applies to both charts — Chart 1 shows drawdown, Chart 2 shows gain)
2. **Clickable Legend:** Each cycle name + colored swatch, click to toggle visibility. 2011 starts hidden.
3. **SD Band Toggle:** Off / ±1 SD / ±1 & ±2 SD
4. **Log Scale Toggle:** For Chart 2 only (linear by default)

## Visual Design

- **Dark theme** — dark navy/black background (#0a0a1a), light grid lines, white text
- **Consistent with Cowen's aesthetic** — clean, data-focused, minimal chrome
- Chart takes up the full viewport width with reasonable padding
- Both charts vertically stacked on one page, both visible
- Minimum supported width: 768px

## Technology

- **D3.js v7** loaded from CDN
- **No build step** — served via local HTTP server
- **No framework** — vanilla JS
- Fetch script requires Node.js (for `node fetch-data.js`)

## Usage

```bash
# First run: fetch all historical data
node fetch-data.js

# Subsequent runs: only fetches new days
node fetch-data.js

# View the chart (local server required for JSON loading)
npx serve .
# Then open http://localhost:3000
```
