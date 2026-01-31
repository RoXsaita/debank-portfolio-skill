---
name: debank-portfolio-scraper
description: Scrape comprehensive crypto portfolio data from DeBank using Playwright browser automation. Use when you need to capture wallet balances, DeFi positions (lending, staking, LP), chain allocations, claimable rewards, and health rates. Supports OpenSea integration for LP position NFTs with entry prices. Persists data to SQLite for historical tracking.
---

# DeBank Portfolio Scraper

Scrape comprehensive portfolio snapshots from DeBank using browser automation, with optional OpenSea integration for LP position entry prices.

## Prerequisites

- **Playwright MCP** - Browser automation for DeBank navigation
- **OpenSea MCP** - NFT/LP position data (optional but recommended)
- **Node.js 18+** - For running persistence scripts
- **SQLite** - Database for historical data

See `references/setup-guide.md` for installation details.

## Usage

```
scrape-portfolio <wallet_address>
scrape-portfolio --all  # Scrape multiple wallets from a config file
```

## Data Sources

1. **DeBank (Playwright)** - DeFi positions, wallet balances, health rates
2. **OpenSea API** - NFT holdings (Uniswap LP position NFTs with entry prices)

## Instructions

### Step 1: Navigate to DeBank

```
browser_navigate: https://debank.com/profile/{address}
```

### Step 2: Wait for Page Load

```
browser_wait_for: time=5
```

### Step 3: Take Snapshot

```
browser_snapshot
```

### Step 4: Expand Hidden Chains

Look for "Unfold X chains" in the snapshot. If present:

```
browser_click: ref=<unfold_button_ref>
browser_wait_for: time=2
browser_snapshot
```

### Step 5: Extract Portfolio Data

Parse the snapshot and extract:

**Profile:**
- Total value (e.g., `$36,694`)
- 24h change percentage
- Account age in days

**Chain Allocation:**
- Chain name, value, percentage

**Wallet Tokens:**
- Symbol, chain, price, amount, USD value

**Protocol Positions:**
For each protocol (Aave, Compound, Uniswap, etc.):
- Protocol name and chain
- Position type (Lending, Yield, Liquidity Pool)
- Health rate (for lending positions)
- Supplied assets with amounts and values
- Borrowed assets with amounts and values
- LP balances and pool IDs
- Claimable rewards

### Step 6: Get NFT Data (OpenSea)

Call the OpenSea MCP tool:

```
get_nft_balances:
  address: {wallet_address}
  sortBy: RECEIVED_DATE
  limit: 100
```

This returns Uniswap LP position NFTs with:
- Token ID (pool ID)
- Creation date (position entry date)
- Pool details (token pair, fee tier)

### Step 7: Get NFT Activity History

```
get_activity:
  entityType: profile
  entityId: {wallet_address}
  limit: 100
```

This provides:
- Entry prices for LP positions
- Transaction hashes
- Historical mints/transfers

### Step 8: Structure the Data

Create JSON matching the schema in `references/debank-portfolio-schema.json`:

```json
{
  "metadata": {
    "source": "debank.com + opensea",
    "scrapeTimestamp": "<ISO timestamp>",
    "profileUrl": "https://debank.com/profile/{address}"
  },
  "profile": {
    "address": "0x...",
    "accountAgeDays": 510
  },
  "portfolio": {
    "totalValueUsd": 36694,
    "change24h": { "percent": 0.11, "direction": "up" },
    "chainAllocation": [...],
    "protocolAllocation": [...]
  },
  "wallet": {
    "totalValueUsd": 374,
    "tokens": [...]
  },
  "protocols": [...],
  "nfts": {
    "lpPositions": [...],
    "other": [...]
  },
  "summary": {
    "totalWalletValue": 374,
    "totalDeFiValue": 36320,
    "totalSupplied": 18810,
    "totalBorrowed": 5167,
    "totalLiquidityProvided": 12042,
    "totalClaimableRewards": 105,
    "activeProtocols": ["Aave V3", "Compound V3", "Uniswap V4", "Uniswap V3"],
    "activeChains": ["Arbitrum", "Base", "Scroll"]
  }
}
```

### Step 9: Save Data

After structuring the JSON:

**1. Write to temp file:**
Save the JSON to a temp file (e.g., `/tmp/portfolio-snapshot.json`)

**2. Save JSON snapshot (backup):**
```bash
mkdir -p data/snapshots/{address}
# Write to data/snapshots/{address}/{YYYY-MM-DD}.json
```

**3. Persist to database:**
```bash
cd scripts && npx ts-node debank-snapshot-saver.ts --file /tmp/portfolio-snapshot.json
```

Set environment variables for database location:
- `DB_PATH` - Path to SQLite database (default: `../data/portfolio.db`)
- `SNAPSHOTS_DIR` - Path to JSON snapshots (default: `../data/snapshots`)

**Database records created (each scrape ADDS new rows, doesn't overwrite):**
- `portfolio_snapshots` - Total value + chain breakdown (timestamped)
- `position_snapshots` - Individual DeFi positions (timestamped)
- `reward_history` - Claimable rewards (timestamped)

This builds historical data for trend analysis. Query examples:
```sql
-- Portfolio value over time
SELECT datetime(timestamp, 'unixepoch') as date, total_value
FROM portfolio_snapshots WHERE address = '0x...' ORDER BY timestamp;

-- Position changes over time
SELECT datetime(timestamp, 'unixepoch') as date, protocol, net_value
FROM position_snapshots WHERE address = '0x...' ORDER BY timestamp;
```

### Step 10: Report Results

Provide summary:

```
Portfolio scraped for 0x5a8a...ed45:

TOTAL VALUE: $36,694 (+0.11% 24h)

CHAIN ALLOCATION:
- Arbitrum: $26,011 (71%)
- Base: $10,650 (29%)

DEFI POSITIONS:
- Aave V3 (Arbitrum): $13,643 net (Health: 2.84)
  - Supplied: 18,784 USDC ($18,811)
  - Borrowed: 1.0168 WETH ($3,011) + 0.0241 WBTC ($2,156)
- Compound V3 (Base): $10,635
  - Supplied: 10,584 USDC
  - Rewards: 1.5 COMP ($36)
- Uniswap V4: $6,900
  - Pool #103120: WBTC/USDC
  - Rewards: $50.21
- Uniswap V3: $5,142
  - Pool #4721026: WBTC/WETH
  - Rewards: $18.92

LP POSITIONS (from OpenSea):
- 11 Uniswap position NFTs
- Entry history tracked from Feb 2025

CLAIMABLE REWARDS: $105.27
- COMP: $36.12
- LP Fees: $69.15

Data saved to:
- data/snapshots/{address}/{date}.json
- data/portfolio.db
```

## Rate Limiting

- Wait 30 seconds between multiple wallet scrapes
- If DeBank shows rate limiting, wait 60 seconds and retry

## Error Handling

- Page doesn't load: Report "DeBank unreachable", skip wallet
- No data found: Report "Wallet may be empty or invalid"
- Partial failure: Save what was collected, note errors

## Database Schema

See `references/schema.sql` for full table definitions:

| Table | Purpose |
|-------|---------|
| `portfolio_snapshots` | Total value + chain breakdown per timestamp |
| `position_snapshots` | Individual DeFi positions with tokens/rewards |
| `reward_history` | Claimable rewards over time |
| `apy_history` | APY tracking for protocols |
| `transactions` | Full transaction history |
