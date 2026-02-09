import React, { useEffect } from 'react';
import type { LevelUpEvent } from '../types/game';
import { TIER_COLORS, tierIconUrl, keyIconUrl, TIER_NAMES } from '../types/game';

interface LevelUpPopupProps {
  levelUp: LevelUpEvent | null;
  onDismiss: () => void;
}

const LevelUpPopup: React.FC<LevelUpPopupProps> = ({ levelUp, onDismiss }) => {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!levelUp) return;
    const timeout = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timeout);
  }, [levelUp, onDismiss]);

  if (!levelUp) return null;

  const tier = levelUp.tier || 1;
  const tierColor = TIER_COLORS[tier] || '#9CA3AF';
  const tierName = levelUp.tier_name || TIER_NAMES[tier] || 'Pleb';
  const tierChanged = levelUp.old_level <= (tier - 1) * 10 && levelUp.new_level > (tier - 1) * 10;

  return (
    <div className="levelup-overlay" onClick={onDismiss}>
      <div className="levelup-card" onClick={e => e.stopPropagation()}>
        {/* Glow Background */}
        <div className="levelup-glow" style={{ background: `radial-gradient(circle, ${tierColor}33 0%, transparent 70%)` }} />

        {/* Title */}
        <div className="levelup-title" style={{ color: tierColor }}>LEVEL UP!</div>

        {/* Tier Icon */}
        <div className="levelup-icon-wrap">
          <img
            src={tierIconUrl(tier)}
            alt={tierName}
            className="levelup-tier-icon"
            style={{ filter: `drop-shadow(0 0 12px ${tierColor})` }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Level Transition */}
        <div className="levelup-levels">
          <span className="levelup-old-level">Lv.{levelUp.old_level}</span>
          <span className="levelup-arrow">→</span>
          <span className="levelup-new-level" style={{ color: tierColor }}>Lv.{levelUp.new_level}</span>
        </div>

        {/* Tier Name (if tier changed) */}
        {tierChanged && (
          <div className="levelup-tier-change" style={{ color: tierColor }}>
            You are now: {tierName}
          </div>
        )}

        {/* Key Grants */}
        {levelUp.keys_granted && levelUp.keys_granted.length > 0 && (
          <div className="levelup-keys">
            {levelUp.keys_granted.map((grant, i) => (
              <div
                key={grant.tier}
                className="levelup-key-item"
                style={{ animationDelay: `${0.3 + i * 0.3}s` }}
              >
                <img
                  src={keyIconUrl(grant.tier)}
                  alt="key"
                  className="levelup-key-icon"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span style={{ color: TIER_COLORS[grant.tier] || '#fff' }}>
                  +{grant.count} {TIER_NAMES[grant.tier]} Key{grant.count > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tap to dismiss */}
        <div className="levelup-dismiss">Tap anywhere to dismiss</div>
      </div>
    </div>
  );
};

export default LevelUpPopup;
