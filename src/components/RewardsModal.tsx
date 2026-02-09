import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Clock, Lock } from 'lucide-react';
import type { ChestInfo, ChestOpenResult, ChestHistoryEntry, PlayerXpState, TierInfo, LootTableEntry } from '../types/game';
import {
  TIER_COLORS, tierIconUrl, chestIconUrl, keyIconUrl,
  TIER_NAMES, TIER_LEVEL_REQ, RARITY_COLORS,
} from '../types/game';

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chests: ChestInfo[];
  xpState: PlayerXpState | null;
  tiers: TierInfo[];
  onOpenChest: (tier: number) => Promise<ChestOpenResult>;
  isLoadingChests: boolean;
  chestHistory?: ChestHistoryEntry[];
  fetchHistory?: () => Promise<void>;
}

type Tab = 'chests' | 'tiers' | 'history';
type AnimPhase = 'idle' | 'shaking' | 'bursting' | 'revealing';

// Format cooldown ms to human string
function formatCooldown(ms: number): string {
  if (ms <= 0) return 'Ready';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Get loot table for a tier — prefer chests[] data, fallback to tiers[] reference
function getLootTable(tier: number, chests: ChestInfo[], tiers: TierInfo[]): LootTableEntry[] {
  const chestData = chests.find(c => c.tier_index === tier);
  if (chestData?.loot_table?.length) return chestData.loot_table;
  const tierData = tiers.find(t => t.index === tier);
  if (tierData?.loot_table?.length) return tierData.loot_table;
  return [];
}

const RewardsModal: React.FC<RewardsModalProps> = ({
  isOpen,
  onClose,
  chests,
  xpState,
  tiers,
  onOpenChest,
  isLoadingChests,
  chestHistory = [],
  fetchHistory,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('chests');
  const [selectedTier, setSelectedTier] = useState<number>(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const [revealedReward, setRevealedReward] = useState<ChestOpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTierRow, setExpandedTierRow] = useState<number | null>(null);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);

  const playerLevel = xpState?.level || 0;
  const playerTier = xpState?.tier ?? 0;

  // Auto-select player's current tier on open
  useEffect(() => {
    if (isOpen) {
      setSelectedTier(playerTier);
      setAnimPhase('idle');
      setRevealedReward(null);
      setError(null);
      setActiveTab('chests');
      setExpandedTierRow(null);
    }
  }, [isOpen, playerTier]);

  // Fetch history when tab changes
  useEffect(() => {
    if (activeTab === 'history' && fetchHistory) {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  // Cleanup anim timeouts
  useEffect(() => {
    return () => {
      animTimeoutRef.current.forEach(clearTimeout);
    };
  }, []);

  // Get chest data for selected tier
  const selectedChest = useMemo(() => {
    return chests.find(c => c.tier_index === selectedTier) || null;
  }, [chests, selectedTier]);

  const selectedLoot = useMemo(() => {
    return getLootTable(selectedTier, chests, tiers);
  }, [selectedTier, chests, tiers]);

  const isLocked = playerLevel < (TIER_LEVEL_REQ[selectedTier] || 0);
  const hasKeys = selectedChest ? selectedChest.keys > 0 : false;
  const isReady = selectedChest ? selectedChest.is_ready : false;
  const cooldownMs = selectedChest?.cooldown_remaining_ms || 0;

  // Handle chest open with animation phases
  const handleOpenChest = useCallback(async () => {
    if (isLocked || !hasKeys || !isReady || animPhase !== 'idle') return;
    setError(null);
    setRevealedReward(null);
    setAnimPhase('shaking');

    // Clear old timeouts
    animTimeoutRef.current.forEach(clearTimeout);
    animTimeoutRef.current = [];

    try {
      const resultPromise = onOpenChest(selectedTier);

      // Phase 2: burst after 800ms
      const t1 = setTimeout(() => setAnimPhase('bursting'), 800);
      animTimeoutRef.current.push(t1);

      const result = await resultPromise;

      if (result.success && result.reward_sol !== undefined) {
        // Phase 3: reveal after burst (400ms more)
        const t2 = setTimeout(() => {
          setRevealedReward(result);
          setAnimPhase('revealing');
        }, 1200);
        animTimeoutRef.current.push(t2);
      } else {
        setError(result.error || 'Failed to open chest');
        setAnimPhase('idle');
      }
    } catch {
      setError('Failed to open chest');
      setAnimPhase('idle');
    }
  }, [isLocked, hasKeys, isReady, animPhase, onOpenChest, selectedTier]);

  const dismissReveal = useCallback(() => {
    setRevealedReward(null);
    setAnimPhase('idle');
  }, []);

  if (!isOpen) return null;

  const tierColor = TIER_COLORS[selectedTier] || '#9CA3AF';
  const tierName = TIER_NAMES[selectedTier] || 'Unknown';

  return (
    <div className="rewards-overlay" onClick={onClose}>
      <div className="rewards-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rewards-modal-header">
          <div className="rewards-modal-title">Rewards</div>
          <button className="rewards-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="rewards-tabs">
          {(['chests', 'tiers', 'history'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`rewards-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'chests' ? 'Chests' : tab === 'tiers' ? 'Tiers' : 'History'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="rewards-modal-body">
          {/* ═══════ TAB: CHESTS ═══════ */}
          {activeTab === 'chests' && (
            <>
              {/* Error banner */}
              {error && (
                <div className="chest-error-banner">
                  {error}
                  <button onClick={() => setError(null)} className="chest-error-dismiss">✕</button>
                </div>
              )}

              {/* Horizontal Chest Strip */}
              <div className="chest-strip" ref={stripRef}>
                {Array.from({ length: 10 }, (_, i) => i).map(tier => {
                  const locked = playerLevel < (TIER_LEVEL_REQ[tier] || 0);
                  const chestData = chests.find(c => c.tier_index === tier);
                  const keys = chestData?.keys ?? 0;
                  const tc = TIER_COLORS[tier] || '#9CA3AF';

                  return (
                    <button
                      key={tier}
                      className={`chest-strip-card${selectedTier === tier ? ' selected' : ''}${locked ? ' locked' : ''}`}
                      onClick={() => { setSelectedTier(tier); setRevealedReward(null); setAnimPhase('idle'); setError(null); }}
                      style={selectedTier === tier && !locked ? {
                        borderColor: tc,
                        boxShadow: `0 0 12px ${tc}44, inset 0 0 8px ${tc}22`,
                      } : undefined}
                      title={TIER_NAMES[tier]}
                    >
                      {/* Key badge */}
                      {!locked && (
                        <div className="chest-key-badge">
                          <span className="chest-key-count" style={{ opacity: keys > 0 ? 1 : 0.4 }}>{keys}</span>
                          <img src={keyIconUrl()} alt="key" className="chest-key-icon" />
                        </div>
                      )}
                      {locked && (
                        <div className="chest-lock-badge">
                          <Lock size={10} />
                        </div>
                      )}
                      <div
                        className="chest-strip-icon"
                        style={{ backgroundImage: `url(${tierIconUrl(tier)})` }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Selected Chest Detail Panel */}
              <div className="chest-detail">
                {/* Chest icon + title */}
                <div className="chest-detail-header">
                  <div
                    className={`chest-detail-icon ${animPhase === 'shaking' ? 'chest-anim-shaking' : ''} ${animPhase === 'bursting' ? 'chest-anim-bursting' : ''}`}
                    style={{ backgroundImage: animPhase !== 'revealing' ? `url(${chestIconUrl(selectedTier)})` : 'none' }}
                  />
                  {animPhase === 'bursting' && (
                    <div className="chest-burst-flash" style={{ background: `radial-gradient(circle, ${tierColor}88 0%, transparent 70%)` }} />
                  )}
                  <h3 className="chest-detail-title" style={{ color: tierColor }}>
                    {tierName} Chest Rewards
                  </h3>
                </div>

                {/* Reward reveal overlay */}
                {animPhase === 'revealing' && revealedReward && (
                  <div
                    className={`chest-reveal-card ${revealedReward.is_jackpot ? 'jackpot' : ''}`}
                    onClick={dismissReveal}
                    style={{
                      borderColor: RARITY_COLORS[revealedReward.rarity] || tierColor,
                      boxShadow: `0 0 30px ${(RARITY_COLORS[revealedReward.rarity] || tierColor)}44`,
                    }}
                  >
                    {revealedReward.is_jackpot && (
                      <div className="chest-reveal-jackpot-banner">JACKPOT!</div>
                    )}
                    <div
                      className="chest-reveal-rarity"
                      style={{ color: RARITY_COLORS[revealedReward.rarity] || '#fff' }}
                    >
                      {revealedReward.rarity}
                    </div>
                    <div className="chest-reveal-sol">+{revealedReward.reward_sol} SOL</div>
                    <div className="chest-reveal-sub">Added to your balance</div>
                    <div className="chest-reveal-tap">Tap to dismiss</div>
                    {revealedReward.is_jackpot && <div className="chest-confetti" />}
                  </div>
                )}

                {/* Loot Table Grid */}
                {animPhase !== 'revealing' && (
                  <div className="chest-loot-grid">
                    {selectedLoot.map((entry, i) => {
                      const rarityColor = RARITY_COLORS[entry.rarity] || '#9d9d9d';
                      const isJackpot = entry.rarity === 'Jackpot';
                      return (
                        <div
                          key={i}
                          className={`chest-loot-card${isJackpot ? ' jackpot' : ''}`}
                          style={{
                            '--loot-color': rarityColor,
                            '--loot-color-dim': `${rarityColor}22`,
                          } as React.CSSProperties}
                        >
                          <div className="chest-loot-sol-bg" />
                          <div className="chest-loot-amount">{entry.reward_sol}</div>
                          <div className="chest-loot-rarity" style={{ color: rarityColor }}>{entry.rarity}</div>
                          <div className="chest-loot-odds">{entry.odds_percent}%</div>
                        </div>
                      );
                    })}
                    {selectedLoot.length === 0 && !isLoadingChests && (
                      <div className="chest-loot-empty">
                        {isLocked ? `Unlock at Level ${TIER_LEVEL_REQ[selectedTier]}` : 'No loot data available'}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Button */}
                <div className="chest-actions">
                  {isLocked ? (
                    <button className="chest-open-btn locked" disabled>
                      <Lock size={16} />
                      UNLOCK AT LEVEL {TIER_LEVEL_REQ[selectedTier]}
                    </button>
                  ) : !hasKeys ? (
                    <button className="chest-open-btn no-keys" disabled>
                      NO KEYS AVAILABLE
                    </button>
                  ) : cooldownMs > 0 ? (
                    <button className="chest-open-btn cooldown" disabled>
                      <Clock size={16} />
                      COOLDOWN: {formatCooldown(cooldownMs)}
                    </button>
                  ) : animPhase !== 'idle' ? (
                    <button className="chest-open-btn opening" disabled>
                      OPENING...
                    </button>
                  ) : (
                    <button
                      className="chest-open-btn ready"
                      style={{ background: tierColor }}
                      onClick={handleOpenChest}
                    >
                      <img src={keyIconUrl()} alt="key" className="chest-btn-key-icon" />
                      OPEN CHEST ({selectedChest?.keys || 0} keys)
                    </button>
                  )}
                  <button className="chest-go-back-btn" onClick={onClose}>
                    GO BACK
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══════ TAB: TIERS ═══════ */}
          {activeTab === 'tiers' && (
            <div className="tier-list">
              {Array.from({ length: 10 }, (_, i) => i).map(tier => {
                const locked = playerLevel < (TIER_LEVEL_REQ[tier] || 0);
                const isCurrent = playerTier === tier;
                const tc = TIER_COLORS[tier] || '#9CA3AF';
                const tierInfo = tiers.find(t => t.index === tier);
                const levelRange = tierInfo?.level_range
                  ? `${tierInfo.level_range[0]}–${tierInfo.level_range[1]}`
                  : `${TIER_LEVEL_REQ[tier] + 1}–${(TIER_LEVEL_REQ[tier + 1] || 100)}`;
                const cooldownMin = tierInfo?.cooldown_minutes;
                const loot = getLootTable(tier, chests, tiers);

                return (
                  <div key={tier} className={`tier-row${isCurrent ? ' current' : ''}${locked ? ' locked' : ''}`}>
                    <button
                      className="tier-row-header"
                      onClick={() => setExpandedTierRow(expandedTierRow === tier ? null : tier)}
                    >
                      <div className="tier-row-icon" style={{ backgroundImage: `url(${tierIconUrl(tier)})` }} />
                      <div className="tier-row-info">
                        <span className="tier-row-name" style={{ color: locked ? 'rgba(248,248,252,0.4)' : tc }}>
                          {TIER_NAMES[tier]}
                        </span>
                        <span className="tier-row-levels">Levels {levelRange}</span>
                      </div>
                      {cooldownMin !== undefined && (
                        <span className="tier-row-cd">
                          <Clock size={12} /> {cooldownMin >= 60 ? `${cooldownMin / 60}h` : `${cooldownMin}m`}
                        </span>
                      )}
                      {isCurrent && <span className="tier-row-badge current-badge">CURRENT</span>}
                      {locked && <span className="tier-row-badge locked-badge">Lv.{TIER_LEVEL_REQ[tier]}</span>}
                      <span className={`tier-row-chevron ${expandedTierRow === tier ? 'expanded' : ''}`}>▸</span>
                    </button>
                    {expandedTierRow === tier && loot.length > 0 && (
                      <div className="tier-loot-expand">
                        <table className="tier-loot-table">
                          <thead>
                            <tr><th>Rarity</th><th>SOL</th><th>Odds</th></tr>
                          </thead>
                          <tbody>
                            {loot.map((entry, i) => (
                              <tr key={i} className={entry.rarity === 'Jackpot' ? 'jackpot-row' : ''}>
                                <td style={{ color: RARITY_COLORS[entry.rarity] || '#9d9d9d' }}>{entry.rarity}</td>
                                <td>{entry.reward_sol}</td>
                                <td>{entry.odds_percent}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════ TAB: HISTORY ═══════ */}
          {activeTab === 'history' && (
            <div className="chest-history-list">
              {chestHistory.length === 0 ? (
                <div className="chest-history-empty">No chest opens yet. Start playing to earn keys!</div>
              ) : (
                chestHistory.map((entry, i) => {
                  const tierIdx = entry.tier_index ?? 0;
                  const tc = TIER_COLORS[tierIdx] || '#9CA3AF';
                  const timeAgo = getTimeAgo(entry.opened_at);
                  return (
                    <div key={i} className={`chest-history-row${entry.is_jackpot ? ' jackpot' : ''}`}>
                      <div className="chest-history-icon" style={{ backgroundImage: `url(${tierIconUrl(tierIdx)})` }} />
                      <div className="chest-history-info">
                        <span className="chest-history-tier" style={{ color: tc }}>{entry.tier || TIER_NAMES[tierIdx]}</span>
                        <span className="chest-history-time">{timeAgo}</span>
                      </div>
                      <div className="chest-history-reward">
                        <span className={`chest-history-sol${entry.is_jackpot ? ' jackpot-text' : ''}`}>
                          +{entry.reward_sol} SOL
                        </span>
                        {entry.is_jackpot && <span className="chest-history-jackpot-badge">JACKPOT</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default RewardsModal;
