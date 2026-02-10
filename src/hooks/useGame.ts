// ============================================================================
// GAME HOOK - Manages game round state, trades, and real-time updates
// Multiplier-based wagering — NO AMM/pool/token math
// Chart is 100% driven by server tick engine via WebSocket
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { PlayerPosition, Trade, GAME_CONSTANTS } from '../types/game';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://api.str8.fun';

const { MIN_TRADE_SOL } = GAME_CONSTANTS;
const COUNTDOWN_SECONDS = 12;
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
  priceHistory: number[];  // Full multiplier history for chart reconstruction

  // Crash state
  isCrashed: boolean;
  showGetCooked: boolean;
  finalMultiplier: number | null;

  // Price state (from server only — no local calculation)
  priceMultiplier: number;  // Current multiplier from server tick engine
  serverTickCount: number;  // Server's authoritative tick count

  // Player state (multiplier-based position)
  playerPosition: PlayerPosition | null;
  solWagered: number;        // SOL in active position
  entryMultiplier: number;   // Multiplier at entry
  currentValue: number;      // Current value of position
  unrealizedPnL: number;     // Profit/loss (current position only)
  roundPnL: number;          // Realized + unrealized PnL for entire round

  // Trade history
  recentTrades: Trade[];

  // Online players count
  onlineCount: number;

  // Actions
  buy: (solAmount: number) => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  sell: (solAmount: number) => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  sellAll: () => Promise<{ success: boolean; error?: string; newBalance?: number }>;
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

  // Crash state
  const [isCrashed, setIsCrashed] = useState<boolean>(false);
  const [showGetCooked, setShowGetCooked] = useState<boolean>(false);
  const [finalMultiplier, setFinalMultiplier] = useState<number | null>(null);

  // Price multiplier — solely from server
  const [priceMultiplier, setPriceMultiplier] = useState<number>(1.0);

  // Server tick count — authoritative candle boundary source
  const [serverTickCount, setServerTickCount] = useState<number>(0);

  // Track previous round ID for chart reset
  const [previousRoundId, setPreviousRoundId] = useState<string | null>(null);
  const [shouldResetChart, setShouldResetChart] = useState<boolean>(false);

  // Price history for chart reconstruction (from backend)
  const [priceHistory, setPriceHistory] = useState<number[]>([]);

  // Player state — multiplier-based position
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);

  // Trade history
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);

  // Online players count
  const [onlineCount, setOnlineCount] = useState<number>(0);

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTransitioningRef = useRef<boolean>(false);
  const getRinsedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to track current round status for use in callbacks
  const roundStatusRef = useRef<'loading' | 'active' | 'ended' | 'countdown' | 'error'>(roundStatus);
  roundStatusRef.current = roundStatus;

  // Ref to track roundId for polling (avoids stale closure in setInterval)
  const roundIdRef = useRef<string | null>(roundId);
  roundIdRef.current = roundId;

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================

  const solWagered = playerPosition?.sol_wagered ?? 0;
  const entryMultiplier = playerPosition?.entry_multiplier ?? 1.0;
  const currentValue = solWagered > 0 ? solWagered * (priceMultiplier / entryMultiplier) : 0;
  const unrealizedPnL = currentValue - solWagered;

  // Round PnL: realized gains/losses + current unrealized
  // Only compute when round is active — during countdown/presale, PnL is frozen at 0
  const totalSolIn = playerPosition?.total_sol_in ?? 0;
  const totalSolOut = playerPosition?.total_sol_out ?? 0;
  const roundPnL = roundStatus === 'active' ? (totalSolOut + currentValue) - totalSolIn : 0;

  // ============================================================================
  // FETCH ACTIVE ROUND
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

      // Handle countdown status — preserve roundId for presale trades
      if (round.status === 'countdown') {
        if (round.id) {
          setRoundId(round.id);
        }
        if (roundStatusRef.current !== 'countdown') {
          setCountdownRemaining(round.countdown_seconds || COUNTDOWN_SECONDS);
          setRoundStatus('countdown');
          // Reset position and price for the new round
          setPlayerPosition(null);
          setPriceMultiplier(1.0);
          setServerTickCount(0);
        }
        setErrorMessage(null);
        return;
      }

      if (round && round.id) {
        setRoundId(round.id);
        setRoundStatus(round.status === 'active' ? 'active' : 'ended');
        setErrorMessage(null);
        setCountdownRemaining(0);

        // Set price multiplier from round data
        if (round.price_multiplier !== undefined) {
          setPriceMultiplier(Number(round.price_multiplier));
        } else if (round.current_price !== undefined) {
          setPriceMultiplier(Number(round.current_price));
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
        console.log('No active round returned from server');
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
        if (data?.position) {
          setPlayerPosition(data.position);
        } else {
          setPlayerPosition(null);
        }
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
  // COUNTDOWN TIMER
  // ============================================================================

  useEffect(() => {
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
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
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

    // Poll every 3s until we have a valid roundId — handles "between rounds"
    // states where the server hasn't created a new round yet
    const pollId = setInterval(() => {
      if (!roundIdRef.current) {
        console.log('[useGame] No roundId yet, polling fetchActiveRound...');
        fetchActiveRound();
      }
    }, 3000);

    return () => clearInterval(pollId);
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

  const retryConnection = useCallback(async () => {
    setErrorMessage(null);
    await fetchActiveRound();
  }, [fetchActiveRound]);

  // ============================================================================
  // WEBSOCKET REALTIME SUBSCRIPTIONS
  // ============================================================================

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
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
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channels: ['round', 'trades', 'chat'],
        }));
        // Request current round state to catch up after (re)connect
        ws?.send(JSON.stringify({ type: 'get_round_state' }));
        if (walletAddress) {
          ws?.send(JSON.stringify({
            type: 'identify',
            wallet_address: walletAddress,
          }));
        }
        ws?.send(JSON.stringify({ type: 'get_online_count' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // ROUND_UPDATE: Round state changes (status, new round, etc.)
          // Does NOT drive chart price — that comes from PRICE_TICK
          if (data.type === 'ROUND_UPDATE' && data.round) {
            const round = data.round;
            if (round.status === 'active') {
              // Transition from countdown/presale into live round
              if (round.id) setRoundId(round.id);
              setRoundStatus('active');
              roundStatusRef.current = 'active'; // Sync immediately so PRICE_TICK gate passes in same event loop
              setCountdownRemaining(0);
              setIsCrashed(false);
              setShowGetCooked(false);
              setFinalMultiplier(null);
            } else if (round.status !== 'active') {
              setRoundStatus('ended');
            }
          }

          // PRICE_TICK: Server tick engine sends price every 50ms
          // This is the ONLY source that drives the chart multiplier
          if (data.type === 'PRICE_TICK') {
            // If we're in countdown but receiving early ticks, the round has
            // started on the server — auto-transition to active immediately
            if (roundStatusRef.current === 'countdown') {
              const tickCount = data.tick_count !== undefined ? Number(data.tick_count) : -1;
              if (tickCount >= 0 && tickCount <= 10) {
                console.log('[WebSocket] Early PRICE_TICK during countdown — auto-activating round');
                setRoundStatus('active');
                roundStatusRef.current = 'active';
                setCountdownRemaining(0);
                setIsCrashed(false);
                setShowGetCooked(false);
                setFinalMultiplier(null);
              }
            }

            if (roundStatusRef.current === 'active') {
              const newPrice = Number(data.price);
              setPriceMultiplier(newPrice);
              if (data.tick_count !== undefined) {
                setServerTickCount(Number(data.tick_count));
              }
              // Synchronous event bypasses React effect batching in background tabs
              window.dispatchEvent(new CustomEvent('pumpit:price_tick', {
                detail: { price: newPrice, tick_count: data.tick_count },
              }));
            }
          }

          // ROUND_CRASH: Server signals round end (rug pull!)
          if (data.type === 'ROUND_CRASH') {
            console.log('[WebSocket] ROUND_CRASH received:', data);

            if (isTransitioningRef.current) {
              console.log('[WebSocket] Already transitioning, ignoring ROUND_CRASH');
              return;
            }
            isTransitioningRef.current = true;

            if (getRinsedTimeoutRef.current) {
              clearTimeout(getRinsedTimeoutRef.current);
            }

            setIsCrashed(true);
            setShowGetCooked(true);
            setFinalMultiplier(Number(data.final_multiplier) || 0);
            setRoundStatus('ended');
            setPlayerPosition(null);  // Position is lost on crash — clear immediately to prevent stale PnL

            getRinsedTimeoutRef.current = setTimeout(() => {
              console.log('[useGame] Get Rinsed timeout done, starting countdown');
              setShowGetCooked(false);
              setIsCrashed(false);
              setPlayerPosition(null);  // Safety net: ensure no stale position leaks into new round
              setRoundStatus('countdown');
              setCountdownRemaining(COUNTDOWN_SECONDS);
              isTransitioningRef.current = false;
            }, GET_RINSED_DURATION);
          }

          // TRADE events — do NOT move chart, just update feed
          if (data.type === 'TRADE' && data.trade) {
            setRecentTrades((prev) => [data.trade, ...prev.slice(0, 49)]);
          }

          // POSITION_UPDATE from server (ignore during crash/ended/countdown to prevent stale data)
          if (data.type === 'POSITION_UPDATE' && data.position) {
            if (data.position.profile_id === profileId && !isTransitioningRef.current && roundStatusRef.current !== 'ended') {
              setPlayerPosition(data.position);
            }
          }

          if (data.type === 'ONLINE_COUNT') {
            setOnlineCount(data.count || 0);
          }

          // Rewards events — bridge to useRewards via CustomEvents
          if (data.type === 'XP_GAIN') {
            window.dispatchEvent(new CustomEvent('pumpit:xp_gain', { detail: data }));
          }
          if (data.type === 'LEVEL_UP') {
            window.dispatchEvent(new CustomEvent('pumpit:level_up', { detail: data }));
          }
          if (data.type === 'CHEST_REWARD') {
            window.dispatchEvent(new CustomEvent('pumpit:chest_reward', { detail: data }));
          }

          // Chat events — bridge to useChat via CustomEvent
          if (data.type === 'CHAT_MESSAGE') {
            window.dispatchEvent(new CustomEvent('pumpit:chat_message', { detail: data }));
          }

          // Referral events — bridge to useReferral via CustomEvents
          if (data.type === 'REFERRAL_COMMISSION') {
            window.dispatchEvent(new CustomEvent('pumpit:referral_commission', { detail: data }));
          }
          if (data.type === 'REFERRAL_MILESTONE') {
            window.dispatchEvent(new CustomEvent('pumpit:referral_milestone', { detail: data }));
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    };

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
  }, [profileId, walletAddress]);

  // ============================================================================
  // CHART RESET & POSITION SYNC - Clear data when round changes
  // ============================================================================

  useEffect(() => {
    if (roundId && roundId !== previousRoundId) {
      console.log('[useGame] Round changed:', previousRoundId, '->', roundId);

      if (previousRoundId !== null) {
        console.log('[useGame] New round started, resetting chart');
        setShouldResetChart(true);
        setPriceMultiplier(1.0);
        setServerTickCount(0);
        setPriceHistory([]);
      }

      // Clear position from previous round
      setPlayerPosition(null);

      if (walletAddress) {
        fetchPlayerPosition();
      }

      setPreviousRoundId(roundId);

      if (previousRoundId !== null) {
        const timeout = setTimeout(() => setShouldResetChart(false), 100);
        return () => clearTimeout(timeout);
      }
    }
  }, [roundId, previousRoundId, walletAddress, fetchPlayerPosition]);

  // ============================================================================
  // BUY ACTION — POST /api/game/trade { trade_type: "buy", sol_amount }
  // ============================================================================

  const buy = useCallback(async (solAmount: number): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    if (!roundId || !walletAddress || (roundStatus !== 'active' && roundStatus !== 'countdown')) {
      return { success: false, error: 'Round not active or not connected' };
    }

    if (solAmount < MIN_TRADE_SOL) {
      return { success: false, error: `Minimum trade is ${MIN_TRADE_SOL} SOL` };
    }

    try {
      console.log('[Trade] Executing BUY:', { walletAddress, solAmount, roundId });

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

      // Update position from response
      if (data.position) {
        setPlayerPosition(data.position);
      }

      console.log(`🟢 BUY: ${solAmount.toFixed(4)} SOL at ${data.entry_multiplier?.toFixed(2) || priceMultiplier.toFixed(2)}x`);

      return { success: true, newBalance: data.new_balance };
    } catch (error) {
      console.error('Error executing buy:', error);
      return { success: false, error: 'Transaction failed' };
    }
  }, [roundId, walletAddress, roundStatus, priceMultiplier, getAuthToken]);

  // ============================================================================
  // SELL ACTION — POST /api/game/trade { trade_type: "sell", sol_amount }
  // sol_amount = the wagered SOL amount to sell (NOT tokens)
  // ============================================================================

  const sell = useCallback(async (solAmount: number): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    if (!roundId || !walletAddress || roundStatus !== 'active') {
      return { success: false, error: 'Round not active or not connected' };
    }

    if (solAmount < MIN_TRADE_SOL) {
      return { success: false, error: `Minimum trade is ${MIN_TRADE_SOL} SOL` };
    }

    try {
      console.log('[Trade] Executing SELL:', { walletAddress, solAmount, roundId });

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

      // Update position from response
      if (data.position) {
        setPlayerPosition(data.position);
      } else {
        // Position fully closed
        setPlayerPosition(null);
      }

      console.log(`🔴 SELL: ${solAmount.toFixed(4)} SOL wagered | Received: ${data.sol_received?.toFixed(4) || 'N/A'} SOL`);

      return { success: true, newBalance: data.new_balance };
    } catch (error) {
      console.error('Error executing sell:', error);
      return { success: false, error: 'Transaction failed' };
    }
  }, [roundId, walletAddress, roundStatus, getAuthToken]);

  // ============================================================================
  // SELL ALL — POST /api/game/sell-all (no body needed)
  // ============================================================================

  const sellAll = useCallback(async (): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    if (!roundId || !walletAddress || roundStatus !== 'active') {
      return { success: false, error: 'Round not active or not connected' };
    }

    if (solWagered <= 0) {
      return { success: false, error: 'No position to sell' };
    }

    try {
      console.log('[Trade] Executing SELL ALL:', { walletAddress, roundId });

      const token = getAuthToken ? await getAuthToken() : null;
      const response = await fetch(`${API_URL}/api/game/sell-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Sell-all error:', data.error);
        return { success: false, error: data.error || 'Failed to sell position' };
      }

      // Position is fully closed
      setPlayerPosition(null);

      console.log(`🔴 SELL ALL | Received: ${data.sol_received?.toFixed(4) || 'N/A'} SOL`);

      return { success: true, newBalance: data.new_balance };
    } catch (error) {
      console.error('Error executing sell-all:', error);
      return { success: false, error: 'Transaction failed' };
    }
  }, [roundId, walletAddress, roundStatus, solWagered, getAuthToken]);

  // ============================================================================
  // RETURN STATE
  // ============================================================================

  return {
    // Round info
    roundId,
    roundStatus,
    countdownRemaining,
    shouldResetChart,
    priceHistory,

    // Crash state
    isCrashed,
    showGetCooked,
    finalMultiplier,

    // Price state (from server only)
    priceMultiplier,
    serverTickCount,

    // Player state (multiplier-based position)
    playerPosition,
    solWagered,
    entryMultiplier,
    currentValue,
    unrealizedPnL,
    roundPnL,

    // Trade history
    recentTrades,

    // Online count
    onlineCount,

    // Error state
    errorMessage,

    // Actions
    buy,
    sell,
    sellAll,
    refreshState,
    retryConnection,
  };
}

export default useGame;
