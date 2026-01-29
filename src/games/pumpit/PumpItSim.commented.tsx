/**
 * ============================================================================
 * PUMPIT SIMULATION COMPONENT
 * ============================================================================
 * 
 * The main game controller that ties everything together.
 * Manages the price simulation, candle generation, and trade execution.
 * 
 * FILE: src/components/pumpit/PumpItSim.tsx
 * 
 * THIS FILE IS THE "BRAIN" OF THE GAME:
 * - Runs the price simulation (random walk + trade impacts)
 * - Generates candlestick data
 * - Handles buy/sell logic
 * - Tracks user balance and position
 * 
 * FOR PRODUCTION:
 * Replace the simulation logic with real WebSocket/API calls to your backend.
 * 
 * USAGE:
 *   <PumpItSim />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import RugsChart from './RugsChart';
import TradeDeck from './TradeDeck';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Candle represents a single candlestick in the chart
 * Standard OHLC (Open, High, Low, Close) format
 */
interface Candle {
  open: number;   // Price when this candle started
  high: number;   // Highest price during this candle
  low: number;    // Lowest price during this candle
  close: number;  // Current/final price of this candle
}

// ============================================================================
// GAME CONSTANTS - CUSTOMIZE THESE TO TUNE GAMEPLAY
// ============================================================================

/**
 * TICK_INTERVAL - Milliseconds between main game ticks
 * 
 * Lower = faster game, more updates per second
 * Higher = slower game, fewer updates
 * 
 * 250ms = 4 updates per second (good balance)
 * 100ms = 10 updates per second (very fast)
 * 500ms = 2 updates per second (slow, casual)
 */
const TICK_INTERVAL = 250;

/**
 * TICKS_PER_CANDLE - How many ticks before a new candle is created
 * 
 * With TICK_INTERVAL of 250ms:
 * - 5 ticks = 1.25 second candles
 * - 10 ticks = 2.5 second candles
 * - 20 ticks = 5 second candles
 * 
 * Lower = more candles, faster chart movement
 * Higher = fewer candles, slower chart movement
 */
const TICKS_PER_CANDLE = 5;

/**
 * IDLE_VOLATILITY - Random price movement per tick (when no trades happen)
 * 
 * This is the "noise" that makes the chart look alive
 * 0.001 = +/- 0.1% per tick
 * 0.005 = +/- 0.5% per tick (very volatile)
 * 0.0005 = +/- 0.05% per tick (very calm)
 */
const IDLE_VOLATILITY = 0.001;

/**
 * PUMP_IMPACT - How much the price increases when someone buys
 * 
 * This is the price impact per 0.1 SOL traded
 * 0.08 = +8% per 0.1 SOL bought (big impact, exciting)
 * 0.02 = +2% per 0.1 SOL bought (smaller impact, realistic)
 * 
 * Higher = more dramatic pumps when buying
 * Lower = more subtle price movements
 */
const PUMP_IMPACT = 0.08;

/**
 * DUMP_IMPACT - How much the price decreases when someone sells
 * 
 * Usually slightly less than PUMP_IMPACT for asymmetry
 * 0.06 = -6% per 0.1 SOL sold
 * 
 * Higher = bigger dumps when selling
 * Lower = more gentle sell pressure
 */
const DUMP_IMPACT = 0.06;

/**
 * INITIAL_PRICE - Starting price of the token
 * 
 * This is the "1.0x" baseline that the multiplier is calculated from
 * Typically set to 1.0 for easy multiplier math (1.5 = 50% gain)
 */
const INITIAL_PRICE = 1.0;

/**
 * INITIAL_BALANCE - Starting balance for the player
 * 
 * How much "SOL" the player starts with
 * 10.0 = 10 SOL to play with
 */
const INITIAL_BALANCE = 10.0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * generateFlatCandles - Creates initial flat candles
 * 
 * These are shown at the start before any price movement
 * Creates a flat line at the initial price
 * 
 * @param count - How many candles to generate
 * @param price - The price for all candles
 * @returns Array of flat candles
 */
function generateFlatCandles(count: number, price: number): Candle[] {
  return Array.from({ length: count }, () => ({
    open: price,
    high: price * 1.001,  // Tiny variance so they're visible
    low: price * 0.999,
    close: price,
  }));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PumpItSim: React.FC = () => {
  
  // -------------------------------------------------------------------------
  // GAME STATE
  // -------------------------------------------------------------------------
  
  /**
   * price - The current live price
   * Updates many times per second for smooth animation
   */
  const [price, setPrice] = useState(INITIAL_PRICE);
  
  /**
   * candles - Array of all candlesticks to display
   * Each candle represents a time period (TICK_INTERVAL * TICKS_PER_CANDLE)
   */
  const [candles, setCandles] = useState<Candle[]>(() => generateFlatCandles(10, INITIAL_PRICE));
  
  /**
   * balance - User's available balance (not invested)
   * Decreases when buying, increases when selling
   */
  const [balance, setBalance] = useState(INITIAL_BALANCE);
  
  /**
   * position - User's token position (how many tokens they hold)
   * Increases when buying, decreases when selling
   */
  const [position, setPosition] = useState(0);
  
  // -------------------------------------------------------------------------
  // REFS (mutable values that don't trigger re-renders)
  // -------------------------------------------------------------------------
  
  /**
   * tickCount - Tracks how many ticks have occurred
   * Used to determine when to create new candles
   */
  const tickCount = useRef(0);
  
  /**
   * pendingImpact - Queued price impact from trades
   * 
   * When a trade happens, we don't apply the impact immediately.
   * Instead, we queue it here and apply it on the next tick.
   * This prevents price from jumping mid-candle.
   * 
   * Positive = price will go up (from buys)
   * Negative = price will go down (from sells)
   */
  const pendingImpact = useRef(0);
  
  /**
   * priceRef - Current price in a ref
   * 
   * We need this because the animation loop can't access state directly
   * (it would use stale values due to closure issues)
   */
  const priceRef = useRef(INITIAL_PRICE);

  // ============================================================================
  // FAST VISUAL TICK (60fps price micro-movements)
  // ============================================================================
  
  /**
   * This effect runs a 60fps animation loop for smooth price movement
   * 
   * It applies tiny random movements (micro-walk) to make the chart
   * look alive and organic, even between main game ticks.
   * 
   * The microWalk value (0.0003) is very small - about 0.03% per frame
   * 
   * TO ADJUST MICRO-MOVEMENT:
   * - Increase 0.0003 for more visible jitter
   * - Decrease for calmer, smoother movement
   * - Set to 0 for no micro-movement (only moves on main ticks)
   */
  useEffect(() => {
    let animationId: number;
    
    const animatePrice = () => {
      // Apply micro random walk (very small movements)
      const microWalk = (Math.random() - 0.5) * 0.0003;
      
      // Update price (never go below 0.0001)
      priceRef.current = Math.max(0.0001, priceRef.current * (1 + microWalk));
      setPrice(priceRef.current);
      
      // Update the current (last) candle with new price
      setCandles(prevCandles => {
        const newCandles = [...prevCandles];
        const lastIndex = newCandles.length - 1;
        
        if (lastIndex >= 0) {
          const lastCandle = newCandles[lastIndex];
          newCandles[lastIndex] = {
            ...lastCandle,
            close: priceRef.current,
            high: Math.max(lastCandle.high, priceRef.current),
            low: Math.min(lastCandle.low, priceRef.current),
          };
        }
        
        return newCandles;
      });
      
      // Request next animation frame
      animationId = requestAnimationFrame(animatePrice);
    };
    
    // Start the animation loop
    animationId = requestAnimationFrame(animatePrice);
    
    // Cleanup: stop animation when component unmounts
    return () => cancelAnimationFrame(animationId);
  }, []);

  // ============================================================================
  // MAIN GAME LOOP (runs every TICK_INTERVAL ms)
  // ============================================================================
  
  /**
   * This effect runs the main game logic on a fixed interval
   * 
   * Every tick:
   * 1. Apply any pending price impact from trades
   * 2. Apply random walk (idle volatility)
   * 3. Maybe create a new candle (if enough ticks have passed)
   * 
   * This is where you'd connect to a real backend:
   * - Replace the random walk with WebSocket price updates
   * - Replace pendingImpact with real market order flow
   */
  useEffect(() => {
    const interval = setInterval(() => {
      // Increment tick counter
      tickCount.current += 1;

      // Get and reset pending impact from trades
      const impact = pendingImpact.current;
      pendingImpact.current = 0;

      // Calculate random walk (idle behavior)
      // (Math.random() - 0.5) gives a value between -0.5 and 0.5
      // Multiply by 2 to get -1 to 1, then by IDLE_VOLATILITY
      const randomWalk = (Math.random() - 0.5) * 2 * IDLE_VOLATILITY;
      
      // Calculate new price: current * (1 + randomWalk + tradeImpact)
      let newPrice = priceRef.current * (1 + randomWalk + impact);
      
      // Clamp to prevent going negative or too low
      newPrice = Math.max(0.0001, newPrice);
      
      // Update the price ref
      priceRef.current = newPrice;

      // Check if it's time to create a new candle
      if (tickCount.current % TICKS_PER_CANDLE === 0) {
        setCandles(prevCandles => {
          const newCandles = [...prevCandles];
          
          // Push a new candle starting at current price
          newCandles.push({
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
          });

          // Keep only last 50 candles to prevent memory bloat
          // INCREASE this for more history visible
          // DECREASE for better performance
          if (newCandles.length > 50) {
            newCandles.shift();  // Remove oldest candle
          }
          
          return newCandles;
        });
      }
    }, TICK_INTERVAL);

    // Cleanup: stop interval when component unmounts
    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // TRADE HANDLERS
  // ============================================================================
  
  /**
   * handleBuy - Called when user clicks the BUY button
   * 
   * @param amount - SOL amount to spend
   * 
   * What happens:
   * 1. Deduct SOL from balance
   * 2. Calculate tokens received (amount / price)
   * 3. Add tokens to position
   * 4. Queue price impact (pump)
   * 
   * FOR PRODUCTION:
   * Replace this with an API call to your trading backend
   */
  const handleBuy = useCallback((amount: number) => {
    // Validate: must be positive and within balance
    if (amount <= 0 || amount > balance) return;

    // Deduct from balance
    setBalance(prev => Math.max(0, prev - amount));

    // Calculate tokens received at current price
    const tokensReceived = amount / priceRef.current;
    setPosition(prev => prev + tokensReceived);

    // Queue price impact (PUMP)
    // Impact scales with trade size: PUMP_IMPACT per 0.1 SOL
    const impactMultiplier = amount / 0.1;
    pendingImpact.current += PUMP_IMPACT * impactMultiplier;

    console.log(`🟢 BUY: ${amount.toFixed(4)} SOL → ${tokensReceived.toFixed(4)} tokens`);
  }, [balance]);

  /**
   * handleSell - Called when user clicks the SELL button
   * 
   * @param amount - SOL value to sell (converted to tokens at current price)
   * 
   * What happens:
   * 1. Calculate tokens to sell based on SOL amount
   * 2. Remove tokens from position
   * 3. Add SOL to balance
   * 4. Queue price impact (dump)
   * 
   * Note: The "amount" is in SOL, not tokens. We convert using current price.
   * 
   * FOR PRODUCTION:
   * Replace this with an API call to your trading backend
   */
  const handleSell = useCallback((amount: number) => {
    // Validate: must have a position to sell
    if (amount <= 0 || position <= 0) {
      console.log('❌ No position to sell');
      return;
    }

    // Calculate how many tokens to sell
    // User inputs SOL amount, we convert to tokens
    const tokensToSell = Math.min(position, amount / priceRef.current);
    
    // Calculate SOL received
    const solReceived = tokensToSell * priceRef.current;
    
    // Add to balance
    setBalance(prev => prev + solReceived);
    
    // Reduce position
    setPosition(prev => Math.max(0, prev - tokensToSell));

    // Queue price impact (DUMP)
    const impactMultiplier = solReceived / 0.1;
    pendingImpact.current -= DUMP_IMPACT * impactMultiplier;

    console.log(`🔴 SELL: ${tokensToSell.toFixed(4)} tokens → ${solReceived.toFixed(4)} SOL`);
  }, [position]);

  // ============================================================================
  // CALCULATED VALUES (derived from state)
  // ============================================================================
  
  /**
   * positionValue - Current value of held tokens in SOL
   * position (tokens) * price (SOL per token) = value in SOL
   */
  const positionValue = position * price;
  
  /**
   * totalValue - Total portfolio value (balance + position value)
   */
  const totalValue = balance + positionValue;
  
  /**
   * pnl - Profit and Loss (how much gained/lost from initial balance)
   */
  const pnl = totalValue - INITIAL_BALANCE;
  
  /**
   * pnlPercent - PnL as a percentage
   */
  const pnlPercent = (pnl / INITIAL_BALANCE) * 100;

  // ============================================================================
  // JSX RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-[#080a0e] flex flex-col">
      {/* 
        ================================================================
        HEADER
        ================================================================
        
        Top bar with game title and balance display
        
        CUSTOMIZE:
        - Change the emoji (🎰)
        - Change the title text
        - Modify colors in the gradient
      */}
      <div className="flex-shrink-0 bg-[#0e1016] border-b border-[#1a1d24] px-4 py-2">
        <div className="max-w-[600px] mx-auto flex items-center justify-between">
          
          {/* Game Title */}
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">🎰</span>
            <span className="bg-gradient-to-r from-[#00FF7F] via-[#00BFFF] to-[#FF00FF] bg-clip-text text-transparent">
              PUMP IT
            </span>
          </h1>
          
          {/* Balance Display */}
          <div className="flex items-center gap-2 bg-[#1a1d24] rounded-lg px-3 py-1.5">
            {/* SOL Icon */}
            <svg width="14" height="14" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="64" fill="#9945FF"/>
              <path d="M93.5 42.5c-1.2-1.2-2.8-1.9-4.5-1.9H38.9c-2.8 0-4.2 3.4-2.2 5.4l12.8 12.8c1.2 1.2 2.8 1.9 4.5 1.9h50.1c2.8 0 4.2-3.4 2.2-5.4L93.5 42.5z" fill="#fff"/>
            </svg>
            {/* Balance Amount */}
            <span className="text-white font-mono font-bold">{balance.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* 
        ================================================================
        GAME AREA (Chart + Trade Deck)
        ================================================================
        
        Centered column containing:
        - RugsChart (candlestick chart)
        - TradeDeck (buy/sell controls)
        
        max-w-[600px] controls the maximum width
        Change this value to make the game wider or narrower
      */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[600px] flex flex-col gap-3">
          
          {/* CHART COMPONENT */}
          <div className="rounded-lg overflow-hidden">
            <RugsChart 
              data={candles} 
              currentPrice={price} 
              startPrice={INITIAL_PRICE} 
            />
          </div>

          {/* TRADE DECK COMPONENT */}
          <TradeDeck
            balance={balance}
            currentPrice={price}
            onBuy={handleBuy}
            onSell={handleSell}
          />
        </div>
      </div>
    </div>
  );
};

export default PumpItSim;
