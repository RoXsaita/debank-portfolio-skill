#!/usr/bin/env npx ts-node

/**
 * DeBank Snapshot Saver
 *
 * Saves scraped DeBank portfolio data to SQLite database and JSON files.
 * Maps the DeBank JSON structure to the database schema.
 *
 * Usage:
 *   npx ts-node debank-snapshot-saver.ts '{"metadata":...}'
 *   npx ts-node debank-snapshot-saver.ts --file /path/to/snapshot.json
 *
 * Environment variables:
 *   DB_PATH - Path to SQLite database (default: ../data/portfolio.db)
 *   SNAPSHOTS_DIR - Path to JSON snapshots (default: ../data/snapshots)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as db from "./db-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR ||
  join(__dirname, "..", "data", "snapshots");

// =============================================================================
// DeBank JSON Types (matching debank-portfolio-schema.json)
// =============================================================================

interface DebankMetadata {
  source: string;
  scrapeTimestamp: string;
  dataUpdatedAgo?: string;
  profileUrl: string;
}

interface DebankProfile {
  address: string;
  web3Id?: string | null;
  bio?: string | null;
  accountAgeDays?: number;
  social?: {
    followers: number;
    following: number;
  };
  metrics?: {
    tvf: number;
    earnings: number;
    hiOfferPrice: number;
  };
}

interface ChainAllocation {
  chain: string;
  valueUsd: number;
  percentAllocation: number;
}

interface ProtocolAllocation {
  protocol: string;
  chain?: string;
  valueUsd: number;
}

interface WalletToken {
  symbol: string;
  chain: string;
  contractAddress?: string;
  tokenUrl?: string;
  price: number;
  amount: number;
  valueUsd: number;
}

interface TokenPosition {
  token: string;
  contractAddress?: string;
  amount: number;
  valueUsd: number;
  canWithdraw?: boolean;
  canClaim?: boolean;
}

interface ProtocolPosition {
  type: string;
  healthRate?: number;
  healthRateDisplay?: string;
  supplied?: TokenPosition[];
  borrowed?: TokenPosition[];
  netValueUsd?: number;
  pool?: TokenPosition;
  rewards?: TokenPosition[];
  poolId?: string;
  poolPair?: string;
  tokens?: Array<{ symbol: string; contractAddress?: string }>;
  balance?: Array<{ token: string; amount: number }>;
  totalRewardsUsd?: number;
  totalValueUsd?: number;
  canWithdraw?: boolean;
  canClaim?: boolean;
}

interface Protocol {
  protocol: string;
  chain: string;
  appUrl?: string;
  totalValueUsd: number;
  positions: ProtocolPosition[];
}

interface DebankPortfolio {
  totalValueUsd: number;
  change24h?: {
    percent: number;
    direction: "up" | "down" | "unchanged";
  };
  chainAllocation: ChainAllocation[];
  protocolAllocation: ProtocolAllocation[];
}

interface DebankWallet {
  totalValueUsd: number;
  tokens: WalletToken[];
}

interface DebankSnapshot {
  metadata: DebankMetadata;
  profile: DebankProfile;
  portfolio: DebankPortfolio;
  wallet: DebankWallet;
  protocols: Protocol[];
  summary?: {
    totalWalletValue: number;
    totalDeFiValue: number;
    totalSupplied: number;
    totalBorrowed: number;
    totalLiquidityProvided: number;
    totalClaimableRewards: number;
    activeProtocols: string[];
    activeChains: string[];
  };
}

// =============================================================================
// Mapping Functions
// =============================================================================

function mapPositionType(type: string): string {
  const typeMap: Record<string, string> = {
    "Lending": "Lending",
    "Yield": "Yield",
    "Liquidity Pool": "Liquidity Pool",
    "Staking": "Staking",
    "Farming": "Farming",
  };
  return typeMap[type] || type;
}

function extractTokensForDb(position: ProtocolPosition): Array<{
  symbol: string;
  amount: number;
  value_usd: number;
  side: string;
}> {
  const tokens: Array<{
    symbol: string;
    amount: number;
    value_usd: number;
    side: string;
  }> = [];

  // Add supplied tokens
  if (position.supplied) {
    for (const t of position.supplied) {
      tokens.push({
        symbol: t.token,
        amount: t.amount,
        value_usd: t.valueUsd,
        side: "supply",
      });
    }
  }

  // Add borrowed tokens (negative)
  if (position.borrowed) {
    for (const t of position.borrowed) {
      tokens.push({
        symbol: t.token,
        amount: -Math.abs(t.amount),
        value_usd: -Math.abs(t.valueUsd),
        side: "borrow",
      });
    }
  }

  // Add pool position
  if (position.pool) {
    tokens.push({
      symbol: position.pool.token,
      amount: position.pool.amount,
      value_usd: position.pool.valueUsd,
      side: "lp",
    });
  }

  // Add LP balance tokens
  if (position.balance && position.tokens) {
    for (let i = 0; i < position.balance.length; i++) {
      const bal = position.balance[i];
      tokens.push({
        symbol: bal.token,
        amount: bal.amount,
        value_usd: 0, // LP balances don't have individual USD values
        side: "lp",
      });
    }
  }

  return tokens;
}

function extractRewardsForDb(position: ProtocolPosition): Array<{
  symbol: string;
  amount: number;
  value_usd: number;
  side: string;
}> {
  const rewards: Array<{
    symbol: string;
    amount: number;
    value_usd: number;
    side: string;
  }> = [];

  if (position.rewards) {
    for (const r of position.rewards) {
      rewards.push({
        symbol: r.token,
        amount: r.amount,
        value_usd: r.valueUsd,
        side: "reward",
      });
    }
  }

  return rewards;
}

function calculateNetValue(position: ProtocolPosition): number {
  if (position.netValueUsd !== undefined) {
    return position.netValueUsd;
  }
  if (position.totalValueUsd !== undefined) {
    return position.totalValueUsd;
  }

  let assetValue = 0;
  let debtValue = 0;

  if (position.supplied) {
    assetValue += position.supplied.reduce((sum, t) => sum + t.valueUsd, 0);
  }
  if (position.pool) {
    assetValue += position.pool.valueUsd;
  }
  if (position.borrowed) {
    debtValue += position.borrowed.reduce((sum, t) => sum + t.valueUsd, 0);
  }

  // For reward-only positions, use the total rewards value
  if (assetValue === 0 && debtValue === 0 && position.rewards) {
    assetValue = position.rewards.reduce((sum, r) => sum + r.valueUsd, 0);
  }

  return assetValue - debtValue;
}

function calculateAssetValue(position: ProtocolPosition): number {
  let assetValue = 0;

  if (position.supplied) {
    assetValue += position.supplied.reduce((sum, t) => sum + t.valueUsd, 0);
  }
  if (position.pool) {
    assetValue += position.pool.valueUsd;
  }

  return assetValue;
}

function calculateDebtValue(position: ProtocolPosition): number {
  if (position.borrowed) {
    return position.borrowed.reduce((sum, t) => sum + t.valueUsd, 0);
  }
  return 0;
}

// =============================================================================
// Save Functions
// =============================================================================

interface SaveResult {
  portfolioId: number;
  positionIds: number[];
  rewardIds: number[];
  jsonPath: string;
}

export function saveDebankSnapshot(snapshot: DebankSnapshot): SaveResult {
  const address = snapshot.profile.address.toLowerCase();
  const timestamp = Math.floor(new Date(snapshot.metadata.scrapeTimestamp).getTime() / 1000);

  // 1. Insert portfolio snapshot
  const portfolioId = db.insertPortfolioSnapshot(
    address,
    timestamp,
    snapshot.portfolio.totalValueUsd,
    snapshot.portfolio.chainAllocation.map((c) => ({
      id: c.chain.toLowerCase().replace(/\s+/g, "-"),
      name: c.chain,
      value_usd: c.valueUsd,
      percentage: c.percentAllocation,
    }))
  );

  const positionIds: number[] = [];
  const rewardIds: number[] = [];

  // 2. Insert position snapshots for each protocol
  for (const protocol of snapshot.protocols) {
    for (const position of protocol.positions) {
      const tokens = extractTokensForDb(position);
      const rewards = extractRewardsForDb(position);

      const positionId = db.insertPositionSnapshot({
        address,
        timestamp,
        protocol: protocol.protocol,
        chain: protocol.chain,
        positionType: mapPositionType(position.type),
        netValue: calculateNetValue(position),
        assetValue: calculateAssetValue(position),
        debtValue: calculateDebtValue(position),
        tokens,
        rewards,
        poolInfo: position.poolId
          ? { id: position.poolId, pair: position.poolPair }
          : null,
      });
      positionIds.push(positionId);

      // 3. Insert reward history for claimable rewards
      for (const reward of rewards) {
        if (reward.value_usd > 0) {
          const rewardId = db.insertRewardHistory(
            address,
            timestamp,
            protocol.protocol,
            protocol.chain,
            reward.symbol,
            reward.amount,
            reward.value_usd
          );
          rewardIds.push(rewardId);
        }
      }
    }
  }

  // 4. Save raw JSON to file
  const addressDir = join(SNAPSHOTS_DIR, address);
  if (!existsSync(addressDir)) {
    mkdirSync(addressDir, { recursive: true });
  }

  const date = new Date(snapshot.metadata.scrapeTimestamp);
  const dateStr = date.toISOString().split("T")[0];
  const jsonPath = join(addressDir, `${dateStr}.json`);

  writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf-8");

  return { portfolioId, positionIds, rewardIds, jsonPath };
}

export function formatSaveResult(result: SaveResult, snapshot: DebankSnapshot): string {
  const lines: string[] = [];
  const addr = snapshot.profile.address;

  lines.push(`\nDeBank Snapshot Saved for ${addr.slice(0, 6)}...${addr.slice(-4)}`);
  lines.push("=".repeat(60));
  lines.push(`Total Value: $${snapshot.portfolio.totalValueUsd.toLocaleString()}`);
  lines.push(`Timestamp: ${snapshot.metadata.scrapeTimestamp}`);
  lines.push("");
  lines.push("Database Records:");
  lines.push(`  Portfolio snapshot ID: ${result.portfolioId}`);
  lines.push(`  Position snapshots: ${result.positionIds.length}`);
  lines.push(`  Reward records: ${result.rewardIds.length}`);
  lines.push("");
  lines.push(`JSON saved to: ${result.jsonPath}`);

  return lines.join("\n");
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage:");
    console.error("  npx ts-node debank-snapshot-saver.ts '<json_data>'");
    console.error("  npx ts-node debank-snapshot-saver.ts --file /path/to/snapshot.json");
    console.error("");
    console.error("Environment variables:");
    console.error("  DB_PATH - Path to SQLite database (default: ../data/portfolio.db)");
    console.error("  SNAPSHOTS_DIR - Path to JSON snapshots (default: ../data/snapshots)");
    process.exit(1);
  }

  let jsonData: string;

  if (args[0] === "--file") {
    if (!args[1]) {
      console.error("Error: --file requires a path argument");
      process.exit(1);
    }
    jsonData = readFileSync(args[1], "utf-8");
  } else {
    jsonData = args[0];
  }

  let snapshot: DebankSnapshot;
  try {
    snapshot = JSON.parse(jsonData);
  } catch (error) {
    console.error("Error: Invalid JSON data");
    console.error(error);
    process.exit(1);
  }

  // Validate required fields
  if (!snapshot.metadata?.scrapeTimestamp) {
    console.error("Error: Missing metadata.scrapeTimestamp");
    process.exit(1);
  }
  if (!snapshot.profile?.address) {
    console.error("Error: Missing profile.address");
    process.exit(1);
  }
  if (snapshot.portfolio?.totalValueUsd === undefined) {
    console.error("Error: Missing portfolio.totalValueUsd");
    process.exit(1);
  }

  try {
    const result = saveDebankSnapshot(snapshot);
    console.log(formatSaveResult(result, snapshot));
    process.exit(0);
  } catch (error) {
    console.error("Error saving snapshot:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
