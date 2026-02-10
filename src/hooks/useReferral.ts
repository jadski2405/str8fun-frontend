import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// ============================================================================
// Types
// ============================================================================

export interface ReferralStats {
  total_referrals: number;
  active_referrals: number;
  total_earnings: number;
  claimable_weeks: ClaimableWeek[];
  referral_code: string;
}

export interface ClaimableWeek {
  week_start: string;
  amount: number;
  claimed: boolean;
}

export interface ReferralNetworkUser {
  username: string;
  level: number;
  wagered: number;
  layer: number;
}

export interface ReferralEarningsWeek {
  week_start: string;
  total: number;
  breakdown: {
    layer: number;
    amount: number;
    from_username: string;
  }[];
}

export interface UseReferralReturn {
  stats: ReferralStats | null;
  network: ReferralNetworkUser[];
  earnings: ReferralEarningsWeek | null;
  isLoading: boolean;
  isClaiming: boolean;
  fetchStats: () => Promise<void>;
  fetchNetwork: () => Promise<void>;
  fetchEarnings: (week: string) => Promise<void>;
  claimWeek: (weekStart: string) => Promise<boolean>;
  referralLink: string;
}

// ============================================================================
// useReferral — Referral system state management
// ============================================================================
export function useReferral(
  walletAddress: string | null,
  getAuthToken: () => Promise<string | null>,
): UseReferralReturn {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [network, setNetwork] = useState<ReferralNetworkUser[]>([]);
  const [earnings, setEarnings] = useState<ReferralEarningsWeek | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const fetchedRef = useRef(false);

  // Referral link based on stats
  const referralLink = stats?.referral_code
    ? `https://str8.fun/?ref=${stats.referral_code}`
    : '';

  // ── Fetch referral stats ──────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/referral/stats`, {
        headers: { 'x-wallet-address': walletAddress },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('[useReferral] fetchStats error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // ── Fetch referral network ────────────────────────────────────────────
  const fetchNetwork = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`${API_URL}/api/referral/network`, {
        headers: { 'x-wallet-address': walletAddress },
      });
      if (res.ok) {
        const data = await res.json();
        setNetwork(Array.isArray(data) ? data : data.network || []);
      }
    } catch (e) {
      console.error('[useReferral] fetchNetwork error:', e);
    }
  }, [walletAddress]);

  // ── Fetch weekly earnings breakdown ───────────────────────────────────
  const fetchEarnings = useCallback(async (week: string) => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`${API_URL}/api/referral/earnings?week=${encodeURIComponent(week)}`, {
        headers: { 'x-wallet-address': walletAddress },
      });
      if (res.ok) {
        const data = await res.json();
        setEarnings(data);
      }
    } catch (e) {
      console.error('[useReferral] fetchEarnings error:', e);
    }
  }, [walletAddress]);

  // ── Claim week's earnings ─────────────────────────────────────────────
  const claimWeek = useCallback(async (weekStart: string): Promise<boolean> => {
    if (!walletAddress) return false;
    setIsClaiming(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({ week_start: weekStart }),
      });
      if (res.ok) {
        // Refresh stats after claim
        await fetchStats();
        return true;
      }
      return false;
    } catch (e) {
      console.error('[useReferral] claimWeek error:', e);
      return false;
    } finally {
      setIsClaiming(false);
    }
  }, [walletAddress, getAuthToken, fetchStats]);

  // ── WS event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const onCommission = () => {
      // Refresh stats when a referral commission comes in
      fetchStats();
    };
    const onMilestone = () => {
      fetchStats();
    };

    window.addEventListener('pumpit:referral_commission', onCommission);
    window.addEventListener('pumpit:referral_milestone', onMilestone);
    return () => {
      window.removeEventListener('pumpit:referral_commission', onCommission);
      window.removeEventListener('pumpit:referral_milestone', onMilestone);
    };
  }, [fetchStats]);

  // ── Auto-fetch on wallet connect ──────────────────────────────────────
  useEffect(() => {
    if (walletAddress && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchStats();
    }
    if (!walletAddress) {
      fetchedRef.current = false;
      setStats(null);
      setNetwork([]);
      setEarnings(null);
    }
  }, [walletAddress, fetchStats]);

  return {
    stats,
    network,
    earnings,
    isLoading,
    isClaiming,
    fetchStats,
    fetchNetwork,
    fetchEarnings,
    claimWeek,
    referralLink,
  };
}
