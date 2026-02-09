import React, { useEffect } from 'react';
import type { XpGainEvent } from '../types/game';

interface XpToastProps {
  gains: XpGainEvent[];
  onClear: (index: number) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  wager: '💰',
  rekt: '💀',
  daily: '⭐',
  trade: '📈',
  win: '🏆',
};

const XpToast: React.FC<XpToastProps> = ({ gains, onClear }) => {
  // Auto-dismiss each toast after 3 seconds
  useEffect(() => {
    if (gains.length === 0) return;
    const timeouts = gains.map((_, i) =>
      setTimeout(() => onClear(i), 3000 + i * 200)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [gains.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gains.length === 0) return null;

  // Show max 3 most recent
  const visible = gains.slice(-3);

  return (
    <div className="xp-toast-stack">
      {visible.map((gain, i) => {
        const icon = SOURCE_ICONS[gain.source || ''] || '✨';
        return (
          <div
            key={`${gain.xp_awarded}-${i}`}
            className="xp-toast-item"
            style={{ animationDelay: `${i * 0.1}s` }}
            onClick={() => onClear(gains.length - visible.length + i)}
          >
            <span className="xp-toast-icon">{icon}</span>
            <span className="xp-toast-amount">+{gain.xp_awarded} XP</span>
            {gain.source && (
              <span className="xp-toast-source">{gain.source}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default XpToast;
