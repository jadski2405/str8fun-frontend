// ============================================================================
// PUMPIT GAME TYPES - Multiplier-based wagering (no AMM/tokens)
// ============================================================================

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface Profile {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar_url: string | null;
  total_volume: number;
  total_pnl: number;
  total_fees_paid: number;
  games_played: number;
  games_won: number;
  created_at: string;
  updated_at: string;
}

export interface GameRound {
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'countdown';
  duration_seconds: number;
  current_price: number;         // Same as price_multiplier (starts at 1.0)
  price_multiplier: number;      // Current multiplier (1.0 = starting price)
  created_at: string;
  started_at: string;
  ended_at: string | null;
}

export interface PlayerPosition {
  sol_wagered: number;           // SOL amount wagered
  entry_multiplier: number;      // Multiplier at time of buy
  current_multiplier: number;    // Current multiplier from server
  current_value: number;         // sol_wagered * (current_multiplier / entry_multiplier)
  pnl: number;                   // current_value - sol_wagered
  pnl_percent: number;           // pnl / sol_wagered * 100
  total_sol_in: number;
  total_sol_out: number;
}

export interface Trade {
  id: string;
  round_id: string;
  profile_id: string;
  trade_type: 'buy' | 'sell';
  sol_amount: number;
  fee_amount: number;
  entry_multiplier: number;
  current_multiplier: number;
  created_at: string;
}

// ============================================================================
// TRADE TYPES
// ============================================================================

export interface TradeRequest {
  trade_type: 'buy' | 'sell';
  sol_amount: number;
}

export interface BuyResult {
  success: boolean;
  error?: string;
  sol_wagered?: number;
  entry_multiplier?: number;
  current_multiplier?: number;
  fee_amount?: number;
  new_balance?: number;
  position?: PlayerPosition;
}

export interface SellResult {
  success: boolean;
  error?: string;
  sol_received?: number;
  entry_multiplier?: number;
  current_multiplier?: number;
  new_balance?: number;
}

// ============================================================================
// REALTIME EVENTS
// ============================================================================

export interface PriceTickEvent {
  roundId: string;
  price: number;             // The multiplier value
  timeRemaining: number;
}

export interface TradeEvent {
  roundId: string;
  profileId: string;
  tradeType: 'buy' | 'sell';
  solAmount: number;
  multiplier: number;
  timestamp: string;
}

export interface RoundEndEvent {
  roundId: string;
  finalMultiplier: number;
  totalVolume: number;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const TradeErrors = {
  MIN_TRADE: { code: 'MIN_TRADE', message: 'Minimum trade is 0.001 SOL' },
  MAX_TRADE: { code: 'MAX_TRADE', message: 'Maximum trade exceeded' },
  INSUFFICIENT_BALANCE: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough SOL deposited' },
  NO_POSITION: { code: 'NO_POSITION', message: 'No active position to sell' },
  ROUND_NOT_ACTIVE: { code: 'ROUND_NOT_ACTIVE', message: 'Round is not active' },
  ROUND_ENDED: { code: 'ROUND_ENDED', message: 'Round has ended' },
  RATE_LIMITED: { code: 'RATE_LIMITED', message: 'Too many trades, slow down' },
} as const;

export type TradeErrorCode = keyof typeof TradeErrors;

// ============================================================================
// CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = {
  MIN_TRADE_SOL: 0.001,
  BUY_FEE_PERCENT: 0.5,       // 0.5% fee on buy only
  TICK_INTERVAL_MS: 50,        // Server sends price every 50ms (20 ticks/sec)
} as const;

// ============================================================================
// REWARDS / XP / LEVELS / KEYS / CHESTS
// ============================================================================

export const TIER_SLUGS = [
  '', 'pleb', 'jeet', 'intern', 'degen', 'ape',
  'chad', 'whale', 'liquidator', 'market_maker', 'sovereign',
] as const;

export const TIER_NAMES = [
  '', 'Pleb', 'Jeet', 'Intern', 'Degen', 'Ape',
  'Chad', 'Whale', 'Liquidator', 'Market Maker', 'Sovereign',
] as const;

export const TIER_COLORS: Record<number, string> = {
  1: '#9CA3AF', // Pleb - gray
  2: '#22C55E', // Jeet - green
  3: '#3B82F6', // Intern - blue
  4: '#A855F7', // Degen - purple
  5: '#F97316', // Ape - orange
  6: '#EAB308', // Chad - gold
  7: '#06B6D4', // Whale - cyan
  8: '#EF4444', // Liquidator - red
  9: '#C0C0C0', // Market Maker - silver
  10: '#FFD700', // Sovereign - gold/rainbow
};

export const tierSlug = (tier: number): string => TIER_SLUGS[tier] || 'pleb';
export const tierIconUrl = (tier: number): string =>
  `https://api.str8.fun/icons/tiers/${tierSlug(tier)}.png`;
export const chestIconUrl = (tier: number): string =>
  `https://api.str8.fun/icons/chests/${tierSlug(tier)}.png`;
export const keyIconUrl = (tier: number): string =>
  `https://api.str8.fun/icons/keys/${tierSlug(tier)}.png`;

export interface TierInfo {
  tier: number;
  name: string;
  slug: string;
  level_min: number;
  level_max: number;
  cooldown_hours: number;
  min_reward: number;
  max_reward: number;
  jackpot_reward: number;
  jackpot_odds: number;
  icon_url?: string;
  chest_url?: string;
  key_url?: string;
}

export interface KeyBalance {
  tier: number;
  balance: number;
}

export interface PlayerXpState {
  xp: number;
  level: number;
  tier: number;
  tier_name: string;
  progress_xp: number;
  needed_xp: number;
  progress_percent: number;
  xp_to_next_level: number;
  next_level_xp: number;
  keys: KeyBalance[];
}

export interface ChestInfo {
  tier: number;
  name: string;
  level_min: number;
  level_max: number;
  is_level_locked: boolean;
  keys_balance: number;
  cooldown_remaining_ms: number;
  next_available_at: number | null;
  is_available: boolean;
  min_reward: number;
  max_reward?: number;
  jackpot_reward: number;
  jackpot_odds: number;
  cooldown_hours: number;
}

export interface ChestOpenResult {
  success: boolean;
  reward_sol?: number;
  is_jackpot?: boolean;
  keys_remaining?: number;
  next_available_at?: number;
  new_balance?: number;
  error?: string;
}

export interface ChestHistoryEntry {
  tier: number;
  reward_sol: number;
  is_jackpot: boolean;
  opened_at: string;
}

// WebSocket event payloads
export interface XpGainEvent {
  type: 'XP_GAIN';
  xp_awarded: number;
  source: 'wager' | 'rekt' | 'daily';
  total_xp: number;
  level: number;
  xp_to_next: number;
}

export interface LevelUpEvent {
  type: 'LEVEL_UP';
  old_level: number;
  new_level: number;
  levels_gained: number;
  tier: number;
  tier_name: string;
  keys_granted: { tier: number; count: number }[];
  total_xp: number;
  xp_to_next: number;
}

export interface ChestRewardEvent {
  type: 'CHEST_REWARD';
  tier: number;
  tier_name: string;
  reward_sol: number;
  is_jackpot: boolean;
  keys_remaining: number;
  next_available_at: number;
  new_balance: number;
}
