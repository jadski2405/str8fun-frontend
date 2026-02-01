// ============================================================================
// LEADERBOARD HOOK - Fetches and manages leaderboard data
// Refreshes every hour, shows top players by PnL
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';
const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// ============================================================================
// TYPES
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  username: string;
  wallet_address: string;
  total_pnl: number;
  trades_count: number;
}

export interface LeaderboardState {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useLeaderboard(limit: number = 10): LeaderboardState {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/game/leaderboard?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.leaderboard)) {
        setEntries(data.leaderboard.map((entry: any, index: number) => ({
          rank: index + 1,
          username: entry.username || `Player${index + 1}`,
          wallet_address: entry.wallet_address || '',
          total_pnl: Number(entry.total_pnl) || 0,
          trades_count: Number(entry.trades_count) || 0,
        })));
        setLastUpdated(new Date());
      } else {
        // No data or empty leaderboard
        setEntries([]);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      // Keep existing entries on error
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  // Initial fetch
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Refresh every hour
  useEffect(() => {
    const interval = setInterval(fetchLeaderboard, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return {
    entries,
    isLoading,
    error,
    lastUpdated,
    refresh: fetchLeaderboard,
  };
}

export default useLeaderboard;
