import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { ChestInfo, ChestOpenResult, PlayerXpState, TierInfo } from '../types/game';
import { TIER_COLORS, tierIconUrl, TIER_NAMES } from '../types/game';

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chests: ChestInfo[];
  xpState: PlayerXpState | null;
  tiers: TierInfo[];
  onOpenChest: (tier: number) => Promise<ChestOpenResult>;
  isLoadingChests: boolean;
}

// Level thresholds for each tier (index = tier number 1-10)
const TIER_LEVEL_REQ = [0, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

const RewardsModal: React.FC<RewardsModalProps> = ({
  isOpen,
  onClose,
  chests: _chests,
  xpState,
  tiers: _tiers,
  onOpenChest,
  isLoadingChests: _isLoadingChests,
}) => {
  const [openingTier, setOpeningTier] = useState<number | null>(null);
  const [revealedReward, setRevealedReward] = useState<ChestOpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setOpeningTier(null);
      setRevealedReward(null);
      setError(null);
    }
  }, [isOpen]);

  const handleOpenChest = useCallback(async (tier: number) => {
    setError(null);
    setOpeningTier(tier);
    setRevealedReward(null);

    try {
      const result = await onOpenChest(tier);
      if (result.success && result.reward_sol !== undefined) {
        await new Promise(r => setTimeout(r, 1200));
        setRevealedReward(result);
      } else {
        setError(result.error || 'Failed to open chest');
      }
    } catch {
      setError('Failed to open chest');
    } finally {
      setOpeningTier(null);
    }
  }, [onOpenChest]);

  if (!isOpen) return null;

  const playerLevel = xpState?.level || 0;

  return (
    <div className="rewards-overlay" onClick={onClose}>
      <div className="rewards-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rewards-modal-header">
          <div className="rewards-modal-title">Rank Chests</div>
          <button className="rewards-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="rewards-modal-body">
          {/* Error banner */}
          {error && (
            <div className="chest-error-banner">
              {error}
              <button onClick={() => setError(null)} className="chest-error-dismiss">✕</button>
            </div>
          )}

          {/* Reward reveal banner */}
          {revealedReward && (
            <div
              className={`chest-reveal-banner ${revealedReward.is_jackpot ? 'jackpot' : ''}`}
              onClick={() => setRevealedReward(null)}
            >
              {revealedReward.is_jackpot && <div className="chest-reveal-jackpot-label">JACKPOT!</div>}
              <div className="chest-reveal-amount">+{revealedReward.reward_sol?.toFixed(4)} SOL</div>
              <div className="chest-reveal-dismiss">Tap to dismiss</div>
            </div>
          )}

          {/* Chest Grid */}
          <div className="chest-grid-mini">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(tier => {
              const requiredLevel = TIER_LEVEL_REQ[tier] || 0;
              const isLocked = playerLevel < requiredLevel;
              const isOpening = openingTier === tier;
              const tierColor = TIER_COLORS[tier] || '#9CA3AF';
              const tierName = TIER_NAMES[tier] || `Tier ${tier}`;

              return (
                <div
                  key={tier}
                  className={`chest-card-mini${isLocked ? ' locked' : ''}${isOpening ? ' opening' : ''}`}
                  onClick={() => !isLocked && !isOpening && handleOpenChest(tier)}
                  style={!isLocked ? { cursor: 'pointer' } : undefined}
                >
                  <div className="chest-icon-mini image-icon">
                    <img
                      src={tierIconUrl(tier)}
                      alt={tierName}
                      className="chest-icon-image"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="chest-info-mini">
                    <div
                      className="chest-level"
                      style={{ color: isLocked ? 'rgba(248,248,252,0.3)' : tierColor }}
                    >
                      LEVEL {requiredLevel}+
                    </div>
                    <div
                      className="chest-name"
                      style={{ color: isLocked ? 'rgba(248,248,252,0.4)' : '#fff' }}
                    >
                      {tierName}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewardsModal;
