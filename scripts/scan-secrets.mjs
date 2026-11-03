/**
 * GIMMS — lightweight tracked-file secret pattern scan.
 *
 * This is a CI guardrail, NOT a replacement for GitHub secret scanning or a
 * full git-history review. It prints only file paths and pattern names, never
 * matched values. Exit 1 on any high-confidence hit.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const patterns = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["openai_style_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["github_token", /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["aws_access_key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["jwt_like", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];

let hits = 0;
for (const file of files) {
  if (file === "package-lock.json") continue;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const [name, re] of patterns) {
    if (re.test(text)) {
      console.log(`POSSIBLE_SECRET ${name} ${file}`);
      hits += 1;
    }
  }
}
console.log(`SECRET_PATTERN_FILES_WITH_HITS=${hits}`);
console.log("NOTE=pattern scan only; GitHub secret scanning and history review are still required.");
process.exit(hits > 0 ? 1 : 0);
