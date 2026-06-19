#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function usage() {
  console.error("Usage: node scripts/run-post-audit.js [--quiet] _posts/post.markdown [...]");
}

function extractFences(markdown) {
  const fencePattern = /^```([^\n`]*)\n([\s\S]*?)^```$/gm;
  const fences = [];
  let match;
  while ((match = fencePattern.exec(markdown)) !== null) {
    fences.push({
      language: match[1].trim().toLowerCase(),
      body: match[2].replace(/\n$/, "")
    });
  }
  return fences;
}

function runnableAuditBlock(markdown) {
  const fences = extractFences(markdown);
  const candidates = fences.map((fence) => {
    const body = fence.body.trimStart();
    const hasLabRequire = /const\s+lab\s*=\s*require\("\.\/assets\/js\/[^"]+\.js"\);/.test(body);
    const hasAuditGuard = /throw new Error|EXPECTED_[A-Z_]+|audit[A-Z][A-Za-z0-9_]*\(/.test(body);
    if (/^(bash|sh|shell)$/.test(fence.language) && body.startsWith("node - <<'NODE'")) {
      return { runner: "bash", source: fence.body, score: hasAuditGuard ? 3 : 2 };
    }
    if (/^(js|javascript)$/.test(fence.language) && hasLabRequire && hasAuditGuard) {
      return { runner: "node", source: fence.body, score: hasAuditGuard ? 2 : 1 };
    }
    return null;
  }).filter(Boolean);

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] || null;
}

function runAudit(file, options) {
  const absolute = path.resolve(file);
  const markdown = fs.readFileSync(absolute, "utf8");
  const block = runnableAuditBlock(markdown);
  if (!block) {
    console.error(`[audit] ${file}: no runnable embedded audit block found`);
    return 1;
  }

  if (!options.quiet) console.error(`[audit] ${file}`);
  const command = block.runner === "bash" ? "bash" : "node";
  const result = spawnSync(command, [], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: block.source,
    stdio: options.quiet ? ["pipe", "pipe", "pipe"] : ["pipe", "inherit", "inherit"]
  });

  if (result.error) {
    console.error(`[audit] ${file}: ${result.error.message}`);
    return 1;
  }
  const status = result.status || 0;
  if (options.quiet) {
    if (status === 0) {
      console.error(`[audit] PASS ${file}`);
    } else {
      console.error(`[audit] FAIL ${file}`);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
  }
  return status;
}

const args = process.argv.slice(2);
const options = {
  quiet: false
};
const files = [];
for (const arg of args) {
  if (arg === "--quiet" || arg === "-q") {
    options.quiet = true;
  } else {
    files.push(arg);
  }
}

if (files.length === 0) {
  usage();
  process.exit(2);
}

let exitCode = 0;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`[audit] ${file}: file not found`);
    exitCode = 1;
    continue;
  }
  const status = runAudit(file, options);
  if (status !== 0) exitCode = status;
}

process.exit(exitCode);
