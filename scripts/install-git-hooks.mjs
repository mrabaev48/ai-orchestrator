import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const gitDir = path.join(repoRoot, ".git");

if (!existsSync(gitDir)) {
  console.warn("Skipping git hook installation: .git directory not found.");
  process.exit(0);
}

execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: repoRoot,
  stdio: "inherit",
});

console.log("Configured git hooks path: .githooks");
