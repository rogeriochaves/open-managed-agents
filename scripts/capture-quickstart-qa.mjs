#!/usr/bin/env node
/**
 * QA capture script for the new two-column Quickstart chat.
 *
 * Drives the real running dev server (localhost:5173 + API 3001),
 * logs in as admin, and takes three screenshots:
 *   01 — empty chat + templates on the right (matching Claude's layout)
 *   02 — after the first turn: user bubble + assistant bubble +
 *        draft preview on the right
 *   03 — after the second turn: done=true, "Create agent" active
 *
 * These shots are the ground truth for the user's "looks exactly
 * like Claude" bar, and the QA artifact for this iteration.
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
const PORT = 9334;
const WIDTH = 1456;
const HEIGHT = 900;

function log(...a) { console.log("[qa-capture]", ...a); }

async function launchChrome() {
  const userDataDir = `/tmp/oma-qa-capture-${Date.now()}`;
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

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
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
    this.listeners = new Map();
    this.ready = new Promise((resolve) => this.ws.on("open", resolve));
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
  on(evt, cb) { this.listeners.set(evt, cb); }
  close() { this.ws.close(); }
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => resolve());
    setTimeout(resolve, 8000);
  });
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
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
    });

    // Log in
    await navigate(cdp, "http://localhost:5173/login");
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

    // 1. Empty Quickstart
    await navigate(cdp, "http://localhost:5173/quickstart");
    await new Promise((r) => setTimeout(r, 1200));
    await screenshot(cdp, join(OUT_DIR, "quickstart-qa-01-empty.png"));

    // 2. Type a prompt and send
    await evaluate(cdp, `
      (async () => {
        const ta = document.querySelector('textarea[placeholder="Describe your agent..."]');
        if (!ta) return 'no-textarea';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, "I want a support agent that reads our Notion docs and escalates hard questions to Slack");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-send') || b.textContent?.trim() === 'Send');
        // Fall back: simulate Enter keydown which our handler supports
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        ta.dispatchEvent(event);
        return 'sent';
      })()
    `);

    // Wait for the assistant reply (up to ~30s)
    for (let i = 0; i < 30; i++) {
      const hasReply = await evaluate(cdp, `
        !!Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('Draft agent') && d.tagName === 'DIV')
      `);
      if (hasReply) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 1200));
    await screenshot(cdp, join(OUT_DIR, "quickstart-qa-02-draft.png"));

    // 3. Second turn: "looks good, ship it"
    await evaluate(cdp, `
      (async () => {
        const ta = document.querySelector('textarea[placeholder="Describe your agent..."]');
        if (!ta) return 'no-textarea';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, "internal team, friendly but concise. looks good, ship it");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return 'sent2';
      })()
    `);

    for (let i = 0; i < 30; i++) {
      const done = await evaluate(cdp, `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim().startsWith('Create agent'));
          return btn && !btn.disabled;
        })()
      `);
      if (done) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 1200));
    await screenshot(cdp, join(OUT_DIR, "quickstart-qa-03-done.png"));
  } finally {
    cdp.close();
    proc.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
