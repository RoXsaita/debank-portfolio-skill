/**
 * SQLite Database Client for Portfolio Data
 * 
 * Provides CRUD operations for portfolio snapshots, positions, rewards, and transactions.
 * 
 * Configuration via environment variables:
 * - DB_PATH: Path to SQLite database (default: ../data/portfolio.db)
 * - SNAPSHOTS_DIR: Path to JSON snapshots directory (default: ../data/snapshots)
 */

import Database from "better-sqlite3";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Types for portfolio snapshots
export interface TokenInfo {
  symbol: string;
  amount: number;
  value_usd: number;
  side?: string;
}

export interface DefiPosition {
  protocol: string;
  chain: string;
  type: string;
  net_value: number;
  asset_value: number;
  debt_value: number;
  tokens: TokenInfo[];
  rewards: TokenInfo[];
  pool_id?: string;
  pool_adapter?: string;
}

export interface PortfolioSnapshot {
  address: string;
  timestamp: string;
  timestamp_unix: number;
  total_usd_value: number;
  chains: Array<{
    id: string;
    name: string;
    value_usd: number;
    percentage?: number;
  }>;
  defi_positions: DefiPosition[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path (configurable via env var)
const DB_PATH =
  process.env.DB_PATH ||
  join(__dirname, "..", "data", "portfolio.db");

// Snapshots directory for JSON files
const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR ||
  join(__dirname, "..", "data", "snapshots");

let db: Database.Database | null = null;

/**
 * Get or create database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = dirname(DB_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Run migrations from schema.sql
    const schemaPath = join(__dirname, "..", "references", "schema.sql");
    if (existsSync(schemaPath)) {
      const schemaSQL = readFileSync(schemaPath, "utf-8");
      db.exec(schemaSQL);
    } else {
      console.error(`Warning: schema.sql not found at ${schemaPath}`);
    }
  }

  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Insert portfolio snapshot
 */
export function insertPortfolioSnapshot(
  address: string,
  timestamp: number,
  totalValue: number,
  chainBreakdown: unknown
): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO portfolio_snapshots (address, timestamp, total_value, chain_breakdown)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    address,
    timestamp,
    totalValue,
    JSON.stringify(chainBreakdown)
  );

  return result.lastInsertRowid as number;
}

/**
 * Insert position snapshot
 */
export function insertPositionSnapshot(data: {
  address: string;
  timestamp: number;
  protocol: string;
  chain: string;
  positionType: string;
  netValue: number;
  assetValue: number;
  debtValue: number;
  tokens: unknown;
  rewards?: unknown;
  poolInfo?: unknown;
  apyData?: unknown;
}): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO position_snapshots
      (address, timestamp, protocol, chain, position_type, net_value, asset_value, debt_value, tokens, rewards, pool_info, apy_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.address,
    data.timestamp,
    data.protocol,
    data.chain,
    data.positionType,
    data.netValue,
    data.assetValue,
    data.debtValue,
    JSON.stringify(data.tokens),
    data.rewards ? JSON.stringify(data.rewards) : null,
    data.poolInfo ? JSON.stringify(data.poolInfo) : null,
    data.apyData ? JSON.stringify(data.apyData) : null
  );

  return result.lastInsertRowid as number;
}

/**
 * Insert reward history
 */
export function insertRewardHistory(
  address: string,
  timestamp: number,
  protocol: string,
  chain: string,
  tokenSymbol: string,
  amount: number,
  value: number
): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO reward_history (address, timestamp, protocol, chain, token_symbol, amount, value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    address,
    timestamp,
    protocol,
    chain,
    tokenSymbol,
    amount,
    value
  );

  return result.lastInsertRowid as number;
}

/**
 * Insert APY history
 */
export function insertAPYHistory(data: {
  protocol: string;
  chain: string;
  poolId?: string;
  timestamp: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
  apyMean30d?: number;
}): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO apy_history (protocol, chain, pool_id, timestamp, apy, apy_base, apy_reward, apy_mean_30d)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.protocol,
    data.chain,
    data.poolId || null,
    data.timestamp,
    data.apy,
    data.apyBase || null,
    data.apyReward || null,
    data.apyMean30d || null
  );

  return result.lastInsertRowid as number;
}

/**
 * Get portfolio snapshots for a time range
 */
export function getPortfolioSnapshots(
  address: string,
  startTime: number,
  endTime: number
): Array<{
  id: number;
  timestamp: number;
  total_value: number;
  chain_breakdown: string;
}> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, timestamp, total_value, chain_breakdown
    FROM portfolio_snapshots
    WHERE address = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `);

  return stmt.all(address, startTime, endTime) as Array<{
    id: number;
    timestamp: number;
    total_value: number;
    chain_breakdown: string;
  }>;
}

/**
 * Get position snapshots for a time range
 */
export function getPositionSnapshots(
  address: string,
  startTime: number,
  endTime: number,
  protocol?: string
): Array<{
  id: number;
  timestamp: number;
  protocol: string;
  chain: string;
  position_type: string;
  net_value: number;
  asset_value: number;
  debt_value: number;
  tokens: string;
  rewards: string | null;
  pool_info: string | null;
  apy_data: string | null;
}> {
  const db = getDatabase();
  let query = `
    SELECT *
    FROM position_snapshots
    WHERE address = ? AND timestamp >= ? AND timestamp <= ?
  `;
  const params: (string | number)[] = [address, startTime, endTime];

  if (protocol) {
    query += " AND protocol = ?";
    params.push(protocol);
  }

  query += " ORDER BY timestamp ASC";

  const stmt = db.prepare(query);
  return stmt.all(...params) as Array<{
    id: number;
    timestamp: number;
    protocol: string;
    chain: string;
    position_type: string;
    net_value: number;
    asset_value: number;
    debt_value: number;
    tokens: string;
    rewards: string | null;
    pool_info: string | null;
    apy_data: string | null;
  }>;
}

/**
 * Get reward history for a time range
 */
export function getRewardHistory(
  address: string,
  startTime: number,
  endTime: number
): Array<{
  id: number;
  timestamp: number;
  protocol: string;
  chain: string;
  token_symbol: string;
  amount: number;
  value: number;
}> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT *
    FROM reward_history
    WHERE address = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `);

  return stmt.all(address, startTime, endTime) as Array<{
    id: number;
    timestamp: number;
    protocol: string;
    chain: string;
    token_symbol: string;
    amount: number;
    value: number;
  }>;
}

/**
 * Get latest portfolio snapshot
 */
export function getLatestPortfolioSnapshot(address: string): {
  id: number;
  timestamp: number;
  total_value: number;
  chain_breakdown: string;
} | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, timestamp, total_value, chain_breakdown
    FROM portfolio_snapshots
    WHERE address = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  return (stmt.get(address) as {
    id: number;
    timestamp: number;
    total_value: number;
    chain_breakdown: string;
  }) || null;
}

/**
 * Save a complete portfolio snapshot to the database
 */
export function saveSnapshotToDatabase(snapshot: PortfolioSnapshot): {
  portfolioId: number;
  positionIds: number[];
  rewardIds: number[];
} {
  const timestamp = snapshot.timestamp_unix;

  // Insert portfolio snapshot
  const portfolioId = insertPortfolioSnapshot(
    snapshot.address,
    timestamp,
    snapshot.total_usd_value,
    snapshot.chains
  );

  const positionIds: number[] = [];
  const rewardIds: number[] = [];

  // Insert each DeFi position
  for (const position of snapshot.defi_positions) {
    const positionId = insertPositionSnapshot({
      address: snapshot.address,
      timestamp,
      protocol: position.protocol,
      chain: position.chain,
      positionType: position.type,
      netValue: position.net_value,
      assetValue: position.asset_value,
      debtValue: position.debt_value,
      tokens: position.tokens,
      rewards: position.rewards,
      poolInfo: position.pool_id
        ? { id: position.pool_id, adapter: position.pool_adapter }
        : null,
    });
    positionIds.push(positionId);

    // Insert rewards into reward_history
    for (const reward of position.rewards) {
      if (reward.value_usd > 0) {
        const rewardId = insertRewardHistory(
          snapshot.address,
          timestamp,
          position.protocol,
          position.chain,
          reward.symbol,
          reward.amount,
          reward.value_usd
        );
        rewardIds.push(rewardId);
      }
    }
  }

  return { portfolioId, positionIds, rewardIds };
}

/**
 * Save a portfolio snapshot to a JSON file
 */
export function saveSnapshotToJson(
  snapshot: PortfolioSnapshot,
  options: { pretty?: boolean } = {}
): string {
  const { pretty = true } = options;

  // Create directory structure: data/snapshots/{address}/
  const addressDir = join(SNAPSHOTS_DIR, snapshot.address.toLowerCase());
  if (!existsSync(addressDir)) {
    mkdirSync(addressDir, { recursive: true });
  }

  // Generate filename with date: YYYY-MM-DD.json
  const date = new Date(snapshot.timestamp);
  const dateStr = date.toISOString().split("T")[0];
  const filename = `${dateStr}.json`;
  const filepath = join(addressDir, filename);

  // Write JSON file
  const content = pretty
    ? JSON.stringify(snapshot, null, 2)
    : JSON.stringify(snapshot);
  writeFileSync(filepath, content, "utf-8");

  return filepath;
}

/**
 * Save a portfolio snapshot to both database and JSON file
 */
export function saveSnapshot(
  snapshot: PortfolioSnapshot
): {
  dbResult: { portfolioId: number; positionIds: number[]; rewardIds: number[] };
  jsonPath: string;
} {
  const dbResult = saveSnapshotToDatabase(snapshot);
  const jsonPath = saveSnapshotToJson(snapshot);

  return { dbResult, jsonPath };
}

/**
 * Check if a snapshot already exists for today
 */
export function hasSnapshotForToday(address: string): boolean {
  const db = getDatabase();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM portfolio_snapshots
    WHERE address = ? AND timestamp >= ? AND timestamp < ?
  `);

  const result = stmt.get(
    address.toLowerCase(),
    Math.floor(startOfDay.getTime() / 1000),
    Math.floor(endOfDay.getTime() / 1000)
  ) as { count: number };

  return result.count > 0;
}

/**
 * Get all snapshots for an address sorted by date
 */
export function getAllSnapshots(
  address: string,
  limit?: number
): Array<{
  id: number;
  timestamp: number;
  total_value: number;
  chain_breakdown: string;
  created_at: number;
}> {
  const db = getDatabase();
  let query = `
    SELECT id, timestamp, total_value, chain_breakdown, created_at
    FROM portfolio_snapshots
    WHERE address = ?
    ORDER BY timestamp DESC
  `;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const stmt = db.prepare(query);
  return stmt.all(address.toLowerCase()) as Array<{
    id: number;
    timestamp: number;
    total_value: number;
    chain_breakdown: string;
    created_at: number;
  }>;
}

/**
 * Get historical portfolio values for charting
 */
export function getPortfolioHistory(
  address: string,
  days: number = 30
): Array<{ date: string; value: number }> {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - days * 24 * 60 * 60;

  // Get one snapshot per day (the latest one)
  const stmt = db.prepare(`
    SELECT 
      date(timestamp, 'unixepoch') as date,
      total_value as value
    FROM portfolio_snapshots
    WHERE address = ? AND timestamp >= ?
    GROUP BY date(timestamp, 'unixepoch')
    ORDER BY timestamp ASC
  `);

  return stmt.all(address.toLowerCase(), startTime) as Array<{
    date: string;
    value: number;
  }>;
}

/**
 * Get claimable rewards total
 */
export function getTotalClaimableRewards(address: string): number {
  const db = getDatabase();

  // Get the latest snapshot timestamp
  const latestStmt = db.prepare(`
    SELECT MAX(timestamp) as latest
    FROM portfolio_snapshots
    WHERE address = ?
  `);
  const latestResult = latestStmt.get(address.toLowerCase()) as { latest: number | null };

  if (!latestResult.latest) return 0;

  // Get rewards from that snapshot
  const rewardsStmt = db.prepare(`
    SELECT COALESCE(SUM(value), 0) as total
    FROM reward_history
    WHERE address = ? AND timestamp = ?
  `);
  const rewardsResult = rewardsStmt.get(
    address.toLowerCase(),
    latestResult.latest
  ) as { total: number };

  return rewardsResult.total;
}
