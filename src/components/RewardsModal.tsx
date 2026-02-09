import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { ChestInfo, ChestOpenResult, PlayerXpState, TierInfo } from '../types/game';
import { TIER_COLORS, tierIconUrl, chestIconUrl, keyIconUrl, TIER_NAMES } from '../types/game';

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chests: ChestInfo[];
  xpState: PlayerXpState | null;
  tiers: TierInfo[];
  onOpenChest: (tier: number) => Promise<ChestOpenResult>;
  isLoadingChests: boolean;
}

// Format cooldown time
const formatCooldown = (ms: number): string => {
  if (ms <= 0) return 'Ready!';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

// Chest Card States
type ChestCardState = 'available' | 'cooldown' | 'no-keys' | 'locked' | 'opening' | 'revealed';

interface ChestReward {
  reward_sol: number;
  is_jackpot: boolean;
}

const RewardsModal: React.FC<RewardsModalProps> = ({
  isOpen,
  onClose,
  chests,
  xpState,
  tiers: _tiers,
  onOpenChest,
  isLoadingChests,
}) => {
  const [openingTier, setOpeningTier] = useState<number | null>(null);
  const [revealedReward, setRevealedReward] = useState<{ tier: number; reward: ChestReward } | null>(null);
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
        // Brief delay for animation
        await new Promise(r => setTimeout(r, 1200));
        setRevealedReward({
          tier,
          reward: {
            reward_sol: result.reward_sol,
            is_jackpot: result.is_jackpot || false,
          },
        });
      } else {
        setError(result.error || 'Failed to open chest');
      }
    } catch {
      setError('Failed to open chest');
    } finally {
      setOpeningTier(null);
    }
  }, [onOpenChest]);

  const getChestState = (chest: ChestInfo): ChestCardState => {
    if (openingTier === chest.tier) return 'opening';
    if (revealedReward?.tier === chest.tier) return 'revealed';
    if (chest.is_level_locked) return 'locked';
    if (chest.keys_balance <= 0) return 'no-keys';
    if (chest.cooldown_remaining_ms > 0) return 'cooldown';
    if (chest.is_available) return 'available';
    return 'no-keys';
  };

  if (!isOpen) return null;

  const playerLevel = xpState?.level || 1;

  return (
    <div className="rewards-overlay" onClick={onClose}>
      <div className="rewards-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rewards-header">
          <div className="rewards-header-left">
            <span className="rewards-title">CHESTS</span>
            {xpState && (
              <span className="rewards-level-badge" style={{ color: TIER_COLORS[xpState.tier] || '#9CA3AF' }}>
                Lv.{xpState.level} {xpState.tier_name}
              </span>
            )}
          </div>
          <button className="rewards-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rewards-error">
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>✕</button>
          </div>
        )}

        {/* Chest Grid */}
        <div className="chest-grid">
          {isLoadingChests && chests.length === 0 ? (
            <div className="chest-loading">Loading chests...</div>
          ) : (
            chests.map((chest) => {
              const state = getChestState(chest);
              const tierColor = TIER_COLORS[chest.tier] || '#9CA3AF';
              const tierName = chest.name || TIER_NAMES[chest.tier] || 'Unknown';
              const isGrayed = state === 'locked' || state === 'no-keys' || state === 'cooldown';

              return (
                <div
                  key={chest.tier}
                  className={`chest-card chest-card--${state}`}
                  style={{
                    borderColor: state === 'available' ? tierColor : undefined,
                    boxShadow: state === 'available' ? `0 0 12px ${tierColor}33, inset 0 0 12px ${tierColor}11` : undefined,
                  }}
                >
                  {/* Chest Icon */}
                  <div className={`chest-icon-wrap ${isGrayed ? 'chest-icon-grayed' : ''}`}>
                    <img
                      src={chestIconUrl(chest.tier)}
                      alt={tierName}
                      className="chest-icon"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = tierIconUrl(chest.tier);
                      }}
                    />
                    {state === 'opening' && <div className="chest-opening-spinner" />}
                    {state === 'revealed' && revealedReward?.tier === chest.tier && (
                      <div className={`chest-reward-reveal ${revealedReward.reward.is_jackpot ? 'chest-jackpot' : ''}`}>
                        {revealedReward.reward.is_jackpot && <div className="jackpot-flash" />}
                        <span className="chest-reward-amount">
                          {revealedReward.reward.is_jackpot ? '🎰 JACKPOT!' : ''}<br />
                          +{revealedReward.reward.reward_sol.toFixed(3)} SOL
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tier Info */}
                  <div className="chest-info">
                    <div className="chest-tier-name" style={{ color: tierColor }}>{tierName}</div>
                    <div className="chest-level-range">Lvl {chest.level_min}–{chest.level_max}</div>
                  </div>

                  {/* Key Count */}
                  <div className="chest-key-row">
                    <img
                      src={keyIconUrl(chest.tier)}
                      alt="key"
                      className="chest-key-icon"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className={`chest-key-count ${chest.keys_balance > 0 ? 'has-keys' : ''}`}>
                      ×{chest.keys_balance}
                    </span>
                  </div>

                  {/* Action / Status */}
                  <div className="chest-action">
                    {state === 'available' && (
                      <button
                        className="chest-open-btn"
                        onClick={() => handleOpenChest(chest.tier)}
                        style={{ background: tierColor }}
                      >
                        OPEN
                      </button>
                    )}
                    {state === 'cooldown' && (
                      <span className="chest-cooldown-timer">
                        {formatCooldown(chest.cooldown_remaining_ms)}
                      </span>
                    )}
                    {state === 'no-keys' && (
                      <span className="chest-status-text">No Keys</span>
                    )}
                    {state === 'locked' && (
                      <span className="chest-status-text chest-locked-text">
                        🔒 Lv.{chest.level_min}
                      </span>
                    )}
                    {state === 'opening' && (
                      <span className="chest-status-text chest-opening-text">Opening...</span>
                    )}
                    {state === 'revealed' && revealedReward?.tier !== chest.tier && (
                      <span className="chest-status-text">—</span>
                    )}
                  </div>

                  {/* Reward Range (small) */}
                  <div className="chest-reward-range">
                    {chest.min_reward}–{chest.jackpot_reward} SOL
                  </div>

                  {/* Level Lock Overlay */}
                  {state === 'locked' && playerLevel < chest.level_min && (
                    <div className="chest-lock-overlay" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Jackpot reveal overlay */}
        {revealedReward?.reward.is_jackpot && (
          <div className="jackpot-overlay">
            <div className="jackpot-text">🎰 JACKPOT! 🎰</div>
            <div className="jackpot-amount">+{revealedReward.reward.reward_sol.toFixed(3)} SOL</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RewardsModal;
