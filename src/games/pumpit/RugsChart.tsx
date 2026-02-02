import React, { useRef, useEffect } from 'react';

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
}

// ============================================================================
// CONSTANTS - Exact dimensions per spec (Retina 2x Scaling @ 1.5x Size)
// ============================================================================
// Fixed dimensions (half size)
// Internal Resolution: 1600 x 900
// CSS Display Size: 800px x 450px
// Ratio: 16:9 aspect ratio with 2:1 internal-to-CSS for Retina sharpness
const CANVAS_INTERNAL_WIDTH = 1600;
const CANVAS_INTERNAL_HEIGHT = 900;
const CANVAS_DISPLAY_WIDTH = 800;
const CANVAS_DISPLAY_HEIGHT = 450;
const CANVAS_SCALE = 2;              // 2x internal resolution for crisp rendering
const PADDING_TOP = 30;              // Scaled padding (1.5x)
const PADDING_BOTTOM = 38;           // Scaled padding (1.5x)
const PADDING_RIGHT = 68;            // Scaled padding (1.5x)
const PADDING_LEFT = 15;             // Scaled padding (1.5x)
const FIXED_CANDLE_COUNT = 60;       // Fixed number of candle slots to display

// Colors - matching site background (grey panels)
const COLOR_BG = '#15161D';
const COLOR_GREEN = '#22C55E';
const COLOR_GREEN_GLOW = 'rgba(34, 197, 94, 0.6)';
const COLOR_RED = '#EF4444';
const COLOR_RED_GLOW = 'rgba(239, 68, 68, 0.6)';
const COLOR_GRID = 'rgba(255, 255, 255, 0.04)';
const COLOR_TEXT = 'rgba(255, 255, 255, 0.4)';

// Animation smoothing
const Y_AXIS_LERP_FACTOR = 0.06; // Smoother axis scaling (lower = smoother)

// ============================================================================
// RUGS CHART COMPONENT - Canvas Based for 60fps
// ============================================================================
const RugsChart: React.FC<RugsChartProps> = ({ data, currentPrice, startPrice, positionValue = 0, unrealizedPnL = 0, hasPosition = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  
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

  // Update refs
  useEffect(() => {
    dataRef.current = data;
    currentPriceRef.current = currentPrice;
    startPriceRef.current = startPrice;
  }, [data, currentPrice, startPrice]);

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
  // CANVAS SETUP - Fixed dimensions with 2x retina scaling (1.5x size)
  // Internal: 3234x1068 → Display: 1617x534 (2:1 ratio)
  // ============================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set fixed internal resolution for maximum sharpness
    canvas.width = CANVAS_INTERNAL_WIDTH;
    canvas.height = CANVAS_INTERNAL_HEIGHT;
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
      // Use fixed display dimensions (internal / 2 for 2:1 ratio)
      const width = CANVAS_DISPLAY_WIDTH;
      const height = CANVAS_DISPLAY_HEIGHT;
      const data = dataRef.current;
      const currentPrice = currentPriceRef.current;
      const startPrice = startPriceRef.current;
      
      // Apply 2x scale for high-DPI rendering
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);

      // Throttle to target FPS
      const delta = timestamp - lastTime;
      if (delta < frameInterval) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = timestamp - (delta % frameInterval);

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
      
      // Calculate desired range with padding
      const range = maxP - minP;
      const minRange = startPrice * 0.05; // Ensure at least 5% range vertically
      const effectiveRange = Math.max(range, minRange);
      const padding = effectiveRange * 0.25; // 25% padding top/bottom
      
      targetMinRef.current = minP - padding;
      targetMaxRef.current = maxP + padding;

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
          const drawingHeight = height - PADDING_TOP - PADDING_BOTTOM;
          return PADDING_TOP + drawingHeight * (1 - ratio);
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
      // DRAW DYNAMIC GRID LINES
      // ================================================================
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = 1;
      
      // Calculate sensible grid steps based on multiplier
      // If range is large (e.g. 10x), step 1.0x. If small (0.5x), step 0.1x
      const rangeMult = drawRange / startPrice;
      let step = 0.1;
      if (rangeMult > 0.5) step = 0.25;
      if (rangeMult > 1.5) step = 0.5;
      if (rangeMult > 3.0) step = 1.0;
      if (rangeMult > 10.0) step = 5.0;

      // Generate lines around startPrice ± N * step
      // Determine Start/End multipliers visible
      const minMult = minVal / startPrice;
      const maxMult = maxVal / startPrice;
      
      const startStepIndex = Math.floor(minMult / step);
      const endStepIndex = Math.ceil(maxMult / step);

      for (let i = startStepIndex; i <= endStepIndex; i++) {
         const mult = i * step;
         const price = startPrice * mult;
         const y = getNormY(price);
         
         if (y >= 0 && y <= height) { // Draw if mostly visible
             ctx.beginPath();
             ctx.moveTo(0, y);
             ctx.lineTo(width - PADDING_RIGHT, y);
             ctx.stroke();

             // Label
             ctx.fillStyle = COLOR_TEXT;
             ctx.font = '9px Monaco, Consolas, monospace';
             ctx.textAlign = 'left';
             ctx.textBaseline = 'middle';
             ctx.fillText(mult.toFixed(2) + 'x', width - PADDING_RIGHT + 5, y);
         }
      }

      // ================================================================
      // DRAW CANDLES
      // ================================================================
      const chartAreaWidth = width - PADDING_LEFT - PADDING_RIGHT;
      const candleWidth = chartAreaWidth / FIXED_CANDLE_COUNT;
      
      // Only show last FIXED_CANDLE_COUNT candles
      const renderCandles = data.slice(-FIXED_CANDLE_COUNT);

      renderCandles.forEach((candle, i) => {
        // Position
        const x = PADDING_LEFT + i * candleWidth;
        
        const isPump = candle.close >= candle.open;
        const color = isPump ? COLOR_GREEN : COLOR_RED;

        // Body
        const bodyTop = getNormY(Math.max(candle.open, candle.close));
        const bodyBottom = getNormY(Math.min(candle.open, candle.close));
        const rawHeight = bodyBottom - bodyTop;
        const bodyHeight = Math.max(rawHeight, 6); // Slightly taller minimum for DynaPuff style
        const adjustedBodyTop = rawHeight < 6 ? bodyTop - (6 - rawHeight) / 2 : bodyTop;
        
        // DynaPuff style: extra chunky, thicc candles
        const bodyWidth = Math.max(candleWidth * 0.95, 8);
        const bodyX = x + (candleWidth - bodyWidth) / 2;
        
        // Fade older candles slightly for depth
        const fadeAlpha = 0.6 + (i / renderCandles.length) * 0.4;

        // Gradient with enhanced colors
        const gradient = ctx.createLinearGradient(bodyX, adjustedBodyTop, bodyX, adjustedBodyTop + bodyHeight + 20);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, isPump ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)');
        gradient.addColorStop(1, isPump ? 'rgba(0, 255, 127, 0.1)' : 'rgba(255, 59, 59, 0.1)');
        
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        // DynaPuff style: fully rounded pill-shaped candles
        const cornerRadius = Math.min(bodyWidth / 2, bodyHeight / 2, 6);
        if (ctx.roundRect) {
            ctx.roundRect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight, cornerRadius);
        } else {
             ctx.rect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight);
        }
        ctx.fill();

        // Enhanced glow for recent candles
        const isRecent = i >= renderCandles.length - 5;
        ctx.shadowColor = color;
        ctx.shadowBlur = isRecent ? 12 : 6;
        ctx.strokeStyle = color;
        ctx.lineWidth = isRecent ? 1 : 0.5;
        ctx.beginPath();
        // DynaPuff style: match fill corner radius
        if (ctx.roundRect) {
            ctx.roundRect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight, cornerRadius);
        } else {
            ctx.rect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

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

        // Price label
        const labelX = width - PADDING_RIGHT + 3;
        const labelWidth = PADDING_RIGHT - 5;
        const labelHeight = 18;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(labelX, priceY - labelHeight / 2, labelWidth, labelHeight);
        
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, priceY - labelHeight / 2, labelWidth, labelHeight);

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 10px Monaco, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const priceText = currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4);
        ctx.fillText(priceText, labelX + labelWidth / 2, priceY);
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
        width={CANVAS_INTERNAL_WIDTH}
        height={CANVAS_INTERNAL_HEIGHT}
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
          top: '12px',
          left: '12px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: '24px',
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
      
      {/* Position Overlay - Top Right */}
      {hasPosition && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: "'DynaPuff', system-ui, sans-serif",
              color: unrealizedPnL >= 0 ? COLOR_GREEN : COLOR_RED,
              textShadow: `0 0 10px ${unrealizedPnL >= 0 ? 'rgba(0, 255, 127, 0.5)' : 'rgba(255, 59, 59, 0.5)'}`,
              lineHeight: 1
            }}
          >
            {unrealizedPnL >= 0 
              ? `Up ${unrealizedPnL.toFixed(4)} SOL` 
              : `${Math.abs(unrealizedPnL).toFixed(4)} SOL left`
            }
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: "'DynaPuff', system-ui, sans-serif",
              color: 'rgba(255, 255, 255, 0.6)',
              marginTop: '4px',
              lineHeight: 1
            }}
          >
            Position: {positionValue.toFixed(4)} SOL
          </div>
        </div>
      )}
    </div>
  );
};

export default RugsChart;
