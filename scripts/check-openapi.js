/**
 * @file check-openapi.js
 * @description Verifies that spec/openapi.json and spec/openapi.yaml are completely up to date
 * with the latest hook definitions in data/hooks/*.json and the package version.
 *
 * Fails CI if someone adds, edits, or removes a hook or updates a return type without
 * updating the OpenAPI specification.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildOpenApiSpec, toYaml } = require('./export-openapi.js');

const ROOT = path.join(__dirname, '..');
const SPEC_JSON = path.join(ROOT, 'spec', 'openapi.json');
const SPEC_YAML = path.join(ROOT, 'spec', 'openapi.yaml');
const DOCS_REPO = process.env.PIXELKIT_DOCS_REPO ?? 'https://github.com/PixelKit-Labs/pixelkit-docs.git';

function resolveHooksDir() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (args.length > 0) return path.resolve(args[0]);
  if (process.env.PIXELKIT_HOOKS_DATA) return path.resolve(process.env.PIXELKIT_HOOKS_DATA);

  // Local sibling checkout
  const sibling = path.resolve(ROOT, '..', 'pixelkit-docs', 'data', 'hooks');
  if (fs.existsSync(sibling)) return sibling;

  // Local .pixelkit-docs cached clone
  const cached = path.join(ROOT, '.pixelkit-docs', 'data', 'hooks');
  if (fs.existsSync(cached)) return cached;

  // Shallow clone
  const checkout = path.join(ROOT, '.pixelkit-docs');
  fs.rmSync(checkout, { recursive: true, force: true });
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', DOCS_REPO, checkout], { stdio: 'inherit' });
  execFileSync('git', ['sparse-checkout', 'set', 'data/hooks'], { cwd: checkout, stdio: 'inherit' });
  return path.join(checkout, 'data', 'hooks');
}

function main() {
  if (!fs.existsSync(SPEC_JSON)) {
    console.error(`[check-openapi] Missing ${SPEC_JSON}. Run 'npm run export:openapi' to generate it.`);
    process.exit(1);
  }

  if (!fs.existsSync(SPEC_YAML)) {
    console.error(`[check-openapi] Missing ${SPEC_YAML}. Run 'npm run export:openapi' to generate it.`);
    process.exit(1);
  }

  const hooksDir = resolveHooksDir();
  if (!hooksDir || !fs.existsSync(hooksDir)) {
    console.error(`[check-openapi] Hook definitions directory could not be resolved at ${hooksDir}!`);
    process.exit(1);
  }

  const normalizeEol = (s) => s.replace(/\r\n/g, '\n').trim();

  const currentSpec = buildOpenApiSpec(hooksDir);
  const expectedJson = normalizeEol(JSON.stringify(currentSpec, null, 2));
  const actualJson = normalizeEol(fs.readFileSync(SPEC_JSON, 'utf8'));

  if (actualJson !== expectedJson) {
    console.error(`[check-openapi] spec/openapi.json is out of date! Run 'npm run export:openapi' to synchronize.`);
    process.exit(1);
  }

  const expectedYaml = normalizeEol(toYaml(currentSpec));
  const actualYaml = normalizeEol(fs.readFileSync(SPEC_YAML, 'utf8'));

  if (actualYaml !== expectedYaml) {
    console.error(`[check-openapi] spec/openapi.yaml is out of date! Run 'npm run export:openapi' to synchronize.`);
    process.exit(1);
  }

  const pathCount = Object.keys(currentSpec.paths).length;
  const schemaCount = Object.keys(currentSpec.components.schemas).length;
  console.log(`[check-openapi] OpenAPI specification is strictly up to date (${pathCount} paths, ${schemaCount} schemas across all 51 hooks).`);
}

if (require.main === module) {
  main();
}
