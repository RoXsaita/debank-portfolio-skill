# Setup Guide

This guide covers prerequisites and installation for the DeBank Portfolio Scraper skill.

## Prerequisites

### 1. Playwright MCP Server

The skill uses Playwright for browser automation to navigate DeBank.

**Installation:**

```bash
# Using npx (recommended)
npx @anthropic/mcp-server-playwright

# Or install globally
npm install -g @anthropic/mcp-server-playwright
```

**MCP Configuration (claude_desktop_config.json or similar):**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-playwright"]
    }
  }
}
```

### 2. OpenSea MCP Server (Optional)

For LP position NFT data with entry prices.

**MCP Configuration:**

```json
{
  "mcpServers": {
    "opensea": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-opensea"],
      "env": {
        "OPENSEA_API_KEY": "your-api-key"
      }
    }
  }
}
```

Get an API key from [OpenSea Developer Portal](https://docs.opensea.io/reference/api-keys).

### 3. Node.js 18+

Required for running the persistence scripts.

```bash
# Check version
node --version  # Should be v18.0.0 or higher

# Install via nvm (recommended)
nvm install 18
nvm use 18
```

### 4. SQLite

Usually included with Node.js. The `better-sqlite3` package handles SQLite operations.

## Installation

### 1. Clone the Skill

```bash
git clone https://github.com/YOUR_USERNAME/debank-portfolio-skill.git
cd debank-portfolio-skill
```

### 2. Install Script Dependencies

```bash
cd scripts
npm install
```

### 3. Configure Paths (Optional)

Set environment variables to customize data storage:

```bash
# Database location
export DB_PATH=/path/to/portfolio.db

# JSON snapshots directory
export SNAPSHOTS_DIR=/path/to/snapshots
```

Default paths (relative to scripts folder):
- Database: `../data/portfolio.db`
- Snapshots: `../data/snapshots/`

### 4. Initialize Database

The database is auto-initialized on first run. To manually initialize:

```bash
cd scripts
npx ts-node -e "import { getDatabase } from './db-client.js'; getDatabase();"
```

## Usage

### Scrape a Portfolio

1. The agent navigates to DeBank using Playwright
2. Extracts portfolio data from the page
3. Optionally fetches NFT data from OpenSea
4. Saves structured JSON to temp file
5. Persists to SQLite database

```bash
# Save snapshot from JSON file
cd scripts
npx ts-node debank-snapshot-saver.ts --file /tmp/portfolio-snapshot.json
```

### Query Historical Data

```bash
sqlite3 data/portfolio.db

# Portfolio value over time
SELECT datetime(timestamp, 'unixepoch') as date, total_value
FROM portfolio_snapshots
WHERE address = '0x...'
ORDER BY timestamp;

# DeFi positions
SELECT datetime(timestamp, 'unixepoch') as date, protocol, net_value
FROM position_snapshots
WHERE address = '0x...'
ORDER BY timestamp;

# Claimable rewards
SELECT datetime(timestamp, 'unixepoch') as date, protocol, token_symbol, value
FROM reward_history
WHERE address = '0x...'
ORDER BY timestamp DESC;
```

## Troubleshooting

### Playwright Issues

**Page doesn't load:**
- Check internet connection
- DeBank may have rate limiting - wait 60 seconds
- Try incognito/private browsing mode

**Elements not found:**
- DeBank UI may have changed
- Take a fresh `browser_snapshot` and inspect element refs

### Database Issues

**"Cannot find module better-sqlite3":**
```bash
cd scripts && npm install
```

**"SQLITE_CANTOPEN":**
- Check DB_PATH is writable
- Ensure parent directory exists

### OpenSea Issues

**"Unauthorized" error:**
- Check OPENSEA_API_KEY is set
- Verify API key is valid

**No LP positions found:**
- Wallet may not have Uniswap V3/V4 positions
- OpenSea only indexes certain NFT collections
