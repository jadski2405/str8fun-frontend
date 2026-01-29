// ============================================================================
// PUMPIT GAME TYPES
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
  status: 'active' | 'completed' | 'cancelled';
  duration_seconds: number;
  house_fee_percent: number;
  pool_sol_balance: number;
  pool_token_supply: number;
  current_price: number;
  accumulated_fees: number;
  forfeited_sol: number;
  created_at: string;
  started_at: string;
  ended_at: string | null;
  settlement_tx_signature: string | null;
}

export interface PlayerPosition {
  id: string;
  round_id: string;
  profile_id: string;
  token_balance: number;
  total_sol_in: number;
  total_sol_out: number;
  total_fees_paid: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  round_id: string;
  profile_id: string;
  trade_type: 'buy' | 'sell';
  sol_amount: number;
  fee_amount: number;
  net_amount: number;
  token_amount: number;
  price_at_trade: number;
  tx_signature: string | null;
  created_at: string;
}

export interface Forfeiture {
  id: string;
  round_id: string;
  profile_id: string;
  tokens_forfeited: number;
  sol_value_forfeited: number;
  created_at: string;
}

export interface RoundSettlement {
  id: string;
  round_id: string;
  accumulated_fees: number;
  forfeited_sol: number;
  total_to_house: number;
  tx_signature: string;
  settled_at: string;
}

// ============================================================================
// POOL STATE
// ============================================================================

export interface PoolState {
  roundId: string;
  solBalance: number;
  tokenSupply: number;
  currentPrice: number;
  accumulatedFees: number;
  startedAt: Date;
  endsAt: Date;
  timeRemaining: number; // seconds
}

// ============================================================================
// TRADE TYPES
// ============================================================================

export interface TradeRequest {
  roundId: string;
  profileId: string;
  tradeType: 'buy' | 'sell';
  solAmount: number;
  txSignature?: string; // For buy transactions
}

export interface TradeResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  trade?: {
    id: string;
    tradeType: 'buy' | 'sell';
    solAmount: number;
    feeAmount: number;
    netAmount: number;
    tokenAmount: number;
    priceAtTrade: number;
    newPrice: number;
    newPoolBalance: number;
  };
  position?: {
    tokenBalance: number;
    totalSolIn: number;
    totalSolOut: number;
  };
}

// ============================================================================
// REALTIME EVENTS
// ============================================================================

export interface PriceTickEvent {
  roundId: string;
  price: number;
  poolSolBalance: number;
  tokenSupply: number;
  timeRemaining: number;
}

export interface TradeEvent {
  roundId: string;
  profileId: string;
  tradeType: 'buy' | 'sell';
  solAmount: number;
  tokenAmount: number;
  newPrice: number;
  timestamp: string;
}

export interface RoundEndEvent {
  roundId: string;
  finalPrice: number;
  totalVolume: number;
  totalFees: number;
  forfeitedSol: number;
  nextRoundId: string;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const TradeErrors = {
  MIN_TRADE: { code: 'MIN_TRADE', message: 'Minimum trade is 0.01 SOL' },
  MAX_TRADE: { code: 'MAX_TRADE', message: 'Maximum trade exceeded' },
  INSUFFICIENT_BALANCE: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough SOL in wallet' },
  INSUFFICIENT_TOKENS: { code: 'INSUFFICIENT_TOKENS', message: 'Not enough tokens to sell' },
  INSUFFICIENT_LIQUIDITY: { code: 'INSUFFICIENT_LIQUIDITY', message: 'Not enough liquidity in pool' },
  ROUND_NOT_ACTIVE: { code: 'ROUND_NOT_ACTIVE', message: 'Round is not active' },
  ROUND_ENDED: { code: 'ROUND_ENDED', message: 'Round has ended' },
  INVALID_SIGNATURE: { code: 'INVALID_SIGNATURE', message: 'Invalid transaction signature' },
  TX_FAILED: { code: 'TX_FAILED', message: 'Transaction failed' },
  RATE_LIMITED: { code: 'RATE_LIMITED', message: 'Too many trades, slow down' },
} as const;

export type TradeErrorCode = keyof typeof TradeErrors;

// ============================================================================
// CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = {
  MIN_TRADE_SOL: 0.01,
  HOUSE_FEE_PERCENT: 2,
  ROUND_DURATION_SECONDS: 30,
  INITIAL_TOKEN_SUPPLY: 1_000_000,
  BASE_PRICE: 0.000001, // 1.00x multiplier
  TICK_INTERVAL_MS: 250,
} as const;
