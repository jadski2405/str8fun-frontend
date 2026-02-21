// ============================================================================
// MINE IT PAGE — Stake-style Mines game (sidebar + grid)
// ============================================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Minus,
  Plus,
} from 'lucide-react';
import GlobalHeader from '../../components/GlobalHeader';
import GlobalChatSidebar from '../../components/GlobalChatSidebar';
import WagerToast from '../../components/WagerToast';
import type { WagerNotification } from '../../components/WagerToast';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';
import { useGame } from '../../hooks/useGame';
import { useMineGame } from './useMineGame';
import MineGrid from './MineGrid';
import { playCashout, playGameStart } from './mineSounds';
import solanaLogo from '../../assets/logo_solana.png';

// ============================================================================
// HELPERS
// ============================================================================
const fmt = (v: number): string => {
  if (v < 0.001 && v > 0) return '<0.001';
  return v.toFixed(3);
};

const DEFAULT_GRID = 5;
const MIN_GRID = 5;
const MAX_GRID = 10;

// ============================================================================
// COMPONENT
// ============================================================================
const MineIt: React.FC = () => {
  /* ── Layout / Chat ───────────────────────────────────────────────────── */
  const [chatCollapsed, setChatCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const {
    isConnected,
    publicKey,
    getAuthToken,
    profileId,
    depositedBalance,
    refreshDepositedBalance,
    hasActiveBonus,
    wagerCompletedFlag,
    dismissWagerCompleted,
  } = useSolanaWallet();
  const gameChat = useGame(profileId, publicKey || null, getAuthToken);
  const [muted, setMuted] = useState(false);

  /* ── Wager notification state ────────────────────────────────────────── */
  const [wagerNotifications, setWagerNotifications] = useState<WagerNotification[]>([]);
  const wagerNotifId = React.useRef(0);

  const pushWagerNotification = useCallback((type: 'locked' | 'completed', message: string) => {
    const id = `wager-mine-${++wagerNotifId.current}`;
    setWagerNotifications(prev => [...prev, { id, type, message }]);
  }, []);

  const dismissWagerNotification = useCallback((id: string) => {
    setWagerNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Show celebration toast when wagering requirement is met
  useEffect(() => {
    if (wagerCompletedFlag) {
      pushWagerNotification('completed', '🎉 Wagering requirement complete! Your bonus balance is now unlocked and withdrawable.');
      dismissWagerCompleted();
    }
  }, [wagerCompletedFlag, pushWagerNotification, dismissWagerCompleted]);

  /* ── Mine game hook ──────────────────────────────────────────────────── */
  const mine = useMineGame(getAuthToken, publicKey || null, refreshDepositedBalance);

  /* ── Config state (locked during active game) ────────────────────────── */
  const [gridSize, setGridSize] = useState(DEFAULT_GRID);
  const [redCount, setRedCount] = useState(3);
  const [yellowCount, setYellowCount] = useState(2);
  const [betInput, setBetInput] = useState('');

  useEffect(() => {
    if (mine.game && mine.phase === 'active') {
      setGridSize(mine.game.grid_size);
      setRedCount(mine.game.red_count);
      setYellowCount(mine.game.yellow_count);
    }
  }, [mine.game?.game_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalTiles = gridSize * gridSize;
  const maxDanger = totalTiles - 1;
  const configLocked = mine.phase === 'active';
  const greenCount = totalTiles - redCount - yellowCount;

  useEffect(() => {
    if (redCount + yellowCount >= totalTiles) {
      setYellowCount(Math.max(0, totalTiles - 1 - redCount));
    }
  }, [redCount, yellowCount, totalTiles]);

  /* ── Bet helpers ─────────────────────────────────────────────────────── */
  const handleBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^\d*\.?\d{0,3}$/.test(e.target.value)) setBetInput(e.target.value);
  };
  const handleHalf = () => {
    const cur = parseFloat(betInput) || 0;
    if (cur > 0) setBetInput(fmt(cur / 2));
  };
  const handleDouble = () => {
    const cur = parseFloat(betInput) || 0;
    const doubled = cur * 2;
    setBetInput(fmt(Math.min(doubled, depositedBalance)));
  };

  /* ── Play / Cashout ──────────────────────────────────────────────────── */
  const handlePlay = useCallback(async () => {
    const betAmt = parseFloat(betInput) || 0;
    if (betAmt <= 0) { mine.clearError(); return; }
    if (betAmt > depositedBalance) return;
    if (!muted) playGameStart();
    await mine.createGame({
      bet_amount: betAmt,
      grid_size: gridSize,
      red_count: redCount,
      yellow_count: yellowCount,
    });
  }, [betInput, depositedBalance, gridSize, redCount, yellowCount, mine, muted]);

  const handleCashout = useCallback(async () => {
    if (!muted) playCashout();
    const success = await mine.cashout();
    if (success && hasActiveBonus) {
      pushWagerNotification('locked', 'Winnings added to bonus balance (locked until wager complete)');
    }
  }, [mine, muted, hasActiveBonus, pushWagerNotification]);

  /* ── Derived display ─────────────────────────────────────────────────── */
  const multiplier = mine.game?.current_multiplier ?? 1;
  const cashoutAmount = mine.game?.cashout_amount ?? 0;
  const betAmount = mine.game?.bet_amount ?? (parseFloat(betInput) || 0);
  const profitAmount = cashoutAmount - betAmount;

  const phaseLabel = useMemo((): string => {
    if (mine.phase === 'active') return 'Playing';
    if (mine.phase === 'ended' && mine.game?.status === 'bust') return 'Busted!';
    if (mine.phase === 'ended' && mine.game?.status === 'cashout') {
      if (mine.game.auto_cashout && mine.game.cap_hit) return 'Max Payout Reached!';
      if (mine.game.auto_cashout) return 'Board Cleared!';
      return 'Cashed Out';
    }
    return '';
  }, [mine.phase, mine.game?.status, mine.game?.auto_cashout, mine.game?.cap_hit]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className={`layout-vertical ${!chatCollapsed ? 'sidebar-open' : ''}`}>
      {/* Header */}
      <header id="app-hdr">
        <GlobalHeader onToggleChat={() => setChatCollapsed(!chatCollapsed)} />
      </header>

      {/* Content */}
      <div id="cntnt">
        {/* Chat Sidebar */}
        <aside id="sidebar" className={chatCollapsed ? 'collapsed' : ''}>
          <div id="sidebar-inner">
            <GlobalChatSidebar
              isCollapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed(!chatCollapsed)}
              isWalletConnected={isConnected}
              walletAddress={publicKey || null}
              getAuthToken={getAuthToken}
              onlineCount={gameChat.onlineCount}
              playerTier={0}
            />
          </div>
        </aside>

        {/* Main Stage */}
        <main id="main-stage" className="mine-main">
          <div className="mine-game-frame">
            {/* ─── SIDEBAR (controls) ────────────────────────────── */}
            <div className="mine-sidebar">
              {/* ── Sticky top: tab ──────────────────────────────── */}
              <div className="mine-sticky-top">
                <div className="mine-tabs">
                  <button className="mine-tab mine-tab--active">Manual</button>
                </div>
              </div>

              {/* ── Scrollable body ──────────────────────────────── */}
              <div className="mine-scrollable">
                {/* Bet Amount */}
                <div className="mine-field">
                  <div className="mine-input-row">
                    <img src={solanaLogo} alt="SOL" className="mine-input-icon" />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="mine-input"
                      value={configLocked ? fmt(betAmount) : betInput}
                      onChange={handleBetChange}
                      disabled={configLocked}
                      placeholder="0.000"
                      autoComplete="off"
                    />
                    <div className="mine-balance-display">
                      <span className="mine-balance-value">{fmt(depositedBalance)}</span>
                    </div>
                  </div>
                  <div className="mine-input-btn-wrap">
                    <button className="mine-input-action" onClick={handleHalf} disabled={configLocked}>½</button>
                    <button className="mine-input-action" onClick={handleDouble} disabled={configLocked}>2×</button>
                  </div>
                  <label className="mine-field-label">Bet Amount</label>
                </div>

                {/* Mines (Bombs) — stepper */}
                <div className="mine-field mine-field--red">
                  <div className="mine-stepper">
                    <button
                      className="mine-stepper-btn"
                      onClick={() => setRedCount(Math.max(1, redCount - 1))}
                      disabled={configLocked || redCount <= 1}
                    ><Minus size={14} /></button>
                    <span className="mine-stepper-val mine-stepper-val--red">{redCount}</span>
                    <button
                      className="mine-stepper-btn"
                      onClick={() => setRedCount(Math.min(maxDanger - yellowCount, redCount + 1))}
                      disabled={configLocked || redCount >= maxDanger - yellowCount}
                    ><Plus size={14} /></button>
                  </div>
                  <label className="mine-field-label mine-field-label--red">Mines</label>
                </div>

                {/* Traps (Yellow) — stepper */}
                <div className="mine-field mine-field--yellow">
                  <div className="mine-stepper">
                    <button
                      className="mine-stepper-btn"
                      onClick={() => setYellowCount(Math.max(0, yellowCount - 1))}
                      disabled={configLocked || yellowCount <= 0}
                    ><Minus size={14} /></button>
                    <span className="mine-stepper-val mine-stepper-val--yellow">{yellowCount}</span>
                    <button
                      className="mine-stepper-btn"
                      onClick={() => setYellowCount(Math.min(maxDanger - redCount, yellowCount + 1))}
                      disabled={configLocked || yellowCount >= maxDanger - redCount}
                    ><Plus size={14} /></button>
                  </div>
                  <label className="mine-field-label mine-field-label--yellow">Traps</label>
                </div>

                {/* Grid Size */}
                <div className="mine-field">
                  <input
                    type="range"
                    className="mine-slider"
                    min={MIN_GRID}
                    max={MAX_GRID}
                    value={gridSize}
                    onChange={(e) => setGridSize(+e.target.value)}
                    disabled={configLocked}
                  />
                  <label className="mine-field-label">
                    Grid Size
                    <span className="mine-field-val">{gridSize}×{gridSize}</span>
                  </label>
                </div>

                {/* Gems (readonly) */}
                <div className="mine-field mine-gems-field">
                  <div className="mine-input-row mine-input-row--readonly">
                    <span className="mine-readonly-val mine-readonly-val--green">{greenCount} Gems</span>
                  </div>
                </div>

                {/* ── Bet / Cashout / Play Again ──────────────────── */}
                <div className="mine-bet-section">
                  {mine.phase === 'config' && (
                    <button
                      className="mine-bet-btn"
                      onClick={handlePlay}
                      disabled={mine.isLoading || !isConnected}
                    >
                      {mine.isLoading ? 'Starting...' : !isConnected ? 'Connect Wallet' : 'Bet'}
                    </button>
                  )}
                  {mine.phase === 'active' && (
                    <button
                      className="mine-bet-btn mine-bet-btn--cashout"
                      onClick={handleCashout}
                      disabled={mine.isLoading || (mine.game?.tiles_clicked ?? 0) === 0}
                    >
                      {(mine.game?.tiles_clicked ?? 0) === 0
                        ? 'Pick a tile first'
                        : `Cashout ${fmt(cashoutAmount)} SOL`}
                    </button>
                  )}
                  {mine.phase === 'ended' && (
                    <div className="mine-post-btns">
                      <button className="mine-bet-btn" onClick={mine.resetGame}>
                        <RotateCcw size={15} /> Play Again
                      </button>
                      {mine.game?.game_id && (
                        <a
                          className="mine-verify-link"
                          href={`https://api.str8.fun/api/mine/verify/${mine.game.game_id}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <ShieldCheck size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Error */}
                {mine.error && <div className="mine-error">{mine.error}</div>}

                {/* Footer */}
                <div className="mine-sidebar-footer">
                  <button className="mine-icon-btn" onClick={() => setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  {mine.game?.game_id && mine.phase === 'ended' && (
                    <a
                      href={`https://api.str8.fun/api/mine/verify/${mine.game.game_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mine-icon-btn"
                      title="Provably fair"
                    >
                      <ShieldCheck size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ─── GRID CONTENT ──────────────────────────────────── */}
            <div className="mine-content">
              {/* Gems badge — shown centered above grid on mobile */}
              <div className="mine-gems-overlay">
                <span className="mine-readonly-val mine-readonly-val--green">{greenCount} Gems</span>
              </div>

              {/* Status overlay (phase badge) */}
              {phaseLabel && (
                <div className={`mine-status mine-status--${mine.game?.status || 'active'}`}>
                  {phaseLabel}
                  {mine.phase === 'active' && (
                    <span className="mine-status-mult">×{multiplier.toFixed(2)}</span>
                  )}
                  {mine.phase === 'ended' && mine.game?.status === 'cashout' && (
                    <span className="mine-status-payout">+{fmt(profitAmount)} SOL</span>
                  )}
                </div>
              )}

              {/* Grid — active / ended */}
              {mine.phase !== 'config' && (
                <MineGrid
                  gridSize={mine.game?.grid_size ?? gridSize}
                  revealedTiles={mine.game?.revealed_tiles ?? []}
                  tileMap={mine.game?.tile_map}
                  gameOver={mine.phase === 'ended'}
                  isRevealing={mine.isRevealing}
                  onReveal={mine.revealTile}
                />
              )}

              {/* Grid — idle preview */}
              {mine.phase === 'config' && (
                <MineGrid
                  gridSize={gridSize}
                  revealedTiles={[]}
                  gameOver={false}
                  isRevealing={false}
                  disabled
                  onReveal={async () => null}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Chat toggle FAB */}
      <button
        id="chat-toggle-btn"
        type="button"
        onClick={() => setChatCollapsed(!chatCollapsed)}
        className={`fixed z-50 rounded-full bg-[#facc15] flex items-center justify-center shadow-lg hover:bg-[#e6b800] transition-all duration-300 ${
          chatCollapsed ? 'w-12 h-12' : 'w-9 h-9'
        }`}
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: chatCollapsed ? 16 : 320 + 8,
          boxShadow: '0 0 20px rgba(250, 204, 21, 0.3)',
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s, height 0.2s, transform 0.3s ease',
        }}
        aria-label={chatCollapsed ? 'Open chat' : 'Close chat'}
      >
        <MessageCircle size={chatCollapsed ? 22 : 16} className="text-black" />
      </button>

      {/* Wager Notifications */}
      <WagerToast
        notifications={wagerNotifications}
        onDismiss={dismissWagerNotification}
      />
    </div>
  );
};

export default MineIt;
