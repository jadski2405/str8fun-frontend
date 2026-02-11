import React from 'react';
import type { RoundResult } from '../../types/game';

// ============================================================================
// HELPERS
// ============================================================================

/** Dynamic precision: 0.87x, 1.24x, 12.5x, 124x */
function formatMultiplier(m: number): string {
  if (m >= 100) return m.toFixed(0) + 'x';
  if (m >= 10) return m.toFixed(1) + 'x';
  return m.toFixed(2) + 'x';
}

// ============================================================================
// ROUND CARD — Thumbnail + peak multiplier label
// ============================================================================
const RoundCard: React.FC<{ round: RoundResult; isLatest?: boolean }> = ({ round, isLatest = false }) => {
  const isWin = round.peakMultiplier >= 1;
  const borderColor = isWin ? '#22C55E' : '#EF4444';

  return (
    <div
      className={`rh-card ${isLatest ? 'rh-card-latest' : ''}`}
      style={{
        borderColor,
        boxShadow: isLatest ? `0 0 8px ${borderColor}55` : undefined,
      }}
    >
      {round.thumbnailUrl ? (
        <img src={round.thumbnailUrl} alt={`Round ${round.roundId}`} className="rh-card-img" />
      ) : (
        <div className="rh-card-placeholder" style={{ background: `${borderColor}15` }} />
      )}
      <div className="rh-card-label" style={{ color: borderColor }}>
        {formatMultiplier(round.peakMultiplier)}
      </div>
    </div>
  );
};

// ============================================================================
// ROUND HISTORY STRIP — Vertical (desktop) or Horizontal (mobile)
// ============================================================================
interface RoundHistoryStripProps {
  rounds: RoundResult[];
  mode: 'vertical' | 'horizontal';
  maxVisible?: number;
}

const RoundHistoryStrip: React.FC<RoundHistoryStripProps> = ({
  rounds,
  mode,
  maxVisible = mode === 'vertical' ? 10 : 5,
}) => {
  // Newest-first, capped
  const visible = rounds.slice(0, maxVisible);

  if (!visible.length) return null;

  const isVertical = mode === 'vertical';

  return (
    <div className={isVertical ? 'rh-column' : 'rh-row'}>
      {visible.map((round, i) => (
        <RoundCard key={round.roundId || i} round={round} isLatest={i === 0} />
      ))}
    </div>
  );
};

export default RoundHistoryStrip;
