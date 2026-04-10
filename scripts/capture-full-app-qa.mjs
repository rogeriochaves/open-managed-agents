#!/usr/bin/env node
/**
 * Full-app QA sweep.
 *
 * Drives the running dev server (localhost:5173) through every major
 * page in sequence, logging in as admin, and captures a screenshot of
 * each. Used to eyeball the whole app for visual regressions or UX
 * snags beyond the Quickstart page.
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "docs", "screenshots", "qa-sweep");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9335;
const WIDTH = 1456;
const HEIGHT = 900;

function log(...a) { console.log("[qa-sweep]", ...a); }

async function launchChrome() {
  const userDataDir = `/tmp/oma-qa-sweep-${Date.now()}`;
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

const PAGES = [
  { path: "/login", name: "01-login" },
  { path: "/quickstart", name: "02-quickstart", auth: true },
  { path: "/agents", name: "03-agents", auth: true },
  { path: "/sessions", name: "04-sessions", auth: true },
  { path: "/environments", name: "05-environments", auth: true },
  { path: "/vaults", name: "06-vaults", auth: true },
  { path: "/usage", name: "07-usage", auth: true },
  { path: "/settings", name: "08-settings", auth: true },
];

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

    // Login page first
    await navigate(cdp, "http://localhost:5173/login");
    await screenshot(cdp, join(OUT_DIR, "01-login.png"));

    // Log in via fetch so the cookie lands in the browser jar
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

    for (const page of PAGES.slice(1)) {
      await navigate(cdp, `http://localhost:5173${page.path}`);
      await screenshot(cdp, join(OUT_DIR, `${page.name}.png`));
    }
  } finally {
    try { cdp.close(); } catch {}
    try { proc.kill("SIGTERM"); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
