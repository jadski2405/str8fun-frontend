/**
 * ============================================================================
 * RUGS CHART COMPONENT
 * ============================================================================
 * 
 * A real-time candlestick chart rendered on HTML5 Canvas at 60fps.
 * Designed to look like rugs.fun with smooth animations and neon aesthetics.
 * 
 * FILE: src/components/pumpit/RugsChart.tsx
 * 
 * USAGE:
 *   <RugsChart 
 *     data={candleArray}      // Array of candle objects
 *     currentPrice={1.25}     // Live price
 *     startPrice={1.0}        // Starting price for multiplier
 *   />
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ============================================================================
// TYPES - Data structures for the chart
// ============================================================================

/**
 * CandleData represents a single candlestick
 * OHLC = Open, High, Low, Close - standard candlestick format
 */
interface CandleData {
  open: number;   // Price when candle started
  high: number;   // Highest price during candle's lifetime
  low: number;    // Lowest price during candle's lifetime
  close: number;  // Current/final price of candle
}

/**
 * Props passed to the RugsChart component
 */
interface RugsChartProps {
  data: CandleData[];      // Array of candles to display
  currentPrice: number;    // The live/current price
  startPrice: number;      // Price at game start (for calculating multiplier)
}

/**
 * MIN_RANGE_MULTIPLIER controls the minimum zoom level
 * 0.3 means the chart will show at least 0.7x to 1.3x range
 * INCREASE this number = more zoomed out (harder to see small movements)
 * DECREASE this number = more zoomed in (amplifies small movements)
 */
const MIN_RANGE_MULTIPLIER = 0.3;

// ============================================================================
// VISUAL CONSTANTS - Customize appearance here
// ============================================================================

/**
 * CHART_HEIGHT - Total height in pixels
 * Change this to make chart taller or shorter
 */
const CHART_HEIGHT = 320;

/**
 * CANDLE_GAP - Space between candles in pixels
 * 0 = candles touch each other
 * 2+ = visible gaps between candles
 */
const CANDLE_GAP = 0;

/**
 * PADDING values create margins inside the chart
 * PADDING_TOP - Space at top for price spikes
 * PADDING_BOTTOM - Space at bottom for price dips
 * PADDING_RIGHT - Space for Y-axis labels (price/multiplier)
 * PADDING_LEFT - Space on left side
 */
const PADDING_TOP = 20;
const PADDING_BOTTOM = 25;
const PADDING_RIGHT = 55;
const PADDING_LEFT = 10;

/**
 * FIXED_CANDLE_COUNT - How many candle "slots" are visible
 * Higher = more candles visible, each candle is thinner
 * Lower = fewer candles visible, each candle is thicker
 * 60 is a good balance for typical screen widths
 */
const FIXED_CANDLE_COUNT = 60;

/**
 * COLOR PALETTE - Customize the chart colors
 * COLOR_BG - Background color of the chart
 * COLOR_GREEN - Color for "pump" candles (close > open)
 * COLOR_RED - Color for "dump" candles (close < open)
 * COLOR_GRID - Faint horizontal grid lines
 * COLOR_TEXT - Y-axis label text color
 */
const COLOR_BG = '#0a0c10';
const COLOR_GREEN = '#00FF7F';
const COLOR_RED = '#FF3B3B';
const COLOR_GRID = 'rgba(255, 255, 255, 0.04)';
const COLOR_TEXT = 'rgba(255, 255, 255, 0.4)';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RugsChart: React.FC<RugsChartProps> = ({ data, currentPrice, startPrice }) => {
  
  // -------------------------------------------------------------------------
  // REFS - Direct references to DOM elements and mutable values
  // -------------------------------------------------------------------------
  
  /**
   * containerRef - Reference to the outer div container
   * Used to measure width for responsive sizing
   */
  const containerRef = useRef<HTMLDivElement>(null);
  
  /**
   * canvasRef - Reference to the canvas element
   * We draw everything onto this canvas
   */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  /**
   * animationRef - Stores the requestAnimationFrame ID
   * Needed to cancel the animation loop when component unmounts
   */
  const animationRef = useRef<number>(0);
  
  // -------------------------------------------------------------------------
  // STATE - Values that trigger re-renders when changed
  // -------------------------------------------------------------------------
  
  /**
   * containerWidth - Current width of the chart container
   * Updates when window is resized
   */
  const [containerWidth, setContainerWidth] = useState(800);
  
  /**
   * animatedMaxRef - The currently animated range multiplier
   * Smoothly interpolates toward targetMaxRef for smooth zoom effects
   */
  const animatedMaxRef = useRef(1);
  
  /**
   * targetMaxRef - The target range multiplier
   * animatedMaxRef smoothly moves toward this value
   */
  const targetMaxRef = useRef(1);
  
  /**
   * cameraOffsetRef - Y offset for "impact" effect when big trades happen
   * Creates subtle camera shake on buys/sells
   */
  const cameraOffsetRef = useRef(0);
  
  /**
   * prevPriceRef - Stores previous price to detect changes
   * Used to calculate camera impact on price jumps
   */
  const prevPriceRef = useRef(currentPrice);

  // ============================================================================
  // EFFECT: Camera Impact (Shake on big price changes)
  // ============================================================================
  
  /**
   * This effect runs whenever currentPrice changes
   * It detects large price movements and adds a camera offset
   * 
   * TO ADJUST THE SHAKE:
   * - Change 0.02 threshold = how big a move triggers the effect (2% = 0.02)
   * - Change 40 multiplier = how strong the camera moves (higher = more shake)
   */
  useEffect(() => {
    // Calculate percentage price change
    const priceChange = (currentPrice - prevPriceRef.current) / prevPriceRef.current;
    prevPriceRef.current = currentPrice;
    
    // Only trigger on significant moves (more than 2%)
    if (Math.abs(priceChange) > 0.02) {
      // Add to camera offset (positive = price up = push view down)
      cameraOffsetRef.current += priceChange * 40;
    }
  }, [currentPrice]);

  // ============================================================================
  // EFFECT: Responsive Width
  // ============================================================================
  
  /**
   * This effect sets up a ResizeObserver to watch the container
   * When the window/container resizes, we update containerWidth
   * This makes the chart responsive to different screen sizes
   */
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    
    // Set initial width
    updateWidth();
    
    // Watch for size changes
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Cleanup: stop observing when component unmounts
    return () => resizeObserver.disconnect();
  }, []);

  // ============================================================================
  // EFFECT: Calculate Chart Range
  // ============================================================================
  
  /**
   * This effect calculates how "zoomed in" the chart should be
   * The chart centers around startPrice and shows price in both directions
   * 
   * TO ADJUST ZOOM BEHAVIOR:
   * - Change MIN_RANGE_MULTIPLIER (0.3) for minimum zoom level
   * - Change 1.3 multiplier for how much padding around price extremes
   */
  useEffect(() => {
    if (data.length === 0) {
      targetMaxRef.current = MIN_RANGE_MULTIPLIER;
      return;
    }
    
    // Get all prices (highs, lows, and current)
    const allPrices = [...data.flatMap(d => [d.high, d.low]), currentPrice];
    
    // Find the maximum deviation from start price
    const maxDeviation = Math.max(
      ...allPrices.map(p => Math.abs(p - startPrice) / startPrice)
    );
    
    // Set target with padding, but at least MIN_RANGE_MULTIPLIER
    targetMaxRef.current = Math.max(maxDeviation * 1.3, MIN_RANGE_MULTIPLIER);
  }, [data, currentPrice, startPrice]);

  // ============================================================================
  // NORMALIZATION FUNCTION
  // ============================================================================
  
  /**
   * norm() converts a price value to a Y pixel position on the canvas
   * 
   * The chart is centered around startPrice (1.0x)
   * - Prices above startPrice appear higher on screen (lower Y value)
   * - Prices below startPrice appear lower on screen (higher Y value)
   * 
   * @param price - The price to convert
   * @param rangeMultiplier - Current zoom level (from animatedMaxRef)
   * @returns Y position in pixels
   */
  const norm = useCallback((price: number, rangeMultiplier: number): number => {
    // Calculate the drawable area (excluding padding)
    const drawableHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    
    // Find the center Y position (where startPrice will appear)
    const centerY = PADDING_TOP + drawableHeight / 2;
    
    // Calculate how far this price is from startPrice (as percentage)
    const deviation = (price - startPrice) / startPrice;
    
    // Convert deviation to Y offset
    // Divide by rangeMultiplier to apply zoom
    // Multiply by half height because deviation of 1.0 should reach the edge
    const yOffset = (deviation / rangeMultiplier) * (drawableHeight / 2);
    
    // Subtract offset from center (positive deviation = up = lower Y)
    return centerY - yOffset;
  }, [startPrice]);

  // ============================================================================
  // MAIN RENDER LOOP (60fps)
  // ============================================================================
  
  /**
   * This effect sets up the canvas rendering loop
   * It runs at approximately 60fps using requestAnimationFrame
   * 
   * The render function:
   * 1. Clears the canvas
   * 2. Draws grid lines
   * 3. Draws candles
   * 4. Draws current price line
   * 5. Draws 1.0x baseline
   * 6. Draws Y-axis labels
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Get 2D rendering context (alpha: false for better performance)
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // -----------------------------------------------------------------------
    // HIGH DPI CANVAS SETUP
    // -----------------------------------------------------------------------
    /**
     * Device Pixel Ratio (dpr) makes the canvas crisp on high-res screens
     * We scale the canvas up, then scale the context down
     * This prevents blurry rendering on Retina/HiDPI displays
     */
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = CHART_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // -----------------------------------------------------------------------
    // FRAME TIMING
    // -----------------------------------------------------------------------
    let lastTime = 0;
    const targetFps = 60;
    const frameInterval = 1000 / targetFps;

    // -----------------------------------------------------------------------
    // RENDER FUNCTION (called every frame)
    // -----------------------------------------------------------------------
    const render = (timestamp: number) => {
      // Throttle to target FPS (skip frames if running too fast)
      const delta = timestamp - lastTime;
      if (delta < frameInterval) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = timestamp - (delta % frameInterval);

      // ---------------------------------------------------------------------
      // SMOOTH ZOOM INTERPOLATION
      // ---------------------------------------------------------------------
      /**
       * Smoothly animate zoom changes
       * 0.15 = interpolation speed (higher = faster, snappier)
       */
      const diff = targetMaxRef.current - animatedMaxRef.current;
      animatedMaxRef.current += diff * 0.15;
      const maxVal = animatedMaxRef.current;
      
      // ---------------------------------------------------------------------
      // CAMERA OFFSET DECAY
      // ---------------------------------------------------------------------
      /**
       * Slowly return camera offset to 0
       * 0.97 = decay rate (higher = slower return to center)
       */
      cameraOffsetRef.current *= 0.97;
      if (Math.abs(cameraOffsetRef.current) < 0.1) cameraOffsetRef.current = 0;
      const cameraOffset = cameraOffsetRef.current;
      
      // ---------------------------------------------------------------------
      // DETERMINE PRICE DIRECTION
      // ---------------------------------------------------------------------
      const isUp = currentPrice >= startPrice;
      const lineColor = isUp ? COLOR_GREEN : COLOR_RED;

      // ---------------------------------------------------------------------
      // APPLY CAMERA TRANSFORM
      // ---------------------------------------------------------------------
      ctx.save();
      ctx.translate(0, cameraOffset);

      // ---------------------------------------------------------------------
      // CLEAR CANVAS
      // ---------------------------------------------------------------------
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, -Math.abs(cameraOffset) - 10, containerWidth, CHART_HEIGHT + Math.abs(cameraOffset) * 2 + 20);

      // =====================================================================
      // DRAW GRID LINES
      // =====================================================================
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = 1;
      const gridLevels = [0.2, 0.4, 0.6, 0.8];
      gridLevels.forEach(level => {
        const y = norm(maxVal * level, maxVal);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(containerWidth - PADDING_RIGHT, y);
        ctx.stroke();
      });

      // =====================================================================
      // DRAW CANDLES
      // =====================================================================
      
      // Calculate candle width based on available space
      const chartAreaWidth = containerWidth - PADDING_LEFT - PADDING_RIGHT;
      const candleWidth = chartAreaWidth / FIXED_CANDLE_COUNT;
      
      // Only show the most recent candles that fit
      const visibleCandles = data.slice(-FIXED_CANDLE_COUNT);

      visibleCandles.forEach((candle, i) => {
        // Position candle from left side
        const x = PADDING_LEFT + i * candleWidth;
        
        // Skip if outside visible area
        if (x > containerWidth - PADDING_RIGHT) return;

        // Determine candle color (green = close >= open, red = close < open)
        const isPump = candle.close >= candle.open;
        const color = isPump ? COLOR_GREEN : COLOR_RED;

        // -------------------------------------------------------------------
        // DRAW WICK (the thin line showing high/low)
        // -------------------------------------------------------------------
        const wickX = x + candleWidth / 2;
        const wickTop = norm(candle.high, maxVal);
        const wickBottom = norm(candle.low, maxVal);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wickX, wickTop);
        ctx.lineTo(wickX, wickBottom);
        ctx.stroke();

        // -------------------------------------------------------------------
        // DRAW BODY (the thick rectangle showing open/close)
        // -------------------------------------------------------------------
        const bodyTop = norm(Math.max(candle.open, candle.close), maxVal);
        const bodyBottom = norm(Math.min(candle.open, candle.close), maxVal);
        const rawHeight = bodyBottom - bodyTop;
        
        // Ensure minimum height of 4px for visibility
        const bodyHeight = Math.max(rawHeight, 4);
        const adjustedBodyTop = rawHeight < 4 ? bodyTop - (4 - rawHeight) / 2 : bodyTop;
        
        // Add small padding between candles
        const bodyWidth = Math.max(candleWidth - 2, 2);
        const bodyX = x + (candleWidth - bodyWidth) / 2;

        // Gradient fill for the body (solid at top, faded at bottom)
        const gradient = ctx.createLinearGradient(bodyX, adjustedBodyTop, bodyX, adjustedBodyTop + bodyHeight + 20);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, isPump ? 'rgba(0, 255, 127, 0.15)' : 'rgba(255, 59, 59, 0.15)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight, 2);
        ctx.fill();

        // Glow effect (neon look)
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(bodyX, adjustedBodyTop, bodyWidth, bodyHeight, 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // =====================================================================
      // DRAW CURRENT PRICE LINE
      // =====================================================================
      if (currentPrice > 0) {
        const priceY = norm(currentPrice, maxVal);

        // Animated dashed line (dashes scroll horizontally)
        const dashOffset = (timestamp / 50) % 24;
        
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);  // 8px dash, 4px gap
        ctx.lineDashOffset = -dashOffset;  // Animate the dashes
        
        // Add glow effect
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 6;
        
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(containerWidth, priceY);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);  // Reset to solid lines

        // -----------------------------------------------------------------
        // PRICE LABEL (box on right side showing current price)
        // -----------------------------------------------------------------
        const labelX = containerWidth - PADDING_RIGHT + 3;
        const labelWidth = PADDING_RIGHT - 5;
        const labelHeight = 18;
        
        // Black background
        ctx.fillStyle = '#000';
        ctx.fillRect(labelX, priceY - labelHeight / 2, labelWidth, labelHeight);
        
        // Colored border
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, priceY - labelHeight / 2, labelWidth, labelHeight);

        // Price text
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 10px Monaco, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const priceText = currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4);
        ctx.fillText(priceText, labelX + labelWidth / 2, priceY);
      }

      // =====================================================================
      // DRAW 1.00x BASELINE
      // =====================================================================
      /**
       * This dashed line shows where the starting price (1.0x) is
       * Helps users see if they're up or down from the start
       */
      const baselineY = norm(startPrice, maxVal);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, baselineY);
      ctx.lineTo(containerWidth - PADDING_RIGHT, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);

      // =====================================================================
      // DRAW Y-AXIS LABELS (multipliers)
      // =====================================================================
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = '9px Monaco, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Show multiplier values at key levels
      const multiplierLevels = [-0.5, -0.25, 0, 0.25, 0.5].filter(
        level => Math.abs(level) <= maxVal
      );
      
      multiplierLevels.forEach(level => {
        const price = startPrice * (1 + level);
        const y = norm(price, maxVal);
        
        // Only draw if within visible area
        if (y > PADDING_TOP && y < CHART_HEIGHT - PADDING_BOTTOM) {
          const text = (1 + level).toFixed(2) + 'x';
          ctx.fillText(text, containerWidth - PADDING_RIGHT + 5, y);
        }
      });

      // Restore canvas transform (undo camera offset)
      ctx.restore();

      // Request next frame
      animationRef.current = requestAnimationFrame(render);
    };

    // Start the render loop
    animationRef.current = requestAnimationFrame(render);

    // Cleanup: stop animation when component unmounts
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [containerWidth, data, currentPrice, startPrice, norm]);

  // ============================================================================
  // CALCULATE MULTIPLIER (for overlay)
  // ============================================================================
  /**
   * multiplier = how much the price has changed from start
   * 1.5 = price is 50% higher than start
   * 0.8 = price is 20% lower than start
   */
  const multiplier = startPrice > 0 ? currentPrice / startPrice : 1;
  const isUp = multiplier >= 1;
  const multiplierText = multiplier.toFixed(2) + 'x';

  // ============================================================================
  // JSX RENDER
  // ============================================================================
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: CHART_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        background: COLOR_BG
      }}
    >
      {/* The canvas where everything is drawn */}
      <canvas
        ref={canvasRef}
        style={{
          width: containerWidth,
          height: CHART_HEIGHT,
          display: 'block'
        }}
      />
      
      {/* 
        MULTIPLIER OVERLAY
        Shows the current multiplier (e.g., "1.25x") in the corner
        
        TO CUSTOMIZE:
        - Change top/left for position
        - Change fontSize for size
        - Change fontWeight for boldness
      */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          pointerEvents: 'none',  // Click-through
        }}
      >
        <div
          style={{
            fontSize: '24px',
            fontWeight: 700,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: isUp ? COLOR_GREEN : COLOR_RED,
            textShadow: `0 0 10px ${isUp ? 'rgba(0, 255, 127, 0.5)' : 'rgba(255, 59, 59, 0.5)'}`,
            lineHeight: 1,
          }}
        >
          {multiplierText}
        </div>
      </div>
    </div>
  );
};

export default RugsChart;
