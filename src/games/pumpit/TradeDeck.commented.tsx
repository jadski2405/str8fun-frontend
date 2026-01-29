/**
 * ============================================================================
 * TRADE DECK COMPONENT
 * ============================================================================
 * 
 * The trading control panel with amount input and Buy/Sell buttons.
 * Styled to match rugs.fun with arcade-style 3D buttons.
 * 
 * FILE: src/components/pumpit/TradeDeck.tsx
 * 
 * USAGE:
 *   <TradeDeck 
 *     balance={10.0}          // User's available balance
 *     currentPrice={1.25}     // Current price (for display/calculations)
 *     onBuy={(amount) => {}}  // Called when BUY is clicked
 *     onSell={(amount) => {}} // Called when SELL is clicked
 *   />
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props required by the TradeDeck component
 */
interface TradeDeckProps {
  balance: number;                    // User's current balance (e.g., SOL amount)
  currentPrice: number;               // Current price (can be used for calculations)
  onBuy: (amount: number) => void;    // Callback when BUY button is clicked
  onSell: (amount: number) => void;   // Callback when SELL button is clicked
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TradeDeck: React.FC<TradeDeckProps> = ({
  balance,
  onBuy,
  onSell,
}) => {
  
  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------
  
  /**
   * tradeAmount - The amount the user wants to trade
   * Stored as string to allow for decimal input (e.g., "0.1", "1.5")
   */
  const [tradeAmount, setTradeAmount] = useState<string>('0.1');

  // ============================================================================
  // HELPER: Adjust Amount
  // ============================================================================
  
  /**
   * adjustAmount - Modifies the trade amount based on user action
   * 
   * @param type - The type of adjustment:
   *   - 'add': Add a fixed value (e.g., +0.1)
   *   - 'multiply': Multiply by a value (e.g., 2X, 1/2)
   *   - 'set': Set to a percentage of balance (e.g., 50%)
   * @param value - The value to use for the adjustment
   * 
   * CUSTOMIZE QUICK BUTTONS:
   * - Change the values in the button arrays below
   * - Add/remove buttons as needed
   */
  const adjustAmount = useCallback((type: 'add' | 'multiply' | 'set', value: number) => {
    setTradeAmount(prev => {
      // Parse current value (default to 0 if invalid)
      const current = parseFloat(prev) || 0;
      
      switch (type) {
        case 'add':
          // Add a fixed amount (e.g., +0.1)
          // Math.max(0, ...) prevents negative values
          return Math.max(0, current + value).toFixed(4).replace(/\.?0+$/, '');
          
        case 'multiply':
          // Multiply by a value (e.g., 2X doubles it)
          // Special case: value of 0 means "MAX" (set to full balance)
          if (value === 0) {
            return balance.toFixed(4).replace(/\.?0+$/, '');
          }
          return Math.max(0, current * value).toFixed(4).replace(/\.?0+$/, '');
          
        case 'set':
          // Set to a percentage of balance (e.g., 0.5 = 50% of balance)
          return (balance * value).toFixed(4).replace(/\.?0+$/, '');
          
        default:
          return prev;
      }
    });
  }, [balance]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  /**
   * handleInputChange - Handles manual typing in the amount input
   * Only allows valid number characters (digits and one decimal point)
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Regex: only digits and optional decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setTradeAmount(value);
    }
  };

  /**
   * handleBuy - Called when BUY button is clicked
   * Parses the amount and calls the onBuy callback
   */
  const handleBuy = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount > 0) onBuy(amount);
  };

  /**
   * handleSell - Called when SELL button is clicked
   * Parses the amount and calls the onSell callback
   */
  const handleSell = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount > 0) onSell(amount);
  };

  // Parse the amount for button disable logic
  const parsedAmount = parseFloat(tradeAmount) || 0;

  // ============================================================================
  // JSX RENDER
  // ============================================================================
  
  return (
    <div className="w-full bg-[#0e1016] rounded-lg p-3 space-y-3">
      {/* 
        ================================================================
        ROW 1: Amount Input + Quick Add + Multipliers
        ================================================================
        
        This row contains:
        - SOL icon + amount input field
        - Quick add buttons (+0.001, +0.01, +0.1, +1)
        - Multiplier buttons (1/2, 2X, MAX)
        
        TO CUSTOMIZE:
        - Change the button values in the arrays below
        - Add/remove buttons as needed
        - Modify styling classes for different appearance
      */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        
        {/* ------------------------------------------------------------- */}
        {/* AMOUNT INPUT with SOL icon */}
        {/* ------------------------------------------------------------- */}
        <div className="flex items-center gap-2 bg-[#1a1d24] rounded-lg px-4 py-2">
          {/* 
            SOL ICON (Solana logo)
            This is an inline SVG - replace with <img> or different icon as needed
          */}
          <svg width="16" height="16" viewBox="0 0 128 128" className="flex-shrink-0">
            <circle cx="64" cy="64" r="64" fill="#9945FF"/>
            <path d="M93.5 42.5c-1.2-1.2-2.8-1.9-4.5-1.9H38.9c-2.8 0-4.2 3.4-2.2 5.4l12.8 12.8c1.2 1.2 2.8 1.9 4.5 1.9h50.1c2.8 0 4.2-3.4 2.2-5.4L93.5 42.5z" fill="#fff"/>
            <path d="M93.5 85.5c-1.2-1.2-2.8-1.9-4.5-1.9H38.9c-2.8 0-4.2 3.4-2.2 5.4l12.8 12.8c1.2 1.2 2.8 1.9 4.5 1.9h50.1c2.8 0 4.2-3.4 2.2-5.4L93.5 85.5z" fill="#fff"/>
            <path d="M34.5 64c1.2 1.2 2.8 1.9 4.5 1.9h50.1c2.8 0 4.2-3.4 2.2-5.4L78.5 47.6c-1.2-1.2-2.8-1.9-4.5-1.9H23.9c-2.8 0-4.2 3.4-2.2 5.4L34.5 64z" fill="#fff"/>
          </svg>
          
          {/* 
            TEXT INPUT for amount
            - w-20: Width of input
            - bg-transparent: No background (uses parent's bg)
            - text-right: Numbers align right
            - font-mono: Monospace font for numbers
          */}
          <input
            type="text"
            value={tradeAmount}
            onChange={handleInputChange}
            className="w-20 bg-transparent text-white text-xl font-bold outline-none text-right font-mono"
            placeholder="0.000"
          />
        </div>

        {/* Visual separator */}
        <div className="w-px h-8 bg-[#2a2d34]" />

        {/* ------------------------------------------------------------- */}
        {/* QUICK ADD BUTTONS */}
        {/* These add a fixed amount to the current value */}
        {/* CUSTOMIZE: Change the values in this array */}
        {/* ------------------------------------------------------------- */}
        {['+0.001', '+0.01', '+0.1', '+1'].map(label => {
          const value = parseFloat(label);  // Convert string to number
          return (
            <button
              key={label}
              onClick={() => adjustAmount('add', value)}
              className="h-10 px-3 rounded-lg bg-[#1a1d24] hover:bg-[#252930] 
                       text-gray-400 hover:text-white text-xs font-medium
                       transition-all duration-100"
            >
              {label}
            </button>
          );
        })}

        {/* Visual separator */}
        <div className="w-px h-8 bg-[#2a2d34]" />

        {/* ------------------------------------------------------------- */}
        {/* MULTIPLIER BUTTONS */}
        {/* ------------------------------------------------------------- */}
        
        {/* 1/2 Button - Halves the amount */}
        <button
          onClick={() => adjustAmount('multiply', 0.5)}
          className="h-10 px-3 rounded-lg bg-[#1a1d24] hover:bg-[#252930] 
                   text-gray-400 hover:text-white text-xs font-medium transition-all"
        >
          1/2
        </button>
        
        {/* 2X Button - Doubles the amount */}
        <button
          onClick={() => adjustAmount('multiply', 2)}
          className="h-10 px-3 rounded-lg bg-[#1a1d24] hover:bg-[#252930] 
                   text-[#00BFFF] font-bold text-xs transition-all"
        >
          2X
        </button>
        
        {/* MAX Button - Sets amount to full balance */}
        <button
          onClick={() => adjustAmount('multiply', 0)}  // 0 = special "MAX" case
          className="h-10 px-4 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] 
                   text-white font-bold text-xs transition-all hover:opacity-90"
        >
          MAX
        </button>
      </div>

      {/* 
        ================================================================
        ROW 2: Percentage Buttons
        ================================================================
        
        These buttons set the amount to a percentage of the user's balance
        Example: 25% with balance of 10 = amount of 2.5
        
        CUSTOMIZE:
        - Change the percentages in the array
        - Add/remove buttons as needed
      */}
      <div className="flex items-center justify-center gap-2">
        {[10, 25, 50, 100].map(pct => (
          <button
            key={pct}
            onClick={() => adjustAmount('set', pct / 100)}  // Convert 25 to 0.25
            className="h-10 px-4 rounded-lg text-xs font-medium transition-all
                     bg-[#1a1d24] text-gray-400 hover:text-white hover:bg-[#252930]"
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* 
        ================================================================
        ROW 3: BUY & SELL BUTTONS
        ================================================================
        
        The main action buttons. Styled to look like arcade buttons with:
        - 3D shadow effect (inset shadows + drop shadows)
        - Press animation (translate-y on hover/active)
        - Disabled state when invalid amount
        
        CUSTOMIZE COLORS:
        - BUY button: Change #00C853, #00962f, #006b22 for different greens
        - SELL button: Change #FF3B3B, #cc2f2f, #991f1f for different reds
        
        CUSTOMIZE SIZE:
        - Change py-4 for button height
        - Change text-2xl for text size
      */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* ------------------------------------------------------------- */}
        {/* BUY BUTTON */}
        {/* ------------------------------------------------------------- */}
        <button
          onClick={handleBuy}
          disabled={parsedAmount <= 0 || parsedAmount > balance}
          className="relative py-4 rounded-lg font-black text-white text-2xl tracking-wider
                   bg-[#00C853] 
                   /* 3D shadow effect - creates the "raised" look */
                   shadow-[inset_0_-4px_0_0_#00962f,0_4px_0_0_#006b22,0_8px_16px_rgba(0,200,83,0.3)]
                   /* Hover - reduce shadows to simulate pressing down */
                   hover:shadow-[inset_0_-2px_0_0_#00962f,0_2px_0_0_#006b22,0_4px_12px_rgba(0,200,83,0.4)]
                   /* Active - flatten shadows for "pressed" state */
                   active:shadow-[inset_0_2px_0_0_#00962f,0_0_0_0_#006b22,0_2px_8px_rgba(0,200,83,0.3)]
                   /* Move button down on hover/click */
                   hover:translate-y-[2px] active:translate-y-[4px]
                   /* Disabled state */
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                   transition-all duration-75"
        >
          BUY
        </button>

        {/* ------------------------------------------------------------- */}
        {/* SELL BUTTON */}
        {/* ------------------------------------------------------------- */}
        <button
          onClick={handleSell}
          disabled={parsedAmount <= 0}
          className="relative py-4 rounded-lg font-black text-white text-2xl tracking-wider
                   bg-[#FF3B3B] 
                   /* 3D shadow effect */
                   shadow-[inset_0_-4px_0_0_#cc2f2f,0_4px_0_0_#991f1f,0_8px_16px_rgba(255,59,59,0.3)]
                   hover:shadow-[inset_0_-2px_0_0_#cc2f2f,0_2px_0_0_#991f1f,0_4px_12px_rgba(255,59,59,0.4)]
                   active:shadow-[inset_0_2px_0_0_#cc2f2f,0_0_0_0_#991f1f,0_2px_8px_rgba(255,59,59,0.3)]
                   hover:translate-y-[2px] active:translate-y-[4px]
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                   transition-all duration-75"
        >
          SELL
        </button>
      </div>
    </div>
  );
};

export default TradeDeck;
