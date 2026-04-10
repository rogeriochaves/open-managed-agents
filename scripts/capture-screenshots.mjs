#!/usr/bin/env node
/**
 * Captures README screenshots of the Open Managed Agents UI.
 *
 * Uses Chrome's CDP (DevTools Protocol) via raw WebSocket so we don't need to
 * install puppeteer. Assumes the dev server is running on localhost:5173
 * and the API on localhost:3001 with the default admin user.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "docs", "screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const WIDTH = 1456;
const HEIGHT = 830;

function log(...a) { console.log("[capture]", ...a); }

async function launchChrome() {
  const userDataDir = `/tmp/oma-screenshots-${Date.now()}`;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ];
  log("launching chrome...");
  const proc = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});

  // Wait for devtools
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  // Get the page target
  const targets = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json());
  const target = targets.find((t) => t.type === "page");
  if (!target) throw new Error("no page target");

  return { proc, wsUrl: target.webSocketDebuggerUrl };
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Map();
    this.ready = new Promise((resolve) => {
      this.ws.on("open", resolve);
    });
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
      if (msg.method) {
        for (const [evt, cb] of this.listeners) {
          if (msg.method === evt) cb(msg.params);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(evt, cb) {
    this.listeners.set(evt, cb);
  }

  close() {
    this.ws.close();
  }
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  // Wait for Page.loadEventFired
  await new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => resolve());
    setTimeout(resolve, 8000);
  });
  // Small extra wait for hydration
  await new Promise((r) => setTimeout(r, 1500));
}

async function screenshot(cdp, path) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(result.data, "base64"));
  log("saved", path);
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result?.value;
}

async function main() {
  const { proc, wsUrl } = await launchChrome();
  const cdp = new Cdp(wsUrl);
  await cdp.ready;

  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });

    // 1. Login page
    await navigate(cdp, "http://localhost:5173/login");
    await screenshot(cdp, join(OUT_DIR, "01-login.png"));

    // Log in via fetch, then navigate
    await evaluate(cdp, `
      (async () => {
        const res = await fetch("/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: "admin@localhost", password: "admin" }),
        });
        return res.status;
      })()
    `);

    // 2. Quickstart template grid
    await navigate(cdp, "http://localhost:5173/quickstart");
    await screenshot(cdp, join(OUT_DIR, "02-quickstart-templates.png"));

    // 3. Select Support agent + Use template → agent created view (hero!)
    await evaluate(cdp, `
      (async () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const supportBtn = buttons.find(b => b.textContent?.startsWith('Support agent') && !b.textContent.includes('Support-to-eng'));
        supportBtn?.click();
        await new Promise(r => setTimeout(r, 500));
        const useBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Use this template');
        useBtn?.click();
        await new Promise(r => setTimeout(r, 2500));
        return 'done';
      })()
    `);
    await screenshot(cdp, join(OUT_DIR, "03-agent-created.png"));

    // 4. Continue through the wizard
    await evaluate(cdp, `
      (async () => {
        const next = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim().startsWith('Next: Configure environment'));
        next?.click();
        await new Promise(r => setTimeout(r, 500));
        const unr = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Unrestricted'));
        unr?.click();
        await new Promise(r => setTimeout(r, 1000));
        return 'done';
      })()
    `);
    await screenshot(cdp, join(OUT_DIR, "04-environment-created.png"));

    // 5. Settings > Providers
    await navigate(cdp, "http://localhost:5173/settings");
    await screenshot(cdp, join(OUT_DIR, "05-settings-providers.png"));

    // 6. Settings > Governance
    await evaluate(cdp, `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Governance');
        btn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    await screenshot(cdp, join(OUT_DIR, "06-settings-governance.png"));

    // 7. Usage & Cost
    await navigate(cdp, "http://localhost:5173/usage");
    await screenshot(cdp, join(OUT_DIR, "07-usage-cost.png"));

    // 8. Find any existing session, send a message, then screenshot transcript
    const sessionId = await evaluate(cdp, `
      (async () => {
        // Create a fresh agent + session for a clean screenshot
        const agent = await fetch("/v1/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: "demo-agent",
            model: "claude-sonnet-4-6",
            description: "Demo agent for README screenshot",
            system: "You are a helpful assistant. Respond in rich markdown with headings, bullet points and bold text when appropriate.",
          }),
        }).then(r => r.json());
        const session = await fetch("/v1/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ agent: agent.id, environment_id: "env_default", title: "Demo conversation" }),
        }).then(r => r.json());
        await fetch("/v1/sessions/" + session.id + "/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            events: [{
              type: "user.message",
              content: [{ type: "text", text: "Give me a 3-step plan to debug a slow web app. Use markdown headings and bullets." }],
            }],
          }),
        });
        // Wait for agent to respond
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const events = await fetch("/v1/sessions/" + session.id + "/events?order=asc&limit=50", { credentials: "include" }).then(r => r.json());
          if (events.data.some(e => e.type === "session.status_idle")) break;
        }
        return session.id;
      })()
    `);

    await navigate(cdp, `http://localhost:5173/sessions/${sessionId}`);
    await new Promise((r) => setTimeout(r, 2000));
    await screenshot(cdp, join(OUT_DIR, "08-session-transcript.png"));

    // 9. Debug view
    await evaluate(cdp, `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'debug');
        btn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    await screenshot(cdp, join(OUT_DIR, "09-session-debug.png"));

    log("all screenshots captured successfully");
  } finally {
    cdp.close();
    proc.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
