import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PlayerXpState,
  ChestInfo,
  ChestOpenResult,
  ChestHistoryEntry,
  TierInfo,
  XpGainEvent,
  LevelUpEvent,
  ChestRewardEvent,
} from '../types/game';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// ============================================================================
// useRewards — XP, levels, keys, chests
// All endpoints use x-wallet-address header (no wallet in URL path)
// ============================================================================

export interface UseRewardsReturn {
  // XP state
  xpState: PlayerXpState | null;
  isLoadingXp: boolean;

  // Chests
  chests: ChestInfo[];
  isLoadingChests: boolean;
  fetchChests: () => Promise<void>;
  openChest: (tier: number) => Promise<ChestOpenResult>;

  // Chest history
  chestHistory: ChestHistoryEntry[];
  fetchHistory: () => Promise<void>;

  // Tier reference data
  tiers: TierInfo[];

  // Popups / notifications
  activeLevelUp: LevelUpEvent | null;
  dismissLevelUp: () => void;
  xpGainQueue: XpGainEvent[];
  clearXpGain: (index: number) => void;

  // Last chest reward (for opening animation)
  lastChestReward: ChestRewardEvent | null;
  clearChestReward: () => void;
}

export function useRewards(
  walletAddress: string | null,
  getAuthToken?: () => Promise<string | null>,
  updateDepositedBalance?: (newBalance: number) => void,
): UseRewardsReturn {
  // ============================================================================
  // STATE
  // ============================================================================
  const [xpState, setXpState] = useState<PlayerXpState | null>(null);
  const [isLoadingXp, setIsLoadingXp] = useState(false);
  const [chests, setChests] = useState<ChestInfo[]>([]);
  const [isLoadingChests, setIsLoadingChests] = useState(false);
  const [chestHistory, setChestHistory] = useState<ChestHistoryEntry[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [activeLevelUp, setActiveLevelUp] = useState<LevelUpEvent | null>(null);
  const [xpGainQueue, setXpGainQueue] = useState<XpGainEvent[]>([]);
  const [lastChestReward, setLastChestReward] = useState<ChestRewardEvent | null>(null);

  const levelUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================================
  // HELPERS
  // ============================================================================

  // Build headers with wallet address
  const walletHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (walletAddress) h['x-wallet-address'] = walletAddress;
    return h;
  }, [walletAddress]);

  // ============================================================================
  // API FETCHERS
  // ============================================================================

  const fetchXpState = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingXp(true);
    try {
      const response = await fetch(`${API_URL}/api/rewards/xp`, {
        headers: walletHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setXpState(data);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching XP state:', error);
    } finally {
      setIsLoadingXp(false);
    }
  }, [walletAddress, walletHeaders]);

  const fetchChests = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingChests(true);
    try {
      const response = await fetch(`${API_URL}/api/rewards/chests`, {
        headers: walletHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setChests(data.chests || []);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching chests:', error);
    } finally {
      setIsLoadingChests(false);
    }
  }, [walletAddress, walletHeaders]);

  const fetchHistory = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const response = await fetch(`${API_URL}/api/rewards/chest/history`, {
        headers: walletHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setChestHistory(data.history || []);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching chest history:', error);
    }
  }, [walletAddress, walletHeaders]);

  const fetchTiers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/rewards/tiers`);
      if (response.ok) {
        const data = await response.json();
        setTiers(data.tiers || []);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching tier data:', error);
    }
  }, []);

  // ============================================================================
  // OPEN CHEST
  // ============================================================================

  const openChest = useCallback(async (tier: number): Promise<ChestOpenResult> => {
    if (!walletAddress) {
      return { reward_sol: 0, is_jackpot: false, tier_name: '', new_balance: 0, cooldown_ready_at: '', keys_remaining: 0, error: 'Not connected' };
    }

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await fetch(`${API_URL}/api/rewards/chest/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress,
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({ tier }),
      });

      const data: ChestOpenResult = await response.json();

      if (response.ok && data.reward_sol !== undefined) {
        // Update balance immediately
        if (data.new_balance !== undefined && updateDepositedBalance) {
          updateDepositedBalance(data.new_balance);
        }
        // Re-fetch chests to get updated cooldowns/keys
        fetchChests();
        fetchXpState();
        return { ...data, success: true };
      }

      return { ...data, success: false, error: data.error || 'Failed to open chest' };
    } catch (error) {
      console.error('[useRewards] Error opening chest:', error);
      return { reward_sol: 0, is_jackpot: false, tier_name: '', new_balance: 0, cooldown_ready_at: '', keys_remaining: 0, error: 'Failed to open chest' };
    }
  }, [walletAddress, getAuthToken, updateDepositedBalance, fetchChests, fetchXpState]);

  // ============================================================================
  // POPUP CONTROLS
  // ============================================================================

  const dismissLevelUp = useCallback(() => {
    setActiveLevelUp(null);
    if (levelUpTimeoutRef.current) {
      clearTimeout(levelUpTimeoutRef.current);
      levelUpTimeoutRef.current = null;
    }
  }, []);

  const clearXpGain = useCallback((index: number) => {
    setXpGainQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearChestReward = useCallback(() => {
    setLastChestReward(null);
  }, []);

  // ============================================================================
  // WEBSOCKET EVENT BRIDGE (via CustomEvents from useGame)
  // ============================================================================

  useEffect(() => {
    const handleXpGain = (e: Event) => {
      const data = (e as CustomEvent<XpGainEvent>).detail;
      setXpGainQueue(prev => [...prev.slice(-4), data]);
      // Inline update for instant feedback
      setXpState(prev => prev ? {
        ...prev,
        xp: data.total_xp,
        level: data.level,
      } : prev);
      fetchXpState();
    };

    const handleLevelUp = (e: Event) => {
      const data = (e as CustomEvent<LevelUpEvent>).detail;
      setActiveLevelUp(data);
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current);
      levelUpTimeoutRef.current = setTimeout(() => {
        setActiveLevelUp(null);
        levelUpTimeoutRef.current = null;
      }, 5000);
      fetchXpState();
      fetchChests();
    };

    const handleChestReward = (e: Event) => {
      const data = (e as CustomEvent<ChestRewardEvent>).detail;
      setLastChestReward(data);
      if (data.new_balance !== undefined && updateDepositedBalance) {
        updateDepositedBalance(data.new_balance);
      }
      fetchChests();
    };

    window.addEventListener('pumpit:xp_gain', handleXpGain);
    window.addEventListener('pumpit:level_up', handleLevelUp);
    window.addEventListener('pumpit:chest_reward', handleChestReward);

    return () => {
      window.removeEventListener('pumpit:xp_gain', handleXpGain);
      window.removeEventListener('pumpit:level_up', handleLevelUp);
      window.removeEventListener('pumpit:chest_reward', handleChestReward);
    };
  }, [fetchXpState, fetchChests, updateDepositedBalance]);

  // ============================================================================
  // INITIAL FETCH
  // ============================================================================

  useEffect(() => {
    if (walletAddress) {
      fetchXpState();
      fetchTiers();
    } else {
      setXpState(null);
      setChests([]);
      setChestHistory([]);
    }
  }, [walletAddress, fetchXpState, fetchTiers]);

  // ============================================================================
  // CLIENT-SIDE COOLDOWN COUNTDOWN
  // ============================================================================

  useEffect(() => {
    cooldownIntervalRef.current = setInterval(() => {
      setChests(prev => {
        let changed = false;
        const updated = prev.map(chest => {
          if (chest.cooldown_ready_at && chest.cooldown_remaining_ms > 0) {
            const remaining = Math.max(0, new Date(chest.cooldown_ready_at).getTime() - Date.now());
            if (remaining !== chest.cooldown_remaining_ms) {
              changed = true;
              return {
                ...chest,
                cooldown_remaining_ms: remaining,
                is_ready: remaining === 0 && chest.keys > 0,
              };
            }
          }
          return chest;
        });
        return changed ? updated : prev;
      });
    }, 1000);

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  return {
    xpState,
    isLoadingXp,
    chests,
    isLoadingChests,
    fetchChests,
    openChest,
    chestHistory,
    fetchHistory,
    tiers,
    activeLevelUp,
    dismissLevelUp,
    xpGainQueue,
    clearXpGain,
    lastChestReward,
    clearChestReward,
  };
}

export default useRewards;
