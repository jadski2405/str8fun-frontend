import React, { ReactNode } from 'react';

interface GameLayoutProps {
  header: ReactNode;
  sidebar?: ReactNode;
  sidebarCollapsed?: boolean;
  chart: ReactNode;
  chartBorderColor?: string;
  tradeControls: ReactNode;
  mobileTradeControls?: ReactNode;
  leaderboard?: ReactNode;
  balanceBar?: ReactNode;
  statusBar?: ReactNode;
  processingIndicator?: ReactNode;
  roundHistory?: ReactNode;       // Desktop: vertical column right of chart
  mobileRoundHistory?: ReactNode; // Mobile: horizontal strip above chart
}

const GameLayout: React.FC<GameLayoutProps> = ({
  header,
  sidebar,
  sidebarCollapsed = true,
  chart,
  chartBorderColor = '#22C55E',
  tradeControls,
  mobileTradeControls,
  leaderboard,
  balanceBar,
  statusBar,
  processingIndicator,
  roundHistory,
  mobileRoundHistory,
}) => {
  return (
    <div className={`layout-vertical ${!sidebarCollapsed ? 'sidebar-open' : ''}`}>
      {/* ========== FIXED HEADER ========== */}
      <header id="app-hdr">
        {header}
      </header>

      {/* ========== CONTENT (Horizontal Split) ========== */}
      <div id="cntnt">
        {/* Collapsible Sidebar (Global Chat) */}
        {sidebar && (
          <aside id="sidebar" className={sidebarCollapsed ? 'collapsed' : ''}>
            <div id="sidebar-inner">
              {sidebar}
            </div>
          </aside>
        )}

        {/* Main Trading Area */}
        <main id="main-stage">
          {/* Balance Bar - Desktop only (mobile shows in header) */}
          <div className="desktop-only">
            {balanceBar}
          </div>
          
          {/* Mobile Round History - Above chart on mobile */}
          {mobileRoundHistory && (
            <div id="round-history-mobile" className="mobile-only">
              {mobileRoundHistory}
            </div>
          )}

          {/* Main Trading Stage - Chart + Desktop Round History side by side */}
          <div id="chart-and-history">
            <div id="chart-stage" style={{ borderColor: chartBorderColor, transition: 'border-color 0.3s ease' }}>
              <div id="chart-canvas-wrap">
                {chart}
              </div>
            </div>
            {/* Desktop Round History - Vertical column right of chart, OUTSIDE chart border */}
            {roundHistory && (
              <div id="round-history-column" className="desktop-only">
                {roundHistory}
              </div>
            )}
          </div>

          {/* Mobile Trade Controls - Directly below chart on mobile */}
          {mobileTradeControls && (
            <div id="trade-ctrls-mobile">
              {mobileTradeControls}
            </div>
          )}

          {/* Trade Controls: Below chart - Desktop */}
          <div id="trade-ctrls">
            {tradeControls}
          </div>
          
          {/* Processing indicator */}
          {processingIndicator}

          {/* Status Bar (Leaderboard) - Desktop only, BELOW trade controls */}
          <div className="desktop-only">
            {statusBar}
          </div>

          {/* Leaderboard: Below controls */}
          {leaderboard && (
            <div id="ldrbrd">
              {leaderboard}
            </div>
          )}
        </main>
      </div>

      {/* ========== MOBILE STATUS BAR (Below Mobile Trade Controls) ========== */}
      {statusBar && (
        <div id="mobile-status-bar" className="mobile-only">
          {statusBar}
        </div>
      )}
    </div>
  );
};

export default GameLayout;
