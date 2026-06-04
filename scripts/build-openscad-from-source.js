#!/usr/bin/env node

/**
 * Build openscad-wasm from source using the RanchHandRobotics forks.
 *
 * Clones:
 *   https://github.com/ranch-hand-robotics/openscad-wasm
 *   https://github.com/ranchhandrobotics/openscad  (branch: feature/color_export)
 *
 * Runs `make wasm` inside the cloned openscad-wasm repo, then copies the
 * built artifacts directly into openscad-wasm-build/build/ so babylon_ros
 * can use them without a GitHub release.
 *
 * Usage:
 *   node scripts/build-openscad-from-source.js [--update]
 *
 *   --update   Pull latest commits on already-cloned repos instead of
 *              skipping them.  Does not re-clone from scratch.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ── Configuration ────────────────────────────────────────────────────────────

const OPENSCAD_WASM_REPO = 'https://github.com/ranch-hand-robotics/openscad-wasm.git';
const OPENSCAD_WASM_BRANCH = process.env.OPENSCAD_WASM_BRANCH || 'main';
const OPENSCAD_WASM_BRANCH_FALLBACK = 'master';
const OPENSCAD_REPO      = 'https://github.com/ranchhandrobotics/openscad.git';
const OPENSCAD_BRANCH    = 'feature/color_export';

const ROOT_DIR       = path.resolve(__dirname, '..');
const SRC_DIR        = path.join(ROOT_DIR, 'build-src');
const SIBLING_WASM_SRC_DIR = path.resolve(ROOT_DIR, '..', 'openscad-wasm');
const CLONED_WASM_SRC_DIR  = path.join(SRC_DIR, 'openscad-wasm');
const OUTPUT_DIR     = path.join(ROOT_DIR, 'openscad-wasm-build', 'build');

const ARTIFACTS = [
  'openscad.js',
  'openscad.wasm.js',
  'openscad.wasm',
  'openscad.fonts.js',
];

const CLEANUP_OUTPUT_FILES = [
  'openscad.fonts.d.ts',
  'openscad.wasm.d.ts',
  'openscad.d.ts',
];

const UPDATE_FLAG = process.argv.includes('--update');
const FORCE_REBUILD = !process.argv.includes('--no-rebuild');

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[build-openscad-from-source] ${msg}`);
}

function run(cmd, cwd, env) {
  log(`> ${cmd}  (in ${cwd})`);
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runAllowFailure(cmd, cwd, env) {
  log(`> ${cmd}  (in ${cwd})`);
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return (result.status ?? 1) === 0;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isGitRepo(dirPath) {
  if (!fs.existsSync(path.join(dirPath, '.git'))) {
    return false;
  }

  const result = spawnSync('git rev-parse --is-inside-work-tree', {
    cwd: dirPath,
    shell: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function remoteHasBranch(repo, branch) {
  try {
    const output = execSync(`git ls-remote --heads ${repo} ${branch}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Boolean(output && output.trim().length > 0);
  } catch {
    return false;
  }
}

function resolveRemoteBranch(repo, preferredBranch, fallbackBranch) {
  if (remoteHasBranch(repo, preferredBranch)) {
    return preferredBranch;
  }

  if (fallbackBranch && remoteHasBranch(repo, fallbackBranch)) {
    log(`Preferred branch '${preferredBranch}' not found on ${repo}. Using '${fallbackBranch}' instead.`);
    return fallbackBranch;
  }

  throw new Error(`Could not find branch '${preferredBranch}' or '${fallbackBranch}' on ${repo}`);
}

function resolveWasmSourceDir() {
  const explicitDir = process.env.OPENSCAD_WASM_DIR;
  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    if (!isGitRepo(resolved)) {
      throw new Error(`OPENSCAD_WASM_DIR is not a git repo: ${resolved}`);
    }
    return resolved;
  }

  if (isGitRepo(SIBLING_WASM_SRC_DIR)) {
    return SIBLING_WASM_SRC_DIR;
  }

  return CLONED_WASM_SRC_DIR;
}

function cloneOrUpdate(repo, branch, dest, recursive) {
  const recurseFlag = recursive ? '--recurse-submodules' : '';
  if (fs.existsSync(dest)) {
    if (!isGitRepo(dest)) {
      throw new Error(`Path exists but is not a git repo: ${dest}. Remove it and re-run.`);
    }

    if (UPDATE_FLAG) {
      log(`Updating existing clone at ${dest}`);
      run(`git fetch origin`, dest);
      run(`git checkout ${branch}`, dest);
      run(`git pull --ff-only origin ${branch}`, dest);
      if (recursive) {
        run(`git submodule update --init --recursive`, dest);
      }
    } else {
      log(`Skipping clone — directory already exists: ${dest}  (use --update to pull latest)`);
    }
  } else {
    log(`Cloning ${repo} (branch: ${branch}) → ${dest}`);
    run(
      `git -c core.autocrlf=false clone ${recurseFlag} --branch ${branch} --single-branch ${repo} "${dest}"`,
      SRC_DIR,
    );
  }
}

function getOriginUrl(repoDir) {
  try {
    return execSync('git config --get remote.origin.url', {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function ensureRepoRemoteAndBranch(repoDir, expectedRepo, branch, recursive) {
  const currentOrigin = getOriginUrl(repoDir);
  if (!currentOrigin) {
    throw new Error(`Could not determine origin remote for ${repoDir}`);
  }

  if (currentOrigin !== expectedRepo) {
    log(`Switching origin remote for ${repoDir}`);
    log(`  from: ${currentOrigin}`);
    log(`  to:   ${expectedRepo}`);
    run(`git remote set-url origin ${expectedRepo}`, repoDir);
  }

  run(`git fetch origin ${branch}`, repoDir);

  if (!runAllowFailure(`git checkout ${branch}`, repoDir)) {
    if (!runAllowFailure(`git checkout -B ${branch} origin/${branch}`, repoDir)) {
      run(`git checkout -B ${branch} FETCH_HEAD`, repoDir);
    }
  }

  if (UPDATE_FLAG) {
    run(`git pull --ff-only origin ${branch}`, repoDir);
  }

  if (recursive) {
    run(`git submodule update --init --recursive`, repoDir);
  }
}

function clearWasmBuildStamps(wasmSourceDir) {
  const rootEntries = fs.readdirSync(wasmSourceDir, { withFileTypes: true });
  const stampFiles = rootEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) =>
      (name.startsWith('.image') || name.startsWith('.base-image')) &&
      name.endsWith('.make')
    );

  for (const file of stampFiles) {
    const fullPath = path.join(wasmSourceDir, file);
    fs.rmSync(fullPath, { force: true });
    log(`Removed build stamp: ${file}`);
  }
}

function parseSemver(version) {
  const match = `${version ?? ''}`.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function getRuntimeLockedTypeScriptVersion(wasmSourceDir) {
  const lockPath = path.join(wasmSourceDir, 'runtime', 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return lock?.packages?.['node_modules/typescript']?.version
      ?? lock?.dependencies?.typescript?.version
      ?? null;
  } catch {
    return null;
  }
}

function ensureRuntimeTsconfigCompatibility(wasmSourceDir) {
  const tsconfigPath = path.join(wasmSourceDir, 'runtime', 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return;
  }

  const lockedTsVersion = getRuntimeLockedTypeScriptVersion(wasmSourceDir);
  const semver = parseSemver(lockedTsVersion);
  const isPreNode16Ts = semver
    ? semver.major < 4 || (semver.major === 4 && semver.minor < 7)
    : false;

  if (!isPreNode16Ts) {
    return;
  }

  let tsconfig;
  try {
    tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  } catch {
    log(`Could not parse runtime tsconfig at ${tsconfigPath}; skipping compatibility patch.`);
    return;
  }

  const compilerOptions = tsconfig.compilerOptions ?? {};
  const needsPatch = compilerOptions.module === 'node16'
    || compilerOptions.moduleResolution === 'node16';

  if (!needsPatch) {
    return;
  }

  log(
    `Applying runtime TypeScript compatibility patch (locked typescript ${lockedTsVersion}): node16 -> node12 in runtime/tsconfig.json`
  );
  compilerOptions.module = compilerOptions.module === 'node16'
    ? 'node12'
    : compilerOptions.module;
  compilerOptions.moduleResolution = compilerOptions.moduleResolution === 'node16'
    ? 'node12'
    : compilerOptions.moduleResolution;
  tsconfig.compilerOptions = compilerOptions;

  fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

log('=== Build OpenSCAD-wasm from source ===');

// 1. Ensure the top-level source directory exists.
ensureDir(SRC_DIR);

// 2. Resolve openscad-wasm source: prefer local sibling repo for iteration,
//    fallback to a cloned copy under build-src.
const wasmSourceDir = resolveWasmSourceDir();
if (wasmSourceDir === CLONED_WASM_SRC_DIR) {
  const openscadWasmBranch = resolveRemoteBranch(
    OPENSCAD_WASM_REPO,
    OPENSCAD_WASM_BRANCH,
    OPENSCAD_WASM_BRANCH_FALLBACK,
  );
  cloneOrUpdate(OPENSCAD_WASM_REPO, openscadWasmBranch, wasmSourceDir, false);
} else {
  log(`Using local openscad-wasm source: ${wasmSourceDir}`);
}

// 3. Ensure openscad fork exists at libs/openscad for the wasm build.
const openscadLibsDir = path.join(wasmSourceDir, 'libs', 'openscad');
ensureDir(path.join(wasmSourceDir, 'libs'));
if (!fs.existsSync(openscadLibsDir)) {
  cloneOrUpdate(OPENSCAD_REPO, OPENSCAD_BRANCH, openscadLibsDir, true);
} else if (isGitRepo(openscadLibsDir)) {
  ensureRepoRemoteAndBranch(openscadLibsDir, OPENSCAD_REPO, OPENSCAD_BRANCH, true);
} else {
  throw new Error(`Path exists but is not a git repo: ${openscadLibsDir}. Remove it and re-run.`);
}

// 4. Build.
if (FORCE_REBUILD) {
  log('Forcing full wasm image rebuild to pick up local OpenSCAD source changes...');
  clearWasmBuildStamps(wasmSourceDir);
}

// 4b. Work around openscad-wasm runtime lockfiles that pin older TypeScript
//     versions which do not support module/moduleResolution = node16.
ensureRuntimeTsconfigCompatibility(wasmSourceDir);

log('Running make wasm …  (this can take a long time — Docker must be running)');
run('make wasm', wasmSourceDir);

// 5. Copy artifacts to openscad-wasm-build/build/.
log(`Copying artifacts to ${OUTPUT_DIR}`);
ensureDir(OUTPUT_DIR);
const wasmBuildDir = path.join(wasmSourceDir, 'build');

for (const file of CLEANUP_OUTPUT_FILES) {
  const staleFile = path.join(OUTPUT_DIR, file);
  if (fs.existsSync(staleFile)) {
    fs.rmSync(staleFile, { force: true });
    log(`  removed stale ${file}`);
  }
}

let copiedCount = 0;
for (const file of ARTIFACTS) {
  const src  = path.join(wasmBuildDir, file);
  const dest = path.join(OUTPUT_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    log(`  copied ${file}`);
    copiedCount++;
  } else {
    log(`  (not found, skipping) ${file}`);
  }
}

if (copiedCount === 0) {
  console.error('[build-openscad-from-source] ERROR: No artifacts were copied — did the build succeed?');
  process.exit(1);
}

// 6. Write a version stamp so the downloader skips the GitHub fetch when the
//    local build is already present.
const versionFile = path.join(ROOT_DIR, 'openscad-wasm-build', 'version.json');
const stamp = {
  version: 'local-build',
  builtAt: new Date().toISOString(),
  source: {
    openscadWasm: wasmSourceDir,
    openscad: `${OPENSCAD_REPO}#${OPENSCAD_BRANCH}`,
  },
};
fs.writeFileSync(versionFile, JSON.stringify(stamp, null, 2) + '\n');
log(`Wrote ${versionFile}`);

log('=== Done ===');
