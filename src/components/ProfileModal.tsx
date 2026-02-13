import React, { useState, useCallback } from 'react';
import { X, LogOut, Copy, Check, Users, Link2, Trophy, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UseProfileReturn } from '../hooks/useProfile';
import type { UseReferralReturn } from '../hooks/useReferral';
import type { PlayerXpState, LeaderboardPeriod } from '../types/game';
import { TIER_COLORS, TIER_NAMES, tierIconUrl } from '../types/game';

// ============================================================================
// Types
// ============================================================================

type ProfileTab = 'profile' | 'refer' | 'socials';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDisconnect: () => void;
  walletAddress: string | null;
  username: string | null;
  xpState: PlayerXpState | null;
  profile: UseProfileReturn;
  referral: UseReferralReturn | null;
}

// ============================================================================
// Helpers
// ============================================================================

const formatAddress = (address: string | null) => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const ordinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Discord SVG icon
const DiscordIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

// X (Twitter) SVG icon
const XIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// ============================================================================
// ProfileModal Component
// ============================================================================

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onDisconnect,
  walletAddress,
  username,
  xpState,
  profile,
  referral,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Copy wallet address
  const handleCopyAddress = useCallback(() => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  }, [walletAddress]);

  // Copy referral link
  const handleCopyLink = useCallback(() => {
    if (!referral?.referralLink) return;
    navigator.clipboard.writeText(referral.referralLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, [referral?.referralLink]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    onDisconnect();
    onClose();
  }, [onDisconnect, onClose]);

  if (!isOpen) return null;

  const level = xpState?.level ?? 0;
  const tier = xpState?.tier ?? 0;
  const xpProgress = xpState?.xp_progress ?? 0;
  const xpNeeded = xpState?.xp_needed ?? 150;
  const progressPercent = xpState?.progress_percent ?? 0;
  const tierColor = TIER_COLORS[tier] || '#9CA3AF';
  const tierName = TIER_NAMES[tier] || 'Pleb';

  const { stats, recentGames, socials, leaderboard, leaderboardPeriod, setLeaderboardPeriod } = profile;
  const refStats = referral?.stats;
  const refNetwork = referral?.network || [];

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="profile-modal-header">
          <div className="profile-modal-header-btns">
            <button
              className="profile-modal-icon-btn profile-modal-logout-btn"
              onClick={handleDisconnect}
              title="Disconnect Wallet"
            >
              <LogOut size={16} />
            </button>
            <button
              className="profile-modal-icon-btn profile-modal-close-btn"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Bar */}
          <div className="profile-tab-bar">
            <button
              className={`profile-tab-btn${activeTab === 'profile' ? ' active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              className={`profile-tab-btn${activeTab === 'refer' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('refer');
                referral?.fetchStats();
                referral?.fetchNetwork();
              }}
            >
              Refer
            </button>
            <button
              className={`profile-tab-btn${activeTab === 'socials' ? ' active' : ''}`}
              onClick={() => setActiveTab('socials')}
            >
              Socials
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="profile-modal-body">
          <AnimatePresence mode="wait">
            {/* ══════════════════ PROFILE TAB ══════════════════ */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="profile-tab-content"
              >
                {/* Username + Level */}
                <div className="profile-user-section">
                  <div className="profile-user-info">
                    <h1 className="profile-username-display">
                      {username || formatAddress(walletAddress)}
                    </h1>
                    <button className="profile-wallet-copy" onClick={handleCopyAddress}>
                      {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
                      <span>{formatAddress(walletAddress)}</span>
                    </button>
                  </div>

                  <div className="profile-level-section">
                    <div className="profile-level-badge-wrapper">
                      <div
                        className="profile-level-badge"
                        style={{ backgroundImage: `url(${tierIconUrl(tier)})` }}
                        title={`Level ${level} - ${tierName}`}
                      />
                    </div>
                    <div className="profile-level-details">
                      <div className="profile-level-text">
                        <span className="profile-level-label" style={{ color: tierColor }}>
                          Level {level}
                        </span>
                        <span className="profile-xp-label">
                          {xpProgress}/{xpNeeded} XP
                        </span>
                      </div>
                      <div className="profile-xp-bar-container">
                        <div
                          className="profile-xp-bar-fill"
                          style={{
                            width: `${Math.min(progressPercent, 100)}%`,
                            background: `linear-gradient(90deg, ${tierColor}, ${tierColor}cc)`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="profile-stats-grid">
                  <div className="profile-stat-card">
                    <div className="profile-stat-value">{stats?.games_played ?? 0}</div>
                    <div className="profile-stat-label">Games Played</div>
                    <div className="profile-stat-sub">{stats?.profitable_rounds ?? 0} profitable</div>
                  </div>
                  <div className="profile-stat-card">
                    <div className={`profile-stat-value ${(stats?.pnl_7d ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                      {stats?.pnl_rank_7d ? ordinalSuffix(stats.pnl_rank_7d) : '--'}
                    </div>
                    <div className="profile-stat-label">PnL Rank (7d)</div>
                    <div className={`profile-stat-sub ${(stats?.pnl_7d ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                      {stats ? `${(stats.pnl_7d >= 0 ? '+' : '')}${stats.pnl_7d.toFixed(3)} SOL` : '--'}
                    </div>
                  </div>
                  <div className="profile-stat-card">
                    <div className="profile-stat-value" style={{ color: '#00FFA3' }}>
                      {(stats?.bonus_sol_claimed ?? 0).toFixed(3)}
                    </div>
                    <div className="profile-stat-label">Bonus SOL Claimed</div>
                  </div>
                  <div className="profile-stat-card">
                    <div className="profile-stat-value">
                      {(stats?.total_volume ?? 0).toFixed(3)}
                    </div>
                    <div className="profile-stat-label">Total Bets</div>
                  </div>
                </div>

                {/* Recent Games */}
                <div className="profile-recent-games">
                  <h3 className="profile-section-title">Recent Games</h3>
                  {recentGames.length > 0 ? (
                    <div className="profile-games-scroll">
                      {recentGames.map((game) => (
                        <div
                          key={game.round_id}
                          className={`profile-game-card ${game.pnl >= 0 ? 'profit' : 'loss'}`}
                        >
                          <div className="profile-game-multi">
                            {game.peak_multiplier.toFixed(2)}x
                          </div>
                          <div className={`profile-game-pnl ${game.pnl >= 0 ? 'positive' : 'negative'}`}>
                            {game.pnl >= 0 ? '+' : ''}{game.pnl.toFixed(4)}
                          </div>
                          <div className="profile-game-time">
                            {new Date(game.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="profile-games-empty">
                      No games played yet
                    </div>
                  )}
                </div>

                {/* Leaderboard */}
                <div className="profile-leaderboard">
                  <div className="profile-leaderboard-header">
                    <h3 className="profile-section-title">
                      <Trophy size={16} />
                      Leaderboard
                    </h3>
                    <div className="profile-period-filter">
                      {(['24h', '7d', '30d', 'all'] as LeaderboardPeriod[]).map(p => (
                        <button
                          key={p}
                          className={`profile-period-btn${leaderboardPeriod === p ? ' active' : ''}`}
                          onClick={() => setLeaderboardPeriod(p)}
                        >
                          {p === '24h' ? '24h' : p === '7d' ? '7d' : p === '30d' ? '30d' : 'All'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Podium - Top 3 */}
                  {leaderboard.length >= 3 && (
                    <div className="profile-podium">
                      {/* 2nd place */}
                      <div className="profile-podium-card second">
                        <div className="profile-podium-rank">2</div>
                        <div className="profile-podium-name">{leaderboard[1].username}</div>
                        <div className={`profile-podium-pnl ${leaderboard[1].total_pnl >= 0 ? 'positive' : 'negative'}`}>
                          {leaderboard[1].total_pnl >= 0 ? '+' : ''}{leaderboard[1].total_pnl.toFixed(2)}
                        </div>
                      </div>
                      {/* 1st place */}
                      <div className="profile-podium-card first">
                        <div className="profile-podium-rank">1</div>
                        <div className="profile-podium-name">{leaderboard[0].username}</div>
                        <div className={`profile-podium-pnl ${leaderboard[0].total_pnl >= 0 ? 'positive' : 'negative'}`}>
                          {leaderboard[0].total_pnl >= 0 ? '+' : ''}{leaderboard[0].total_pnl.toFixed(2)}
                        </div>
                      </div>
                      {/* 3rd place */}
                      <div className="profile-podium-card third">
                        <div className="profile-podium-rank">3</div>
                        <div className="profile-podium-name">{leaderboard[2].username}</div>
                        <div className={`profile-podium-pnl ${leaderboard[2].total_pnl >= 0 ? 'positive' : 'negative'}`}>
                          {leaderboard[2].total_pnl >= 0 ? '+' : ''}{leaderboard[2].total_pnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Table - Rank 4+ */}
                  {leaderboard.length > 3 && (
                    <div className="profile-lb-table-wrap">
                      <table className="profile-lb-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th style={{ textAlign: 'right' }}>PnL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.slice(3).map(entry => (
                            <tr key={entry.wallet_address || entry.rank}>
                              <td className="profile-lb-rank">{entry.rank}</td>
                              <td className="profile-lb-name">{entry.username}</td>
                              <td className={`profile-lb-pnl ${entry.total_pnl >= 0 ? 'positive' : 'negative'}`}>
                                {entry.total_pnl >= 0 ? '+' : ''}{entry.total_pnl.toFixed(2)} SOL
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {leaderboard.length === 0 && !profile.isLoadingLeaderboard && (
                    <div className="profile-lb-empty">No leaderboard data available</div>
                  )}
                  {profile.isLoadingLeaderboard && (
                    <div className="profile-lb-empty">Loading...</div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ══════════════════ REFER TAB ══════════════════ */}
            {activeTab === 'refer' && (
              <motion.div
                key="refer"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="profile-tab-content"
              >
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
                </div>
              </motion.div>
            )}

            {/* ══════════════════ SOCIALS TAB ══════════════════ */}
            {activeTab === 'socials' && (
              <motion.div
                key="socials"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="profile-tab-content"
              >
                <div className="socials-tab">
                  <div className="socials-description">
                    <Link2 size={16} />
                    Connect your accounts to verify your identity and unlock social rewards
                  </div>

                  {/* Discord Card */}
                  <SocialCard
                    provider="discord"
                    providerName="Discord"
                    icon={<DiscordIcon size={24} />}
                    connection={socials.find(s => s.provider === 'discord')}
                    onConnect={profile.connectDiscord}
                    onDisconnect={() => profile.disconnectSocial('discord')}
                    isDisconnecting={profile.isDisconnecting}
                    accentColor="#5865F2"
                  />

                  {/* Twitter / X Card */}
                  <SocialCard
                    provider="twitter"
                    providerName="X (Twitter)"
                    icon={<XIcon size={22} />}
                    connection={socials.find(s => s.provider === 'twitter')}
                    onConnect={profile.connectTwitter}
                    onDisconnect={() => profile.disconnectSocial('twitter')}
                    isDisconnecting={profile.isDisconnecting}
                    accentColor="#fff"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SocialCard Sub-Component
// ============================================================================

interface SocialCardProps {
  provider: 'discord' | 'twitter';
  providerName: string;
  icon: React.ReactNode;
  connection?: { provider_username: string; provider_avatar?: string; connected_at: string };
  onConnect: () => void;
  onDisconnect: () => Promise<boolean>;
  isDisconnecting: boolean;
  accentColor: string;
}

const SocialCard: React.FC<SocialCardProps> = ({
  providerName,
  icon,
  connection,
  onConnect,
  onDisconnect,
  isDisconnecting,
  accentColor,
}) => {
  const isConnected = !!connection;

  return (
    <div className={`social-card ${isConnected ? 'connected' : ''}`}>
      <div className="social-card-left">
        <div className="social-card-icon" style={{ color: accentColor }}>
          {icon}
        </div>
        <div className="social-card-info">
          <div className="social-card-name">{providerName}</div>
          {isConnected ? (
            <div className="social-card-username">
              @{connection.provider_username}
              <span className="social-connected-badge">Connected</span>
            </div>
          ) : (
            <div className="social-card-status">Not connected</div>
          )}
        </div>
      </div>
      <div className="social-card-right">
        {isConnected ? (
          <button
            className="social-disconnect-btn"
            onClick={onDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? '...' : 'Disconnect'}
          </button>
        ) : (
          <button
            className="social-connect-btn"
            onClick={onConnect}
            style={{ borderColor: accentColor }}
          >
            Connect
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
