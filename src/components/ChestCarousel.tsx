import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { LootTableEntry, ChestOpenResult } from '../types/game';
import { RARITY_COLORS } from '../types/game';
import { playTick, playReveal } from '../lib/sounds';
import solanaLogo from '../assets/logo_solana.png';

interface ChestCarouselProps {
  lootTable: LootTableEntry[];
  result: ChestOpenResult;
  tierColor: string;
  onComplete: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ITEM_COUNT = 35;
const ITEM_WIDTH = 72;     // px per rectangle card width
const ITEM_HEIGHT = 100;   // px per rectangle card height
const ITEM_GAP = 8;        // px gap between items
const ITEM_TOTAL = ITEM_WIDTH + ITEM_GAP; // 80px per slot
const WIN_INDEX = 30;      // The winning item's position in the strip
const SCROLL_DURATION = 5000; // ms — total animation duration (longer for drama)
const HOLD_DURATION = 1000;   // ms — how long to hold on the winner before completing

// Rarity hierarchy for near-miss placement
const RARITY_ORDER = [
  'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary',
  'Mythic', 'Ancient', 'Immortal', 'Divine', 'Jackpot',
];

// ============================================================================
// HELPERS
// ============================================================================

/** Pick a random loot entry weighted by odds_percent */
function weightedRandom(table: LootTableEntry[]): LootTableEntry {
  const totalOdds = table.reduce((sum, e) => sum + e.odds_percent, 0);
  let r = Math.random() * totalOdds;
  for (const entry of table) {
    r -= entry.odds_percent;
    if (r <= 0) return entry;
  }
  return table[table.length - 1];
}

/** Find the nearest higher-rarity entry in the loot table (for near-miss) */
function findNearMiss(winRarity: string, table: LootTableEntry[]): LootTableEntry | null {
  const winIdx = RARITY_ORDER.indexOf(winRarity);
  if (winIdx === -1) return null;

  // Look for entries with strictly higher rarity
  for (let i = winIdx + 1; i < RARITY_ORDER.length; i++) {
    const entry = table.find(e => e.rarity === RARITY_ORDER[i]);
    if (entry) return entry;
  }
  return null;
}

/** Custom easing: fast ramp-up (first 12%), long dramatic deceleration (remaining 88%) */
function carouselEase(t: number): number {
  if (t < 0.12) {
    // Quick acceleration
    return (t / 0.12) * 0.12;
  }
  // Quartic ease-out for more dramatic slow-down
  const localT = (t - 0.12) / 0.88;
  return 0.12 + 0.88 * (1 - Math.pow(1 - localT, 4));
}

// ============================================================================
// COMPONENT
// ============================================================================

const ChestCarousel: React.FC<ChestCarouselProps> = ({
  lootTable,
  result,
  tierColor,
  onComplete,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastItemIdxRef = useRef<number>(-1);
  const [finished, setFinished] = useState(false);
  const completedRef = useRef(false);

  // Build the item strip
  const items = useMemo(() => {
    if (!lootTable.length) return [];

    const strip: LootTableEntry[] = new Array(ITEM_COUNT);

    // Place the winning item at WIN_INDEX
    const winEntry: LootTableEntry = {
      rarity: result.rarity || 'Common',
      reward_sol: result.reward_sol ?? 0,
      odds_percent: 0,
    };
    strip[WIN_INDEX] = winEntry;

    // Place near-miss 1-2 positions before winner
    const nearMiss = findNearMiss(winEntry.rarity, lootTable);
    const nearMissPos = WIN_INDEX - (Math.random() < 0.5 ? 1 : 2);
    if (nearMiss && nearMissPos >= 0) {
      strip[nearMissPos] = nearMiss;
    }

    // Fill remaining slots with weighted random picks
    for (let i = 0; i < ITEM_COUNT; i++) {
      if (!strip[i]) {
        strip[i] = weightedRandom(lootTable);
      }
    }

    return strip;
  }, [lootTable, result]);

  // Calculate the final translateX so WIN_INDEX is centered
  const containerWidthRef = useRef(0);

  // Total scroll distance: from showing first items to centering on WIN_INDEX
  const getTargetX = (containerWidth: number) => {
    const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
    return WIN_INDEX * ITEM_TOTAL - centerOffset;
  };

  // Animation loop
  useEffect(() => {
    if (!items.length) return;

    const container = stripRef.current?.parentElement;
    if (!container) return;

    containerWidthRef.current = container.clientWidth;
    const targetX = getTargetX(containerWidthRef.current);

    startTimeRef.current = performance.now();
    lastItemIdxRef.current = -1;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / SCROLL_DURATION, 1);
      const easedT = carouselEase(t);

      const currentX = easedT * targetX;

      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(${-currentX}px)`;
      }

      // Detect which item is under the center indicator
      const centerPos = currentX + containerWidthRef.current / 2;
      const currentItemIdx = Math.floor(centerPos / ITEM_TOTAL);

      // Play tick when a new item crosses the center (skip during very fast phase for cleaner sound)
      if (currentItemIdx !== lastItemIdxRef.current && currentItemIdx >= 0 && currentItemIdx < ITEM_COUNT) {
        lastItemIdxRef.current = currentItemIdx;
        const speed = 1 - easedT; // Speed decreases as easing progresses
        // Skip ticks during the fastest phase to avoid noise
        if (speed < 0.85) {
          playTick(speed);
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete — hold, then reveal
        setFinished(true);
        playReveal(result.is_jackpot || false);

        setTimeout(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
        }, HOLD_DURATION);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [items, result.is_jackpot, onComplete]);

  if (!items.length) return null;

  return (
    <div className="chest-carousel-overlay">
      <div className="chest-carousel-container">
        {/* Center indicator */}
        <div className="chest-carousel-indicator" style={{ color: tierColor, borderColor: tierColor }} />

        {/* Scrolling strip */}
        <div className="chest-carousel-viewport">
          <div
            ref={stripRef}
            className="chest-carousel-strip"
            style={{ willChange: 'transform' }}
          >
            {items.map((item, i) => {
              const rarityColor = RARITY_COLORS[item.rarity] || '#9d9d9d';
              const isWinner = i === WIN_INDEX && finished;
              const isJackpot = item.rarity === 'Jackpot';
              const isHighRarity = ['Epic', 'Legendary', 'Mythic', 'Ancient', 'Immortal', 'Divine', 'Jackpot'].includes(item.rarity);

              return (
                <div
                  key={i}
                  className={`chest-carousel-item${isWinner ? ' winner' : ''}${isJackpot ? ' jackpot' : ''}${isHighRarity ? ' high-rarity' : ''}`}
                  style={{
                    borderColor: rarityColor,
                    boxShadow: isWinner
                      ? `0 0 32px ${rarityColor}99, 0 0 64px ${rarityColor}44, inset 0 0 20px ${rarityColor}33`
                      : `0 0 8px ${rarityColor}22`,
                    background: `linear-gradient(180deg, ${rarityColor}15 0%, rgba(12, 12, 16, 0.95) 60%, ${rarityColor}08 100%)`,
                    width: ITEM_WIDTH,
                    minWidth: ITEM_WIDTH,
                    height: ITEM_HEIGHT,
                  }}
                >
                  <div className="chest-carousel-item-rarity" style={{ color: rarityColor }}>
                    {item.rarity}
                  </div>
                  <div className="chest-carousel-item-amount">
                    <img src={solanaLogo} alt="SOL" className="chest-carousel-sol-icon" />
                    <span>{item.reward_sol}</span>
                  </div>
                  <div className="chest-carousel-item-percent">
                    {item.odds_percent.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChestCarousel;
