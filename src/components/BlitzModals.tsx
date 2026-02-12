// ============================================================================
// BLITZ MODALS — Hour Started splash + Hour Ended winner announcement
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Trophy, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { BlitzParticipant } from '../types/game';

// ============================================================================
// HELPERS
// ============================================================================

function truncateWallet(addr: string): string {
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function fireConfetti(intensity: 'normal' | 'heavy') {
  const defaults = {
    disableForReducedMotion: true,
    zIndex: 10001,
  };

  if (intensity === 'heavy') {
    // Multi-burst from both sides + center
    const end = Date.now() + 2500;
    const colors = ['#A855F7', '#7C3AED', '#FFD700', '#00FFA3', '#3B82F6'];

    const frame = () => {
      confetti({
        ...defaults,
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        ...defaults,
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();

    // Center burst
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 120,
        spread: 100,
        origin: { x: 0.5, y: 0.4 },
        colors,
        scalar: 1.2,
      });
    }, 300);
  } else {
    confetti({
      ...defaults,
      particleCount: 60,
      spread: 70,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#A855F7', '#7C3AED', '#FFD700'],
    });
  }
}

// ============================================================================
// HOUR STARTED MODAL
// ============================================================================

interface HourStartedProps {
  data: { hour: number; participants: BlitzParticipant[] } | null;
  onDismiss: () => void;
}

export const BlitzHourStartedModal: React.FC<HourStartedProps> = ({ data, onDismiss }) => {
  if (!data) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="blitz-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onDismiss}
      >
        <motion.div
          className="blitz-modal-card blitz-modal-started"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button className="blitz-modal-close" onClick={onDismiss} type="button">
            <X size={18} />
          </button>

          {/* Content */}
          <div className="blitz-modal-icon-row">
            <Zap size={32} className="blitz-zap-icon" />
          </div>
          <h2 className="blitz-modal-title">Hour {data.hour} Started</h2>
          <p className="blitz-modal-subtitle">25 new players selected</p>

          {/* Participant list */}
          <div className="blitz-modal-participant-list">
            {data.participants.slice(0, 25).map((p, i) => (
              <div key={p.wallet_address} className="blitz-modal-participant">
                <span className="blitz-modal-participant-num">{i + 1}.</span>
                <span className="blitz-modal-participant-name">
                  {p.username || truncateWallet(p.wallet_address)}
                </span>
                <span className="blitz-modal-participant-csol">10.00 Csol</span>
              </div>
            ))}
          </div>

          <div className="blitz-modal-prize-note">
            <Trophy size={14} />
            <span>1 SOL prize for the highest Csol balance</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ============================================================================
// HOUR ENDED MODAL
// ============================================================================

interface HourEndedProps {
  data: { hour: number; winner: BlitzParticipant; prizeSol: number; isMe: boolean } | null;
  onDismiss: () => void;
}

export const BlitzHourEndedModal: React.FC<HourEndedProps> = ({ data, onDismiss }) => {
  const hasFired = useRef(false);

  useEffect(() => {
    if (data && !hasFired.current) {
      hasFired.current = true;
      fireConfetti(data.isMe ? 'heavy' : 'normal');
    }
    if (!data) {
      hasFired.current = false;
    }
  }, [data]);

  if (!data) return null;

  if (data.isMe) {
    // Full-screen winner celebration
    return (
      <AnimatePresence>
        <motion.div
          className="blitz-modal-overlay blitz-winner-celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            className="blitz-winner-content"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="blitz-modal-close blitz-modal-close-winner" onClick={onDismiss} type="button">
              <X size={20} />
            </button>

            <div className="blitz-winner-zap-ring">
              <Zap size={48} className="blitz-zap-icon" />
            </div>
            <h1 className="blitz-winner-headline">YOU WON {data.prizeSol} SOL!</h1>
            <p className="blitz-winner-sub">
              Hour {data.hour} Champion — {data.winner.csol_balance.toFixed(2)} Csol
            </p>
            <div className="blitz-winner-trophy">
              <Trophy size={40} />
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Standard winner announcement
  return (
    <AnimatePresence>
      <motion.div
        className="blitz-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onDismiss}
      >
        <motion.div
          className="blitz-modal-card blitz-modal-ended"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="blitz-modal-close" onClick={onDismiss} type="button">
            <X size={18} />
          </button>

          <div className="blitz-modal-icon-row">
            <Trophy size={32} style={{ color: '#FFD700' }} />
          </div>
          <h2 className="blitz-modal-title">Hour {data.hour} Winner</h2>
          <div className="blitz-modal-winner-name">
            {data.winner.username || truncateWallet(data.winner.wallet_address)}
          </div>
          <div className="blitz-modal-winner-stats">
            <span>{data.winner.csol_balance.toFixed(2)} Csol</span>
            <span className="blitz-modal-winner-arrow">-&gt;</span>
            <span className="blitz-modal-winner-prize">Won {data.prizeSol} SOL</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
