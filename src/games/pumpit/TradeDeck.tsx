import React, { useState, useCallback, useRef, useEffect } from 'react';
import solanaLogo from '../../assets/logo_solana.png';

// ============================================================================
// TYPES
// ============================================================================
interface TradeDeckProps {
  balance: number;
  currentPrice: number;
  onBuy: (amount: number) => void;
  onSell: (amount: number) => void;
  solWagered?: number; // SOL amount in active position
  currentValue?: number; // Current value of position
  onError?: (message: string) => void; // Callback to show error messages
  isCountdown?: boolean; // Presale phase — buy at 1.00x, sell disabled
}

// ============================================================================
// CONSTANTS
// ============================================================================
const BUY_PERCENTAGES = [10, 25, 50, 100] as const;
const MAX_HOLD_DURATION = 2000; // 2 seconds to fill MAX button

// Helper: Format SOL to exactly 3 decimal places, 0.000 if < 0.001
const formatSOL = (value: number): string => {
  if (value < 0.001) return '0.000';
  return value.toFixed(3);
};

// ============================================================================
// TRADE DECK COMPONENT - Vertical Stacked Layout (rugs.fun style)
// ============================================================================
const TradeDeck: React.FC<TradeDeckProps> = ({
  balance,
  currentPrice: _currentPrice,
  onBuy,
  onSell,
  solWagered = 0,
  currentValue = 0,
  onError,
  isCountdown = false,
}) => {
  // ============================================================================
  // STATE
  // ============================================================================
  const [tradeAmount, setTradeAmount] = useState<string>('');
  
  // MAX button hold state
  const [maxHoldProgress, setMaxHoldProgress] = useState(0);
  const [isHoldingMax, setIsHoldingMax] = useState(false);
  const maxHoldStartRef = useRef<number | null>(null);
  const maxAnimationRef = useRef<number | null>(null);

  // ============================================================================
  // MAX BUTTON HOLD LOGIC - Progress bar animation
  // ============================================================================
  const startMaxHold = useCallback(() => {
    if (isCountdown || solWagered <= 0) return;
    setIsHoldingMax(true);
    maxHoldStartRef.current = Date.now();
    
    const animate = () => {
      if (maxHoldStartRef.current === null) return;
      
      const elapsed = Date.now() - maxHoldStartRef.current;
      const progress = Math.min(elapsed / MAX_HOLD_DURATION, 1);
      setMaxHoldProgress(progress);
      
      if (progress >= 1) {
        // MAX triggered - sell entire position
        onSell(currentValue);
        endMaxHold();
        return;
      }
      
      maxAnimationRef.current = requestAnimationFrame(animate);
    };
    
    maxAnimationRef.current = requestAnimationFrame(animate);
  }, [isCountdown, solWagered, currentValue, onSell]);

  const endMaxHold = useCallback(() => {
    setIsHoldingMax(false);
    maxHoldStartRef.current = null;
    if (maxAnimationRef.current) {
      cancelAnimationFrame(maxAnimationRef.current);
      maxAnimationRef.current = null;
    }
    setMaxHoldProgress(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (maxAnimationRef.current) {
        cancelAnimationFrame(maxAnimationRef.current);
      }
    };
  }, []);

  // ============================================================================
  // AMOUNT HELPERS
  // ============================================================================
  // Buy preset: autofill input with percentage of balance
  const handleBuyPercent = useCallback((pct: number) => {
    const amount = (balance * pct) / 100;
    setTradeAmount(amount > 0 ? formatSOL(amount) : '');
  }, [balance]);

  // Instant sell: sell a fraction of position immediately (no input interaction)
  const handleInstantSell = useCallback((fraction: number) => {
    if (isCountdown) return;
    if (solWagered <= 0) {
      onError?.('No position to sell');
      return;
    }
    const amount = currentValue * fraction;
    if (amount <= 0) return;
    onSell(amount);
  }, [isCountdown, solWagered, currentValue, onSell, onError]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow typing but limit to 3 decimal places
    if (/^\d*\.?\d{0,3}$/.test(value)) {
      setTradeAmount(value);
    }
  };

  // ============================================================================
  // TRADE HANDLERS
  // ============================================================================
  const handleBuy = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      onError?.('Enter an amount to buy');
      return;
    }
    if (amount > balance) {
      onError?.('Insufficient balance - deposit SOL first');
      return;
    }
    onBuy(amount);
  };

  const handleSell = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      onError?.('Enter an amount to sell');
      return;
    }
    if (solWagered <= 0) {
      onError?.('No position to sell - buy first');
      return;
    }
    onSell(amount);
  };

  // ============================================================================
  // RENDER - Vertical Stacked Layout (rugs.fun style)
  // ============================================================================
  return (
    <div id="trade-deck" className="trade-deck">
      
      {/* Row 1: Buy Presets (green) + Sell Presets (red) */}
      <div className="trd-row trd-row-controls">
        <div className="trd-btn-group">
          {BUY_PERCENTAGES.map(pct => (
            <button
              key={pct}
              onClick={() => handleBuyPercent(pct)}
              className="trd-buy-preset-btn"
            >
              {pct}%
            </button>
          ))}
        </div>
        <div className="trd-btn-group">
          <button
            onClick={() => handleInstantSell(0.5)}
            className="trd-sell-preset-btn"
            disabled={isCountdown}
          >
            1/2
          </button>
          <button
            onClick={() => handleInstantSell(1)}
            className="trd-sell-preset-btn"
            disabled={isCountdown}
          >
            X2
          </button>
          {/* MAX Button with Hold Progress - Sells 100% of position */}
          <button
            className={`trd-sell-preset-btn trd-max-btn ${isHoldingMax ? 'holding' : ''}`}
            onMouseDown={startMaxHold}
            onMouseUp={endMaxHold}
            onMouseLeave={endMaxHold}
            onTouchStart={startMaxHold}
            onTouchEnd={endMaxHold}
            disabled={isCountdown}
          >
            <div 
              className="trd-max-progress" 
              style={{ width: `${maxHoldProgress * 100}%` }}
            />
            <span className="trd-max-text">MAX</span>
          </button>
        </div>
      </div>

      {/* Row 2: Amount Input with SOL icon */}
      <div className="trd-row trd-row-input">
        <div className="trd-input-wrap">
          <img src={solanaLogo} alt="SOL" className="trd-sol-icon" />
          <input
            id="trade-amount-input"
            type="text"
            inputMode="decimal"
            value={tradeAmount}
            onChange={handleInputChange}
            className="trd-input"
            placeholder="0.000"
            autoComplete="off"
          />
          <div className="trd-balance-display">
            <span className="trd-balance-value">{formatSOL(balance)}</span>
          </div>
        </div>
      </div>

      {/* Row 3: BUY and SELL Buttons */}
      <div className="trd-row trd-row-actions">
        <button
          onClick={handleBuy}
          className="trd-action-btn trd-buy-btn always-glow"
        >
          {isCountdown ? 'BUY AT 1.00x' : 'BUY'}
        </button>
        <button
          onClick={handleSell}
          className="trd-action-btn trd-sell-btn"
          disabled={isCountdown}
          style={isCountdown ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          SELL
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MOBILE TRADE DECK - Direct Buy/Sell Buttons (1-click trading)
// ============================================================================
interface MobileTradeDeckProps {
  balance: number;
  currentPrice: number;
  onBuy: (amount: number) => void;
  onSell: (amount: number) => void;
  solWagered?: number;
  currentValue?: number;
  connected?: boolean;
  onError?: (message: string) => void;
  isCountdown?: boolean;
}

export const MobileTradeDeck: React.FC<MobileTradeDeckProps> = ({
  balance,
  currentPrice: _currentPrice,
  onBuy,
  onSell,
  solWagered = 0,
  currentValue = 0,
  connected: _connected = true,
  onError,
  isCountdown = false,
}) => {
  const [tradeAmount, setTradeAmount] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*\.?\d{0,3}$/.test(value)) {
      setTradeAmount(value);
    }
  };

  const adjustAmount = useCallback((_type: 'percent', value: number) => {
    // For selling - calculate from position value (like desktop)
    if (solWagered > 0) {
      const newValue = (currentValue * value) / 100;
      setTradeAmount(newValue > 0 ? formatSOL(newValue) : '');
    } else {
      // No position - calculate from balance for buying
      const newValue = (balance * value) / 100;
      setTradeAmount(newValue > 0 ? formatSOL(newValue) : '');
    }
  }, [balance, solWagered, currentValue]);

  const handleBuy = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      onError?.('Enter an amount to buy');
      return;
    }
    if (amount > balance) {
      onError?.('Insufficient balance - deposit SOL first');
      return;
    }
    onBuy(amount);
  };

  const handleSell = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      onError?.('Enter an amount to sell');
      return;
    }
    if (solWagered <= 0) {
      onError?.('No position to sell - buy first');
      return;
    }
    onSell(amount);
  };

  return (
    <div className="mobile-trade-deck">
      {/* Amount Input with Presets */}
      <div className="mobile-trade-input-row">
        <div className="mobile-input-wrap">
          <img src={solanaLogo} alt="SOL" className="mobile-sol-icon" />
          <input
            type="text"
            inputMode="decimal"
            value={tradeAmount}
            onChange={handleInputChange}
            className="mobile-trade-input"
            placeholder="0.000"
            autoComplete="off"
          />
          <div className="mobile-balance-box">
            <span className="mobile-balance-value">{balance.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* Percentage Presets */}
      <div className="mobile-preset-row">
        {BUY_PERCENTAGES.map(pct => (
          <button
            key={pct}
            onClick={() => adjustAmount('percent', pct)}
            className="mobile-preset-btn"
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Direct Buy/Sell Buttons */}
      <div className="mobile-action-row">
        <button
          onClick={handleBuy}
          className="mobile-action-btn buy"
        >
          {isCountdown ? 'BUY AT 1.00x' : 'BUY'}
        </button>
        <button
          onClick={handleSell}
          className="mobile-action-btn sell"
          disabled={isCountdown}
          style={isCountdown ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          SELL
        </button>
      </div>
    </div>
  );
};

export default TradeDeck;
