// ============================================================================
// MINE GAME HOOK — State management + API calls for MineIt
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// ============================================================================
// TYPES
// ============================================================================

export interface RevealedTile {
  index: number;
  type: 'green' | 'yellow' | 'red';
  damage_seed?: number;
}

export interface TileMapEntry {
  index: number;
  type: 'green' | 'yellow' | 'red';
  damage_seed?: number;
}

export interface MineGame {
  game_id: string;
  grid_size: number;
  total_tiles: number;
  red_count: number;
  yellow_count: number;
  green_count: number;
  bet_amount: number;
  current_multiplier: number;
  status: 'active' | 'bust' | 'cashout';
  payout: number | null;
  server_seed_hash: string;
  server_seed?: string;
  client_seed: string;
  nonce: number;
  revealed_tiles: RevealedTile[];
  tile_map?: TileMapEntry[];
  tiles_clicked: number;
  created_at: string;
  next_green_multiplier?: number;
  cashout_amount?: number;
  // v2 fixed-track fields
  greens_found: number;
  green_track: number[];
  max_multiplier: number;
  max_payout: number;
  auto_cashout?: boolean;
  cap_hit?: boolean;
}

export interface RevealResult {
  tile_type: 'green' | 'yellow' | 'red';
  new_multiplier: number;
  slash_amount?: number;
  game_over: boolean;
  payout?: number;
  auto_cashout?: boolean;
  cap_hit?: boolean;
}

export interface MineHistoryEntry extends MineGame {
  // History entries include the full tile_map and server_seed
}

export type GamePhase = 'config' | 'active' | 'ended';

export interface UseMineGameReturn {
  // State
  game: MineGame | null;
  phase: GamePhase;
  isLoading: boolean;
  isRevealing: boolean;
  lastReveal: RevealResult | null;
  error: string | null;
  history: MineHistoryEntry[];
  isLoadingHistory: boolean;

  // Actions
  createGame: (params: {
    bet_amount: number;
    grid_size: number;
    red_count: number;
    yellow_count: number;
    client_seed?: string;
  }) => Promise<boolean>;
  revealTile: (tileIndex: number) => Promise<RevealResult | null>;
  cashout: () => Promise<boolean>;
  fetchActive: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  clearError: () => void;
  resetGame: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useMineGame(
  getAuthToken: (() => Promise<string | null>) | undefined,
  walletAddress: string | null,
  refreshBalance?: () => Promise<void>,
): UseMineGameReturn {
  const [game, setGame] = useState<MineGame | null>(null);
  const [phase, setPhase] = useState<GamePhase>('config');
  const [isLoading, setIsLoading] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [lastReveal, setLastReveal] = useState<RevealResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MineHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Helper: build auth headers
  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (walletAddress) headers['x-wallet-address'] = walletAddress;
    if (getAuthToken) {
      const token = await getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-auth-token'] = token;
      }
    }
    return headers;
  }, [getAuthToken, walletAddress]);

  // ── Fetch active game (page load recovery) ──────────────────────────────
  const fetchActive = useCallback(async () => {
    if (!getAuthToken || !walletAddress) return;
    setIsLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/api/mine/active`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.game && data.game.status === 'active') {
          if (mountedRef.current) {
            setGame(data.game);
            setPhase('active');
          }
        }
      }
    } catch (err) {
      console.error('[useMineGame] fetchActive error:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [getAuthToken, walletAddress, getHeaders]);

  // ── Auto-recover on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (walletAddress && getAuthToken) {
      fetchActive();
    }
  }, [walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create game ─────────────────────────────────────────────────────────
  const createGame = useCallback(async (params: {
    bet_amount: number;
    grid_size: number;
    red_count: number;
    yellow_count: number;
    client_seed?: string;
  }): Promise<boolean> => {
    if (!getAuthToken || !walletAddress) {
      setError('Connect wallet to play');
      return false;
    }
    setIsLoading(true);
    setError(null);
    setLastReveal(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/api/mine/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bet_amount: params.bet_amount,
          grid_size: params.grid_size,
          red_count: params.red_count,
          yellow_count: params.yellow_count,
          client_seed: params.client_seed || 'default',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to create game');
        return false;
      }
      if (mountedRef.current) {
        setGame(data.game);
        setPhase('active');
        refreshBalance?.();
      }
      return true;
    } catch (err) {
      setError('Network error — try again');
      return false;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [getAuthToken, walletAddress, getHeaders, refreshBalance]);

  // ── Reveal tile ─────────────────────────────────────────────────────────
  const revealTile = useCallback(async (tileIndex: number): Promise<RevealResult | null> => {
    if (!game || !getAuthToken) return null;
    setIsRevealing(true);
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/api/mine/reveal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ game_id: game.game_id, tile_index: tileIndex }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to reveal tile');
        return null;
      }
      const result: RevealResult = {
        tile_type: data.tile_type,
        new_multiplier: data.new_multiplier,
        slash_amount: data.slash_amount,
        game_over: data.game_over,
        payout: data.payout,
        auto_cashout: data.auto_cashout,
        cap_hit: data.cap_hit,
      };
      if (mountedRef.current) {
        setGame(data.game);
        setLastReveal(result);
        if (data.game_over) {
          setPhase('ended');
          refreshBalance?.();
        }
      }
      return result;
    } catch (err) {
      setError('Network error — try again');
      return null;
    } finally {
      if (mountedRef.current) setIsRevealing(false);
    }
  }, [game, getAuthToken, getHeaders, refreshBalance]);

  // ── Cashout ─────────────────────────────────────────────────────────────
  const cashout = useCallback(async (): Promise<boolean> => {
    if (!game || !getAuthToken) return false;
    setIsLoading(true);
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/api/mine/cashout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ game_id: game.game_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to cash out');
        return false;
      }
      if (mountedRef.current) {
        setGame(data.game);
        setPhase('ended');
        refreshBalance?.();
      }
      return true;
    } catch (err) {
      setError('Network error — try again');
      return false;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [game, getAuthToken, getHeaders, refreshBalance]);

  // ── Fetch history ───────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!getAuthToken || !walletAddress) return;
    setIsLoadingHistory(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/api/mine/history?limit=20`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setHistory(Array.isArray(data.games) ? data.games : []);
        }
      }
    } catch (err) {
      console.error('[useMineGame] fetchHistory error:', err);
    } finally {
      if (mountedRef.current) setIsLoadingHistory(false);
    }
  }, [getAuthToken, walletAddress, getHeaders]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  const resetGame = useCallback(() => {
    setGame(null);
    setPhase('config');
    setLastReveal(null);
    setError(null);
  }, []);

  return {
    game,
    phase,
    isLoading,
    isRevealing,
    lastReveal,
    error,
    history,
    isLoadingHistory,
    createGame,
    revealTile,
    cashout,
    fetchActive,
    fetchHistory,
    clearError,
    resetGame,
  };
}
