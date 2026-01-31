-- Portfolio snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  total_value REAL NOT NULL,
  chain_breakdown TEXT NOT NULL, -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_address_timestamp
  ON portfolio_snapshots(address, timestamp);

-- Position snapshots table
CREATE TABLE IF NOT EXISTS position_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  chain TEXT NOT NULL,
  position_type TEXT NOT NULL,
  net_value REAL NOT NULL,
  asset_value REAL NOT NULL,
  debt_value REAL NOT NULL,
  tokens TEXT NOT NULL, -- JSON
  rewards TEXT, -- JSON
  pool_info TEXT, -- JSON
  apy_data TEXT, -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_position_address_timestamp
  ON position_snapshots(address, timestamp);
CREATE INDEX IF NOT EXISTS idx_position_protocol
  ON position_snapshots(protocol, chain);

-- Reward history table
CREATE TABLE IF NOT EXISTS reward_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  value REAL NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reward_address_timestamp
  ON reward_history(address, timestamp);
CREATE INDEX IF NOT EXISTS idx_reward_protocol_token
  ON reward_history(protocol, token_symbol);

-- APY history table
CREATE TABLE IF NOT EXISTS apy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol TEXT NOT NULL,
  chain TEXT NOT NULL,
  pool_id TEXT,
  timestamp INTEGER NOT NULL,
  apy REAL NOT NULL,
  apy_base REAL,
  apy_reward REAL,
  apy_mean_30d REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_apy_protocol_timestamp
  ON apy_history(protocol, chain, timestamp);
CREATE INDEX IF NOT EXISTS idx_apy_pool
  ON apy_history(pool_id, timestamp);

-- Transaction history table
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  tx_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  type_name TEXT NOT NULL,
  protocol TEXT,
  gas_fee_usd REAL NOT NULL DEFAULT 0,
  sends TEXT NOT NULL, -- JSON array
  receives TEXT NOT NULL, -- JSON array
  is_scam INTEGER NOT NULL DEFAULT 0,
  raw_data TEXT, -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(address, tx_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_address_timestamp
  ON transactions(address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_chain
  ON transactions(address, chain, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type
  ON transactions(address, type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_protocol
  ON transactions(address, protocol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_id
  ON transactions(tx_id);

-- Pool claim dates table (for APY calculation based on rewards)
CREATE TABLE IF NOT EXISTS pool_claim_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  protocol TEXT NOT NULL,
  chain TEXT NOT NULL,
  pool_id TEXT,
  last_claim_date INTEGER NOT NULL DEFAULT 1767225600, -- Jan 1, 2026 00:00:00 UTC
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(address, protocol, chain, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_claim_address
  ON pool_claim_dates(address);
CREATE INDEX IF NOT EXISTS idx_pool_claim_lookup
  ON pool_claim_dates(address, protocol, chain, pool_id);
