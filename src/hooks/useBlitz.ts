// ============================================================================
// BLITZ HOOK — Manages Str8 Blitz weekly competition state
// Polls /api/blitz/* endpoints, listens for WS events via CustomEvent bridge
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  BlitzParticipant,
  BlitzEvent,
  BlitzHourStartedEvent,
  BlitzHourEndedEvent,
  BlitzLeaderboardEvent,
  BlitzTradeEvent,
} from '../types/game';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// ============================================================================
// TYPES
// ============================================================================

export interface BlitzState {
  // Status
  blitzActive: boolean;
  eventId: string | null;
  currentHour: number | null;
  totalHours: number;
  hourEndsAt: string | null;
  nextEventAt: string | null;

  // Leaderboard
  leaderboard: BlitzParticipant[];

  // Participation
  isParticipating: boolean;
  csolBalance: number;

  // History
  eventHistory: BlitzEvent[];

  // Splash modals
  hourStartedSplash: { hour: number; participants: BlitzParticipant[] } | null;
  hourEndedSplash: { hour: number; winner: BlitzParticipant; prizeSol: number; isMe: boolean } | null;

  // Actions
  dismissHourStarted: () => void;
  dismissHourEnded: () => void;
  fetchHistory: () => Promise<void>;
  refetchStatus: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useBlitz(
  walletAddress: string | null,
  getAuthToken?: () => Promise<string | null>,
): BlitzState {
  // Status state
  const [blitzActive, setBlitzActive] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [currentHour, setCurrentHour] = useState<number | null>(null);
  const [totalHours] = useState(12);
  const [hourEndsAt, setHourEndsAt] = useState<string | null>(null);
  const [nextEventAt, setNextEventAt] = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<BlitzParticipant[]>([]);

  // Participation
  const [isParticipating, setIsParticipating] = useState(false);
  const [csolBalance, setCsolBalance] = useState(0);

  // History
  const [eventHistory, setEventHistory] = useState<BlitzEvent[]>([]);

  // Splash modals
  const [hourStartedSplash, setHourStartedSplash] = useState<{ hour: number; participants: BlitzParticipant[] } | null>(null);
  const [hourEndedSplash, setHourEndedSplash] = useState<{ hour: number; winner: BlitzParticipant; prizeSol: number; isMe: boolean } | null>(null);

  // Refs
  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;
  const startedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================================================
  // API HELPERS
  // ============================================================================

  const fetchBlitzStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/blitz/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      setBlitzActive(data.active);
      setEventId(data.event_id);
      setCurrentHour(data.current_hour);
      setHourEndsAt(data.hour_ends_at);
      setNextEventAt(data.next_event_at);

      if (data.active && data.participants?.length) {
        // Rank participants by csol_balance descending
        const ranked = [...data.participants]
          .sort((a: BlitzParticipant, b: BlitzParticipant) => b.csol_balance - a.csol_balance)
          .map((p: BlitzParticipant, i: number) => ({ ...p, rank: i + 1 }));
        setLeaderboard(ranked);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const fetchBlitzMe = useCallback(async () => {
    if (!walletRef.current) {
      setIsParticipating(false);
      setCsolBalance(0);
      return;
    }

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const res = await fetch(`${API_URL}/api/blitz/me/${walletRef.current}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      setIsParticipating(data.participating);
      if (data.participating && data.csol_balance !== undefined) {
        setCsolBalance(data.csol_balance);
      } else {
        setCsolBalance(0);
      }
    } catch {
      // Non-critical
    }
  }, [getAuthToken]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/blitz/history?limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.events) {
        setEventHistory(data.events);
      }
    } catch {
      // Non-critical
    }
  }, []);

  // ============================================================================
  // INITIAL FETCH
  // ============================================================================

  useEffect(() => {
    fetchBlitzStatus();
    fetchHistory();
  }, [fetchBlitzStatus, fetchHistory]);

  // Fetch participation status when wallet changes or blitz becomes active
  useEffect(() => {
    if (walletAddress) {
      fetchBlitzMe();
    } else {
      setIsParticipating(false);
      setCsolBalance(0);
    }
  }, [walletAddress, blitzActive, fetchBlitzMe]);

  // ============================================================================
  // POLLING — 30s inactive, 60s active (WS handles real-time when active)
  // ============================================================================

  useEffect(() => {
    const interval = setInterval(() => {
      fetchBlitzStatus();
    }, blitzActive ? 60000 : 30000);

    return () => clearInterval(interval);
  }, [blitzActive, fetchBlitzStatus]);

  // ============================================================================
  // WEBSOCKET EVENT LISTENERS (via CustomEvent bridge from useGame)
  // ============================================================================

  useEffect(() => {
    const onHourStarted = (e: Event) => {
      const data = (e as CustomEvent<BlitzHourStartedEvent>).detail;
      setBlitzActive(true);
      setCurrentHour(data.hour_number);
      setHourEndsAt(data.ends_at);

      // Set initial leaderboard from participants (all at 10 Csol)
      const ranked = data.participants
        .map((p, i) => ({ ...p, rank: i + 1 }));
      setLeaderboard(ranked);

      // Show splash
      setHourStartedSplash({ hour: data.hour_number, participants: data.participants });
      if (startedTimerRef.current) clearTimeout(startedTimerRef.current);
      startedTimerRef.current = setTimeout(() => setHourStartedSplash(null), 5000);

      // Re-check participation (new hour = new participants)
      fetchBlitzMe();
    };

    const onHourEnded = (e: Event) => {
      const data = (e as CustomEvent<BlitzHourEndedEvent>).detail;
      const isMe = walletRef.current === data.winner.wallet_address;

      setHourEndedSplash({
        hour: data.hour_number,
        winner: data.winner,
        prizeSol: data.prize_sol,
        isMe,
      });
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      endedTimerRef.current = setTimeout(() => setHourEndedSplash(null), isMe ? 10000 : 6000);

      // Clear leaderboard for transition
      setLeaderboard([]);
    };

    const onLeaderboard = (e: Event) => {
      const data = (e as CustomEvent<BlitzLeaderboardEvent>).detail;
      setCurrentHour(data.hour_number);
      setLeaderboard(data.leaderboard.map(p => ({ ...p })));
    };

    const onTrade = (e: Event) => {
      const data = (e as CustomEvent<BlitzTradeEvent>).detail;
      if (walletRef.current && data.wallet_address === walletRef.current) {
        setCsolBalance(data.csol_balance);
      }
    };

    window.addEventListener('pumpit:blitz_hour_started', onHourStarted);
    window.addEventListener('pumpit:blitz_hour_ended', onHourEnded);
    window.addEventListener('pumpit:blitz_leaderboard', onLeaderboard);
    window.addEventListener('pumpit:blitz_trade', onTrade);

    return () => {
      window.removeEventListener('pumpit:blitz_hour_started', onHourStarted);
      window.removeEventListener('pumpit:blitz_hour_ended', onHourEnded);
      window.removeEventListener('pumpit:blitz_leaderboard', onLeaderboard);
      window.removeEventListener('pumpit:blitz_trade', onTrade);
      if (startedTimerRef.current) clearTimeout(startedTimerRef.current);
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
    };
  }, [fetchBlitzMe]);

  // ============================================================================
  // DISMISS ACTIONS
  // ============================================================================

  const dismissHourStarted = useCallback(() => {
    setHourStartedSplash(null);
    if (startedTimerRef.current) clearTimeout(startedTimerRef.current);
  }, []);

  const dismissHourEnded = useCallback(() => {
    setHourEndedSplash(null);
    if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    blitzActive,
    eventId,
    currentHour,
    totalHours,
    hourEndsAt,
    nextEventAt,
    leaderboard,
    isParticipating,
    csolBalance,
    eventHistory,
    hourStartedSplash,
    hourEndedSplash,
    dismissHourStarted,
    dismissHourEnded,
    fetchHistory,
    refetchStatus: fetchBlitzStatus,
  };
}

export default useBlitz;
