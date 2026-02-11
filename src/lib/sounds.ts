// ============================================================================
// PROCEDURAL SOUND EFFECTS — Web Audio API
// Zero audio file dependencies. All sounds generated on-the-fly.
// ============================================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Short click/tick sound for carousel items passing the indicator.
 * @param speed 0..1 — 1 = fastest scroll, 0 = slowest. Higher speed = higher pitch + quieter.
 */
export function playTick(speed: number): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Pitch rises with speed (creates urgency at fast scroll, satisfaction at slow)
    const freq = 300 + speed * 600; // 300Hz (slow) → 900Hz (fast)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Volume: louder when slow (so final ticks are prominent)
    const vol = 0.08 + (1 - speed) * 0.12; // 0.08 (fast) → 0.20 (slow)
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Silent fail — audio not critical
  }
}

/**
 * Reward reveal sound — ascending tone burst.
 * @param isJackpot If true, plays an extended celebratory fanfare.
 */
export function playReveal(isJackpot: boolean): void {
  try {
    const ctx = getAudioContext();

    // Main reveal chord
    const frequencies = isJackpot
      ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6 — major chord
      : [440, 554.37, 659.25]; // A4, C#5, E5 — A major triad

    const duration = isJackpot ? 0.6 : 0.3;

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const vol = isJackpot ? 0.12 : 0.10;
      const delay = i * 0.03; // Stagger each note slightly for arpeggio effect
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration + 0.01);
    });

    // Jackpot shimmer — high-frequency sparkle
    if (isJackpot) {
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(2093, ctx.currentTime + 0.2); // C7
      shimmer.frequency.exponentialRampToValueAtTime(4186, ctx.currentTime + 0.8);
      shimmerGain.gain.setValueAtTime(0.04, ctx.currentTime + 0.2);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);
      shimmer.start(ctx.currentTime + 0.2);
      shimmer.stop(ctx.currentTime + 0.9);
    }
  } catch {
    // Silent fail
  }
}
