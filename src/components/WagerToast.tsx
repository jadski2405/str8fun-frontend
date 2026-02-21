import React, { useEffect } from 'react';

// ============================================================================
// WagerToast — Shows wager-related notifications:
//   1. "Winnings locked" note after a cashout/sell when wager requirement active
//   2. "Wagering complete!" celebration when requirement is finally met
// ============================================================================

export interface WagerNotification {
  id: string;
  type: 'locked' | 'completed';
  message: string;
}

interface WagerToastProps {
  notifications: WagerNotification[];
  onDismiss: (id: string) => void;
}

const WagerToast: React.FC<WagerToastProps> = ({ notifications, onDismiss }) => {
  // Auto-dismiss after 5s (locked) or 8s (completed)
  useEffect(() => {
    if (notifications.length === 0) return;
    const timeouts = notifications.map((n) =>
      setTimeout(() => onDismiss(n.id), n.type === 'completed' ? 8000 : 5000)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  const visible = notifications.slice(-3);

  return (
    <div className="wager-toast-stack">
      {visible.map((n, i) => (
        <div
          key={n.id}
          className={`wager-toast-item wager-toast-item--${n.type}`}
          style={{ animationDelay: `${i * 0.1}s` }}
          onClick={() => onDismiss(n.id)}
        >
          <span className="wager-toast-icon">
            {n.type === 'completed' ? '🎉' : '🔒'}
          </span>
          <span className="wager-toast-message">{n.message}</span>
        </div>
      ))}
    </div>
  );
};

export default WagerToast;
