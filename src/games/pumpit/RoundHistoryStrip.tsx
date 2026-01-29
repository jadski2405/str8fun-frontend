import React from 'react';

// ============================================================================
// TYPES
// ============================================================================
interface RoundResult {
  roundId: string;
  multiplier: number;
  isBust: boolean;
  priceHistory?: number[]; // For mini-chart SVG
}

interface RoundHistoryStripProps {
  rounds: RoundResult[];
  totalBurned?: number;
  counts?: {
    x2: number;
    x10: number;
    x50: number;
  };
}

// ============================================================================
// MINI CHART SVG - Simplified candle representation
// ============================================================================
const MiniChart: React.FC<{ priceHistory?: number[]; isWin: boolean }> = ({ priceHistory, isWin }) => {
  // Generate a simple line path from price history or create a random one
  const points = priceHistory?.length 
    ? priceHistory 
    : Array.from({ length: 8 }, () => Math.random());
  
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  
  // Normalize to SVG viewBox (0-40 width, 0-30 height)
  const pathData = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 40;
      const y = 28 - ((p - min) / range) * 24;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const color = isWin ? '#00FFA3' : '#ff4757';
  
  return (
    <svg 
      viewBox="0 0 40 30" 
      className="round-card-chart"
      style={{ width: '100%', height: '28px' }}
    >
      <defs>
        <linearGradient id={`grad-${isWin ? 'win' : 'lose'}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path
        d={`${pathData} L 40 30 L 0 30 Z`}
        fill={`url(#grad-${isWin ? 'win' : 'lose'})`}
      />
      {/* Line stroke */}
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ============================================================================
// ROUND CARD COMPONENT
// ============================================================================
const RoundCard: React.FC<{ round: RoundResult; isLatest?: boolean }> = ({ round, isLatest = false }) => {
  const isWin = round.multiplier >= 1;
  
  return (
    <div 
      className={`round-card ${isLatest ? 'latest' : ''}`}
      style={{
        boxShadow: isLatest ? '0 0 8px rgba(0, 255, 163, 0.3)' : undefined
      }}
    >
      <MiniChart priceHistory={round.priceHistory} isWin={isWin} />
      <div 
        className="round-card-multiplier"
        style={{ color: isWin ? '#00FFA3' : '#ff4757' }}
      >
        {round.multiplier.toFixed(2)}x
      </div>
    </div>
  );
};

// ============================================================================
// ROUND HISTORY STRIP COMPONENT
// ============================================================================
const RoundHistoryStrip: React.FC<RoundHistoryStripProps> = ({
  rounds,
  totalBurned = 0,
  counts = { x2: 0, x10: 0, x50: 0 }
}) => {
  return (
    <div id="round-history-strip" className="round-history-strip">
      {/* Last 100 Summary - Pinned Left */}
      <div className="round-history-summary">
        {/* Fire + Total Burned */}
        <div className="summary-stat fire-stat">
          <span className="fire-icon">🔥</span>
          <span className="fire-value">{totalBurned.toFixed(2)}x</span>
        </div>
        
        {/* Multiplier Counters */}
        <div className="summary-counters">
          <div className="counter-item">
            <span className="counter-badge x2">2x</span>
            <span className="counter-count">{counts.x2}</span>
          </div>
          <div className="counter-item">
            <span className="counter-badge x10">10x</span>
            <span className="counter-count">{counts.x10}</span>
          </div>
          <div className="counter-item">
            <span className="counter-badge x50">50x</span>
            <span className="counter-count">{counts.x50}</span>
          </div>
        </div>
      </div>

      {/* Scrollable Round Cards */}
      <div className="round-history-cards">
        {rounds.map((round, index) => (
          <RoundCard 
            key={round.roundId} 
            round={round} 
            isLatest={index === rounds.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export default RoundHistoryStrip;
