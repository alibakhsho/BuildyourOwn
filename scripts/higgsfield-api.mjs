#!/usr/bin/env node
/* =========================================================================
   higgsfield-api.mjs — dev tool for generating site assets (3D props,
   textures, imagery) against the Higgsfield platform API, billed to the
   API balance (separate from the app credits the `higgsfield` CLI spends).

   Credentials: HF_CREDENTIALS ("key-id:key-secret") in .env.local — see
   hf-env.mjs. Never committed, never printed. Create the key at
   https://cloud.higgsfield.ai. For models with an official client example,
   prefer @higgsfield/client (see seedance-example.mjs); this covers the rest.

   Usage:
     node scripts/higgsfield-api.mjs check
     node scripts/higgsfield-api.mjs estimate <model-path> --prompt "..." [--json ...]   (free cost check)
     node scripts/higgsfield-api.mjs run <model-path> --prompt "..." [--json '{"k":"v"}'] [--out dir]
     node scripts/higgsfield-api.mjs status <request-id> [--out dir]

   <model-path> is the model's endpoint path from the console
   (https://console.higgsfield.ai), e.g. higgsfield-ai/soul/standard.
   Finished outputs (images, video, .glb, ...) are downloaded into --out
   (default: generated/), alongside the raw JSON response.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadHfCredentials } from "./hf-env.mjs";

const BASE = "https://api.higgsfield.ai";
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

function loadCreds() {
  const [id, secret] = loadHfCredentials().split(":");
  return { id, secret };
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

async function api(creds, method, url, body, extraHeaders = {}) {
  const res = await fetch(url.startsWith("http") ? url : BASE + url, {
    method,
    headers: {
      Authorization: `Key ${creds.id}:${creds.secret}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

/* Every http(s) URL anywhere in the response — images[].url, video.url,
   model_mesh.url, ... — whatever shape the model returns. */
function collectUrls(o, acc = new Set()) {
  if (typeof o === "string" && /^https?:\/\//.test(o) && !/\/requests\//.test(o)) acc.add(o);
  else if (Array.isArray(o)) o.forEach((v) => collectUrls(v, acc));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => collectUrls(v, acc));
  return acc;
}

async function download(urls, outDir, stem) {
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) { console.error(`  skip ${u} (${res.status})`); continue; }
    const ext = path.extname(new URL(u).pathname) || "";
    const file = path.join(outDir, `${stem}-${++n}${ext}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  saved ${file}`);
  }
}

async function poll(creds, requestId, outDir) {
  let delay = 2000, last = "";
  for (;;) {
    const { status, json } = await api(creds, "GET", `/requests/${requestId}/status`);
    if (status >= 400) { console.error(`status ${status}:`, JSON.stringify(json)); process.exit(1); }
    if (json.status !== last) { console.log(`  ${json.status}`); last = json.status; }
    if (TERMINAL.has(json.status)) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${requestId}.json`), JSON.stringify(json, null, 2));
      if (json.status === "completed") await download(collectUrls(json), outDir, requestId.slice(0, 8));
      else process.exitCode = 1;
      return json;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(10000, delay * 1.4);
  }
}

const a = args(process.argv.slice(2));
const cmd = a._[0];
const outDir = a.out || "generated";

if (cmd === "check") {
  const creds = loadCreds();
  // a made-up request id: 401 = bad key, 404/422 = key accepted
  const { status } = await api(creds, "GET", `/requests/${crypto.randomUUID()}/status`);
  if (status === 401 || status === 403) { console.error(`Key rejected (${status}). Re-check the ID and secret.`); process.exit(1); }
  console.log(`Key accepted (probe returned ${status}). Ready to generate.`);
} else if (cmd === "estimate") {
  // free: what a run with these inputs would cost, in credits and USD
  const model = a._[1];
  if (!model) { console.error("estimate needs a model path"); process.exit(2); }
  const body = { ...(a.json ? JSON.parse(a.json) : {}), ...(a.prompt ? { prompt: a.prompt } : {}) };
  const { status, json } = await api(loadCreds(), "POST", `/estimate/${model.replace(/^\//, "")}`, body);
  if (status >= 400) { console.error(`estimate ${status}:`, JSON.stringify(json)); process.exit(1); }
  console.log(JSON.stringify(json));
} else if (cmd === "run") {
  const model = a._[1];
  if (!model) { console.error("run needs a model path"); process.exit(2); }
  const body = { ...(a.json ? JSON.parse(a.json) : {}), ...(a.prompt ? { prompt: a.prompt } : {}) };
  const creds = loadCreds();
  const { status, json } = await api(creds, "POST", `/${model.replace(/^\//, "")}`, body, { "Idempotency-Key": crypto.randomUUID() });
  if (status >= 400) { console.error(`submit failed ${status}:`, JSON.stringify(json)); process.exit(1); }
  console.log(`queued ${json.request_id}`);
  await poll(creds, json.request_id, outDir);
} else if (cmd === "status") {
  await poll(loadCreds(), a._[1], outDir);
} else {
  console.log("usage: check | run <model-path> --prompt ... [--json ...] [--out dir] | status <request-id>");
}
