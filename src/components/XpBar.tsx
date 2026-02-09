import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PlayerXpState } from '../types/game';
import { TIER_COLORS, tierIconUrl, TIER_NAMES } from '../types/game';

interface XpBarProps {
  xpState: PlayerXpState | null;
  compact?: boolean;
}

const XpBar: React.FC<XpBarProps> = ({ xpState, compact = false }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = useCallback(() => setOpen(p => !p), []);

  if (!xpState) return null;

  const tier = xpState.tier ?? 0;
  const tierColor = TIER_COLORS[tier] || '#9CA3AF';
  const tierName = TIER_NAMES[tier] || 'Pleb';
  const progressPercent = Math.min(100, Math.max(0, xpState.progress_percent || 0));

  return (
    <div className={`xp-bar-container ${compact ? 'xp-bar-compact' : ''}`} ref={containerRef}>
      {/* Trigger Button */}
      <button className="xp-bar-trigger" onClick={toggle} type="button">
        <div
          className="xp-bar-badge"
          style={{ backgroundImage: `url(${tierIconUrl(tier)})` }}
          title={`Level ${xpState.level} - ${tierName}`}
        />
        <div className="xp-bar-info">
          <span className="xp-bar-level-text" style={{ color: tierColor }}>
            Level {xpState.level}
          </span>
          <div className="xp-bar-track">
            <div
              className="xp-bar-fill"
              style={{
                width: `${progressPercent}%`,
                background: tierColor,
              }}
            />
          </div>
        </div>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="xp-bar-dropdown">
          {/* Dropdown Header */}
          <div className="xp-bar-dropdown-header">
            <h3 className="xp-bar-dropdown-title">XP INFORMATION</h3>
            <div className="xp-bar-dropdown-badge-wrap">
              <div
                className="xp-bar-badge-small"
                style={{ backgroundImage: `url(${tierIconUrl(tier)})` }}
              />
              <span className="xp-bar-dropdown-badge-level">{xpState.level}</span>
            </div>
          </div>

          {/* Dropdown Body */}
          <div className="xp-bar-dropdown-body">
            <div className="xp-bar-dropdown-progress-section">
              <div className="xp-bar-dropdown-row">
                <span className="xp-dd-label">Current Progress:</span>
                <span className="xp-dd-value">{progressPercent.toFixed(1)}%</span>
              </div>
              <div className="xp-bar-dropdown-xp-count">
                {xpState.xp_progress?.toLocaleString()}/{xpState.xp_needed?.toLocaleString()} XP
              </div>
              <div className="xp-bar-dropdown-track">
                <div
                  className="xp-bar-dropdown-fill"
                  style={{
                    width: `${progressPercent}%`,
                    background: `linear-gradient(90deg, ${tierColor}, ${tierColor}cc)`,
                  }}
                />
              </div>
            </div>

            <div className="xp-bar-dropdown-stats">
              <div className="xp-bar-stat-row">
                <span className="xp-dd-label">XP to Next Level:</span>
                <span className="xp-dd-value">{xpState.xp_to_next?.toLocaleString()} XP</span>
              </div>
              <div className="xp-bar-stat-row">
                <span className="xp-dd-label">Total XP Earned:</span>
                <span className="xp-dd-value">{xpState.xp?.toLocaleString()}</span>
              </div>
            </div>

            <div className="xp-bar-dropdown-info">
              <p>
                Earn <strong>1 XP</strong> per <strong style={{ color: '#00FFA3' }}>0.001 SOL</strong> bet
              </p>
              <span className="xp-dd-caption">Bets must be held for 5+ seconds to count as valid bet.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default XpBar;
