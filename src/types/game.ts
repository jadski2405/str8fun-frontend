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
