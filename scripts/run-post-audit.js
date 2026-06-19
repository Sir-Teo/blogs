#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function usage() {
  console.error(
    "Usage: node scripts/run-post-audit.js [--quiet] [--list] [--all] [--date YYYY-MM-DD] " +
    "_posts/post.markdown [...]"
  );
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

function discoverPosts(filter) {
  const postsDir = path.resolve("_posts");
  if (!fs.existsSync(postsDir)) {
    console.error("[audit] _posts directory not found");
    return [];
  }

  return fs.readdirSync(postsDir)
    .filter((name) => name.endsWith(".markdown") && filter(name))
    .map((name) => path.join("_posts", name))
    .filter((file) => {
      const markdown = fs.readFileSync(path.resolve(file), "utf8");
      return runnableAuditBlock(markdown) !== null;
    })
    .sort();
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
  all: false,
  date: null,
  list: false,
  quiet: false
};
const files = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--quiet" || arg === "-q") {
    options.quiet = true;
  } else if (arg === "--list") {
    options.list = true;
  } else if (arg === "--all") {
    options.all = true;
  } else if (arg === "--date") {
    options.date = args[index + 1];
    index += 1;
  } else {
    files.push(arg);
  }
}

if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
  console.error("[audit] --date must use YYYY-MM-DD");
  process.exit(2);
}

if (options.all) {
  files.push(...discoverPosts(() => true));
}

if (options.date) {
  files.push(...discoverPosts((name) => name.startsWith(`${options.date}-`)));
}

const auditFiles = Array.from(new Set(files));

if (auditFiles.length === 0) {
  if (options.list) {
    console.error("[audit] 0 audit targets");
    process.exit(0);
  }
  usage();
  process.exit(2);
}

if (options.list) {
  auditFiles.forEach((file) => console.log(file));
  console.error(`[audit] ${auditFiles.length} audit targets`);
  process.exit(0);
}

let exitCode = 0;
let passedAudits = 0;
let failedAudits = 0;
for (const file of auditFiles) {
  if (!fs.existsSync(file)) {
    console.error(`[audit] ${file}: file not found`);
    failedAudits += 1;
    exitCode = 1;
    continue;
  }
  const status = runAudit(file, options);
  if (status === 0) {
    passedAudits += 1;
  } else {
    failedAudits += 1;
    exitCode = status;
  }
}

if (options.quiet) {
  const totalAudits = passedAudits + failedAudits;
  console.error(`[audit] ${passedAudits}/${totalAudits} audits passed`);
}

process.exit(exitCode);
