/* =========================================================================
   MODULE: state/projects.js
   Project persistence — every project is one workspace. localStorage-backed
   for now; the API mirrors what a backend would expose so login/dashboard
   can swap in later without touching UI code.
   Schema v1: { id, name, userType, buildMode, region, spec, hrSpec, matSpec,
                chats: { [personaId]: [{role, content}] }, createdAt, updatedAt }
   ========================================================================= */

const LS = "byo.projects.v1";
const LS_TOMBS = "byo.projects.deleted.v1"; // { [id]: deletedAt } — so deletes reach the cloud too

/* Change feed. The cloud mirror (state/cloud-sync.js) listens here, so
   every save/create/delete is pushed without touching the call sites. */
const listeners = new Set();
export function onProjectsChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind, id) { listeners.forEach((fn) => { try { fn(kind, id); } catch {} }); }

export function readTombstones() {
  try { return JSON.parse(localStorage.getItem(LS_TOMBS)) || {}; } catch { return {}; }
}
export function writeTombstones(t) {
  try { localStorage.setItem(LS_TOMBS, JSON.stringify(t)); } catch {}
}

export function readAll() {
  try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; }
}
export function writeAll(list) {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch {}
}

export function listProjects() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getProject(id) {
  return readAll().find((p) => p.id === id) || null;
}

export function createProject({ name, userType = "homeowner", buildMode = "residential", region = "AU", spec, hrSpec, matSpec }) {
  const now = Date.now();
  const p = {
    id: `prj_${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: name || "Untitled project",
    userType, buildMode, region,
    spec: spec || null, hrSpec: hrSpec || null, matSpec: matSpec || null,
    chats: {},
    createdAt: now, updatedAt: now,
  };
  writeAll([...readAll(), p]);
  emit("upsert", p.id);
  return p;
}

export function saveProject(id, patch) {
  const list = readAll();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id, updatedAt: Date.now() };
  writeAll(list);
  emit("upsert", id);
  return list[i];
}

export function deleteProject(id) {
  writeAll(readAll().filter((p) => p.id !== id));
  writeTombstones({ ...readTombstones(), [id]: Date.now() });
  emit("delete", id);
}

export function duplicateProject(id) {
  const src = getProject(id);
  if (!src) return null;
  return createProject({ ...src, name: `${src.name} (copy)` });
}
