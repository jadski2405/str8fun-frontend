import React from 'react';
import solanaLogo from '../../assets/logo_solana.png';

// ============================================================================
// TYPES
// ============================================================================
export interface PlayerPnL {
  entryPrice: number;
  currentPrice: number;
  positionSize: number; // SOL amount in position
}

interface LivePnLFeedProps {
  playerPnL: PlayerPnL | null;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================
const calculateMultiplier = (entryPrice: number, currentPrice: number): number => {
  if (entryPrice <= 0) return 1;
  return currentPrice / entryPrice;
};

const formatMultiplier = (multiplier: number): string => {
  return `${multiplier.toFixed(2)}x`;
};

const formatPnL = (pnl: number): string => {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${pnl.toFixed(4)}`;
};

// ============================================================================
// LIVE PNL FEED - Player's Own PnL Only
// ============================================================================
const LivePnLFeed: React.FC<LivePnLFeedProps> = ({ playerPnL, className = '' }) => {
  // No position = show empty state
  if (!playerPnL || playerPnL.positionSize <= 0) {
    return (
      <div className={`pnl-feed-container ${className}`}>
        <div className="pnl-row pnl-empty">
          <span className="pnl-empty-text">No active position</span>
        </div>
      </div>
    );
  }

  const multiplier = calculateMultiplier(playerPnL.entryPrice, playerPnL.currentPrice);
  const pnlSol = (multiplier - 1) * playerPnL.positionSize;
  const isProfit = pnlSol >= 0;

  return (
    <div className={`pnl-feed-container ${className}`}>
      <div className="pnl-row">
        {/* Left: Label */}
        <div className="pnl-player-info">
          <span className="pnl-label">Your PnL</span>
        </div>
        
        {/* Right: Multiplier + PnL */}
        <div className="pnl-stats">
          <span className={`pnl-multiplier ${isProfit ? 'profit' : 'loss'}`}>
            {formatMultiplier(multiplier)}
          </span>
          <div className={`pnl-amount ${isProfit ? 'profit' : 'loss'}`}>
            <img src={solanaLogo} alt="SOL" className="pnl-sol-icon" />
            <span>{formatPnL(pnlSol)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LivePnLFeed;
