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
  // API FETCHERS
  // ============================================================================

  const fetchXpState = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingXp(true);
    try {
      const response = await fetch(`${API_URL}/api/rewards/xp/${walletAddress}`);
      if (response.ok) {
        const data = await response.json();
        setXpState(data);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching XP state:', error);
    } finally {
      setIsLoadingXp(false);
    }
  }, [walletAddress]);

  const fetchChests = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingChests(true);
    try {
      const response = await fetch(`${API_URL}/api/rewards/chests/${walletAddress}`);
      if (response.ok) {
        const data = await response.json();
        setChests(data.chests || []);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching chests:', error);
    } finally {
      setIsLoadingChests(false);
    }
  }, [walletAddress]);

  const fetchHistory = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const response = await fetch(`${API_URL}/api/rewards/chest/history/${walletAddress}?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setChestHistory(data.history || []);
      }
    } catch (error) {
      console.error('[useRewards] Error fetching chest history:', error);
    }
  }, [walletAddress]);

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
      return { success: false, error: 'Not connected' };
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

      const data = await response.json();

      if (data.success) {
        // Update balance immediately
        if (data.new_balance !== undefined && updateDepositedBalance) {
          updateDepositedBalance(data.new_balance);
        }
        // Re-fetch chests to get updated cooldowns/keys
        fetchChests();
        // Re-fetch XP state (keys changed)
        fetchXpState();
      }

      return data;
    } catch (error) {
      console.error('[useRewards] Error opening chest:', error);
      return { success: false, error: 'Failed to open chest' };
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
      // Add to toast queue (max 5)
      setXpGainQueue(prev => [...prev.slice(-4), data]);
      // Update XP state inline for instant feedback
      setXpState(prev => prev ? {
        ...prev,
        xp: data.total_xp,
        level: data.level,
        xp_to_next_level: data.xp_to_next,
      } : prev);
      // Full refresh for accurate progress bar
      fetchXpState();
    };

    const handleLevelUp = (e: Event) => {
      const data = (e as CustomEvent<LevelUpEvent>).detail;
      setActiveLevelUp(data);
      // Auto-dismiss after 5 seconds
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current);
      levelUpTimeoutRef.current = setTimeout(() => {
        setActiveLevelUp(null);
        levelUpTimeoutRef.current = null;
      }, 5000);
      // Refresh XP + chests (keys changed)
      fetchXpState();
      fetchChests();
    };

    const handleChestReward = (e: Event) => {
      const data = (e as CustomEvent<ChestRewardEvent>).detail;
      setLastChestReward(data);
      // Update balance
      if (data.new_balance !== undefined && updateDepositedBalance) {
        updateDepositedBalance(data.new_balance);
      }
      // Refresh chests
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
    // Tick every second to update cooldown_remaining_ms
    cooldownIntervalRef.current = setInterval(() => {
      setChests(prev => {
        const now = Date.now();
        let changed = false;
        const updated = prev.map(chest => {
          if (chest.next_available_at && chest.cooldown_remaining_ms > 0) {
            const remaining = Math.max(0, chest.next_available_at - now);
            if (remaining !== chest.cooldown_remaining_ms) {
              changed = true;
              return {
                ...chest,
                cooldown_remaining_ms: remaining,
                is_available: remaining === 0 && !chest.is_level_locked && chest.keys_balance > 0,
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
