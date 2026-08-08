# DeBank Portfolio Skill

An agent skill that scrapes a full crypto portfolio snapshot from [DeBank](https://debank.com) via browser automation, and persists it to SQLite for historical tracking.

Built because DeBank has no public API for DeFi position data — the numbers only exist in the rendered page.

## What it captures

- Wallet balances and chain allocations
- DeFi positions: lending, staking, liquidity pools
- Health rates on borrow positions
- Claimable rewards
- Uniswap LP position NFTs **with entry prices**, via OpenSea

Entry prices are the reason for the OpenSea leg — DeBank shows you what an LP position is worth now, not what you paid for it, so PnL is unrecoverable from DeBank alone.

## Requirements

| | |
|---|---|
| Playwright MCP | Browser automation for DeBank navigation |
| OpenSea MCP | LP position NFTs and entry prices (optional) |
| Node.js 18+ | Persistence scripts |
| SQLite | Historical snapshot storage |

See [`references/setup-guide.md`](references/setup-guide.md) for installation.

## Usage

```bash
scrape-portfolio <wallet_address>
scrape-portfolio --all          # multiple wallets from a config file
```

## Layout

```
SKILL.md                              agent instructions (the actual skill)
scripts/db-client.ts                  SQLite client
scripts/debank-snapshot-saver.ts      snapshot persistence
references/schema.sql                 database schema
references/debank-portfolio-schema.json
references/setup-guide.md
```

## Install

Drop into your agent's skills directory:

```bash
git clone https://github.com/RoXsaita/debank-portfolio-skill.git ~/.claude/skills/debank-portfolio-skill
```

## License

MIT
