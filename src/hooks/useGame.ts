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

const { ROUND_DURATION_SECONDS, MIN_TRADE_SOL } = GAME_CONSTANTS;
const COUNTDOWN_SECONDS = 20; // Time between rounds

// ============================================================================
// TYPES
// ============================================================================

export interface GameState {
  // Round info
  roundId: string | null;
  roundStatus: 'loading' | 'active' | 'ended' | 'countdown' | 'error';
  timeRemaining: number;
  countdownRemaining: number;
  
  // Pool state
  pool: Pool;
  price: number;
  priceMultiplier: number;
  
  // Player state
  playerPosition: PlayerPosition | null;
  tokenBalance: number;
  totalSolIn: number;
  totalSolOut: number;
  unrealizedPnL: number;
  
  // Trade history
  recentTrades: Trade[];
  
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
  const [timeRemaining, setTimeRemaining] = useState<number>(ROUND_DURATION_SECONDS);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(0);
  const [roundStartedAt, setRoundStartedAt] = useState<Date | null>(null);
  
  // Pool state
  const [pool, setPool] = useState<Pool>(createInitialPool());
  
  // Player state
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);
  
  // Trade history
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  
  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Refs for timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Retry ref for auto-retry
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  
  const price = getPrice(pool);
  const priceMultiplier = getPriceMultiplier(pool);
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
      setRoundStatus('loading');
      const response = await fetch(`${API_URL}/api/game/round`);
      
      if (!response.ok) {
        console.error('Error fetching active round:', response.status);
        setRoundStatus('error');
        setErrorMessage('Failed to connect to game server');
        return;
      }
      
      const round = await response.json();
      
      if (round && round.id) {
        setRoundId(round.id);
        setRoundStartedAt(new Date(round.started_at));
        setPool({
          solBalance: Number(round.pool_sol_balance) || 0,
          tokenSupply: Number(round.pool_token_supply) || 1_000_000,
          accumulatedFees: Number(round.accumulated_fees) || 0,
        });
        setRoundStatus(round.status === 'active' ? 'active' : 'ended');
        setErrorMessage(null);
        
        // Calculate time remaining
        const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000;
        const remaining = Math.max(0, (round.duration_seconds || ROUND_DURATION_SECONDS) - elapsed);
        setTimeRemaining(Math.ceil(remaining));
      } else {
        // No active round from server - show error
        console.error('No active round returned from server');
        setRoundStatus('error');
        setErrorMessage('No active game round available');
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
  // TIMER
  // ============================================================================
  
  useEffect(() => {
    if (roundStatus !== 'active' && roundStatus !== 'countdown') return;
    
    const updateTimer = () => {
      if (roundStatus === 'active' && roundStartedAt) {
        const elapsed = (Date.now() - roundStartedAt.getTime()) / 1000;
        const remaining = Math.max(0, ROUND_DURATION_SECONDS - elapsed);
        setTimeRemaining(Math.ceil(remaining));
        
        if (remaining <= 0) {
          // Round ended, start 20s countdown
          setRoundStatus('countdown');
          setCountdownRemaining(COUNTDOWN_SECONDS);
        }
      } else if (roundStatus === 'countdown') {
        setCountdownRemaining(prev => {
          const newVal = prev - 0.1;
          if (newVal <= 0) {
            // Countdown finished, fetch new round
            refreshState();
            return 0;
          }
          return newVal;
        });
      }
    };
    
    updateTimer();
    timerRef.current = setInterval(updateTimer, 100);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [roundStatus, roundStartedAt, refreshState]);

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
            if (round.status !== 'active') {
              setRoundStatus('ended');
            }
          }
          
          if (data.type === 'TRADE' && data.trade) {
            setRecentTrades((prev) => [data.trade, ...prev.slice(0, 49)]);
          }
          
          if (data.type === 'POSITION_UPDATE' && data.position) {
            if (data.position.profile_id === profileId) {
              setPlayerPosition(data.position);
            }
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
    
    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roundId, profileId, walletAddress]);

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
      
      // Get auth token if available (backend should work without it)
      const token = getAuthToken ? await getAuthToken() : null;
      console.log('[Trade] Executing BUY:', { walletAddress, solAmount, roundId });
      
      // Execute trade via Express API
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
      
      console.log(`🟢 BUY: ${solAmount.toFixed(4)} SOL | Tokens: ${data.tokens_traded?.toFixed(2) || calculation.tokensTransferred.toFixed(2)}`);
      
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
    
    if (tokenBalance <= 0) {
      return { success: false, error: 'No tokens to sell' };
    }
    
    try {
      // Calculate how many tokens needed for this SOL value
      const { tokensNeeded, ...calculation } = calculateSellBySolValue(pool, solAmount);
      
      if (tokensNeeded > tokenBalance) {
        return { success: false, error: 'Not enough tokens' };
      }
      
      // Get auth token if available (backend should work without it)
      const token = getAuthToken ? await getAuthToken() : null;
      console.log('[Trade] Executing SELL:', { walletAddress, solAmount, roundId });
      
      // Execute trade via Express API
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
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.error('Trade error:', data.error);
        return { success: false, error: data.error || 'Failed to execute trade' };
      }
      
      // Update local state optimistically
      applySell(pool, calculation);
      setPool({ ...pool });
      
      // Update position if returned
      if (data.position) {
        setPlayerPosition(data.position);
      }
      
      console.log(`🔴 SELL: ${solAmount.toFixed(4)} SOL worth | Net: ${data.sol_received?.toFixed(4) || calculation.netAmount.toFixed(4)} SOL`);
      
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
    timeRemaining,
    countdownRemaining,
    
    // Pool state
    pool,
    price,
    priceMultiplier,
    
    // Player state
    playerPosition,
    tokenBalance,
    totalSolIn,
    totalSolOut,
    unrealizedPnL,
    
    // Trade history
    recentTrades,
    
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
