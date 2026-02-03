import { useState, useEffect, useCallback, useRef } from 'react';
import { useLogin } from '@privy-io/react-auth';
import { MessageCircle } from 'lucide-react';
import RugsChart from './RugsChart';
import TradeDeck, { MobileTradeDeck } from './TradeDeck';
import LivePnLFeed, { PlayerPnL } from './LivePnLFeed';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';
import { useGame } from '../../hooks/useGame';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { GAME_CONSTANTS } from '../../types/game';
import GameLayout from '../../components/layout/GameLayout';
import GlobalHeader from '../../components/GlobalHeader';
import GlobalChatSidebar from '../../components/GlobalChatSidebar';
import solanaLogo from '../../assets/logo_solana.png';

// ============================================================================
// HELPER: Format time with milliseconds (e.g., 20.00)
// ============================================================================
const formatTimeWithMs = (seconds: number): string => {
  return seconds.toFixed(2);
};

// ============================================================================
// TYPES
// ============================================================================
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

// Trade marker for showing buy/sell points on chart
export interface TradeMarker {
  type: 'buy' | 'sell';
  price: number;
  candleIndex: number; // Index into candles array when trade happened
}

// ============================================================================
// CONSTANTS
// ============================================================================
const TICK_INTERVAL = 250; // ms
const TICKS_PER_CANDLE = 5;
const PUMP_IMPACT = 0.08; // +8% per 0.1 SOL (amplified)
const DUMP_IMPACT = 0.06; // -6% per 0.1 SOL (amplified)
const INITIAL_PRICE = 1.0;

// Smooth animation constants
const PRICE_LERP_SPEED = 0.08; // Smooth interpolation speed (lower = smoother)

// ============================================================================
// HELPER: Generate flat candles
// ============================================================================
function generateFlatCandles(count: number, price: number): Candle[] {
  return Array.from({ length: count }, () => ({
    open: price,
    high: price * 1.001,
    low: price * 0.999,
    close: price,
  }));
}

// ============================================================================
// HELPER: Generate candles from price history array
// ============================================================================
function generateCandlesFromHistory(priceHistory: number[], ticksPerCandle: number = TICKS_PER_CANDLE): Candle[] {
  if (!priceHistory || priceHistory.length === 0) {
    return generateFlatCandles(10, INITIAL_PRICE);
  }
  
  const candles: Candle[] = [];
  
  // Group price ticks into candles
  for (let i = 0; i < priceHistory.length; i += ticksPerCandle) {
    const chunk = priceHistory.slice(i, i + ticksPerCandle);
    if (chunk.length === 0) continue;
    
    // Previous candle's close becomes this candle's open (for continuity)
    const prevClose = candles.length > 0 ? candles[candles.length - 1].close : chunk[0];
    
    candles.push({
      open: prevClose,
      high: Math.max(prevClose, ...chunk),
      low: Math.min(prevClose, ...chunk),
      close: chunk[chunk.length - 1],
    });
  }
  
  // Ensure at least 10 candles for visual consistency
  if (candles.length < 10) {
    const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : INITIAL_PRICE;
    const paddingNeeded = 10 - candles.length;
    const padding = generateFlatCandles(paddingNeeded, lastPrice);
    return [...padding, ...candles];
  }
  
  return candles;
}

// ============================================================================
// USERNAME VALIDATION
// ============================================================================
function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 1 || username.length > 20) {
    return { valid: false, error: 'Username must be 1-20 characters' };
  }
  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    return { valid: false, error: 'Letters and numbers only' };
  }
  const capitalCount = (username.match(/[A-Z]/g) || []).length;
  if (capitalCount > 1) {
    return { valid: false, error: 'Maximum 1 capital letter' };
  }
  return { valid: true };
}

// ============================================================================
// PUMPIT SIMULATION COMPONENT
// ============================================================================
const PumpItSim: React.FC = () => {
  // Privy login hook - triggers wallet connection modal
  const { login } = useLogin();
  
  // Wallet state - ALL wallet access goes through useSolanaWallet hook
  const { 
    isConnected: connected,
    publicKey,
    balance: walletBalance, 
    depositedBalance,
    deposit,
    withdraw,
    refreshDepositedBalance,
    updateDepositedBalance,
    profileId,
    username: _username,
    needsUsername,
    setUsername,
    checkUsernameAvailable,
    getAuthToken,
  } = useSolanaWallet();
  
  // Game state from hook (for real trading) - pass wallet address and auth token
  const game = useGame(profileId, publicKey || null, getAuthToken);
  
  // Leaderboard data - refreshes every hour
  const leaderboard = useLeaderboard(10);
  
  // Local simulation state (visual chart)
  const [price, setPrice] = useState(INITIAL_PRICE);
  const [candles, setCandles] = useState<Candle[]>(() => generateFlatCandles(10, INITIAL_PRICE));
  
  // Tick counter for candle generation
  const tickCount = useRef(0);
  
  // Track pending price impacts from trades
  const pendingImpact = useRef(0);
  
  // Track current price in ref for candle updates
  const priceRef = useRef(INITIAL_PRICE);
  
  // Trading state
  const [isProcessingTrade, setIsProcessingTrade] = useState(false);
  
  // Deposit/Withdraw UI state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Trade error state for user feedback
  const [tradeError, setTradeError] = useState<string | null>(null);
  
  // Trade markers for showing buy/sell points on chart (user-specific, persists until round end)
  const [tradeMarkers, setTradeMarkers] = useState<TradeMarker[]>([]);
  
  // Username modal state
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  
  // Welcome promo popup state
  const [showPromoPopup, setShowPromoPopup] = useState(() => {
    // Only show if user hasn't dismissed it before
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('str8fun_promo_dismissed');
    }
    return true;
  });
  
  const handleDismissPromo = () => {
    setShowPromoPopup(false);
    localStorage.setItem('str8fun_promo_dismissed', 'true');
  };
  
  // Chat sidebar state - open by default on desktop, collapsed on mobile
  const [chatCollapsed, setChatCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  
  // Smooth animation refs for server tick price
  const targetPriceRef = useRef(INITIAL_PRICE);
  const velocityRef = useRef(0);
  
  // Player's own PnL tracking (TODO: Backend integration needed)
  // For now, calculate from local position state
  const playerPnL: PlayerPnL | null = game.tokenBalance > 0 ? {
    entryPrice: INITIAL_PRICE, // TODO: Get from backend when position opened
    currentPrice: price,
    positionSize: game.tokenBalance,
  } : null;
  
  // Show username modal when needed
  useEffect(() => {
    console.log('[PumpItSim] connected:', connected, 'needsUsername:', needsUsername);
    if (connected && needsUsername) {
      console.log('[PumpItSim] Showing username modal');
      setShowUsernameModal(true);
    } else {
      setShowUsernameModal(false);
    }
  }, [connected, needsUsername]);

  // ============================================================================
  // USERNAME HANDLERS
  // ============================================================================
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsernameInput(value);
    
    // Live validation
    if (value) {
      const validation = validateUsername(value);
      if (!validation.valid) {
        setUsernameError(validation.error || null);
      } else {
        setUsernameError(null);
      }
    } else {
      setUsernameError(null);
    }
  };

  const handleCheckUsername = useCallback(async () => {
    if (!usernameInput) return;
    
    const validation = validateUsername(usernameInput);
    if (!validation.valid) {
      setUsernameError(validation.error || null);
      return;
    }
    
    setIsCheckingUsername(true);
    const result = await checkUsernameAvailable(usernameInput);
    setIsCheckingUsername(false);
    
    if (!result.valid) {
      setUsernameError(result.error || 'Username not available');
    } else {
      setUsernameError(null);
    }
  }, [usernameInput, checkUsernameAvailable]);

  const handleSetUsername = useCallback(async () => {
    if (!usernameInput || usernameError) return;
    
    const validation = validateUsername(usernameInput);
    if (!validation.valid) {
      setUsernameError(validation.error || null);
      return;
    }
    
    setIsSettingUsername(true);
    const result = await setUsername(usernameInput);
    setIsSettingUsername(false);
    
    if (!result.success) {
      setUsernameError(result.error || 'Failed to set username');
    } else {
      setShowUsernameModal(false);
      setUsernameInput('');
    }
  }, [usernameInput, usernameError, setUsername]);

  // ============================================================================
  // SYNC PRICE FROM GAME STATE (Server tick price or AMM price)
  // ============================================================================
  useEffect(() => {
    if (game.roundStatus === 'active') {
      // In random mode, use server tick price; in AMM mode, use pool price
      if (game.priceMode === 'random' && game.tickPrice !== null) {
        targetPriceRef.current = game.tickPrice;
      } else if (game.priceMultiplier > 0) {
        targetPriceRef.current = game.priceMultiplier;
        priceRef.current = game.priceMultiplier;
      }
    }
  }, [game.priceMultiplier, game.tickPrice, game.priceMode, game.roundStatus]);

  // ============================================================================
  // CRASH ANIMATION - Rapid drop to 0 when round crashes
  // ============================================================================
  useEffect(() => {
    if (game.isCrashed) {
      console.log('[PumpItSim] CRASH! Animating price drop to 0');
      // Set target to 0 and add strong downward velocity for dramatic effect
      targetPriceRef.current = 0;
      velocityRef.current = -0.5; // Strong downward momentum
    }
  }, [game.isCrashed]);

  // ============================================================================
  // RESET CHART ON NEW ROUND
  // ============================================================================
  useEffect(() => {
    if (game.shouldResetChart) {
      setCandles(generateFlatCandles(10, INITIAL_PRICE));
      priceRef.current = INITIAL_PRICE;
      targetPriceRef.current = INITIAL_PRICE;
      velocityRef.current = 0;
      setPrice(INITIAL_PRICE);
      setTradeMarkers([]); // Reset trade markers for new round
      console.log('[PumpItSim] Chart reset for new round:', game.roundId);
    }
  }, [game.shouldResetChart, game.roundId]);

  // ============================================================================
  // INITIALIZE CHART FROM PRICE HISTORY (mid-round joins / page refresh)
  // ============================================================================
  const priceHistoryInitialized = useRef(false);
  
  useEffect(() => {
    // Only initialize once when we first receive price history for a round
    // and only if we haven't already initialized (to prevent overwriting ongoing chart)
    if (game.priceHistory.length > 0 && !priceHistoryInitialized.current && game.roundStatus === 'active') {
      console.log('[PumpItSim] Initializing chart from price history:', game.priceHistory.length, 'ticks');
      
      const candlesFromHistory = generateCandlesFromHistory(game.priceHistory, TICKS_PER_CANDLE);
      setCandles(candlesFromHistory);
      
      // Set current price to last price in history
      const lastPrice = game.priceHistory[game.priceHistory.length - 1];
      priceRef.current = lastPrice;
      targetPriceRef.current = lastPrice;
      setPrice(lastPrice);
      
      priceHistoryInitialized.current = true;
    }
    
    // Reset the initialized flag when round changes
    if (game.shouldResetChart) {
      priceHistoryInitialized.current = false;
    }
  }, [game.priceHistory, game.roundStatus, game.shouldResetChart]);

  // ============================================================================
  // FAST VISUAL TICK - 60fps price micro-movements for smooth animation
  // ============================================================================
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    
    const animatePrice = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Normalize to ~60fps, cap at 2x
      lastTime = currentTime;
      
      // Smoothly interpolate towards target price (from server ticks or AMM)
      const diff = targetPriceRef.current - priceRef.current;
      
      // Apply velocity (momentum)
      velocityRef.current *= 0.92; // Friction/decay
      
      // Smooth lerp towards target + velocity
      const lerpAmount = diff * PRICE_LERP_SPEED * deltaTime;
      const velocityAmount = velocityRef.current * priceRef.current * deltaTime;
      
      let newPrice = priceRef.current + lerpAmount + velocityAmount;
      
      // Clamp to reasonable bounds
      newPrice = Math.max(0.1, Math.min(10.0, newPrice));
      priceRef.current = newPrice;
      
      // Update UI with current ref price
      setPrice(priceRef.current);
      
      // Update current candle in real-time
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
      
      animationId = requestAnimationFrame(animatePrice);
    };
    
    animationId = requestAnimationFrame(animatePrice);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // ============================================================================
  // GAME LOOP - Main tick for larger movements and new candles
  // ============================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      tickCount.current += 1;

      // Apply pending impact from trades
      const impact = pendingImpact.current;
      pendingImpact.current = 0;

      // In random mode during active round, generate local random movement
      // This provides chart movement until backend sends PRICE_TICK events
      let randomMovement = 0;
      if (game.priceMode === 'random' && game.roundStatus === 'active' && !game.isCrashed) {
        // Random walk: -3% to +3% per tick, with slight upward bias
        randomMovement = (Math.random() - 0.48) * 0.06;
      }

      // Calculate new price (trade impact + random movement in random mode)
      let newPrice = priceRef.current * (1 + impact + randomMovement);
      
      // Clamp to prevent going negative or too high
      newPrice = Math.max(0.1, Math.min(10.0, newPrice));
      
      // Update both current and target price for smooth animation
      priceRef.current = newPrice;
      targetPriceRef.current = newPrice;

      // Push new candle every N ticks
      if (tickCount.current % TICKS_PER_CANDLE === 0) {
        setCandles(prevCandles => {
          const newCandles = [...prevCandles];
          
          // New candle opens at previous candle's close for continuity
          const prevClose = newCandles.length > 0 
            ? newCandles[newCandles.length - 1].close 
            : newPrice;
          
          newCandles.push({
            open: prevClose,
            high: Math.max(prevClose, newPrice),
            low: Math.min(prevClose, newPrice),
            close: newPrice,
          });

          // Keep only last 100 candles for performance
          if (newCandles.length > 100) {
            newCandles.shift();
          }
          
          return newCandles;
        });
      }
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [game.priceMode, game.roundStatus, game.isCrashed]);

  // ============================================================================
  // TRADE HANDLERS - Now use deposited balance (no wallet approval per trade!)
  // ============================================================================
  const handleBuy = useCallback(async (amount: number) => {
    if (!connected) {
      // Open Privy wallet login modal if not connected
      login();
      return;
    }
    
    if (depositedBalance <= 0) {
      // Show deposit modal if no balance
      setShowDepositModal(true);
      setDepositError('Deposit SOL to start trading');
      return;
    }
    
    if (amount <= 0 || amount > depositedBalance) {
      console.log('❌ Invalid amount or insufficient deposited balance');
      return;
    }
    
    if (amount < GAME_CONSTANTS.MIN_TRADE_SOL) {
      console.log(`❌ Minimum trade is ${GAME_CONSTANTS.MIN_TRADE_SOL} SOL`);
      return;
    }
    
    setIsProcessingTrade(true);
    
    try {
      // Execute trade using deposited balance (NO WALLET APPROVAL!)
      const result = await game.buy(amount);
      
      if (result.success) {
        // Apply visual price impact
        const impactMultiplier = amount / 0.1;
        pendingImpact.current += PUMP_IMPACT * impactMultiplier;
        console.log(`🟢 BUY: ${amount.toFixed(4)} SOL`);
        
        // Add trade marker at current price and candle
        setTradeMarkers(prev => [...prev, {
          type: 'buy',
          price: priceRef.current,
          candleIndex: candles.length - 1,
        }]);
        
        // Update balance immediately if returned, otherwise refresh
        if (result.newBalance !== undefined) {
          updateDepositedBalance(result.newBalance);
        } else {
          refreshDepositedBalance();
        }
      } else {
        console.log(`❌ Buy failed: ${result.error}`);
        setTradeError(result.error || 'Buy failed');
      }
    } catch (error) {
      console.error('Error executing buy:', error);
    } finally {
      setIsProcessingTrade(false);
    }
  }, [connected, depositedBalance, game, login, refreshDepositedBalance, updateDepositedBalance]);

  const handleSell = useCallback(async (amount: number) => {
    if (!connected) {
      login();
      return;
    }
    
    if (amount <= 0 || game.tokenBalance <= 0) {
      console.log('❌ No position to sell');
      return;
    }
    
    if (amount < GAME_CONSTANTS.MIN_TRADE_SOL) {
      console.log(`❌ Minimum trade is ${GAME_CONSTANTS.MIN_TRADE_SOL} SOL`);
      return;
    }
    
    setIsProcessingTrade(true);
    
    try {
      // Execute sell (credits deposited balance - NO WALLET APPROVAL!)
      const result = await game.sell(amount);
      
      if (result.success) {
        // Apply visual price impact
        const impactMultiplier = amount / 0.1;
        pendingImpact.current -= DUMP_IMPACT * impactMultiplier;
        console.log(`🔴 SELL: ~${amount.toFixed(4)} SOL worth`);
        
        // Add trade marker at current price and candle
        setTradeMarkers(prev => [...prev, {
          type: 'sell',
          price: priceRef.current,
          candleIndex: candles.length - 1,
        }]);
        
        // Update balance immediately if returned, otherwise refresh
        if (result.newBalance !== undefined) {
          updateDepositedBalance(result.newBalance);
        } else {
          refreshDepositedBalance();
        }
      } else {
        console.log(`❌ Sell failed: ${result.error}`);
        setTradeError(result.error || 'Sell failed');
      }
    } catch (error) {
      console.error('Error executing sell:', error);
    } finally {
      setIsProcessingTrade(false);
    }
  }, [connected, game, login, refreshDepositedBalance, updateDepositedBalance]);

  // ============================================================================
  // DEPOSIT/WITHDRAW HANDLERS
  // ============================================================================
  const handleDeposit = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount < 0.001) {
      setDepositError('Minimum deposit is 0.001 SOL');
      return;
    }
    if (amount > walletBalance) {
      setDepositError('Insufficient wallet balance');
      return;
    }
    
    setIsDepositing(true);
    setDepositError(null);
    
    try {
      const result = await deposit(amount);
      if (result.success) {
        setDepositAmount('');
        setShowDepositModal(false);
        
        // Show bonus celebration if applicable
        if (result.bonusApplied && result.bonusAmount) {
          setSuccessMessage(`🎉 Deposited ${amount} SOL + ${result.bonusAmount} SOL bonus!`);
        } else {
          setSuccessMessage(`✅ Deposited ${amount} SOL`);
        }
      } else {
        setDepositError(result.error || 'Deposit failed');
      }
    } catch (error) {
      setDepositError('Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  }, [depositAmount, walletBalance, deposit]);

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 0.001) {
      setDepositError('Minimum withdrawal is 0.001 SOL');
      return;
    }
    if (amount > depositedBalance) {
      setDepositError('Insufficient deposited balance');
      return;
    }
    
    setIsWithdrawing(true);
    setDepositError(null);
    
    try {
      const result = await withdraw(amount);
      if (result.success) {
        setWithdrawAmount('');
        // Show pending message for withdrawals
        setSuccessMessage(result.message || '⏳ Withdrawal submitted - processing within 24-48 hours');
      } else {
        setDepositError(result.error || 'Withdrawal failed');
      }
    } catch (error) {
      setDepositError('Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  }, [withdrawAmount, depositedBalance, withdraw]);

  // ============================================================================
  // CALCULATED VALUES
  // ============================================================================
  const displayBalance = connected ? depositedBalance : 10.0; // Show 10 SOL for demo when not connected
  // Token value calculation available if needed: game.tokenBalance * price

  // Auto-hide trade error after 5 seconds
  useEffect(() => {
    if (tradeError) {
      const timer = setTimeout(() => setTradeError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [tradeError]);

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <>
      {/* Welcome Promo Popup */}
      {showPromoPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
          <div 
            style={{
              background: 'linear-gradient(135deg, #1e2029 0%, #15161d 100%)',
              border: '2px solid rgba(0, 255, 163, 0.3)',
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              width: 'calc(100% - 32px)',
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(0, 255, 163, 0.2)',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎁</div>
            <h2 
              style={{ 
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 24,
                fontWeight: 700,
                color: '#00FFA3',
                marginBottom: 12,
              }}
            >
              Welcome Bonus!
            </h2>
            <p 
              style={{ 
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 18,
                color: '#fff',
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Deposit <span style={{ color: '#00FFA3', fontWeight: 700 }}>1 SOL</span> and get{' '}
              <span style={{ color: '#facc15', fontWeight: 700 }}>0.5 SOL</span> reward!
            </p>
            <button
              onClick={handleDismissPromo}
              style={{
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(to right, #3B82F6, #00FFA3)',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                padding: '12px 32px',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
      
      {/* Success Message Toast */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg font-dynapuff text-sm animate-pulse">
          {successMessage}
        </div>
      )}
      
      {/* Backend Connection Error Banner */}
      {game.roundStatus === 'error' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white p-4 text-center">
          <div className="flex items-center justify-center gap-4">
            <span className="font-medium">
              ⚠️ {game.errorMessage || 'Unable to connect to game server'}
            </span>
            <button
              onClick={() => game.retryConnection()}
              className="px-4 py-1 bg-white text-red-600 rounded font-medium hover:bg-gray-100 transition-colors"
            >
              Retry
            </button>
          </div>
          <div className="text-sm mt-1 opacity-80">Auto-retrying every 5 seconds...</div>
        </div>
      )}

      {/* Username Modal - First time setup */}
      {showUsernameModal && connected && (
        <div className="username-modal-overlay">
          <div className="username-modal">
            {/* Icon */}
            <div className="username-modal-icon">
              <span>🎮</span>
            </div>
            
            {/* Title */}
            <h2 className="username-modal-title">Welcome to STR8.FUN!</h2>
            
            {/* Instructions */}
            <p className="username-modal-text">
              Choose a username to get started. Letters and numbers only, max 1 capital letter.
            </p>
            
            {/* Username Input */}
            <div className="username-input-wrap">
              <input
                type="text"
                value={usernameInput}
                onChange={handleUsernameChange} 
                onBlur={handleCheckUsername}
                placeholder="Enter username..."
                maxLength={20}
                className="username-input"
                autoFocus
              />
              <span className="username-char-count">{usernameInput.length}/20</span>
            </div>
            
            {/* Error Message */}
            {usernameError && (
              <div className="username-error">
                {usernameError}
              </div>
            )}
            
            {/* Submit Button */}
            <button
              onClick={handleSetUsername}
              disabled={!usernameInput || !!usernameError || isSettingUsername || isCheckingUsername}
              className="username-submit-btn"
            >
              {isSettingUsername ? 'Setting...' : isCheckingUsername ? 'Checking...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Deposit/Withdraw Modal */}
      {showDepositModal && connected && !showUsernameModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#12171f] rounded-2xl border border-[#1f2937] p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">💰 Manage Balance</h2>
              <button 
                onClick={() => { setShowDepositModal(false); setDepositError(null); }}
                className="text-gray-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1f2a] transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* Balance Display - Two columns */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#1a1f2a] rounded-xl p-4 text-center">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Wallet</div>
                <div className="flex items-center justify-center gap-2">
                  <img src={solanaLogo} alt="SOL" className="w-6 h-6" />
                  <span className="text-white font-bold text-xl">{walletBalance.toFixed(4)}</span>
                </div>
              </div>
              <div className="bg-[#1a1f2a] rounded-xl p-4 text-center border border-[#00ff88]/30">
                <div className="text-[#00ff88] text-xs uppercase tracking-wider mb-1">Game Balance</div>
                <div className="flex items-center justify-center gap-2">
                  <img src={solanaLogo} alt="SOL" className="w-6 h-6" />
                  <span className="text-[#00ff88] font-bold text-xl">{depositedBalance.toFixed(4)}</span>
                </div>
              </div>
            </div>
            
            {/* Error Message */}
            {depositError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                {depositError}
              </div>
            )}
            
            {/* Deposit Section */}
            <div className="mb-6">
              <label className="text-gray-400 text-sm font-medium mb-3 block">Deposit SOL to Game</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="flex-1 bg-[#1a1f2a] border border-[#2a3441] rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-[#00ff88] transition-colors"
                />
                <button
                  onClick={handleDeposit}
                  disabled={isDepositing}
                  className="px-6 py-4 bg-gradient-to-r from-[#00ff88] to-[#00cc6a] text-black font-bold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
                >
                  {isDepositing ? '...' : 'Deposit'}
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                {[0.1, 0.25, 0.5, 1.0].map((val) => (
                  <button
                    key={val}
                    onClick={() => setDepositAmount(val.toString())}
                    className="flex-1 py-2.5 bg-[#1a1f2a] border border-[#2a3441] rounded-lg text-sm text-gray-400 hover:text-white hover:border-[#00ff88] transition-colors"
                  >
                    {val} SOL
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#2a3441] my-6"></div>
            
            {/* Withdraw Section */}
            <div>
              <label className="text-gray-400 text-sm font-medium mb-3 block">Withdraw SOL to Wallet</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="flex-1 bg-[#1a1f2a] border border-[#2a3441] rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-[#00ff88] transition-colors"
                />
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || depositedBalance <= 0}
                  className="px-6 py-4 bg-[#2a3441] text-white font-bold rounded-xl hover:bg-[#3a4451] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
                >
                  {isWithdrawing ? '...' : 'Withdraw'}
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setWithdrawAmount((depositedBalance * pct / 100).toFixed(4))}
                    disabled={depositedBalance <= 0}
                    className="flex-1 py-2.5 bg-[#1a1f2a] border border-[#2a3441] rounded-lg text-sm text-gray-400 hover:text-white hover:border-[#00ff88] transition-colors disabled:opacity-50"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => {
                    const formatted = depositedBalance < 0.001 ? '0.000' : depositedBalance.toFixed(3);
                    setWithdrawAmount(formatted);
                  }}
                  disabled={depositedBalance <= 0}
                  className="flex-1 py-2.5 bg-[#1a1f2a] border border-[#2a3441] rounded-lg text-sm text-gray-400 hover:text-white hover:border-[#00ff88] transition-colors disabled:opacity-50"
                >
                  Max
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Game Layout */}
      <GameLayout
        header={
          <GlobalHeader
            onOpenDeposit={() => setShowDepositModal(true)}
            onOpenWithdraw={() => setShowDepositModal(true)}
            onToggleChat={() => setChatCollapsed(!chatCollapsed)}
          />
        }
        sidebar={
          <GlobalChatSidebar
            isCollapsed={chatCollapsed}
            onToggleCollapse={() => setChatCollapsed(!chatCollapsed)}
            room="pumpit"
            isWalletConnected={connected}
            walletAddress={publicKey?.toString() || null}
            getAuthToken={getAuthToken}
            onlineCount={game.onlineCount}
          />
        }
        sidebarCollapsed={chatCollapsed}
        statusBar={
          connected && !showUsernameModal ? (
            <LivePnLFeed playerPnL={playerPnL} />
          ) : null
        }
        chart={
          <div className="relative w-full h-full flex flex-col">
            <div className="relative flex-1">
              {/* Trade Error Popup - centered at top of chart */}
              {tradeError && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg font-dynapuff text-sm">
                  {tradeError}
                </div>
              )}
              <RugsChart 
                data={candles} 
                currentPrice={price} 
                startPrice={INITIAL_PRICE}
                positionValue={game.tokenBalance * price}
                unrealizedPnL={game.unrealizedPnL}
                hasPosition={game.tokenBalance > 0}
                tradeMarkers={tradeMarkers}
              />
            </div>
            {/* "Get Rinsed" Overlay - shows for 4 seconds after crash */}
            {game.showGetCooked && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 rounded-lg pointer-events-none">
                <div className="text-center">
                  <div className="text-7xl font-dynapuff font-bold text-red-500 animate-pulse" style={{ textShadow: '0 0 30px rgba(239, 68, 68, 0.8)' }}>
                    Get Rinsed
                  </div>
                </div>
              </div>
            )}
            {/* Round Countdown Overlay - inside chart only */}
            {game.roundStatus === 'countdown' && !game.showGetCooked && game.countdownRemaining > 0 && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 rounded-lg pointer-events-none">
                <div className="text-center">
                  <div className="text-6xl font-dynapuff font-bold text-yellow-400 mb-3 animate-pulse">
                    {formatTimeWithMs(game.countdownRemaining)}
                  </div>
                  <div className="text-xl font-dynapuff text-white/90">
                    Next round starting...
                  </div>
                  <div className="mt-3 text-sm text-white/50 font-dynapuff">
                    Get ready to trade!
                  </div>
                </div>
              </div>
            )}
          </div>
        }
        tradeControls={
          <TradeDeck
            balance={displayBalance}
            currentPrice={price}
            onBuy={handleBuy}
            onSell={handleSell}
            tokenBalance={game.tokenBalance}
            onError={setTradeError}
          />
        }
        mobileTradeControls={
          <MobileTradeDeck
            balance={displayBalance}
            currentPrice={price}
            onBuy={handleBuy}
            onSell={handleSell}
            tokenBalance={game.tokenBalance}
            connected={connected}
            onError={setTradeError}
          />
        }
        leaderboard={
          <>
            <div id="ldrbrd-header">🏆 Leaderboard</div>
            <div id="ldrbrd-list">
              {leaderboard.isLoading ? (
                <div className="ldrbrd-row">
                  <span className="ldrbrd-name" style={{ opacity: 0.5 }}>Loading...</span>
                </div>
              ) : leaderboard.entries.length === 0 ? (
                <div className="ldrbrd-row">
                  <span className="ldrbrd-name" style={{ opacity: 0.5 }}>No data yet</span>
                </div>
              ) : (
                leaderboard.entries.map((entry) => (
                  <div key={entry.wallet_address || entry.rank} className="ldrbrd-row">
                    <span className={`ldrbrd-rank ${entry.rank === 1 ? 'gold' : entry.rank === 2 ? 'silver' : entry.rank === 3 ? 'bronze' : ''}`}>
                      {entry.rank}
                    </span>
                    <span className="ldrbrd-name">{entry.username}</span>
                    <span className={`ldrbrd-score ${entry.total_pnl < 0 ? 'negative' : ''}`}>
                      {entry.total_pnl >= 0 ? '+' : ''}{entry.total_pnl.toFixed(2)} SOL
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        }
        processingIndicator={
          isProcessingTrade ? (
            <div className="flex items-center justify-center py-3 mt-2">
              <div className="flex items-center gap-2 text-[#00ff88]">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-dynapuff">Processing trade...</span>
              </div>
            </div>
          ) : null
        }
      />

      {/* Chat Toggle Button - Always visible, moves with sidebar */}
      <button
        id="chat-toggle-btn"
        type="button"
        onClick={() => setChatCollapsed(!chatCollapsed)}
        className={`fixed z-50 rounded-full bg-[#facc15] flex items-center justify-center shadow-lg hover:bg-[#e6b800] transition-all duration-300 ${
          chatCollapsed ? 'w-12 h-12' : 'w-9 h-9'
        }`}
        style={{ 
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', 
          left: chatCollapsed ? 16 : 320 + 8, // 320px sidebar + 8px gap outside
          boxShadow: '0 0 20px rgba(250, 204, 21, 0.3)',
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s, height 0.2s, transform 0.3s ease',
        }}
        aria-label={chatCollapsed ? 'Open chat' : 'Close chat'}
      >
        <MessageCircle size={chatCollapsed ? 22 : 16} className="text-black" />
      </button>
    </>
  );
};

export default PumpItSim;
