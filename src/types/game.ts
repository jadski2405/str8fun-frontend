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
// Tiers are 0-indexed: 0=Pleb, 1=Jeet, ..., 9=Sovereign
// ============================================================================

export const TIER_SLUGS = [
  'pleb', 'jeet', 'intern', 'degen', 'ape',
  'chad', 'whale', 'liquidator', 'market_maker', 'sovereign',
] as const;

export const TIER_NAMES = [
  'Pleb', 'Jeet', 'Intern', 'Degen', 'Ape',
  'Chad', 'Whale', 'Liquidator', 'Market Maker', 'Sovereign',
] as const;

// Level threshold to unlock each tier (index = tier 0-9)
export const TIER_LEVEL_REQ = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export const TIER_COLORS: Record<number, string> = {
  0: '#9CA3AF', // Pleb - gray
  1: '#22C55E', // Jeet - green
  2: '#3B82F6', // Intern - blue
  3: '#A855F7', // Degen - purple
  4: '#F97316', // Ape - orange
  5: '#EAB308', // Chad - gold
  6: '#06B6D4', // Whale - cyan
  7: '#EF4444', // Liquidator - red
  8: '#C0C0C0', // Market Maker - silver
  9: '#FFD700', // Sovereign - gold/rainbow
};

export const tierSlug = (tier: number): string => TIER_SLUGS[tier] || 'pleb';
export const tierIconUrl = (tier: number): string =>
  `https://api.str8.fun/icons/tiers/${tierSlug(tier)}.png`;
export const chestIconUrl = (tier: number): string =>
  `https://api.str8.fun/icons/chests/${tierSlug(tier)}.png`;
export const keyIconUrl = (): string =>
  `https://api.str8.fun/icons/keys/key.png`;

// Round history entry (for round history strip)
export interface RoundResult {
  roundId: string;
  peakMultiplier: number;
  isBust: boolean;           // true if peakMultiplier < 1.0
  thumbnailUrl?: string;     // Backend-rendered chart thumbnail (120×80 PNG)
}

// Loot table entry (returned per tier from /api/rewards/tiers and /api/rewards/chests)
export interface LootTableEntry {
  rarity: string;
  reward_sol: number;
  odds_percent: number;
}

// Rarity name → color map
export const RARITY_COLORS: Record<string, string> = {
  Common:    '#9d9d9d',
  Uncommon:  '#1eff00',
  Rare:      '#0070ff',
  Epic:      '#a335ee',
  Legendary: '#ff8000',
  Mythic:    '#ff4040',
  Ancient:   '#00cccc',
  Immortal:  '#e6cc80',
  Divine:    '#ff69b4',
  Jackpot:   '#ffd700',
};

export interface TierInfo {
  index: number;
  name: string;
  slug: string;
  level_range: number[];        // e.g. [1, 10]
  cooldown_minutes: number;
  xp_to_unlock: number;
  icon_url: string;
  chest_url: string;
  key_url: string;
  loot_table: LootTableEntry[];
}

export interface XpCurveEntry {
  level: number;
  xp_required: number;
  total_xp: number;
  tier: string;
}

export interface PlayerXpState {
  level: number;
  xp: number;
  tier: number;           // tier_index (0-9)
  tier_index?: number;    // alias from API
  xp_progress: number;
  xp_needed: number;
  xp_to_next: number;
  progress_percent: number;
  daily_bonus_available: boolean;
}

export interface ChestInfo {
  tier_index: number;
  tier_name: string;
  slug: string;
  keys: number;
  is_ready: boolean;
  cooldown_ready_at: string | null;
  cooldown_remaining_ms: number;
  cooldown_minutes: number;
  loot_table: LootTableEntry[];
}

export interface ChestOpenResult {
  success?: boolean;
  reward_sol: number;
  rarity: string;
  is_jackpot: boolean;
  tier_name: string;
  new_balance: number;
  cooldown_ready_at: string;
  keys_remaining: number;
  error?: string;
}

export interface ChestHistoryEntry {
  tier: string;             // tier name e.g. "Pleb"
  tier_index: number;
  reward_sol: number;
  is_jackpot: boolean;
  opened_at: string;
}

// WebSocket event payloads
export interface XpGainEvent {
  type: 'XP_GAIN';
  xp_gained: number;
  total_xp: number;
  level: number;
  reason: string;
  timestamp?: number;
}

export interface LevelUpEvent {
  type: 'LEVEL_UP';
  old_level: number;
  new_level: number;
  tier: number | string;               // tier name or index
  keys_awarded: Record<string, number>;
  xp_to_next?: number;
  timestamp?: number;
}

export interface ChestRewardEvent {
  type: 'CHEST_REWARD';
  tier: string;
  tier_index: number;
  rarity: string;
  reward_sol: number;
  is_jackpot: boolean;
  new_balance: number;
  keys_remaining: number;
  cooldown_ready_at: string;
  timestamp?: number;
}

// ============================================================================
// STR8 BLITZ — Weekly trading competition types
// ============================================================================

export interface BlitzParticipant {
  wallet_address: string;
  username: string | null;
  csol_balance: number;
  rank?: number;
}

export interface BlitzStatus {
  success: boolean;
  active: boolean;
  event_id: string | null;
  current_hour: number | null;
  total_hours: number;
  hour_ends_at: string | null;
  participants: BlitzParticipant[];
  next_event_at: string | null;
}

export interface BlitzMeResponse {
  success: boolean;
  participating: boolean;
  csol_balance?: number;
}

export interface BlitzHourWinner {
  hour_number: number;
  winner_username: string | null;
  winner_wallet: string;
  winning_balance: number;
}

export interface BlitzEvent {
  id: string;
  date: string;
  hours: BlitzHourWinner[];
}

export interface BlitzHistoryResponse {
  success: boolean;
  events: BlitzEvent[];
}

// Blitz WebSocket event payloads
export interface BlitzHourStartedEvent {
  type: 'BLITZ_HOUR_STARTED';
  hour_number: number;
  ends_at: string;
  participants: BlitzParticipant[];
  timestamp: number;
}

export interface BlitzHourEndedEvent {
  type: 'BLITZ_HOUR_ENDED';
  hour_number: number;
  winner: BlitzParticipant;
  prize_sol: number;
  timestamp: number;
}

export interface BlitzLeaderboardEvent {
  type: 'BLITZ_LEADERBOARD';
  hour_number: number;
  leaderboard: BlitzParticipant[];
  timestamp: number;
}

export interface BlitzTradeEvent {
  type: 'BLITZ_TRADE';
  wallet_address: string;
  username: string | null;
  trade_type: 'buy' | 'sell';
  csol_amount: number;
  csol_balance: number;
  timestamp: number;
}
