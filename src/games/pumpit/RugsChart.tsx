import React, { useRef, useEffect } from 'react';
import type { TradeMarker } from './PumpItSim';

// ============================================================================
// TYPES
// ============================================================================
interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface RugsChartProps {
  data: CandleData[];
  currentPrice: number;
  startPrice: number;
  positionValue?: number;   // Current value of player's position in SOL
  unrealizedPnL?: number;   // Player's unrealized profit/loss in SOL
  hasPosition?: boolean;    // Whether player has an open position
  tradeMarkers?: TradeMarker[]; // User's buy/sell markers
  resetView?: boolean;      // When true, instantly snap Y-axis back to 1.00x centered
}

// ============================================================================
// CONSTANTS - Exact dimensions per spec (Retina 2x Scaling @ 1.5x Size)
// ============================================================================
// Fixed dimensions (half size)
// Internal Resolution: 1600 x 900
// CSS Display Size: 800px x 450px
// Ratio: 16:9 aspect ratio with 2:1 internal-to-CSS for Retina sharpness
// Dynamic sizing — these are only fallback defaults now
const DEFAULT_DISPLAY_WIDTH = 800;
const DEFAULT_DISPLAY_HEIGHT = 450;

// Reference geometry (desktop 800×450)
// Padding and candle count are now computed proportionally inside the render loop
const REF_WIDTH = 800;
const REF_HEIGHT = 450;
const REF_PADDING_TOP = 30;
const REF_PADDING_BOTTOM = 38;
const REF_PADDING_RIGHT = 12;
const REF_PADDING_LEFT = 15;
const REF_CANDLE_COUNT = 60;          // Desktop candle count
const MIN_CANDLE_WIDTH = 8;           // Minimum candle body width in px
// Reference aspect = drawingHeight / drawingWidth at 800×450
const REF_DRAWING_H = REF_HEIGHT - REF_PADDING_TOP - REF_PADDING_BOTTOM; // 382
const REF_DRAWING_W = REF_WIDTH - REF_PADDING_LEFT - REF_PADDING_RIGHT;  // 773
const REF_ASPECT = REF_DRAWING_H / REF_DRAWING_W; // ~0.533

// Colors - matching site background (grey panels)
const COLOR_BG = '#15161D';
const COLOR_GREEN = '#22C55E';
const COLOR_GREEN_GLOW = 'rgba(34, 197, 94, 0.6)';
const COLOR_RED = '#EF4444';
const COLOR_RED_GLOW = 'rgba(239, 68, 68, 0.6)';
const COLOR_GRID = 'rgba(255, 255, 255, 0.04)';

// Grid visibility toggle
const SHOW_GRID_LINES = false; // Set to true to re-enable grid lines & Y-axis labels

// Animation smoothing
const Y_AXIS_LERP_FACTOR = 0.06; // Smoother axis scaling (lower = smoother)

// ============================================================================
// RUGS CHART COMPONENT - Canvas Based for 60fps
// ============================================================================
const RugsChart: React.FC<RugsChartProps> = ({ data, currentPrice, startPrice, positionValue: _positionValue = 0, unrealizedPnL = 0, hasPosition: _hasPosition = false, tradeMarkers = [], resetView = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // Dynamic sizing refs (updated by ResizeObserver)
  const displayWidthRef = useRef(DEFAULT_DISPLAY_WIDTH);
  const displayHeightRef = useRef(DEFAULT_DISPLAY_HEIGHT);
  const dprRef = useRef(window.devicePixelRatio || 2);
  
  // Animation Targets (Dynamic Range)
  const animatedMinRef = useRef(startPrice * 0.95);
  const animatedMaxRef = useRef(startPrice * 1.05);
  const targetMinRef = useRef(startPrice * 0.95);
  const targetMaxRef = useRef(startPrice * 1.05);
  
  // Camera offset for impact effects
  const cameraOffsetRef = useRef(0);
  const prevPriceRef = useRef(currentPrice);

  // Keep refs for loop
  const dataRef = useRef(data);
  const currentPriceRef = useRef(currentPrice);
  const startPriceRef = useRef(startPrice);
  const tradeMarkersRef = useRef(tradeMarkers);

  // Update refs
  useEffect(() => {
    dataRef.current = data;
    currentPriceRef.current = currentPrice;
    startPriceRef.current = startPrice;
    tradeMarkersRef.current = tradeMarkers;
  }, [data, currentPrice, startPrice, tradeMarkers]);

  // ============================================================================
  // RESET VIEW - Snap Y-axis back to 1.00x centered (on round end/new round)
  // ============================================================================
  useEffect(() => {
    if (resetView) {
      const sp = startPrice;
      animatedMinRef.current = sp * 0.95;
      animatedMaxRef.current = sp * 1.05;
      targetMinRef.current = sp * 0.95;
      targetMaxRef.current = sp * 1.05;
      cameraOffsetRef.current = 0;
      prevPriceRef.current = sp;
    }
  }, [resetView, startPrice]);

  // ============================================================================
  // CAMERA IMPACT EFFECT - Detect big price changes (smooth)
  // ============================================================================
  useEffect(() => {
    const priceChange = (currentPrice - prevPriceRef.current) / prevPriceRef.current;
    prevPriceRef.current = currentPrice;
    
    // If significant price change, add camera offset (very subtle)
    if (Math.abs(priceChange) > 0.02) { 
      cameraOffsetRef.current += priceChange * 40; 
    }
  }, [currentPrice]);

  // ============================================================================
  // CANVAS SETUP - Dynamic sizing via ResizeObserver with retina scaling
  // ============================================================================
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width) || DEFAULT_DISPLAY_WIDTH;
      const h = Math.round(rect.height) || DEFAULT_DISPLAY_HEIGHT;
      const dpr = window.devicePixelRatio || 2;

      displayWidthRef.current = w;
      displayHeightRef.current = h;
      dprRef.current = dpr;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ============================================================================
  // MAIN RENDER LOOP - 60fps Canvas
  // ============================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let lastTime = 0;
    const targetFps = 60;
    const frameInterval = 1000 / targetFps;

    const render = (timestamp: number) => {
      // Use dynamic display dimensions from ResizeObserver
      const width = displayWidthRef.current;
      const height = displayHeightRef.current;
      const dpr = dprRef.current;
      const data = dataRef.current;
      const currentPrice = currentPriceRef.current;
      const startPrice = startPriceRef.current;
      
      // Apply DPR scale for high-DPI rendering
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Throttle to target FPS
      const delta = timestamp - lastTime;
      if (delta < frameInterval) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = timestamp - (delta % frameInterval);

      // ================================================================
      // PROPORTIONAL PADDING (scale with container size)
      // ================================================================
      const PADDING_TOP = Math.round(height * (REF_PADDING_TOP / REF_HEIGHT));
      const PADDING_BOTTOM = Math.round(height * (REF_PADDING_BOTTOM / REF_HEIGHT));
      const PADDING_RIGHT = Math.round(width * (REF_PADDING_RIGHT / REF_WIDTH));
      const PADDING_LEFT = Math.round(width * (REF_PADDING_LEFT / REF_WIDTH));

      // Dynamic candle count — ensure candles stay readable (≥ MIN_CANDLE_WIDTH px)
      const chartAreaWidth = width - PADDING_LEFT - PADDING_RIGHT;
      const FIXED_CANDLE_COUNT = Math.max(20, Math.min(REF_CANDLE_COUNT, Math.floor(chartAreaWidth / MIN_CANDLE_WIDTH)));

      // ================================================================
      // 1. CALCULATE AUTO-SCALING (Centered View)
      // ================================================================
      const visibleCandles = data.slice(-FIXED_CANDLE_COUNT);
      let minP = currentPrice;
      let maxP = currentPrice;
      
      // Include all visible candles in range
      visibleCandles.forEach(c => {
         minP = Math.min(minP, c.low);
         maxP = Math.max(maxP, c.high);
      });
      
      // Center 1.00x: make range symmetric around startPrice
      const distAbove = maxP - startPrice;
      const distBelow = startPrice - minP;
      let halfSpan = Math.max(distAbove, distBelow, startPrice * 0.025); // at least 2.5% each side

      // Aspect-ratio normalization: scale Y range so price movement looks
      // the same fraction of the chart on any container shape.
      // A taller container (higher currentAspect) gets a proportionally
      // wider price range, preventing amplified visual movement.
      const drawingH = height - PADDING_TOP - PADDING_BOTTOM;
      const drawingW = chartAreaWidth;
      const currentAspect = drawingW > 0 ? drawingH / drawingW : REF_ASPECT;
      const aspectScale = currentAspect / REF_ASPECT;
      halfSpan *= aspectScale;

      const rangePad = halfSpan * 0.25; // 25% padding
      
      targetMinRef.current = startPrice - halfSpan - rangePad;
      targetMaxRef.current = startPrice + halfSpan + rangePad;

      // Smooth interpolation (slower for smoother feel)
      const lerpFactor = Y_AXIS_LERP_FACTOR;
      animatedMinRef.current += (targetMinRef.current - animatedMinRef.current) * lerpFactor;
      animatedMaxRef.current += (targetMaxRef.current - animatedMaxRef.current) * lerpFactor;
      
      const minVal = animatedMinRef.current;
      const maxVal = animatedMaxRef.current;
      const drawRange = maxVal - minVal;

      // Coordinate Helper
      const getNormY = (price: number) => {
          const ratio = (price - minVal) / drawRange;
          return PADDING_TOP + drawingH * (1 - ratio);
      };

      // Camera Offset Decay
      cameraOffsetRef.current *= 0.95;
      if (Math.abs(cameraOffsetRef.current) < 0.1) cameraOffsetRef.current = 0;
      const cameraOffset = cameraOffsetRef.current;
      
      const isUp = currentPrice >= startPrice;
      const lineColor = isUp ? COLOR_GREEN : COLOR_RED;

      // ================================================================
      // DRAW BACKGROUND
      // ================================================================
      ctx.save();
      ctx.translate(0, cameraOffset);

      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, -Math.abs(cameraOffset) - 10, width, height + Math.abs(cameraOffset) * 2 + 20);

      // ================================================================
      // DRAW DYNAMIC GRID LINES (toggleable)
      // ================================================================
      if (SHOW_GRID_LINES) {
        ctx.strokeStyle = COLOR_GRID;
        ctx.lineWidth = 1;
        
        const rangeMult = drawRange / startPrice;
        let step = 0.1;
        if (rangeMult > 0.5) step = 0.25;
        if (rangeMult > 1.5) step = 0.5;
        if (rangeMult > 3.0) step = 1.0;
        if (rangeMult > 10.0) step = 5.0;

        const minMult = minVal / startPrice;
        const maxMult = maxVal / startPrice;
        
        const startStepIndex = Math.floor(minMult / step);
        const endStepIndex = Math.ceil(maxMult / step);

        for (let i = startStepIndex; i <= endStepIndex; i++) {
           const mult = i * step;
           const price = startPrice * mult;
           const y = getNormY(price);
           
           if (y >= 0 && y <= height) {
               ctx.beginPath();
               ctx.moveTo(0, y);
               ctx.lineTo(width - PADDING_RIGHT, y);
               ctx.stroke();

               const labelFontSize = Math.max(8, Math.round(width * 0.011));
               ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
               ctx.font = `${labelFontSize}px 'DynaPuff', sans-serif`;
               ctx.textAlign = 'left';
               ctx.textBaseline = 'middle';
               ctx.fillText(mult.toFixed(2) + 'x', width - PADDING_RIGHT + 4, y);
           }
        }
      }

      // ================================================================
      // DRAW CANDLES
      // ================================================================
      const candleWidth = Math.floor(chartAreaWidth / FIXED_CANDLE_COUNT);
      
      // Only show last FIXED_CANDLE_COUNT candles
      const renderCandles = data.slice(-FIXED_CANDLE_COUNT);

      // Center the candle group horizontally when fewer than max
      const totalRenderedWidth = candleWidth * renderCandles.length;
      const startOffset = PADDING_LEFT + Math.floor((chartAreaWidth - totalRenderedWidth) / 2);

      renderCandles.forEach((candle, i) => {
        // Position - use integer math to prevent drift
        const x = startOffset + i * candleWidth;
        
        const isPump = candle.close >= candle.open;
        const color = isPump ? COLOR_GREEN : COLOR_RED;

        // Body
        const bodyTop = getNormY(Math.max(candle.open, candle.close));
        const bodyBottom = getNormY(Math.min(candle.open, candle.close));
        const rawHeight = bodyBottom - bodyTop;
        const bodyHeight = Math.max(rawHeight, 6); // Slightly taller minimum for DynaPuff style
        const adjustedBodyTop = rawHeight < 6 ? bodyTop - (6 - rawHeight) / 2 : bodyTop;
        
        // DynaPuff style: extra chunky, thicc candles
        const bodyWidth = Math.max(candleWidth * 0.95, MIN_CANDLE_WIDTH);
        const bodyX = x + (candleWidth - bodyWidth) / 2;
        
        // Solid colors - full opacity
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        // DynaPuff style: fully rounded pill-shaped candles
        const cornerRadius = Math.min(bodyWidth / 2, bodyHeight / 2, 6);
        if (ctx.roundRect) {
            ctx.roundRect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight, cornerRadius);
        } else {
             ctx.rect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // ================================================================
      // DRAW TRADE MARKERS (User's buy/sell indicators)
      // ================================================================
      const markers = tradeMarkersRef.current;
      if (markers.length > 0) {
        // Calculate which candles are visible (last FIXED_CANDLE_COUNT)
        const totalCandles = data.length;
        const visibleStartIndex = Math.max(0, totalCandles - FIXED_CANDLE_COUNT);
        
        // Group markers by candle index for vertical stacking
        const markersByCandle: { [key: number]: typeof markers } = {};
        markers.forEach(marker => {
          const visibleIndex = marker.candleIndex - visibleStartIndex;
          if (visibleIndex >= 0 && visibleIndex < FIXED_CANDLE_COUNT) {
            if (!markersByCandle[visibleIndex]) {
              markersByCandle[visibleIndex] = [];
            }
            markersByCandle[visibleIndex].push(marker);
          }
        });
        
        // Draw markers
        Object.entries(markersByCandle).forEach(([candleIndexStr, candleMarkers]) => {
          const candleIndex = parseInt(candleIndexStr);
          const x = startOffset + candleIndex * candleWidth + candleWidth / 2;
          
          candleMarkers.forEach((marker, stackIndex) => {
            const markerY = getNormY(marker.price);
            // Offset vertically for stacking (proportional to container)
            const markerScale = width / REF_WIDTH;
            const yOffset = stackIndex * Math.round(40 * markerScale);
            const finalY = markerY - yOffset;
            
            const isBuy = marker.type === 'buy';
            const markerColor = isBuy ? COLOR_GREEN : COLOR_RED;
            const markerRadius = Math.max(8, Math.round(14 * markerScale));
            
            // Draw circle with glow
            ctx.shadowColor = markerColor;
            ctx.shadowBlur = 8;
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(x, finalY, markerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Draw border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw letter (B or S)
            const markerFontSize = Math.max(9, Math.round(14 * markerScale));
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${markerFontSize}px DynaPuff, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isBuy ? 'B' : 'S', x, finalY + 1);
          });
        });
      }

      // ================================================================
      // DRAW CURRENT PRICE LINE with enhanced glow
      // ================================================================
      if (currentPrice > 0) {
        const priceY = getNormY(currentPrice);

        const dashOffset = (timestamp / 40) % 24; // Slightly faster animation
        const glowColor = isUp ? COLOR_GREEN_GLOW : COLOR_RED_GLOW;
        
        // Pulsing glow intensity
        const pulseIntensity = 0.7 + Math.sin(timestamp * 0.005) * 0.3;
        
        // Draw outer glow first (larger, softer)
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.3 * pulseIntensity;
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width, priceY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Main dashed line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -dashOffset;
        
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 12;
        
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width, priceY);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
      }

      // ================================================================
      // DRAW 1.00x BASELINE (If visible)
      // ================================================================
      const baselineY = getNormY(startPrice);
      if (baselineY >= 0 && baselineY <= height) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // Slightly brighter
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(PADDING_LEFT, baselineY);
        ctx.lineTo(width - PADDING_RIGHT, baselineY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []); // Run once, depend on Refs

  // ============================================================================
  // CALCULATE MULTIPLIER
  // ============================================================================
  const multiplier = startPrice > 0 ? currentPrice / startPrice : 1;
  const isUp = multiplier >= 1;
  const multiplierText = multiplier.toFixed(2) + 'x';

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div 
      ref={containerRef} 
      className="pumpit-chart-container _container_ilu4p_1"
      style={{ 
        width: '100%',
        height: '100%',
        minWidth: '100%',
        minHeight: '100%',
        flexGrow: 1,
        position: 'relative',
        overflow: 'visible',
        background: COLOR_BG,
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        touchAction: 'auto',
        cursor: 'inherit',
        WebkitFontSmoothing: 'antialiased',
        // Tailwind variable resets to prevent distortion
        ['--tw-border-spacing-x' as string]: '0',
        ['--tw-border-spacing-y' as string]: '0',
        ['--tw-translate-x' as string]: '0',
        ['--tw-translate-y' as string]: '0',
        ['--tw-rotate' as string]: '0',
        ['--tw-skew-x' as string]: '0',
        ['--tw-skew-y' as string]: '0',
        ['--tw-scale-x' as string]: '1',
        ['--tw-scale-y' as string]: '1',
        borderWidth: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        className="pumpit-chart-canvas"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          boxSizing: 'border-box',
          margin: 0,
          padding: 0,
          // Strict crisp scaling for retina sharpness
          imageRendering: 'pixelated',
          // @ts-ignore - vendor prefix for crisp-edges
          WebkitImageRendering: 'crisp-edges',
          touchAction: 'auto',
          cursor: 'inherit',
        }}
      />
      
      {/* Multiplier Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(6px, 2.7%, 12px)',
          left: 'clamp(6px, 1.5%, 12px)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(16px, 3vw, 24px)',
            fontWeight: 700,
            fontFamily: "'DynaPuff', system-ui, sans-serif",
            color: isUp ? COLOR_GREEN : COLOR_RED,
            textShadow: `0 0 10px ${isUp ? 'rgba(0, 255, 127, 0.5)' : 'rgba(255, 59, 59, 0.5)'}`,
            lineHeight: 1
          }}
        >
          {multiplierText}
        </div>
      </div>
      
      {/* PnL Overlay - Top Right (always visible) */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(6px, 2.7%, 12px)',
          right: 'clamp(6px, 1.5%, 12px)',
          pointerEvents: 'none',
          textAlign: 'right',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(13px, 2.5vw, 20px)',
            fontWeight: 700,
            fontFamily: "'DynaPuff', system-ui, sans-serif",
            color: unrealizedPnL >= 0 ? COLOR_GREEN : COLOR_RED,
            textShadow: `0 0 10px ${unrealizedPnL >= 0 ? 'rgba(0, 255, 127, 0.5)' : 'rgba(255, 59, 59, 0.5)'}`,
            lineHeight: 1
          }}
        >
          {unrealizedPnL >= 0
            ? `+ ${unrealizedPnL.toFixed(4)} SOL`
            : `- ${Math.abs(unrealizedPnL).toFixed(4)} SOL`
          }
        </div>
      </div>
    </div>
  );
};

export default RugsChart;
