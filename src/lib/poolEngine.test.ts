// ============================================================================
// POOL ENGINE TESTS - Verify AMM trading logic
// Run with: npx vitest run src/lib/poolEngine.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  Pool,
  getPrice,
  calculateBuy,
  calculateSell,
} from './poolEngine';
import { GAME_CONSTANTS } from '../types/game';

const { INITIAL_TOKEN_SUPPLY, BASE_PRICE } = GAME_CONSTANTS;

// ============================================================================
// HELPER: Create a pool with some liquidity
// ============================================================================
function createPool(solBalance: number, tokenSupply: number): Pool {
  return { solBalance, tokenSupply, accumulatedFees: 0 };
}

// ============================================================================
// PRICE CALCULATION TESTS
// ============================================================================
describe('Price Calculation', () => {
  it('returns BASE_PRICE for empty pool', () => {
    const pool = createPool(0, INITIAL_TOKEN_SUPPLY);
    expect(getPrice(pool)).toBe(BASE_PRICE);
  });

  it('calculates price as SOL/tokens', () => {
    const pool = createPool(10, 100);
    expect(getPrice(pool)).toBe(0.1); // 10 SOL / 100 tokens
  });

  it('price increases when SOL is added', () => {
    const pool1 = createPool(10, 100);
    const pool2 = createPool(20, 100);
    expect(getPrice(pool2)).toBeGreaterThan(getPrice(pool1));
  });
});

// ============================================================================
// BUY TESTS - Constant Product AMM
// ============================================================================
describe('Buy Calculation', () => {
  it('deducts 2% fee from SOL input', () => {
    const pool = createPool(100, 1000);
    const result = calculateBuy(pool, 10);
    
    expect(result.grossAmount).toBe(10);
    expect(result.fee).toBe(0.2); // 2% of 10
    expect(result.netAmount).toBe(9.8); // 10 - 0.2
  });

  it('follows constant product formula (x * y = k)', () => {
    const pool = createPool(100, 1000);
    const k = pool.solBalance * pool.tokenSupply; // 100,000
    
    const result = calculateBuy(pool, 10);
    
    // After trade: newSol * newTokens should still equal k
    const newK = result.newPoolSolBalance * result.newTokenSupply;
    expect(newK).toBeCloseTo(k, 5);
  });

  it('buying increases price', () => {
    const pool = createPool(100, 1000);
    const priceBefore = getPrice(pool);
    
    const result = calculateBuy(pool, 10);
    
    expect(result.newPrice).toBeGreaterThan(priceBefore);
    expect(result.priceImpact).toBeGreaterThan(0);
  });

  it('larger buys have larger price impact', () => {
    const pool = createPool(100, 1000);
    
    const smallBuy = calculateBuy(pool, 1);
    const largeBuy = calculateBuy(pool, 10);
    
    expect(largeBuy.priceImpact).toBeGreaterThan(smallBuy.priceImpact);
  });

  it('tokens received decreases as pool has more SOL (slippage)', () => {
    const pool1 = createPool(10, 1000);
    const pool2 = createPool(100, 1000);
    
    const buy1 = calculateBuy(pool1, 1);
    const buy2 = calculateBuy(pool2, 1);
    
    // With more SOL in pool, same SOL input gets fewer tokens
    expect(buy2.tokensTransferred).toBeLessThan(buy1.tokensTransferred);
  });

  it('rejects trades below minimum', () => {
    const pool = createPool(100, 1000);
    expect(() => calculateBuy(pool, 0.001)).toThrow('Minimum trade');
  });
});

// ============================================================================
// SELL TESTS - Constant Product AMM
// ============================================================================
describe('Sell Calculation', () => {
  it('deducts 2% fee from SOL output', () => {
    const pool = createPool(100, 1000);
    const result = calculateSell(pool, 100);
    
    expect(result.fee).toBeCloseTo(result.grossAmount * 0.02, 10);
    expect(result.netAmount).toBeCloseTo(result.grossAmount * 0.98, 10);
  });

  it('follows constant product formula (x * y = k)', () => {
    const pool = createPool(100, 1000);
    const k = pool.solBalance * pool.tokenSupply;
    
    const result = calculateSell(pool, 100);
    
    const newK = result.newPoolSolBalance * result.newTokenSupply;
    expect(newK).toBeCloseTo(k, 5);
  });

  it('selling decreases price', () => {
    const pool = createPool(100, 1000);
    const priceBefore = getPrice(pool);
    
    const result = calculateSell(pool, 100);
    
    expect(result.newPrice).toBeLessThan(priceBefore);
    expect(result.priceImpact).toBeLessThan(0);
  });

  it('larger sells have larger (negative) price impact', () => {
    const pool = createPool(100, 1000);
    
    const smallSell = calculateSell(pool, 10);
    const largeSell = calculateSell(pool, 100);
    
    expect(largeSell.priceImpact).toBeLessThan(smallSell.priceImpact);
  });

  it('rejects sell when pool has no liquidity', () => {
    const pool = createPool(0, 1000);
    expect(() => calculateSell(pool, 10)).toThrow('No liquidity');
  });
});

// ============================================================================
// ROUND-TRIP TESTS - Buy then Sell
// ============================================================================
describe('Round-trip Trading', () => {
  it('selling immediately after buying returns less SOL (due to fees + slippage)', () => {
    const pool = createPool(100, 1000);
    const initialSol = 10;
    
    // Buy tokens
    const buyResult = calculateBuy(pool, initialSol);
    
    // Create pool state after buy
    const poolAfterBuy = createPool(
      buyResult.newPoolSolBalance,
      buyResult.newTokenSupply
    );
    
    // Sell all tokens received
    const sellResult = calculateSell(poolAfterBuy, buyResult.tokensTransferred);
    
    // Should get back less than initial due to:
    // 1. 2% buy fee
    // 2. 2% sell fee  
    // 3. Price slippage
    expect(sellResult.netAmount).toBeLessThan(initialSol);
    
    // Calculate total loss percentage
    const lossPercent = ((initialSol - sellResult.netAmount) / initialSol) * 100;
    console.log(`Round-trip loss: ${lossPercent.toFixed(2)}%`);
    
    // Should lose roughly 4% to fees (2% buy + 2% sell) + some slippage
    // Actual: ~3.96% which is correct (slightly less due to compounding)
    expect(lossPercent).toBeGreaterThan(3.9);
    expect(lossPercent).toBeLessThan(10); // Shouldn't be excessive
  });

  it('profitable if price increases enough between buy and sell', () => {
    const pool = createPool(100, 1000);
    const initialSol = 5;
    
    // Player 1 buys
    const buy1 = calculateBuy(pool, initialSol);
    const poolAfterBuy1 = createPool(buy1.newPoolSolBalance, buy1.newTokenSupply);
    
    // Other players buy (simulating price increase)
    const otherBuy = calculateBuy(poolAfterBuy1, 50);
    const poolAfterOthers = createPool(otherBuy.newPoolSolBalance, otherBuy.newTokenSupply);
    
    // Player 1 sells
    const sell1 = calculateSell(poolAfterOthers, buy1.tokensTransferred);
    
    // Should be profitable!
    const profit = sell1.netAmount - initialSol;
    const profitPercent = (profit / initialSol) * 100;
    
    console.log(`Profit after price pump: ${profitPercent.toFixed(2)}%`);
    expect(sell1.netAmount).toBeGreaterThan(initialSol);
  });

  it('loss if price decreases between buy and sell', () => {
    // Start with larger pool
    const pool = createPool(200, 1000);
    const initialSol = 5;
    
    // Player 1 buys first  
    const buy1 = calculateBuy(pool, initialSol);
    const poolAfterBuy1 = createPool(buy1.newPoolSolBalance, buy1.newTokenSupply);
    
    // Other players sell (simulating price dump)
    const otherSell = calculateSell(poolAfterBuy1, 200);
    const poolAfterOthers = createPool(otherSell.newPoolSolBalance, otherSell.newTokenSupply);
    
    // Player 1 sells
    const sell1 = calculateSell(poolAfterOthers, buy1.tokensTransferred);
    
    // Should be a loss
    const loss = initialSol - sell1.netAmount;
    const lossPercent = (loss / initialSol) * 100;
    
    console.log(`Loss after price dump: ${lossPercent.toFixed(2)}%`);
    expect(sell1.netAmount).toBeLessThan(initialSol);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================
describe('Edge Cases', () => {
  it('handles very small trades', () => {
    const pool = createPool(100, 1000);
    const result = calculateBuy(pool, 0.01); // Minimum trade
    
    expect(result.tokensTransferred).toBeGreaterThan(0);
    expect(result.newPrice).toBeGreaterThan(getPrice(pool));
  });

  it('handles very large trades', () => {
    const pool = createPool(100, 1000);
    const result = calculateBuy(pool, 1000); // 10x the pool
    
    expect(result.tokensTransferred).toBeGreaterThan(0);
    expect(result.priceImpact).toBeGreaterThan(100); // Massive price impact
  });

  it('price impact increases non-linearly with trade size', () => {
    const pool = createPool(100, 1000);
    
    const buy1 = calculateBuy(pool, 10);
    const buy2 = calculateBuy(pool, 20);
    
    // 2x the SOL should cause MORE than 2x price impact
    expect(buy2.priceImpact / buy1.priceImpact).toBeGreaterThan(2);
  });
});

// ============================================================================
// COMPARISON WITH REAL AMM (Uniswap-style)
// ============================================================================
describe('Comparison with Real AMM', () => {
  it('matches Uniswap constant product formula', () => {
    // Uniswap formula: 
    // x * y = k (constant)
    // dy = y - k/(x + dx)
    
    const pool = createPool(100, 1000);
    const x = pool.solBalance;
    const y = pool.tokenSupply;
    const k = x * y;
    const dx = 10 * 0.98; // After 2% fee
    
    // Expected tokens out (Uniswap formula)
    const expectedTokens = y - (k / (x + dx));
    
    const result = calculateBuy(pool, 10);
    
    expect(result.tokensTransferred).toBeCloseTo(expectedTokens, 10);
  });
});
