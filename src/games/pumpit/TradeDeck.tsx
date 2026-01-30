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
  tokenBalance?: number; // User's token balance for selling
  onError?: (message: string) => void; // Callback to show error messages
}

// ============================================================================
// CONSTANTS
// ============================================================================
const INCREMENTORS = [0.001, 0.01, 0.1, 1] as const;
const PERCENTAGES = [10, 25, 50, 100] as const;
const MAX_HOLD_DURATION = 2000; // 2 seconds to fill MAX button

// Helper: Format to max 3 decimal places
const formatSOL = (value: number): string => {
  return value.toFixed(3);
};

// ============================================================================
// TRADE DECK COMPONENT - Vertical Stacked Layout (rugs.fun style)
// ============================================================================
const TradeDeck: React.FC<TradeDeckProps> = ({
  balance,
  onBuy,
  onSell,
  tokenBalance = 0,
  onError,
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
    setIsHoldingMax(true);
    maxHoldStartRef.current = Date.now();
    
    const animate = () => {
      if (maxHoldStartRef.current === null) return;
      
      const elapsed = Date.now() - maxHoldStartRef.current;
      const progress = Math.min(elapsed / MAX_HOLD_DURATION, 1);
      setMaxHoldProgress(progress);
      
      if (progress >= 1) {
        // MAX triggered - set to full balance (max 3 decimals)
        setTradeAmount(formatSOL(balance));
        endMaxHold();
        return;
      }
      
      maxAnimationRef.current = requestAnimationFrame(animate);
    };
    
    maxAnimationRef.current = requestAnimationFrame(animate);
  }, [balance]);

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
  const adjustAmount = useCallback((type: 'add' | 'multiply' | 'percent', value: number) => {
    setTradeAmount(prev => {
      const current = parseFloat(prev) || 0;
      let newValue: number;
      
      if (type === 'add') {
        newValue = Math.max(0, current + value);
      } else if (type === 'multiply') {
        newValue = Math.max(0, current * value);
      } else {
        // percent - calculate from balance
        newValue = (balance * value) / 100;
      }
      
      // Cap at balance
      newValue = Math.min(newValue, balance);
      
      // Format to max 3 decimals
      return newValue > 0 ? formatSOL(newValue) : '';
    });
  }, [balance]);

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
    if (tokenBalance <= 0) {
      onError?.('No tokens to sell - buy first');
      return;
    }
    onSell(amount);
  };

  const parsedAmount = parseFloat(tradeAmount) || 0;
  const canBuy = parsedAmount > 0 && parsedAmount <= balance;
  const canSell = parsedAmount > 0 && tokenBalance > 0;

  // ============================================================================
  // RENDER - Vertical Stacked Layout (rugs.fun style)
  // ============================================================================
  return (
    <div id="trade-deck" className="trade-deck">
      
      {/* Row 1: Incrementors + Multipliers */}
      <div className="trd-row trd-row-controls">
        <div className="trd-btn-group">
          {INCREMENTORS.map(val => (
            <button
              key={val}
              onClick={() => adjustAmount('add', val)}
              className="trd-ctrl-btn"
            >
              +{val}
            </button>
          ))}
        </div>
        <div className="trd-btn-group">
          <button
            onClick={() => adjustAmount('multiply', 0.5)}
            className="trd-ctrl-btn"
          >
            1/2
          </button>
          <button
            onClick={() => adjustAmount('multiply', 2)}
            className="trd-ctrl-btn"
          >
            X2
          </button>
          {/* MAX Button with Hold Progress */}
          <button
            className={`trd-ctrl-btn trd-max-btn ${isHoldingMax ? 'holding' : ''}`}
            onMouseDown={startMaxHold}
            onMouseUp={endMaxHold}
            onMouseLeave={endMaxHold}
            onTouchStart={startMaxHold}
            onTouchEnd={endMaxHold}
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

      {/* Row 3: Percentage Presets */}
      <div className="trd-row trd-row-presets">
        {PERCENTAGES.map(pct => (
          <button
            key={pct}
            onClick={() => adjustAmount('percent', pct)}
            className="trd-preset-btn"
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Row 4: BUY and SELL Buttons */}
      <div className="trd-row trd-row-actions">
        <button
          onClick={handleBuy}
          className="trd-action-btn trd-buy-btn always-glow"
        >
          BUY
        </button>
        <button
          onClick={handleSell}
          className="trd-action-btn trd-sell-btn"
        >
          SELL
        </button>
      </div>

      {/* Token Balance Info */}
      {tokenBalance > 0 && (
        <div className="trd-token-info">
          Tokens: {formatSOL(tokenBalance)}
        </div>
      )}
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
  tokenBalance?: number;
  connected?: boolean;
}

export const MobileTradeDeck: React.FC<MobileTradeDeckProps> = ({
  balance,
  currentPrice,
  onBuy,
  onSell,
  tokenBalance = 0,
  connected = true,
}) => {
  const [tradeAmount, setTradeAmount] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-hide error after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*\.?\d{0,3}$/.test(value)) {
      setTradeAmount(value);
    }
  };

  const adjustAmount = useCallback((_type: 'percent', value: number) => {
    const newValue = (balance * value) / 100;
    setTradeAmount(newValue > 0 ? formatSOL(newValue) : '');
  }, [balance]);

  const handleBuy = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      setErrorMessage('Enter an amount to buy');
      return;
    }
    if (amount > balance) {
      setErrorMessage('Insufficient balance');
      return;
    }
    onBuy(amount);
    setTradeAmount('');
  };

  const handleSell = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (amount <= 0) {
      setErrorMessage('Enter an amount to sell');
      return;
    }
    if (tokenBalance <= 0) {
      setErrorMessage('No tokens to sell');
      return;
    }
    onSell(amount);
    setTradeAmount('');
  };

  const parsedAmount = parseFloat(tradeAmount) || 0;
  const canBuy = parsedAmount > 0 && parsedAmount <= balance;
  const canSell = parsedAmount > 0 && tokenBalance > 0;

  return (
    <div className="mobile-trade-deck">
      {/* Error Popup */}
      {errorMessage && (
        <div className="mobile-error-popup">
          {errorMessage}
        </div>
      )}

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
        {PERCENTAGES.map(pct => (
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
          BUY
        </button>
        <button
          onClick={handleSell}
          className="mobile-action-btn sell"
        >
          SELL
        </button>
      </div>

      {/* Current Price Display */}
      <div className="mobile-price-display">
        <span className="mobile-price-label">Price</span>
        <span className="mobile-price-value">{currentPrice.toFixed(6)}</span>
      </div>
    </div>
  );
};

export default TradeDeck;
