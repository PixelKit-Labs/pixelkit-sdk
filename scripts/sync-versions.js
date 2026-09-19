/**
 * @file sync-versions.js
 * @description Puts every workspace package on the root version.
 *
 * pixelkit pins its native modules by exact version, in dependencies and peerDependencies both:
 * a mismatch publishes a package that cannot resolve its own dependencies. This makes that
 * impossible to forget.
 * dependencies. This makes that impossible to forget.
 *
 * Usage: `node scripts/sync-versions.js` (after editing the root version), or
 *        `node scripts/sync-versions.js 1.2.0` to set it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/** Published npm name -> directory under packages/. They differ: the scope is not a folder. */
const PACKAGES = {
  '@pixelkit-labs/sdk': 'sdk',
  '@pixelkit-labs/native': 'native',
  '@pixelkit-labs/mlkit': 'mlkit',
};
const NAMES = Object.keys(PACKAGES);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

const rootPath = path.join(ROOT, 'package.json');
const root = readJson(rootPath);

const requested = process.argv[2];
if (requested) {
  if (!/^\d+\.\d+\.\d+$/.test(requested)) {
    console.error(`Not a version: ${requested}`);
    process.exit(1);
  }
  root.version = requested;
}
const version = root.version;

for (const name of NAMES) {
  root.dependencies[name] = version;
}
writeJson(rootPath, root);

for (const name of NAMES) {
  const p = path.join(ROOT, 'packages', PACKAGES[name], 'package.json');
  const pkg = readJson(p);
  pkg.version = version;
  // pixelkit pins its native modules exactly, in both dependencies and peerDependencies. Missing
  // the peer block leaves a pin on a version that was never published, and npm then tries to fetch
  // it from the registry instead of using the workspace symlink, so a plain npm install fails 404.
  for (const dep of NAMES) {
    for (const field of ['dependencies', 'peerDependencies']) {
      if (pkg[field] && pkg[field][dep]) pkg[field][dep] = version;
    }
  }
  writeJson(p, pkg);
}

// Workspace lock metadata must agree with the manifests without resolving new dependencies.
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = readJson(lockPath);
  lock.version = version;
  for (const directory of ['', ...Object.values(PACKAGES).map(dir => `packages/${dir}`)]) {
    const entry = lock.packages?.[directory];
    if (!entry) continue;
    entry.version = version;
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const name of NAMES) {
        if (entry[field]?.[name]) entry[field][name] = version;
      }
    }
  }
  writeJson(lockPath, lock);
}

console.log(`version ${version} across the root and ${NAMES.length} packages`);

// Automatically regenerate OpenAPI specification with the updated version
try {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(__dirname, 'export-openapi.js')], { stdio: 'inherit' });
} catch (e) {
  console.warn('[sync-versions] Note: export-openapi could not run automatically:', e.message);
}
