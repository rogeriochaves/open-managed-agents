#!/usr/bin/env node
/**
 * Capture the agent-detail (edit) view of a real existing agent.
 *
 * Expects AGENT_ID via env var. Logs in as admin, opens /agents/:id,
 * and saves a screenshot. Used to eyeball the edit screen post-restyle
 * for UX issues I haven't seen.
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
const PORT = 9337;
const WIDTH = 1456;
const HEIGHT = 900;
const AGENT_ID = process.env.AGENT_ID;
if (!AGENT_ID) { console.error("AGENT_ID required"); process.exit(1); }

async function launchChrome() {
  const userDataDir = `/tmp/oma-agent-qa-${Date.now()}`;
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    `--window-size=${WIDTH},${HEIGHT}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", () => {}); proc.stderr.on("data", () => {});
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json/version`); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const targets = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json());
  const target = targets.find((t) => t.type === "page");
  return { proc, wsUrl: target.webSocketDebuggerUrl };
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((r) => this.ws.on("open", r));
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
      if (msg.method) { for (const [e, cb] of this.listeners) if (msg.method === e) cb(msg.params); }
    });
  }
  send(m, p = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method: m, params: p })); });
  }
  on(e, cb) { this.listeners.set(e, cb); }
  close() { this.ws.close(); }
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await new Promise((r) => { cdp.on("Page.loadEventFired", () => r()); setTimeout(r, 8000); });
  await new Promise((r) => setTimeout(r, 1500));
}
async function screenshot(cdp, path) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.data, "base64"));
  console.log("[agent-qa] saved", path);
}
async function evaluate(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

async function main() {
  const { proc, wsUrl } = await launchChrome();
  const cdp = new Cdp(wsUrl); await cdp.ready;
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });

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

    // Agents list with the QA agent visible
    await navigate(cdp, "http://localhost:5173/agents");
    await screenshot(cdp, join(OUT_DIR, "agent-qa-01-list.png"));

    // Agent detail / edit
    await navigate(cdp, `http://localhost:5173/agents/${AGENT_ID}`);
    await new Promise((r) => setTimeout(r, 1500));
    await screenshot(cdp, join(OUT_DIR, "agent-qa-02-detail.png"));

    // Click Edit and capture the edit form
    await evaluate(cdp, `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Edit');
        btn?.click();
        return btn ? 'clicked' : 'not-found';
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));
    await screenshot(cdp, join(OUT_DIR, "agent-qa-03-edit.png"));
  } finally {
    try { cdp.close(); } catch {}
    try { proc.kill("SIGTERM"); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
