/**
 * GIMMS AUTO-PILOT WORKER — PLAN INTERPRETER
 *
 * Executes a plan produced by lib/agent/planner.ts. The interpreter is a CLOSED
 * switch over AgentStep.op — there is no eval, no new Function, no arbitrary script
 * injection, and no shell. A plan is untrusted data; the worst it can do is navigate
 * to an allowlisted host and click something.
 *
 * Every step is enforced defensively on the worker as well as on Vercel: the worker
 * re-checks the destination allowlist itself, because the worker is the component
 * that actually holds a browser.
 */

import { humanClick, humanHover, humanPause, humanScroll, humanType, moveMouse, rnd } from "./human.js";

const ALLOWED_HOSTS = [
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "gimms.lk",
  "infoceyteq.com",
  "docs.google.com",
  "drive.google.com",
  "sheets.google.com",
];

export function hostAllowed(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/** Resolve the first selector in a step that actually exists. */
async function firstLocator(page, step) {
  const candidates = [step.selector, ...(step.selectors || [])].filter(Boolean);
  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0) return locator;
    } catch {
      /* invalid selector: try the next */
    }
  }
  throw new Error(`no element matched: ${candidates.join(" | ")}`);
}

export async function runPlan({ page, plan, log, onProgress, deadline }) {
  const context = { extracted: {}, screenshots: [] };

  const record = async (level, message, data) => {
    log.push({ at: new Date().toISOString(), level, message, ...(data ? { data } : {}) });
    if (onProgress) await onProgress(level, message).catch(() => {});
  };

  for (let index = 0; index < plan.steps.length; index += 1) {
    if (Date.now() > deadline) throw new Error("plan exceeded its maximum duration");
    const step = plan.steps[index];

    switch (step.op) {
      case "goto": {
        if (!hostAllowed(step.url)) throw new Error(`worker refused navigation to a non-allowlisted host: ${step.url}`);
        const response = await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: step.timeoutMs ?? 30000,
        });
        await record("progress", `navigated to ${step.url} (HTTP ${response ? response.status() : "n/a"})`);
        break;
      }

      case "waitFor": {
        const locator = await firstLocator(page, step);
        await locator.waitFor({ state: "visible", timeout: step.timeoutMs ?? 20000 });
        await record("progress", `waited for ${step.selector}`);
        break;
      }

      case "humanClick": {
        const locator = await firstLocator(page, step);
        await humanClick(page, locator);
        await record("progress", `clicked ${step.selector}`);
        break;
      }

      case "humanHover": {
        const locator = await firstLocator(page, step);
        await humanHover(page, locator);
        await record("progress", `hovered ${step.selector}`);
        break;
      }

      case "humanType": {
        let locator = null;
        try {
          locator = await firstLocator(page, step);
          await locator.click({ timeout: 5000 });
        } catch {
          // No explicit selector: type into whatever is already focused.
        }
        await humanType(page, step.text ?? "");
        await record("progress", `typed ${(step.text ?? "").length} characters`);
        break;
      }

      case "humanScroll": {
        await humanScroll(page, step.amount ?? 600, step.direction ?? "down");
        await record("progress", `scrolled ${step.direction ?? "down"} ${step.amount ?? 600}px`);
        break;
      }

      case "selectOption": {
        const locator = await firstLocator(page, step);
        await locator.selectOption(step.value ?? "");
        await record("progress", `selected ${step.value}`);
        break;
      }

      case "press": {
        await page.keyboard.press(step.key ?? "Enter");
        await record("progress", `pressed ${step.key}`);
        break;
      }

      case "wait":
      case "humanPause": {
        await humanPause(step.ms ?? 500);
        break;
      }

      case "assertVisible": {
        const locator = await firstLocator(page, step);
        if (!(await locator.isVisible())) throw new Error(`assertVisible failed: ${step.selector}`);
        await record("progress", `asserted visible: ${step.selector}`);
        break;
      }

      case "assertText": {
        const body = await page.locator("body").innerText();
        if (step.expected && !body.includes(step.expected)) {
          throw new Error(`assertText failed: "${step.expected}" not found`);
        }
        await record("progress", `asserted text present: ${step.expected}`);
        break;
      }

      case "extract": {
        const key = step.name || `extract_${index}`;
        try {
          const locator = await firstLocator(page, step);
          const attribute = step.attribute || "innerText";
          const values =
            attribute === "innerText"
              ? [await locator.innerText()]
              : await locator.evaluateAll((nodes, attr) => nodes.map((node) => node.getAttribute(attr) || ""), attribute);
          // Cap everything so a hostile page cannot blow up the callback payload.
          context.extracted[key] = Array.isArray(values)
            ? values.slice(0, 40).map((value) => String(value).slice(0, 4000))
            : String(values).slice(0, 4000);
        } catch (cause) {
          context.extracted[key] = null;
          await record("warn", `extract ${key} failed: ${cause.message}`);
        }
        await record("progress", `extracted "${key}"`);
        break;
      }

      case "screenshot": {
        if (context.screenshots.length >= 12) {
          await record("warn", "screenshot budget exhausted");
          break;
        }
        const name = step.name || `shot_${index}`;
        const buffer = await page.screenshot({ fullPage: step.name?.includes("full") ?? false, type: "png" });
        context.screenshots.push({ name, bytes: buffer.length, buffer });
        await record("progress", `captured screenshot ${name} (${buffer.length} bytes)`);
        break;
      }

      default:
        throw new Error(`worker refused unknown op: ${step.op}`);
    }
  }

  // Leave the page in a human resting state rather than slamming it shut.
  await page.mouse.move(rnd(200, 900), rnd(120, 600), { steps: 6 });
  return context;
}
