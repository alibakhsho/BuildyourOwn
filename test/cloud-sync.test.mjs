/* Merge rules for the local ⇄ cloud project mirror. The module imports the
   Supabase client, so stub the browser bits it touches at import time. */
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis.window || { dispatchEvent() {} };
const { mergePlan } = await import("../src/state/cloud-sync.js");

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const ids = (a) => a.map((x) => x.id || x).sort().join(",");

const L = (id, t) => ({ id, name: id, updatedAt: t });
const R = (id, t, deleted = false) => ({ id, client_updated_at: t, deleted, data: { id, name: `${id}-remote` } });

{
  const p = mergePlan([L("a", 10)], {}, []);
  ok("local-only project is pushed", ids(p.toPush) === "a");
}
{
  const p = mergePlan([], {}, [R("b", 10)]);
  ok("remote-only project is pulled", ids(p.toLocal) === "b" && p.toLocal[0].name === "b-remote");
  ok("pulled project keeps the remote timestamp", p.toLocal[0].updatedAt === 10);
}
{
  const p = mergePlan([L("c", 20)], {}, [R("c", 10)]);
  ok("newer local edit wins → push", ids(p.toPush) === "c" && !p.toLocal.length);
}
{
  const p = mergePlan([L("d", 10)], {}, [R("d", 20)]);
  ok("newer remote edit wins → pull", ids(p.toLocal) === "d" && !p.toPush.length);
}
{
  const p = mergePlan([L("e", 10)], {}, [R("e", 10)]);
  ok("identical timestamps → nothing moves", !p.toLocal.length && !p.toPush.length);
}
{
  const p = mergePlan([], { f: 30 }, [R("f", 20)]);
  ok("deleted here after last remote edit → delete pushed", ids(p.toPushDelete) === "f");
}
{
  const p = mergePlan([], { g: 10 }, [R("g", 20)]);
  ok("remote edited after our delete → remote wins, project returns", ids(p.toLocal) === "g" && !p.toPushDelete.length && ids(p.clearTombs) === "g");
}
{
  const p = mergePlan([L("h", 10)], {}, [R("h", 20, true)]);
  ok("deleted elsewhere → removed here", ids(p.removeLocal) === "h");
}
{
  const p = mergePlan([L("i", 30)], {}, [R("i", 20, true)]);
  ok("edited here after a delete elsewhere → kept and pushed", ids(p.toPush) === "i" && !p.removeLocal.length);
}
{
  const p = mergePlan([], { j: 5 }, []);
  ok("tombstone for a never-synced project is just cleared", ids(p.clearTombs) === "j" && !p.toPushDelete.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
