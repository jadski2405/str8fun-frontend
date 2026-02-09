import React, { useState } from 'react';
import type { PlayerXpState } from '../types/game';
import { TIER_COLORS, tierIconUrl, TIER_NAMES } from '../types/game';

interface XpBarProps {
  xpState: PlayerXpState | null;
  compact?: boolean; // For mobile / smaller areas
}

const XpBar: React.FC<XpBarProps> = ({ xpState, compact = false }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!xpState) return null;

  const tier = xpState.tier || 1;
  const tierColor = TIER_COLORS[tier] || '#9CA3AF';
  const tierName = xpState.tier_name || TIER_NAMES[tier] || 'Pleb';
  const progressPercent = Math.min(100, Math.max(0, xpState.progress_percent || 0));

  return (
    <div
      className={`xp-bar-container ${compact ? 'xp-bar-compact' : ''}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(prev => !prev)}
    >
      {/* Tier Icon */}
      <img
        src={tierIconUrl(tier)}
        alt={tierName}
        className="xp-tier-icon"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Level + Progress */}
      <div className="xp-bar-info">
        <div className="xp-bar-top">
          <span className="xp-bar-level" style={{ color: tierColor }}>
            Lv.{xpState.level}
          </span>
          <span className="xp-bar-tier-name">{tierName}</span>
        </div>
        <div className="xp-bar-track">
          <div
            className="xp-bar-fill"
            style={{
              width: `${progressPercent}%`,
              background: tierColor,
              boxShadow: `0 0 6px ${tierColor}66`,
            }}
          />
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="xp-bar-tooltip">
          <div className="xp-tooltip-row">
            <span>XP</span>
            <span>{xpState.progress_xp?.toLocaleString()} / {xpState.needed_xp?.toLocaleString()}</span>
          </div>
          <div className="xp-tooltip-row">
            <span>Next Level</span>
            <span>{xpState.xp_to_next_level?.toLocaleString()} XP</span>
          </div>
          <div className="xp-tooltip-row">
            <span>Total XP</span>
            <span>{xpState.xp?.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default XpBar;
