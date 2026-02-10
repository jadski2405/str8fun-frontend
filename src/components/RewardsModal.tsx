import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Clock, Lock, Copy, Check, Users, Gift } from 'lucide-react';
import type { ChestInfo, ChestOpenResult, PlayerXpState, TierInfo, LootTableEntry } from '../types/game';
import {
  TIER_COLORS, tierIconUrl, chestIconUrl, keyIconUrl,
  TIER_NAMES, TIER_LEVEL_REQ, RARITY_COLORS,
} from '../types/game';
import type { UseReferralReturn } from '../hooks/useReferral';

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chests: ChestInfo[];
  xpState: PlayerXpState | null;
  tiers: TierInfo[];
  onOpenChest: (tier: number) => Promise<ChestOpenResult>;
  isLoadingChests: boolean;
  chestHistory?: unknown[];
  fetchHistory?: () => Promise<void>;
  referral?: UseReferralReturn | null;
}

type AnimPhase = 'idle' | 'shaking' | 'bursting' | 'revealing';
type RewardsTab = 'chests' | 'referrals';

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
  chestHistory: _chestHistory = [],
  fetchHistory: _fetchHistory,
  referral,
}) => {
  const [selectedTier, setSelectedTier] = useState<number>(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const [revealedReward, setRevealedReward] = useState<ChestOpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<RewardsTab>('chests');
  const [copiedLink, setCopiedLink] = useState(false);

  const playerLevel = xpState?.level || 0;
  const playerTier = xpState?.tier ?? 0;

  // Auto-select player's current tier on open
  useEffect(() => {
    if (isOpen) {
      setSelectedTier(playerTier);
      setAnimPhase('idle');
      setRevealedReward(null);
      setError(null);
      setCopiedLink(false);
    }
  }, [isOpen, playerTier]);

  // Fetch referral data when switching to referrals tab
  useEffect(() => {
    if (isOpen && activeTab === 'referrals' && referral) {
      referral.fetchStats();
      referral.fetchNetwork();
    }
  }, [isOpen, activeTab]);

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

  // Copy referral link to clipboard
  const handleCopyLink = useCallback(() => {
    if (!referral?.referralLink) return;
    navigator.clipboard.writeText(referral.referralLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, [referral?.referralLink]);

  if (!isOpen) return null;

  const tierColor = TIER_COLORS[selectedTier] || '#9CA3AF';
  const tierName = TIER_NAMES[selectedTier] || 'Unknown';

  const refStats = referral?.stats;
  const refNetwork = referral?.network || [];

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

        {/* Tabs */}
        <div className="rewards-tab-bar">
          <button
            className={`rewards-tab-btn${activeTab === 'chests' ? ' active' : ''}`}
            onClick={() => setActiveTab('chests')}
          >
            <Gift size={14} />
            Chests
          </button>
          <button
            className={`rewards-tab-btn${activeTab === 'referrals' ? ' active' : ''}`}
            onClick={() => setActiveTab('referrals')}
          >
            <Users size={14} />
            Referrals
          </button>
        </div>

        {/* Body */}
        <div className="rewards-modal-body">
          {/* ── CHESTS TAB ─────────────────────────────────────────── */}
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

          {/* ── REFERRALS TAB ──────────────────────────────────────── */}
          {activeTab === 'referrals' && (
            <div className="referral-tab">
              {/* Referral Link Section */}
              <div className="referral-link-section">
                <div className="referral-link-label">Your Referral Link</div>
                <div className="referral-link-row">
                  <input
                    className="referral-link-input"
                    value={referral?.referralLink || 'Connect wallet to get link'}
                    readOnly
                  />
                  <button
                    className="referral-copy-btn"
                    onClick={handleCopyLink}
                    disabled={!referral?.referralLink}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="referral-commission-info">
                  Earn <span className="referral-highlight">25%</span> Layer 1 · <span className="referral-highlight">5%</span> Layer 2 · <span className="referral-highlight">3%</span> Layer 3 of house fees
                </div>
              </div>

              {/* Stats Cards */}
              <div className="referral-stats-grid">
                <div className="referral-stat-card">
                  <div className="referral-stat-value">{refStats?.total_referrals ?? 0}</div>
                  <div className="referral-stat-label">Total Referrals</div>
                </div>
                <div className="referral-stat-card">
                  <div className="referral-stat-value">{refStats?.active_referrals ?? 0}</div>
                  <div className="referral-stat-label">Active</div>
                </div>
                <div className="referral-stat-card">
                  <div className="referral-stat-value" style={{ color: '#00FFA3' }}>
                    {(refStats?.total_earnings ?? 0).toFixed(2)}
                  </div>
                  <div className="referral-stat-label">Total Earned (SOL)</div>
                </div>
              </div>

              {/* Claimable Weeks */}
              {refStats?.claimable_weeks && refStats.claimable_weeks.length > 0 && (
                <div className="referral-claimable-section">
                  <div className="referral-section-title">Claimable Earnings</div>
                  {refStats.claimable_weeks.filter(w => !w.claimed).map(week => (
                    <div key={week.week_start} className="referral-claim-row">
                      <div className="referral-claim-info">
                        <span className="referral-claim-week">
                          Week of {new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="referral-claim-amount" style={{ color: '#00FFA3' }}>
                          {week.amount.toFixed(4)} SOL
                        </span>
                      </div>
                      <button
                        className="referral-claim-btn"
                        onClick={() => referral?.claimWeek(week.week_start)}
                        disabled={referral?.isClaiming}
                      >
                        {referral?.isClaiming ? 'Claiming...' : 'Claim'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Network */}
              {refNetwork.length > 0 && (
                <div className="referral-network-section">
                  <div className="referral-section-title">Your Network</div>
                  <div className="referral-network-list">
                    {refNetwork.map((user, i) => (
                      <div key={i} className="referral-network-row">
                        <div className="referral-network-user">
                          <span className={`referral-layer-badge layer-${user.layer}`}>L{user.layer}</span>
                          <span className="referral-network-name">{user.username}</span>
                        </div>
                        <div className="referral-network-meta">
                          <span className="referral-network-level">Lv.{user.level}</span>
                          <span className="referral-network-wagered">{user.wagered.toFixed(2)} SOL</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!referral?.isLoading && refNetwork.length === 0 && (
                <div className="referral-empty">
                  <Users size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>Share your link to start earning</div>
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                    Earn commissions when your referrals trade
                  </div>
                </div>
              )}

              <button className="chest-go-back-btn" onClick={onClose}>
                GO BACK
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RewardsModal;
