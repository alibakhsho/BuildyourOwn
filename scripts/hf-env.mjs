/* Loads HF_CREDENTIALS ("key-id:key-secret") for the Higgsfield dev scripts.

   Reads .env.local from the current checkout, then from the main checkout
   when running inside a git worktree — so the key is entered once, in the
   main project folder. Never logs the value. */
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

export function loadHfCredentials() {
  const files = [path.resolve(".env.local")];
  try {
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    files.push(path.join(path.dirname(common), ".env.local"));
  } catch { /* not a git checkout — the local file is all there is */ }
  for (const f of files) dotenv.config({ path: f, quiet: true });

  const creds = process.env.HF_CREDENTIALS?.trim();
  if (!creds || !/^[^:\s]+:[^:\s]+$/.test(creds)) {
    console.error(`HF_CREDENTIALS is missing or not in key-id:key-secret form.\nAdd it to ${files[files.length - 1]}`);
    process.exit(2);
  }
  return creds;
}
