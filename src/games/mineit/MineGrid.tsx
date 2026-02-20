// ============================================================================
// MINE GRID — NxN interactive grid of 3D-raised clickable tiles (Stake-style)
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { RevealedTile, TileMapEntry, RevealResult } from './useMineGame';
import { playTileClick, playGreenReveal, playYellowReveal, playRedBust } from './mineSounds';

interface MineGridProps {
  gridSize: number;           // 5–10
  revealedTiles: RevealedTile[];
  tileMap?: TileMapEntry[];   // full map (shown after game ends)
  gameOver: boolean;
  isRevealing: boolean;
  disabled?: boolean;         // idle / config state
  onReveal: (index: number) => Promise<RevealResult | null>;
}

type TileState = 'hidden' | 'green' | 'yellow' | 'red' | 'ghost-green' | 'ghost-yellow' | 'ghost-red';

function getTileState(
  index: number,
  revealedTiles: RevealedTile[],
  tileMap?: TileMapEntry[],
  gameOver?: boolean,
): TileState {
  const revealed = revealedTiles.find((t) => t.index === index);
  if (revealed) return revealed.type;
  if (gameOver && tileMap) {
    const mapped = tileMap.find((t) => t.index === index);
    if (mapped) return `ghost-${mapped.type}` as TileState;
  }
  return 'hidden';
}

/* ── SVG Icons (filled, Stake-style) ──────────────────────────────────── */
function GemIcon() {
  return (
    <svg className="mine-tile-icon" viewBox="0 0 36 36" fill="none">
      <path d="M18 4L6 14l12 18 12-18L18 4z" fill="#10b981" />
      <path d="M18 4L6 14h24L18 4z" fill="#34d399" />
      <path d="M18 32L6 14h24L18 32z" fill="#059669" opacity=".7" />
    </svg>
  );
}
function WarningIcon() {
  return (
    <svg className="mine-tile-icon" viewBox="0 0 36 36" fill="none">
      <path d="M18 4L2 32h32L18 4z" fill="#f59e0b" />
      <path d="M18 4L2 32h32L18 4z" fill="#fbbf24" opacity=".5" />
      <rect x="16.5" y="14" width="3" height="10" rx="1.5" fill="#000" />
      <circle cx="18" cy="27" r="1.8" fill="#000" />
    </svg>
  );
}
function BombIcon() {
  return (
    <svg className="mine-tile-icon" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="20" r="10" fill="#ef4444" />
      <circle cx="18" cy="20" r="10" fill="#dc2626" opacity=".6" />
      <rect x="16.5" y="4" width="3" height="8" rx="1.5" fill="#ef4444" />
      <circle cx="18" cy="4" r="2" fill="#fbbf24" />
      <line x1="10" y1="12" x2="7" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="12" x2="29" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="14" cy="17" rx="2.5" ry="2" fill="#fff" opacity=".25" />
    </svg>
  );
}

function TileIcon({ type }: { type: string }) {
  const base = type.replace('ghost-', '');
  if (base === 'green') return <GemIcon />;
  if (base === 'yellow') return <WarningIcon />;
  return <BombIcon />;
}

/* ── Component ────────────────────────────────────────────────────────── */
export default function MineGrid({
  gridSize,
  revealedTiles,
  tileMap,
  gameOver,
  isRevealing,
  disabled = false,
  onReveal,
}: MineGridProps) {
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const [animatingTiles, setAnimatingTiles] = useState<Set<number>>(new Set());
  const [tileMultipliers, setTileMultipliers] = useState<Map<number, number>>(new Map());
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!isRevealing) setClickedIndex(null);
  }, [isRevealing]);

  // Reset multiplier map when a new game starts (revealedTiles empties)
  useEffect(() => {
    if (revealedTiles.length === 0) setTileMultipliers(new Map());
  }, [revealedTiles.length]);

  const handleClick = useCallback(async (index: number) => {
    if (disabled || gameOver || isRevealing || cooldownRef.current) return;
    const state = getTileState(index, revealedTiles, tileMap, gameOver);
    if (state !== 'hidden') return;

    cooldownRef.current = true;
    setClickedIndex(index);
    playTileClick();

    const result = await onReveal(index);
    if (result) {
      // Store multiplier for this tile
      if (result.tile_type === 'green' || result.tile_type === 'yellow') {
        setTileMultipliers((prev) => new Map(prev).set(index, result.new_multiplier));
      }
      setAnimatingTiles((prev) => new Set(prev).add(index));
      if (result.tile_type === 'green') playGreenReveal();
      else if (result.tile_type === 'yellow') playYellowReveal();
      else if (result.tile_type === 'red') playRedBust();
      setTimeout(() => {
        setAnimatingTiles((prev) => { const n = new Set(prev); n.delete(index); return n; });
      }, 600);
    }
    setTimeout(() => { cooldownRef.current = false; }, 300);
  }, [disabled, gameOver, isRevealing, revealedTiles, tileMap, onReveal]);

  const totalTiles = gridSize * gridSize;

  return (
    <div
      className="mine-grid"
      style={{
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${gridSize}, 1fr)`,
      }}
    >
      {Array.from({ length: totalTiles }, (_, i) => {
        const state = getTileState(i, revealedTiles, tileMap, gameOver);
        const isAnimating = animatingTiles.has(i);
        const isClicked = clickedIndex === i;
        const isGhost = state.startsWith('ghost-');
        const isHidden = state === 'hidden';
        const clickable = isHidden && !gameOver && !isRevealing && !disabled;
        const tileMultiplier = tileMultipliers.get(i);
        const baseType = state.replace('ghost-', '');

        return (
          <button
            key={i}
            className={[
              'mine-tile',
              `mine-tile--${state}`,
              clickable ? 'mine-tile--clickable' : '',
              isAnimating && (state === 'green' || state === 'yellow') ? 'mine-tile--pop' : '',
              isAnimating && state === 'red' ? 'mine-tile--dead' : '',
              isClicked && isRevealing ? 'mine-tile--loading' : '',
              disabled ? 'mine-tile--idle' : '',
              (gameOver && isHidden) ? 'mine-tile--disabled' : '',
            ].filter(Boolean).join(' ')}
            disabled={!clickable}
            onClick={() => handleClick(i)}
            aria-label={`Tile ${i + 1}`}
          >
            {/* 3D raised cover on unrevealed tiles */}
            {isHidden && !(isClicked && isRevealing) && (
              <div className="mine-tile-cover" />
            )}

            {isClicked && isRevealing ? (
              <span className="mine-tile-spinner" />
            ) : !isHidden ? (
              <span className={`mine-tile-face ${isGhost ? 'mine-tile-face--ghost' : ''}`}>
                <TileIcon type={state} />
                {/* Show multiplier under icon for green/yellow revealed tiles */}
                {(baseType === 'green' || baseType === 'yellow') && tileMultiplier && !isGhost && (
                  <span className={`mine-tile-mult mine-tile-mult--${baseType}`}>
                    {tileMultiplier.toFixed(2)}×
                  </span>
                )}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
