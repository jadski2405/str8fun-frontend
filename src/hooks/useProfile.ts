import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProfileStats, RecentGame, SocialConnection, LeaderboardPeriod } from '../types/game';
import type { LeaderboardEntry } from './useLeaderboard';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// Minimum seconds between OAuth initiation clicks (client-side throttle)
const OAUTH_THROTTLE_MS = 12_000;

// Map social_error query param codes to user-friendly messages
const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  discord_already_linked: 'This Discord account is already linked to another wallet',
  twitter_already_linked: 'This X account is already linked to another wallet',
  invalid_state: 'Authentication expired. Please try again',
  discord_failed: 'Failed to connect Discord. Please try again',
  twitter_failed: 'Failed to connect X. Please try again',
};

// ============================================================================
// Types
// ============================================================================

export interface UseProfileReturn {
  // Profile stats
  stats: ProfileStats | null;
  isLoadingStats: boolean;

  // Recent games
  recentGames: RecentGame[];
  isLoadingGames: boolean;

  // Social connections
  socials: SocialConnection[];
  isLoadingSocials: boolean;

  // Leaderboard with period support
  leaderboard: LeaderboardEntry[];
  leaderboardPeriod: LeaderboardPeriod;
  setLeaderboardPeriod: (period: LeaderboardPeriod) => void;
  isLoadingLeaderboard: boolean;
  leaderboardLastUpdated: Date | null;

  // Social actions
  connectDiscord: () => void;
  connectTwitter: () => void;
  disconnectSocial: (provider: 'discord' | 'twitter') => Promise<boolean>;
  isDisconnecting: boolean;

  // Social feedback (consumed by parent for toasts)
  socialMessage: string | null;
  socialError: string | null;
  clearSocialMessage: () => void;
  clearSocialError: () => void;

  // Data refresh
  refreshAll: () => void;
}

// ============================================================================
// useProfile — Profile modal data management
// ============================================================================

export function useProfile(
  walletAddress: string | null,
  getAuthToken: () => Promise<string | null>,
  isActive: boolean,
): UseProfileReturn {
  // Stats
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Recent games
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);

  // Socials
  const [socials, setSocials] = useState<SocialConnection[]>([]);
  const [isLoadingSocials, setIsLoadingSocials] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Social feedback
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>('all');
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardLastUpdated, setLeaderboardLastUpdated] = useState<Date | null>(null);

  const fetchedRef = useRef(false);
  const lastOAuthClickRef = useRef(0);

  const clearSocialMessage = useCallback(() => setSocialMessage(null), []);
  const clearSocialError = useCallback(() => setSocialError(null), []);

  // ── Fetch profile stats ─────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingStats(true);
    try {
      const res = await fetch(`${API_URL}/api/profile/stats?wallet=${walletAddress}`);
      if (res.status === 429) { console.warn('[useProfile] Stats rate limited'); setIsLoadingStats(false); return; }
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (e) {
      console.error('[useProfile] fetchStats error:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, [walletAddress]);

  // ── Fetch recent games ──────────────────────────────────────────────
  const fetchRecentGames = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingGames(true);
    try {
      const res = await fetch(`${API_URL}/api/profile/recent-games?wallet=${walletAddress}&limit=10`);
      if (res.status === 429) { console.warn('[useProfile] Recent games rate limited'); setIsLoadingGames(false); return; }
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.games)) {
          setRecentGames(data.games);
        }
      }
    } catch (e) {
      console.error('[useProfile] fetchRecentGames error:', e);
    } finally {
      setIsLoadingGames(false);
    }
  }, [walletAddress]);

  // ── Fetch social connections ────────────────────────────────────────
  const fetchSocials = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingSocials(true);
    try {
      const token = await getAuthToken();
      if (!token) { setIsLoadingSocials(false); return; }
      const res = await fetch(`${API_URL}/api/profile/socials`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.connections)) {
          setSocials(data.connections);
        }
      } else if (res.status === 429) {
        console.warn('[useProfile] Socials rate limited');
      }
    } catch (e) {
      console.error('[useProfile] fetchSocials error:', e);
    } finally {
      setIsLoadingSocials(false);
    }
  }, [walletAddress, getAuthToken]);

  // ── Fetch leaderboard with period ───────────────────────────────────
  const fetchLeaderboard = useCallback(async (period: LeaderboardPeriod) => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetch(`${API_URL}/api/game/leaderboard?limit=50&period=${period}`);
      if (res.status === 429) { console.warn('[useProfile] Leaderboard rate limited'); setIsLoadingLeaderboard(false); return; }
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard.map((entry: Record<string, unknown>, index: number) => ({
            rank: index + 1,
            username: (entry.username as string) || `Player${index + 1}`,
            wallet_address: (entry.wallet_address as string) || '',
            total_pnl: Number(entry.total_pnl) || 0,
            trades_count: Number(entry.trades_count) || 0,
          })));
          setLeaderboardLastUpdated(new Date());
        }
      }
    } catch (e) {
      console.error('[useProfile] fetchLeaderboard error:', e);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  // ── Social OAuth actions (full-page redirect) ────────────────────
  const connectDiscord = useCallback(async () => {
    const now = Date.now();
    if (now - lastOAuthClickRef.current < OAUTH_THROTTLE_MS) {
      setSocialError('Please wait a few seconds before trying again');
      return;
    }
    const token = await getAuthToken();
    if (!token) return;
    lastOAuthClickRef.current = now;
    window.location.href = `${API_URL}/api/auth/discord?token=${encodeURIComponent(token)}`;
  }, [getAuthToken]);

  const connectTwitter = useCallback(async () => {
    const now = Date.now();
    if (now - lastOAuthClickRef.current < OAUTH_THROTTLE_MS) {
      setSocialError('Please wait a few seconds before trying again');
      return;
    }
    const token = await getAuthToken();
    if (!token) return;
    lastOAuthClickRef.current = now;
    window.location.href = `${API_URL}/api/auth/twitter?token=${encodeURIComponent(token)}`;
  }, [getAuthToken]);

  const disconnectSocial = useCallback(async (provider: 'discord' | 'twitter'): Promise<boolean> => {
    setIsDisconnecting(true);
    try {
      const token = await getAuthToken();
      if (!token) return false;
      const res = await fetch(`${API_URL}/api/profile/socials/${provider}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token,
        },
      });
      if (res.ok) {
        setSocials(prev => prev.filter(s => s.provider !== provider));
        return true;
      }
      return false;
    } catch (e) {
      console.error('[useProfile] disconnectSocial error:', e);
      return false;
    } finally {
      setIsDisconnecting(false);
    }
  }, [getAuthToken]);

  // ── Refresh all data ────────────────────────────────────────────────
  const refreshAll = useCallback(() => {
    fetchStats();
    fetchRecentGames();
    fetchSocials();
    fetchLeaderboard(leaderboardPeriod);
  }, [fetchStats, fetchRecentGames, fetchSocials, fetchLeaderboard, leaderboardPeriod]);

  // ── Leaderboard period change ───────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      fetchLeaderboard(leaderboardPeriod);
    }
  }, [leaderboardPeriod, isActive, fetchLeaderboard]);

  // ── Initial fetch when modal opens ──────────────────────────────────
  useEffect(() => {
    if (isActive && walletAddress && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchStats();
      fetchRecentGames();
      fetchSocials();
      fetchLeaderboard(leaderboardPeriod);
    }
    if (!isActive) {
      fetchedRef.current = false;
    }
  }, [isActive, walletAddress, fetchStats, fetchRecentGames, fetchSocials, fetchLeaderboard, leaderboardPeriod]);

  // ── Detect OAuth redirect via URL params on mount ────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const socialConnected = params.get('social_connected');
    const socialError = params.get('social_error');

    if (socialConnected) {
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('social_connected');
      window.history.replaceState({}, '', url.toString());
      // Show success toast
      const provider = socialConnected === 'discord' ? 'Discord' : socialConnected === 'twitter' ? 'X' : socialConnected;
      setSocialMessage(`${provider} connected successfully`);
      // Refresh socials data
      fetchSocials();
    }

    if (socialError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('social_error');
      window.history.replaceState({}, '', url.toString());
      // Map error code to user-friendly message
      const message = SOCIAL_ERROR_MESSAGES[socialError] || `Social connection failed: ${socialError}`;
      setSocialError(message);
    }
  }, [fetchSocials]);

  // ── Polling while modal is open ─────────────────────────────────────
  useEffect(() => {
    if (!isActive || !walletAddress) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchRecentGames();
    }, 60_000);
    return () => clearInterval(interval);
  }, [isActive, walletAddress, fetchStats, fetchRecentGames]);

  // ── Reset on wallet disconnect ──────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) {
      setStats(null);
      setRecentGames([]);
      setSocials([]);
      setLeaderboard([]);
      fetchedRef.current = false;
    }
  }, [walletAddress]);

  return {
    stats,
    isLoadingStats,
    recentGames,
    isLoadingGames,
    socials,
    isLoadingSocials,
    leaderboard,
    leaderboardPeriod,
    setLeaderboardPeriod,
    isLoadingLeaderboard,
    leaderboardLastUpdated,
    connectDiscord,
    connectTwitter,
    disconnectSocial,
    isDisconnecting,
    socialMessage,
    socialError,
    clearSocialMessage,
    clearSocialError,
    refreshAll,
  };
}
