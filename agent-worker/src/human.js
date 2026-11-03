/**
 * GIMMS AUTO-PILOT WORKER — HUMAN INPUT SIMULATION
 *
 * This is the layer that makes the browser behave like a person rather than a script:
 *
 *   · pointer paths are curved and eased, not straight teleports
 *   · hover happens before a click, with a short dwell
 *   · typing has variable per-key latency, bigram-aware pauses, and occasional
 *     self-correction (backspace then retype)
 *   · scrolling is eased in several wheel events, not one jump
 *
 * IMPORTANT, HONEST NOTE — read this before assuming it is "undetectable":
 *   This defeats naive "did a click jump 0px?" heuristics. It does NOT defeat
 *   behavioural analytics, device fingerprinting, or TLS fingerprinting, and it does
 *   not make automation compliant with a platform's terms. See
 *   PHASE2-AGENT-ARCHITECTURE.md §7. Do not use this to evade enforcement.
 */

import { setTimeout as sleep } from "node:timers/promises";

/** Random float in [min, max). */
export function rnd(min, max) {
  return min + Math.random() * (max - min);
}

/** Random integer in [min, max]. */
export function rndInt(min, max) {
  return Math.floor(rnd(min, max + 1));
}

/** Human pause: log-normal-ish, so most pauses are short and a few are long. */
export async function humanPause(baseMs = 400) {
  const value = baseMs * (0.45 + Math.pow(Math.random(), 2) * 1.45);
  await sleep(Math.max(40, Math.min(value, 8000)));
}

/** Cubic-bezier-ish easing so velocity starts at 0 and ends at 0. */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Move the mouse along a slightly curved path to (x, y).
 * `steps` is chosen from distance so a long move is not 3 giant jumps.
 */
export async function moveMouse(page, x, y, options = {}) {
  const { overshoot = true } = options;
  const viewport = page.viewportSize() || { width: 1280, height: 800 };

  // Start from wherever the pointer currently is; default to a plausible spot.
  const from = options.from || {
    x: rnd(viewport.width * 0.25, viewport.width * 0.75),
    y: rnd(viewport.height * 0.2, viewport.height * 0.6),
  };

  const distance = Math.hypot(x - from.x, y - from.y);
  const steps = Math.max(8, Math.min(60, Math.round(distance / 14)));

  // Control point offset gives a natural bow to the path.
  const bow = rnd(0.04, 0.14) * (Math.random() > 0.5 ? 1 : -1);
  const cx = (from.x + x) / 2 + (y - from.y) * bow;
  const cy = (from.y + y) / 2 + (x - from.x) * bow;

  const target = overshoot
    ? { x: x + rnd(-3, 3), y: y + rnd(-3, 3) }
    : { x, y };

  for (let i = 1; i <= steps; i += 1) {
    const t = easeInOut(i / steps);
    // Quadratic Bezier from → control → target.
    const px = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * target.x;
    const py = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * target.y;
    await page.mouse.move(px, py);
    // Movement is not metronomic: jitter the interval.
    await sleep(rnd(4, 16));
  }

  if (overshoot) {
    // Small corrective drift onto the exact target.
    await page.mouse.move(x, y, { steps: rndInt(2, 4) });
  }
  return { x, y };
}

/** Scroll the element into view, hover it, then click with a realistic delay. */
export async function humanClick(page, locator, options = {}) {
  await locator.waitFor({ state: "visible", timeout: options.timeoutMs ?? 20000 });

  // Scroll like a person would if the target is off-screen.
  try {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize() || { height: 800 };
    if (box && (box.y < 0 || box.y + box.height > viewport.height - 60)) {
      await locator.scrollIntoViewIfNeeded();
      await humanPause(220);
    }
  } catch {
    /* element detached between checks: fall through to Playwright's own actionability */
  }

  const box = await locator.boundingBox();
  const viewport = page.viewportSize() || { width: 1280, height: 800 };
  const point = box
    ? { x: box.x + box.width * rnd(0.34, 0.66), y: box.y + box.height * rnd(0.34, 0.66) }
    : { x: rnd(80, viewport.width - 80), y: rnd(80, viewport.height - 80) };

  await moveMouse(page, point.x, point.y);
  // Dwell before pressing, as a human does while confirming the target.
  await humanPause(options.dwellMs ?? 180);
  await page.mouse.down({ button: "left" });
  await sleep(rnd(45, 125));
  await page.mouse.up({ button: "left" });
}

/** Type text one character at a time with human timing and rare self-correction. */
export async function humanType(page, text, options = {}) {
  const typoRate = options.typoRate ?? 0.012;
  const wpm = options.wpm ?? 62;
  const baseDelay = 60000 / (wpm * 5); // ms per character

  const words = text.split(" ");
  for (let w = 0; w < words.length; w += 1) {
    const word = words[w];
    for (let i = 0; i < word.length; i += 1) {
      const char = word[i];

      // Occasional typo, immediately corrected — real typists do this constantly.
      if (Math.random() < typoRate && /[a-z]/i.test(char)) {
        const wrong = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
        await page.keyboard.type(wrong);
        await sleep(rnd(90, 260));
        await page.keyboard.press("Backspace");
        await sleep(rnd(60, 160));
      }

      await page.keyboard.type(char);
      // Key latency: faster inside a word, slower after a "hard" key.
      const hard = /[^a-z0-9]/i.test(char);
      await sleep(baseDelay * rnd(0.35, 1.5) + (hard ? rnd(20, 90) : 0));
    }

    if (w < words.length - 1) {
      // Space + a think-pause between words (longer at punctuation).
      await page.keyboard.type(" ");
      const pauseAfter = /[,.;:!?]$/.test(word) ? rnd(320, 900) : rnd(40, 150);
      await sleep(pauseAfter);
    }
  }
}

/** Eased scroll in several wheel events. */
export async function humanScroll(page, amount = 600, direction = "down") {
  const total = Math.abs(amount);
  const sign = direction === "down" ? 1 : -1;
  const chunks = Math.max(3, Math.min(14, Math.round(total / 110)));
  for (let i = 0; i < chunks; i += 1) {
    await page.mouse.wheel(0, sign * (total / chunks) * rnd(0.7, 1.3));
    await sleep(rnd(35, 150));
  }
}

/** Hover by moving onto the element and dwelling briefly. */
export async function humanHover(page, locator, options = {}) {
  await locator.waitFor({ state: "visible", timeout: options.timeoutMs ?? 15000 });
  const box = await locator.boundingBox();
  if (!box) return;
  await moveMouse(page, box.x + box.width / 2, box.y + box.height / 2);
  await humanPause(160);
}
