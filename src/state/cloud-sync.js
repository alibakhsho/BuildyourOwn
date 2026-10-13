/* =========================================================================
   MODULE: state/cloud-sync.js
   Mirrors localStorage projects to Supabase (public.estimator_projects)
   for a signed-in user. The app stays local-first: every screen keeps
   reading state/projects.js, and this module just keeps the two copies
   level in the background.

   Conflict rule: newest edit wins, per project (client_updated_at vs the
   local updatedAt). Deletes travel as tombstones so a project removed on
   one device disappears on the others instead of being resurrected.

   The free tier keeps 3 projects in the cloud — the database enforces it
   (enforce_project_cap). A project refused for that reason stays on this
   device and is reported as "local", never lost.
   ========================================================================= */
import { useEffect, useState } from "react";
import { supabase, isAuthConfigured } from "../lib/supabase.js";
import { readAll, writeAll, readTombstones, writeTombstones, onProjectsChanged, getProject } from "./projects.js";

const TABLE = "estimator_projects";

/* Pure merge — exported for the headless test. Given local projects, local
   tombstones and remote rows, decide what moves where. */
export function mergePlan(local, tombs, remote) {
  const L = new Map(local.map((p) => [p.id, p]));
  const R = new Map(remote.map((r) => [r.id, r]));
  const out = { toLocal: [], removeLocal: [], toPush: [], toPushDelete: [], clearTombs: [] };
  const ids = new Set([...L.keys(), ...R.keys(), ...Object.keys(tombs)]);
  for (const id of ids) {
    const l = L.get(id), r = R.get(id), t = tombs[id];
    const rt = r ? Number(r.client_updated_at) || 0 : 0;
    if (r && r.deleted) {
      if (l && (l.updatedAt || 0) > rt) out.toPush.push(l);       // edited here after a delete elsewhere → keep it
      else if (l) out.removeLocal.push(id);
      if (t) out.clearTombs.push(id);
    } else if (r) {
      if (t && t >= rt) out.toPushDelete.push(id);                 // deleted here after the last remote edit
      else if (!l) out.toLocal.push({ ...r.data, id, updatedAt: rt });
      else if (rt > (l.updatedAt || 0)) out.toLocal.push({ ...r.data, id, updatedAt: rt });
      else if ((l.updatedAt || 0) > rt) out.toPush.push(l);
      if (t && t < rt) out.clearTombs.push(id);                    // remote edit is newer than our delete
    } else {
      if (l) out.toPush.push(l);
      if (t) out.clearTombs.push(id);                              // never reached the cloud — nothing to delete
    }
  }
  return out;
}

const toRow = (userId, p) => ({
  user_id: userId,
  id: p.id,
  name: (p.name || "Untitled project").slice(0, 200),
  build_mode: ["residential", "highrise", "materials"].includes(p.buildMode) ? p.buildMode : null,
  region: (p.region || "AU").slice(0, 8),
  data: p,
  client_updated_at: p.updatedAt || Date.now(),
  deleted: false,
});

/* ---- tiny observable store so React can show sync state ---- */
let state = { status: isAuthConfigured ? "off" : "unavailable", lastSync: null, local: [], error: "" };
const subs = new Set();
function set(patch) { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)); }
export function useCloudSync() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); return () => subs.delete(setS); }, []);
  return s;
}

let userId = null;
let unsub = null;
const timers = new Map();
const localOnly = new Set();

const isCap = (e) => /plan_limit/.test(e?.message || "");

async function pushOne(id) {
  if (!userId) return;
  const p = getProject(id);
  if (!p) return;
  const { error } = await supabase.from(TABLE).upsert(toRow(userId, p), { onConflict: "user_id,id" });
  if (error) {
    if (isCap(error)) { localOnly.add(id); set({ local: [...localOnly] }); return; }
    set({ status: "error", error: error.message });
    return;
  }
  localOnly.delete(id);
  set({ status: "synced", lastSync: Date.now(), local: [...localOnly], error: "" });
}

async function pushDelete(id) {
  if (!userId) return;
  const { error } = await supabase.from(TABLE)
    .update({ deleted: true, data: {}, client_updated_at: Date.now() })
    .eq("user_id", userId).eq("id", id);
  if (error) { set({ status: "error", error: error.message }); return; }
  const t = readTombstones(); delete t[id]; writeTombstones(t);
  localOnly.delete(id);
  set({ status: "synced", lastSync: Date.now(), local: [...localOnly] });
}

/* Full two-way sync. Runs on sign-in and on demand. */
export async function syncNow() {
  if (!supabase || !userId) return;
  set({ status: "syncing" });
  const { data: remote, error } = await supabase
    .from(TABLE).select("id, data, client_updated_at, deleted").eq("user_id", userId);
  if (error) { set({ status: "error", error: error.message }); return; }

  const plan = mergePlan(readAll(), readTombstones(), remote || []);

  // apply to localStorage in one write, quietly (no change events → no echo pushes)
  if (plan.toLocal.length || plan.removeLocal.length) {
    const byId = new Map(readAll().map((p) => [p.id, p]));
    plan.removeLocal.forEach((id) => byId.delete(id));
    plan.toLocal.forEach((p) => byId.set(p.id, p));
    writeAll([...byId.values()]);
  }
  if (plan.clearTombs.length) {
    const t = readTombstones(); plan.clearTombs.forEach((id) => delete t[id]); writeTombstones(t);
  }
  // oldest-first so, at the free cap, the projects you've had longest win the cloud slots
  const pushes = [...plan.toPush].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const p of pushes) await pushOne(p.id);
  for (const id of plan.toPushDelete) await pushDelete(id);

  set({ status: state.status === "error" ? "error" : "synced", lastSync: Date.now(), pulled: plan.toLocal.length + plan.removeLocal.length });
  window.dispatchEvent(new CustomEvent("byo:projects-synced"));
}

export function startCloudSync(uid) {
  if (!supabase || !uid || uid === userId) return;
  stopCloudSync();
  userId = uid;
  unsub = onProjectsChanged((kind, id) => {
    clearTimeout(timers.get(id));
    // debounce: the workspace autosaves on every slider tick
    timers.set(id, setTimeout(() => { timers.delete(id); kind === "delete" ? pushDelete(id) : pushOne(id); }, 1200));
  });
  syncNow();
}

export function stopCloudSync() {
  unsub?.(); unsub = null;
  timers.forEach(clearTimeout); timers.clear();
  localOnly.clear();
  userId = null;
  set({ status: isAuthConfigured ? "off" : "unavailable", lastSync: null, local: [], error: "" });
}
