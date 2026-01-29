// ============================================================================
// POOL ENGINE - Core trading logic for the liquidity pool
// ============================================================================

import { GAME_CONSTANTS } from '../types/game';

const { HOUSE_FEE_PERCENT, INITIAL_TOKEN_SUPPLY, BASE_PRICE, MIN_TRADE_SOL } = GAME_CONSTANTS;

// ============================================================================
// POOL STATE
// ============================================================================

export interface Pool {
  solBalance: number;
  tokenSupply: number;
  accumulatedFees: number;
}

export interface TradeCalculation {
  grossAmount: number;
  fee: number;
  netAmount: number;
  tokensTransferred: number;
  newPrice: number;
  newPoolSolBalance: number;
  newTokenSupply: number;
  priceImpact: number;
}

// ============================================================================
// PRICE CALCULATION
// ============================================================================

/**
 * Calculate current price based on pool state
 * Price = SOL in pool / Token supply
 * When pool is empty, price starts at BASE_PRICE (1.00x)
 */
export function getPrice(pool: Pool): number {
  if (pool.solBalance <= 0 || pool.tokenSupply <= 0) {
    return BASE_PRICE;
  }
  return pool.solBalance / pool.tokenSupply;
}

/**
 * Get price multiplier for display (e.g., 1.00x, 2.50x)
 */
export function getPriceMultiplier(pool: Pool): number {
  return getPrice(pool) / BASE_PRICE;
}

// ============================================================================
// BUY CALCULATION
// ============================================================================

/**
 * Calculate tokens received for a given SOL amount
 * Uses constant product formula: x * y = k
 * 
 * When buying:
 * 1. Player sends SOL
 * 2. 2% fee is deducted
 * 3. Net SOL goes into pool
 * 4. Tokens come out based on new ratio
 */
export function calculateBuy(pool: Pool, solAmount: number): TradeCalculation {
  if (solAmount < MIN_TRADE_SOL) {
    throw new Error(`Minimum trade is ${MIN_TRADE_SOL} SOL`);
  }

  const startPrice = getPrice(pool);
  
  // Calculate fee
  const fee = solAmount * (HOUSE_FEE_PERCENT / 100);
  const netSolIn = solAmount - fee;

  // If pool is empty (first buy), use simple calculation
  if (pool.solBalance <= 0) {
    // First buyer sets the initial price
    // They get tokens at BASE_PRICE
    const tokensOut = netSolIn / BASE_PRICE;
    const newPoolSol = netSolIn;
    const newTokenSupply = INITIAL_TOKEN_SUPPLY - tokensOut;
    const newPrice = newPoolSol / newTokenSupply;
    
    return {
      grossAmount: solAmount,
      fee,
      netAmount: netSolIn,
      tokensTransferred: tokensOut,
      newPrice,
      newPoolSolBalance: newPoolSol,
      newTokenSupply,
      priceImpact: ((newPrice - startPrice) / startPrice) * 100,
    };
  }

  // Constant product: k = sol * tokens
  const k = pool.solBalance * pool.tokenSupply;
  
  // New SOL balance after adding
  const newPoolSol = pool.solBalance + netSolIn;
  
  // New token supply (k / newSol)
  const newTokenSupply = k / newPoolSol;
  
  // Tokens out = old supply - new supply
  const tokensOut = pool.tokenSupply - newTokenSupply;
  
  // New price
  const newPrice = newPoolSol / newTokenSupply;
  
  // Price impact
  const priceImpact = ((newPrice - startPrice) / startPrice) * 100;

  return {
    grossAmount: solAmount,
    fee,
    netAmount: netSolIn,
    tokensTransferred: tokensOut,
    newPrice,
    newPoolSolBalance: newPoolSol,
    newTokenSupply,
    priceImpact,
  };
}

// ============================================================================
// SELL CALCULATION
// ============================================================================

/**
 * Calculate SOL received for selling tokens
 * 
 * When selling:
 * 1. Player sends tokens back to pool
 * 2. SOL comes out based on new ratio
 * 3. 2% fee is deducted from SOL out
 * 4. Player receives net SOL
 */
export function calculateSell(pool: Pool, tokenAmount: number): TradeCalculation {
  if (pool.solBalance <= 0) {
    throw new Error('No liquidity in pool');
  }

  const startPrice = getPrice(pool);
  
  // Calculate SOL value of tokens
  // Constant product: k = sol * tokens
  const k = pool.solBalance * pool.tokenSupply;
  
  // New token supply after adding tokens back
  const newTokenSupply = pool.tokenSupply + tokenAmount;
  
  // New SOL balance (k / newTokens)
  const newPoolSol = k / newTokenSupply;
  
  // SOL out = old balance - new balance
  const grossSolOut = pool.solBalance - newPoolSol;
  
  // Calculate fee
  const fee = grossSolOut * (HOUSE_FEE_PERCENT / 100);
  const netSolOut = grossSolOut - fee;
  
  // New price
  const newPrice = newPoolSol / newTokenSupply;
  
  // Price impact (negative for sells)
  const priceImpact = ((newPrice - startPrice) / startPrice) * 100;

  return {
    grossAmount: grossSolOut,
    fee,
    netAmount: netSolOut,
    tokensTransferred: tokenAmount,
    newPrice,
    newPoolSolBalance: newPoolSol,
    newTokenSupply,
    priceImpact,
  };
}

/**
 * Calculate SOL received for selling a specific SOL value worth of tokens
 * This is used when user inputs SOL amount to sell
 */
export function calculateSellBySolValue(pool: Pool, solValue: number): TradeCalculation & { tokensNeeded: number } {
  if (solValue < MIN_TRADE_SOL) {
    throw new Error(`Minimum trade is ${MIN_TRADE_SOL} SOL`);
  }
  
  if (pool.solBalance <= 0) {
    throw new Error('No liquidity in pool');
  }

  // Estimate tokens needed for this SOL value (iterative approach)
  // Start with simple price-based estimate
  const currentPrice = getPrice(pool);
  let tokensNeeded = solValue / currentPrice;
  
  // Adjust for slippage (tokens needed will be slightly higher due to price impact)
  // Use binary search to find exact amount
  let low = tokensNeeded * 0.5;
  let high = tokensNeeded * 2;
  
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const result = calculateSell(pool, mid);
    
    if (Math.abs(result.netAmount - solValue) < 0.0001) {
      tokensNeeded = mid;
      break;
    }
    
    if (result.netAmount < solValue) {
      low = mid;
    } else {
      high = mid;
    }
    tokensNeeded = mid;
  }
  
  const result = calculateSell(pool, tokensNeeded);
  
  return {
    ...result,
    tokensNeeded,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateBuy(solAmount: number, walletBalance: number): string | null {
  if (solAmount < MIN_TRADE_SOL) {
    return `Minimum trade is ${MIN_TRADE_SOL} SOL`;
  }
  if (solAmount > walletBalance) {
    return 'Insufficient balance';
  }
  return null;
}

export function validateSell(tokenAmount: number, playerTokenBalance: number, pool: Pool): string | null {
  if (tokenAmount <= 0) {
    return 'Invalid token amount';
  }
  if (tokenAmount > playerTokenBalance) {
    return 'Not enough tokens';
  }
  if (pool.solBalance <= 0) {
    return 'No liquidity in pool';
  }
  return null;
}

// ============================================================================
// FORFEITURE CALCULATION
// ============================================================================

/**
 * Calculate the SOL value of tokens that would be forfeited
 */
export function calculateForfeitureValue(pool: Pool, tokenAmount: number): number {
  if (tokenAmount <= 0 || pool.solBalance <= 0) {
    return 0;
  }
  
  try {
    const result = calculateSell(pool, tokenAmount);
    return result.grossAmount; // Gross value (before fee) goes to house
  } catch {
    return 0;
  }
}

// ============================================================================
// POOL HELPERS
// ============================================================================

/**
 * Create initial pool state
 */
export function createInitialPool(): Pool {
  return {
    solBalance: 0,
    tokenSupply: INITIAL_TOKEN_SUPPLY,
    accumulatedFees: 0,
  };
}

/**
 * Apply a buy trade to pool state (mutates)
 */
export function applyBuy(pool: Pool, calculation: TradeCalculation): void {
  pool.solBalance = calculation.newPoolSolBalance;
  pool.tokenSupply = calculation.newTokenSupply;
  pool.accumulatedFees += calculation.fee;
}

/**
 * Apply a sell trade to pool state (mutates)
 */
export function applySell(pool: Pool, calculation: TradeCalculation): void {
  pool.solBalance = calculation.newPoolSolBalance;
  pool.tokenSupply = calculation.newTokenSupply;
  pool.accumulatedFees += calculation.fee;
}
