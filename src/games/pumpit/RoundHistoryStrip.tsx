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

/**
 * Multiplier color logic:
 * - Under 2x: white
 * - 2x+: gradually more vibrant green (lerp from white → bright green)
 * - Cap at 50x for full green saturation
 */
function getMultiplierColor(m: number): string {
  if (m < 2) return '#FFFFFF';
  // Lerp from 2x (slight green) to 50x (full vibrant green)
  const t = Math.min((m - 2) / 48, 1); // 0 at 2x, 1 at 50x+
  const r = Math.round(255 - t * (255 - 34));   // 255 → 34
  const g = Math.round(255 - t * (255 - 197));  // 255 → 197 (stays high)
  const b = Math.round(255 - t * (255 - 94));   // 255 → 94
  return `rgb(${r}, ${g}, ${b})`;
}

// ============================================================================
// ROUND CARD — Thumbnail + peak multiplier label
// Only renders when thumbnailUrl is available (backend has finished rendering)
// ============================================================================
const RoundCard: React.FC<{ round: RoundResult; isLatest?: boolean }> = ({ round, isLatest = false }) => {
  // Don't render cards without thumbnails — prevents empty boxes on screen
  if (!round.thumbnailUrl) return null;

  return (
    <div
      className={`rh-card ${isLatest ? 'rh-card-latest' : ''}`}
      style={{
        boxShadow: isLatest ? '0 0 8px rgba(255, 255, 255, 0.25)' : undefined,
      }}
    >
      <img src={round.thumbnailUrl} alt="Round" className="rh-card-img" />
      <div className="rh-card-label" style={{ color: getMultiplierColor(round.peakMultiplier) }}>
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
  maxVisible = 4,
}) => {
  // Only show rounds that have thumbnails (newest-first, capped)
  const visible = rounds.filter(r => r.thumbnailUrl).slice(0, maxVisible);

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
