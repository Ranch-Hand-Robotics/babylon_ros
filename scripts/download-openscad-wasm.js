#!/usr/bin/env node

/**
 * Download the latest openscad-wasm release from GitHub
 * This script fetches prebuilt WASM binaries from:
 * https://github.com/Ranch-Hand-Robotics/openscad-wasm/releases
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const OWNER = 'Ranch-Hand-Robotics';
const REPO = 'openscad-wasm';
const OUTPUT_DIR = path.join(__dirname, '..', 'openscad-wasm-build');
const TMP_ZIP_PATH = path.join(OUTPUT_DIR, 'collateral.zip');

// Files to download from the release
const FILES_TO_DOWNLOAD = [
  'openscad.js',
  'openscad.wasm.js',
  'openscad.wasm',
  'openscad.fonts.js'
];

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'babylon_ros-downloader' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(outputPath);
    https.get(url, { headers: { 'User-Agent': 'babylon_ros-downloader' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findZipEntryPath(entries, fileName) {
  const normalized = fileName.toLowerCase();
  const candidates = entries
    .map((entry) => entry.entryName)
    .filter((entryName) => {
      const lower = entryName.toLowerCase();
      return (
        lower === normalized ||
        lower.endsWith(`/${normalized}`) ||
        lower.endsWith(`/build/${normalized}`) ||
        lower.endsWith(`/dist/${normalized}`)
      );
    });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.length - b.length);
  return candidates[0];
}

function extractCollateralZip(zipPath, buildDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  if (!entries || entries.length === 0) {
    throw new Error('Collateral ZIP is empty');
  }

  ensureDir(buildDir);
  const extracted = [];

  for (const file of FILES_TO_DOWNLOAD) {
    const entryPath = findZipEntryPath(entries, file);
    if (!entryPath) {
      throw new Error(`Required runtime file not found in collateral ZIP: ${file}`);
    }

    const entry = zip.getEntry(entryPath);
    if (!entry) {
      throw new Error(`Failed to resolve ZIP entry for ${file}`);
    }

    const outputPath = path.join(buildDir, file);
    const data = entry.getData();
    fs.writeFileSync(outputPath, data);
    const size = fs.statSync(outputPath).size;

    if (size <= 0) {
      throw new Error(`Extracted ${file} is empty`);
    }

    extracted.push({ file, size, source: entryPath });
  }

  return extracted;
}

async function main() {
  try {
    // Skip download if all required files already exist
    const buildDir = path.join(OUTPUT_DIR, 'build');
    const allFilesPresent = FILES_TO_DOWNLOAD.every(f =>
      fs.existsSync(path.join(buildDir, f))
    );

    if (allFilesPresent) {
      const versionFile = path.join(OUTPUT_DIR, 'version.json');
      const version = fs.existsSync(versionFile)
        ? JSON.parse(fs.readFileSync(versionFile, 'utf8')).version
        : 'unknown';
      console.log(`openscad-wasm already present (${version}). Skipping download.`);
      console.log(`Run "npm run download-openscad" directly to force a re-download.`);
      return;
    }

    console.log(`Fetching latest release from ${OWNER}/${REPO}...`);

    // Get latest release metadata
    const release = await fetchJSON(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
    );

    if (!release || !release.tag_name) {
      throw new Error(`No latest release found for ${OWNER}/${REPO}`);
    }

    const version = release.tag_name;

    console.log(`Latest version: ${version}`);
    console.log(`Release: ${release.name}`);
    console.log(`URL: ${release.html_url}`);

    // Find collateral ZIP asset
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const collateralZipAsset = assets.find((asset) =>
      typeof asset?.name === 'string' && /openscad-wasm-collateral-.*\.zip$/i.test(asset.name)
    );

    if (!collateralZipAsset?.browser_download_url) {
      throw new Error('Could not find collateral ZIP asset in latest release');
    }

    console.log(`Collateral asset: ${collateralZipAsset.name}`);
    console.log(`\nDownloading and extracting artifacts...`);

    ensureDir(OUTPUT_DIR);

    console.log(`  Downloading ${collateralZipAsset.name}...`);    await downloadFile(collateralZipAsset.browser_download_url, TMP_ZIP_PATH);

    const zipSize = fs.statSync(TMP_ZIP_PATH).size;
    if (zipSize <= 0) {
      throw new Error('Downloaded collateral ZIP is empty');
    }

    console.log(`    ✓ ${collateralZipAsset.name} (${zipSize} bytes)`);

    const extracted = extractCollateralZip(TMP_ZIP_PATH, buildDir);
    for (const item of extracted) {
      console.log(`    ✓ ${item.file} (${item.size} bytes) ← ${item.source}`);
    }

    // Cleanup temporary ZIP
    if (fs.existsSync(TMP_ZIP_PATH)) {
      fs.unlinkSync(TMP_ZIP_PATH);
    }

    // Write version info
    const versionFile = path.join(OUTPUT_DIR, 'version.json');
    fs.writeFileSync(versionFile, JSON.stringify({
      version,
      downloadedAt: new Date().toISOString(),
      releaseUrl: release.html_url,
      repo: `${OWNER}/${REPO}`,
      collateralAsset: collateralZipAsset.name
    }, null, 2));

    console.log(`\n✓ Download complete!`);
    console.log(`  Artifacts saved to: ${OUTPUT_DIR}`);
    console.log(`  Version: ${version}`);

  } catch (error) {
    if (fs.existsSync(TMP_ZIP_PATH)) {
      try {
        fs.unlinkSync(TMP_ZIP_PATH);
      } catch {
        // Best-effort cleanup only
      }
    }

    console.error(`\n✗ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
