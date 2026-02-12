// ============================================================================
// BLITZ HEADER CAROUSEL — Rotates between XP bar and Blitz countdown/timer
// Click on Blitz item opens a leaderboard/history dropdown
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronDown, Trophy, Clock } from 'lucide-react';
import XpBar from './XpBar';
import type { PlayerXpState } from '../types/game';
import type { BlitzState } from '../hooks/useBlitz';

interface BlitzHeaderCarouselProps {
  xpState: PlayerXpState | null;
  blitz: BlitzState;
  compact?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return '0s';

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatHourTimer(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return '00:00';

  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function truncateWallet(addr: string): string {
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

const BlitzHeaderCarousel: React.FC<BlitzHeaderCarouselProps> = ({ xpState, blitz, compact = false }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'history'>('leaderboard');
  const [countdown, setCountdown] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Total items — always show XP bar (0), show Blitz (1) if there's any status
  const hasBlitz = blitz.blitzActive || blitz.nextEventAt;
  const itemCount = hasBlitz ? 2 : 1;

  // ============================================================================
  // AUTO-ROTATE
  // ============================================================================

  const startAutoRotate = useCallback(() => {
    if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    if (itemCount <= 1) return;
    autoRotateRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % itemCount);
    }, 5000);
  }, [itemCount]);

  useEffect(() => {
    if (!dropdownOpen) {
      startAutoRotate();
    } else {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    }
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    };
  }, [dropdownOpen, startAutoRotate]);

  // ============================================================================
  // COUNTDOWN TIMER (updates every second)
  // ============================================================================

  useEffect(() => {
    const tick = () => {
      if (blitz.blitzActive && blitz.hourEndsAt) {
        setCountdown(formatHourTimer(blitz.hourEndsAt));
      } else if (!blitz.blitzActive && blitz.nextEventAt) {
        setCountdown(formatCountdown(blitz.nextEventAt));
      } else {
        setCountdown('');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [blitz.blitzActive, blitz.hourEndsAt, blitz.nextEventAt]);

  // ============================================================================
  // CLICK OUTSIDE
  // ============================================================================

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // ============================================================================
  // RENDER — BLITZ WIDGET TRIGGER
  // ============================================================================

  const handleBlitzClick = () => {
    setActiveIndex(1); // Switch to blitz panel
    setDropdownOpen(prev => !prev);
  };

  const renderBlitzTrigger = () => {
    if (blitz.blitzActive) {
      return (
        <button className="blitz-timer-trigger blitz-timer-live" onClick={handleBlitzClick} type="button">
          <span className="blitz-live-dot" />
          <Zap size={14} className="blitz-zap-icon" />
          <span className="blitz-timer-label">BLITZ</span>
          <span className="blitz-timer-hour">Hr {blitz.currentHour}/{blitz.totalHours}</span>
          <span className="blitz-timer-countdown">{countdown}</span>
          <ChevronDown size={12} style={{ opacity: 0.6 }} />
        </button>
      );
    }

    return (
      <button className="blitz-timer-trigger blitz-timer-upcoming" onClick={handleBlitzClick} type="button">
        <Zap size={14} className="blitz-zap-icon" />
        <span className="blitz-timer-label">Str8 Blitz</span>
        <span className="blitz-timer-countdown">{countdown || 'TBD'}</span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>
    );
  };

  // ============================================================================
  // DROPDOWN CONTENT
  // ============================================================================

  const renderDropdown = () => {
    return (
      <div className="blitz-dropdown">
        {/* Header */}
        <div className="blitz-dropdown-header">
          <div className="blitz-dropdown-title-row">
            <Zap size={16} className="blitz-zap-icon" />
            <span className="blitz-dropdown-title">STR8 BLITZ</span>
            {blitz.blitzActive ? (
              <span className="blitz-status-badge blitz-status-live">LIVE</span>
            ) : blitz.nextEventAt ? (
              <span className="blitz-status-badge blitz-status-upcoming">UPCOMING</span>
            ) : (
              <span className="blitz-status-badge blitz-status-ended">ENDED</span>
            )}
          </div>

          {blitz.blitzActive && (
            <div className="blitz-dropdown-timer-row">
              <Clock size={12} style={{ opacity: 0.6 }} />
              <span>Hour {blitz.currentHour} of {blitz.totalHours}</span>
              <span className="blitz-dropdown-countdown">{countdown}</span>
            </div>
          )}

          {!blitz.blitzActive && blitz.nextEventAt && (
            <div className="blitz-dropdown-timer-row">
              <Clock size={12} style={{ opacity: 0.6 }} />
              <span>Starts in {countdown}</span>
            </div>
          )}

          <div className="blitz-dropdown-prize">
            <Trophy size={12} />
            <span>1 SOL prize per hour</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="blitz-dropdown-tabs">
          <button
            className={`blitz-tab ${activeTab === 'leaderboard' ? 'blitz-tab-active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
            type="button"
          >
            Leaderboard
          </button>
          <button
            className={`blitz-tab ${activeTab === 'history' ? 'blitz-tab-active' : ''}`}
            onClick={() => { setActiveTab('history'); blitz.fetchHistory(); }}
            type="button"
          >
            History
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'leaderboard' ? (
          <div className="blitz-dropdown-body">
            {blitz.leaderboard.length === 0 ? (
              <div className="blitz-empty">
                {blitz.blitzActive ? 'Waiting for trades...' : 'No active competition'}
              </div>
            ) : (
              <div className="blitz-leaderboard-list">
                {blitz.leaderboard.map((p, i) => {
                  const isMe = blitz.isParticipating && p.wallet_address === (window as any).__blitz_wallet;
                  const rank = p.rank ?? i + 1;
                  const gap = rank === 1 && blitz.leaderboard.length > 1
                    ? (p.csol_balance - blitz.leaderboard[1].csol_balance).toFixed(2)
                    : null;

                  return (
                    <div key={p.wallet_address} className={`blitz-leaderboard-row ${isMe ? 'blitz-leaderboard-row--me' : ''}`}>
                      <span className={`blitz-rank ${rank <= 3 ? `blitz-rank-${rank}` : ''}`}>{rank}</span>
                      <span className="blitz-player-name">
                        {p.username || truncateWallet(p.wallet_address)}
                      </span>
                      <span className="blitz-csol-balance">{p.csol_balance.toFixed(2)}</span>
                      {rank === 1 && gap && (
                        <span className="blitz-gap-indicator">+{gap}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="blitz-dropdown-body">
            {blitz.eventHistory.length === 0 ? (
              <div className="blitz-empty">No past events yet</div>
            ) : (
              <div className="blitz-history-list">
                {blitz.eventHistory.map(ev => (
                  <div key={ev.id} className="blitz-history-event">
                    <div className="blitz-history-date">
                      {new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {ev.hours.slice(0, 3).map(h => (
                      <div key={h.hour_number} className="blitz-history-hour">
                        <span className="blitz-history-hour-num">Hr {h.hour_number}</span>
                        <span className="blitz-history-winner">
                          {h.winner_username || truncateWallet(h.winner_wallet)}
                        </span>
                        <span className="blitz-history-balance">{h.winning_balance.toFixed(2)} Csol</span>
                      </div>
                    ))}
                    {ev.hours.length > 3 && (
                      <div className="blitz-history-more">+{ev.hours.length - 3} more hours</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className={`blitz-carousel-container ${compact ? 'blitz-carousel-compact' : ''}`} ref={containerRef}>
      <div className="blitz-carousel-viewport">
        <AnimatePresence mode="wait">
          {activeIndex === 0 ? (
            <motion.div
              key="xp"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
            >
              <XpBar xpState={xpState} compact={compact} />
            </motion.div>
          ) : (
            <motion.div
              key="blitz"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
            >
              {renderBlitzTrigger()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {itemCount > 1 && (
        <div className="blitz-carousel-dots">
          {Array.from({ length: itemCount }).map((_, i) => (
            <button
              key={i}
              className={`blitz-carousel-dot ${activeIndex === i ? 'blitz-carousel-dot-active' : ''}`}
              onClick={() => { setActiveIndex(i); startAutoRotate(); }}
              type="button"
              aria-label={`Carousel item ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Blitz dropdown */}
      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            {renderDropdown()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BlitzHeaderCarousel;
