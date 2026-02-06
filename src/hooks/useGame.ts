// ============================================================================
// GAME HOOK - Manages game round state, trades, and real-time updates
// Uses deposited balance for instant trading (no wallet approval per trade)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Pool, 
  createInitialPool, 
  calculateBuy, 
  calculateSellBySolValue,
  getPrice,
  getPriceMultiplier,
  applyBuy,
  applySell,
} from '../lib/poolEngine';
import { PlayerPosition, Trade, GAME_CONSTANTS } from '../types/game';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://api.str8.fun';

const { MIN_TRADE_SOL } = GAME_CONSTANTS;
const COUNTDOWN_SECONDS = 12; // Time between rounds (after "Get Rinsed" message)
const GET_RINSED_DURATION = 4000; // 4 seconds for "Get Rinsed" message

// ============================================================================
// TYPES
// ============================================================================

export interface GameState {
  // Round info
  roundId: string | null;
  roundStatus: 'loading' | 'active' | 'ended' | 'countdown' | 'error';
  countdownRemaining: number;
  shouldResetChart: boolean;
  priceMode: 'amm' | 'random';  // AMM = pool-based, Random = server tick engine
  priceHistory: number[];  // Full price history for chart reconstruction
  
  // Crash state (random round end)
  isCrashed: boolean;
  showGetCooked: boolean;
  finalMultiplier: number | null;  // Price at crash
  
  // Pool state
  pool: Pool;
  price: number;
  priceMultiplier: number;
  tickPrice: number | null;  // Server-generated tick price (random mode)
  
  // Player state
  playerPosition: PlayerPosition | null;
  tokenBalance: number;
  totalSolIn: number;
  totalSolOut: number;
  unrealizedPnL: number;
  
  // Trade history
  recentTrades: Trade[];
  
  // Online players count
  onlineCount: number;
  
  // Actions - NO wallet approval needed, uses deposited balance
  buy: (solAmount: number) => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  sell: (solAmount: number) => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  refreshState: () => Promise<void>;
  retryConnection: () => Promise<void>;
  
  // Error state
  errorMessage: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useGame(
  profileId: string | null, 
  walletAddress: string | null,
  getAuthToken?: () => Promise<string | null>
): GameState {
  // Round state
  const [roundId, setRoundId] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState<'loading' | 'active' | 'ended' | 'countdown' | 'error'>('loading');
  const [countdownRemaining, setCountdownRemaining] = useState<number>(0);
  
  // Crash state (random round end)
  const [isCrashed, setIsCrashed] = useState<boolean>(false);
  const [showGetCooked, setShowGetCooked] = useState<boolean>(false);
  const [finalMultiplier, setFinalMultiplier] = useState<number | null>(null);
  
  // Pool state
  const [pool, setPool] = useState<Pool>(createInitialPool());
  
  // Backend-provided price multiplier (use directly, no local calculation)
  const [backendPriceMultiplier, setBackendPriceMultiplier] = useState<number>(1.0);
  
  // Price mode: 'amm' or 'random' (from backend)
  const [priceMode, setPriceMode] = useState<'amm' | 'random'>('random');
  
  // Server tick price for random mode
  const [tickPrice, setTickPrice] = useState<number | null>(null);
  
  // Track previous round ID for chart reset
  const [previousRoundId, setPreviousRoundId] = useState<string | null>(null);
  const [shouldResetChart, setShouldResetChart] = useState<boolean>(false);
  
  // Price history for chart reconstruction (from backend)
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  
  // Player state
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);
  
  // Trade history
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  
  // Online players count (0 until WebSocket sends real data)
  const [onlineCount, setOnlineCount] = useState<number>(0);
  
  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Refs for timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Retry ref for auto-retry
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref to prevent multiple countdown transitions
  const isTransitioningRef = useRef<boolean>(false);
  
  // Ref to track Get Rinsed timeout
  const getRinsedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref to track current round status for use in callbacks (avoids stale closures)
  const roundStatusRef = useRef<'loading' | 'active' | 'ended' | 'countdown' | 'error'>(roundStatus);
  roundStatusRef.current = roundStatus; // Keep in sync on each render

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  
  const price = getPrice(pool);
  // Use backend-provided multiplier directly if available, otherwise calculate locally
  const priceMultiplier = backendPriceMultiplier > 0 ? backendPriceMultiplier : getPriceMultiplier(pool);
  const tokenBalance = playerPosition?.token_balance ?? 0;
  const totalSolIn = playerPosition?.total_sol_in ?? 0;
  const totalSolOut = playerPosition?.total_sol_out ?? 0;
  
  // Calculate unrealized PnL
  const tokenValueInSol = tokenBalance > 0 ? tokenBalance * price : 0;
  const unrealizedPnL = (totalSolOut + tokenValueInSol) - totalSolIn;

  // ============================================================================
  // FETCH ACTIVE ROUND (using Express API)
  // ============================================================================
  
  const fetchActiveRound = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/game/round`);
      
      if (!response.ok) {
        console.error('Error fetching active round:', response.status);
        setRoundStatus('error');
        setErrorMessage('Failed to connect to game server');
        return;
      }
      
      const round = await response.json();
      
      // Handle countdown status - this is NOT an error
      if (round.status === 'countdown') {
        setRoundId(null);
        // Only set countdown if not already counting down
        if (roundStatusRef.current !== 'countdown') {
          setCountdownRemaining(round.countdown_seconds || COUNTDOWN_SECONDS);
          setRoundStatus('countdown');
        }
        setErrorMessage(null);
        return; // Don't retry, countdown is expected
      }
      
      if (round && round.id) {
        setRoundId(round.id);
        setPool({
          solBalance: Number(round.pool_sol_balance) || 0,
          tokenSupply: Number(round.pool_token_supply) || 1_000_000,
          accumulatedFees: Number(round.accumulated_fees) || 0,
        });
        setRoundStatus(round.status === 'active' ? 'active' : 'ended');
        setErrorMessage(null);
        setCountdownRemaining(0);
        
        // Set price mode from backend
        if (round.price_mode) {
          setPriceMode(round.price_mode as 'amm' | 'random');
        }
        
        // Set tick price if in random mode
        if (round.tick_price !== undefined) {
          setTickPrice(Number(round.tick_price));
        }
        
        // Set price history if available (for mid-round joins)
        if (round.price_history && Array.isArray(round.price_history)) {
          setPriceHistory(round.price_history.map((p: number) => Number(p)));
        }
        
        // Reset crash state for active round
        setIsCrashed(false);
        setShowGetCooked(false);
        setFinalMultiplier(null);
      } else {
        // Only log "no active round" if we're NOT in countdown and id is missing
        console.log('No active round returned from server');
        // Only start countdown if not already in one
        if (roundStatusRef.current !== 'countdown') {
          setRoundStatus('countdown');
          setCountdownRemaining(COUNTDOWN_SECONDS);
        }
        setErrorMessage(null);
      }
      
    } catch (error) {
      console.error('Error in fetchActiveRound:', error);
      setRoundStatus('error');
      setErrorMessage('Unable to connect to game server');
    }
  }, []);

  // ============================================================================
  // FETCH PLAYER POSITION
  // ============================================================================
  
  const fetchPlayerPosition = useCallback(async () => {
    if (!roundId || !walletAddress) {
      setPlayerPosition(null);
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/game/position/${walletAddress}`);
      if (response.ok) {
        const data = await response.json();
        setPlayerPosition(data?.position || null);
      }
    } catch (error) {
      console.error('Error fetching position:', error);
    }
  }, [roundId, walletAddress]);

  // ============================================================================
  // FETCH RECENT TRADES
  // ============================================================================
  
  const fetchRecentTrades = useCallback(async () => {
    if (!roundId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/game/trades/${roundId}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setRecentTrades(data?.trades || []);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    }
  }, [roundId]);

  // ============================================================================
  // REFRESH ALL STATE
  // ============================================================================
  
  const refreshState = useCallback(async () => {
    await fetchActiveRound();
    await fetchPlayerPosition();
    await fetchRecentTrades();
  }, [fetchActiveRound, fetchPlayerPosition, fetchRecentTrades]);

  // ============================================================================
  // COUNTDOWN TIMER (only during countdown phase, not active round)
  // ============================================================================
  
  useEffect(() => {
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (roundStatus !== 'countdown') return;
    if (countdownRemaining <= 0) return;
    
    const updateTimer = () => {
      setCountdownRemaining(prev => {
        const newVal = prev - 0.1;
        if (newVal <= 0) {
          // Countdown finished - clear timer and fetch new round
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          // Reset transition flag
          isTransitioningRef.current = false;
          refreshState();
          return 0;
        }
        return newVal;
      });
    };
    
    timerRef.current = setInterval(updateTimer, 100);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [roundStatus, refreshState]);

  // ============================================================================
  // INITIAL LOAD
  // ============================================================================
  
  useEffect(() => {
    fetchActiveRound();
  }, [fetchActiveRound]);
  
  useEffect(() => {
    fetchPlayerPosition();
  }, [fetchPlayerPosition]);
  
  useEffect(() => {
    fetchRecentTrades();
  }, [fetchRecentTrades]);

  // ============================================================================
  // AUTO-RETRY ON ERROR
  // ============================================================================
  
  useEffect(() => {
    if (roundStatus === 'error') {
      // Retry every 5 seconds
      retryTimeoutRef.current = setInterval(() => {
        console.log('Auto-retrying connection to game server...');
        fetchActiveRound();
      }, 5000);
      
      return () => {
        if (retryTimeoutRef.current) {
          clearInterval(retryTimeoutRef.current);
        }
      };
    }
  }, [roundStatus, fetchActiveRound]);

  // Manual retry connection
  const retryConnection = useCallback(async () => {
    setErrorMessage(null);
    await fetchActiveRound();
  }, [fetchActiveRound]);

  // ============================================================================
  // WEBSOCKET REALTIME SUBSCRIPTIONS
  // ============================================================================
  
  const wsRef = useRef<WebSocket | null>(null);
  
  useEffect(() => {
    if (!roundId) return;
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;
    
    const connect = () => {
      if (!isMounted) return;
      
      ws = new WebSocket(`${WS_URL}/ws`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        if (!isMounted) return;
        console.log('✅ WebSocket connected');
        // Subscribe to channels
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channels: ['round', 'trades', 'chat'],
        }));
        // Identify with wallet if available
        if (walletAddress) {
          ws?.send(JSON.stringify({
            type: 'identify',
            wallet_address: walletAddress,
          }));
        }
        // Request current online count
        ws?.send(JSON.stringify({ type: 'get_online_count' }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'ROUND_UPDATE' && data.round) {
            const round = data.round;
            setPool({
              solBalance: Number(round.pool_sol_balance) || 0,
              tokenSupply: Number(round.pool_token_supply) || 1_000_000,
              accumulatedFees: Number(round.accumulated_fees) || 0,
            });
            // Use backend price_multiplier directly if provided
            if (round.price_multiplier !== undefined) {
              setBackendPriceMultiplier(Number(round.price_multiplier));
            }
            // Update price mode
            if (round.price_mode) {
              setPriceMode(round.price_mode as 'amm' | 'random');
            }
            // Update tick price for random mode
            if (round.tick_price !== undefined) {
              setTickPrice(Number(round.tick_price));
            }
            // Initialize price history if provided (for mid-round joins)
            if (round.price_history && Array.isArray(round.price_history)) {
              setPriceHistory(round.price_history.map((p: number) => Number(p)));
            }
            if (round.status !== 'active') {
              setRoundStatus('ended');
            }
          }
          
          // PRICE_TICK: Server-generated price ticks for random mode
          if (data.type === 'PRICE_TICK') {
            const newPrice = Number(data.price);
            setTickPrice(newPrice);
            // Append new price to history
            setPriceHistory(prev => [...prev, newPrice]);
            // Also update the price multiplier for display
            setBackendPriceMultiplier(Number(data.price));
          }
          
          // ROUND_CRASH: Server signals random round end (rug pull!)
          if (data.type === 'ROUND_CRASH') {
            console.log('[WebSocket] ROUND_CRASH received:', data);
            
            // Prevent multiple crash handlers
            if (isTransitioningRef.current) {
              console.log('[WebSocket] Already transitioning, ignoring ROUND_CRASH');
              return;
            }
            isTransitioningRef.current = true;
            
            // Clear any existing Get Rinsed timeout
            if (getRinsedTimeoutRef.current) {
              clearTimeout(getRinsedTimeoutRef.current);
            }
            
            setIsCrashed(true);
            setShowGetCooked(true);
            setFinalMultiplier(Number(data.final_multiplier) || 0);
            setRoundStatus('ended');
            
            // After 4 seconds of "Get Rinsed", transition to countdown
            getRinsedTimeoutRef.current = setTimeout(() => {
              console.log('[useGame] Get Rinsed timeout done, starting countdown');
              setShowGetCooked(false);
              setIsCrashed(false);
              setRoundStatus('countdown');
              setCountdownRemaining(COUNTDOWN_SECONDS);
              isTransitioningRef.current = false;
            }, GET_RINSED_DURATION);
          }
          
          // Update price multiplier from trade events
          if (data.type === 'TRADE' && data.price_multiplier !== undefined) {
            setBackendPriceMultiplier(Number(data.price_multiplier));
          }
          
          if (data.type === 'TRADE' && data.trade) {
            setRecentTrades((prev) => [data.trade, ...prev.slice(0, 49)]);
          }
          
          if (data.type === 'POSITION_UPDATE' && data.position) {
            if (data.position.profile_id === profileId) {
              setPlayerPosition(data.position);
            }
          }
          
          if (data.type === 'ONLINE_COUNT') {
            setOnlineCount(data.count || 0);
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };
      
      ws.onerror = () => {
        // Suppress error logging - reconnection will handle it
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 2 seconds if still mounted
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    };
    
    // Small delay to avoid React Strict Mode double-mount issues
    const initTimeout = setTimeout(connect, 100);
    
    // Periodically request online count every 30 seconds
    const onlineCountInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'get_online_count' }));
      }
    }, 30000);
    
    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      clearTimeout(reconnectTimeout);
      clearInterval(onlineCountInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roundId, profileId, walletAddress]);

  // ============================================================================
  // CHART RESET & POSITION SYNC - Clear data when round changes
  // ============================================================================
  
  useEffect(() => {
    if (roundId && roundId !== previousRoundId) {
      console.log('[useGame] Round changed:', previousRoundId, '->', roundId);
      
      // Only reset chart when going from one VALID round to another VALID round
      // (not on initial page load when previousRoundId is null)
      if (previousRoundId !== null) {
        console.log('[useGame] New round started, resetting chart');
        setShouldResetChart(true);
        setBackendPriceMultiplier(1.0); // Reset to 1.0x for new round
        setPriceHistory([]); // Clear old history, will be populated by new round data
      }
      
      // Clear position from previous round - IMPORTANT for sell validation
      setPlayerPosition(null);
      
      // Fetch fresh position for new round
      if (walletAddress) {
        fetchPlayerPosition();
      }
      
      setPreviousRoundId(roundId);
      
      // Reset the chart flag after a short delay so components can react
      if (previousRoundId !== null) {
        const timeout = setTimeout(() => setShouldResetChart(false), 100);
        return () => clearTimeout(timeout);
      }
    }
  }, [roundId, previousRoundId, walletAddress, fetchPlayerPosition]);

  // ============================================================================
  // BUY ACTION - Uses deposited balance, no wallet approval needed
  // ============================================================================
  
  const buy = useCallback(async (solAmount: number): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    if (!roundId || !walletAddress || roundStatus !== 'active') {
      return { success: false, error: 'Round not active or not connected' };
    }
    
    if (solAmount < MIN_TRADE_SOL) {
      return { success: false, error: `Minimum trade is ${MIN_TRADE_SOL} SOL` };
    }
    
    try {
      // Calculate trade locally first for optimistic update
      const calculation = calculateBuy(pool, solAmount);
      
      console.log('[Trade] Executing BUY:', { walletAddress, solAmount, roundId });
      
      // Execute trade with retry on 401 (token refresh)
      const executeWithRetry = async (retries = 1): Promise<Response> => {
        const token = getAuthToken ? await getAuthToken() : null;
        const response = await fetch(`${API_URL}/api/game/trade`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
          },
          body: JSON.stringify({
            wallet_address: walletAddress,
            trade_type: 'buy',
            sol_amount: solAmount,
          }),
        });
        
        // Retry on 401 - token will be refreshed on next getAuthToken() call
        if (response.status === 401 && retries > 0) {
          console.log('[Trade] 401 on buy, refreshing token and retrying...');
          await new Promise(r => setTimeout(r, 500));
          return executeWithRetry(retries - 1);
        }
        return response;
      };
      
      const response = await executeWithRetry();
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.error('Trade error:', data.error);
        return { success: false, error: data.error || 'Failed to execute trade' };
      }
      
      // Update local state optimistically
      applyBuy(pool, calculation);
      setPool({ ...pool });
      
      // Update position if returned
      if (data.position) {
        setPlayerPosition(data.position);
      }
      
      console.log(`🟢 BUY: ${solAmount.toFixed(4)} SOL | Tokens: ${data.tokens_traded?.toFixed(4) || calculation.tokensTransferred.toFixed(4)}`);
      
      return { success: true, newBalance: data.new_balance };
    } catch (error) {
      console.error('Error executing buy:', error);
      return { success: false, error: 'Transaction failed' };
    }
  }, [roundId, walletAddress, roundStatus, pool]);

  // ============================================================================
  // SELL ACTION - Credits deposited balance, no wallet approval needed
  // ============================================================================
  
  const sell = useCallback(async (solAmount: number): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    if (!roundId || !walletAddress || roundStatus !== 'active') {
      return { success: false, error: 'Round not active or not connected' };
    }
    
    if (solAmount < MIN_TRADE_SOL) {
      return { success: false, error: `Minimum trade is ${MIN_TRADE_SOL} SOL` };
    }
    
    // Note: We skip frontend token validation and let the backend be source of truth
    // This prevents issues with stale position data from previous rounds
    console.log('[Trade] Attempting SELL:', { walletAddress, solAmount, roundId, localTokenBalance: tokenBalance });
    
    try {
      // Calculate expected values for optimistic update (may be stale)
      let calculation;
      try {
        const result = calculateSellBySolValue(pool, solAmount);
        calculation = result;
      } catch {
        // Pool calculation failed, let backend handle it
        calculation = null;
      }
      
      // Get auth token if available (backend should work without it)
      console.log('[Trade] Executing SELL:', { walletAddress, solAmount, roundId });
      
      // Execute trade with retry on 401 (token refresh)
      const executeWithRetry = async (retries = 1): Promise<Response> => {
        const token = getAuthToken ? await getAuthToken() : null;
        const response = await fetch(`${API_URL}/api/game/trade`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
          },
          body: JSON.stringify({
            wallet_address: walletAddress,
            trade_type: 'sell',
            sol_amount: solAmount,
          }),
        });
        
        // Retry on 401 - token will be refreshed on next getAuthToken() call
        if (response.status === 401 && retries > 0) {
          console.log('[Trade] 401 on sell, refreshing token and retrying...');
          await new Promise(r => setTimeout(r, 500));
          return executeWithRetry(retries - 1);
        }
        return response;
      };
      
      const response = await executeWithRetry();
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.error('Trade error:', data.error);
        return { success: false, error: data.error || 'Failed to execute trade' };
      }
      
      // Update local state from backend response
      if (calculation) {
        applySell(pool, calculation);
        setPool({ ...pool });
      }
      
      // Update position if returned
      if (data.position) {
        setPlayerPosition(data.position);
      }
      
      console.log(`🔴 SELL: ${solAmount.toFixed(4)} SOL worth | Net: ${data.sol_received?.toFixed(4) || 'N/A'} SOL`);
      
      return { success: true, newBalance: data.new_balance };
    } catch (error) {
      console.error('Error executing sell:', error);
      return { success: false, error: 'Transaction failed' };
    }
  }, [roundId, walletAddress, roundStatus, pool, tokenBalance]);

  // ============================================================================
  // RETURN STATE
  // ============================================================================
  
  return {
    // Round info
    roundId,
    roundStatus,
    countdownRemaining,
    shouldResetChart,
    priceMode,
    priceHistory,
    
    // Crash state
    isCrashed,
    showGetCooked,
    finalMultiplier,
    
    // Pool state
    pool,
    price,
    priceMultiplier,
    tickPrice,
    
    // Player state
    playerPosition,
    tokenBalance,
    totalSolIn,
    totalSolOut,
    unrealizedPnL,
    
    // Trade history
    recentTrades,
    
    // Online count
    onlineCount,
    
    // Error state
    errorMessage,
    
    // Actions
    buy,
    sell,
    refreshState,
    retryConnection,
  };
}

export default useGame;
