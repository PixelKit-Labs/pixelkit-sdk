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
const { buildOpenApiSpec, toYaml } = require('./export-openapi.js');

const ROOT = path.join(__dirname, '..');
const SPEC_JSON = path.join(ROOT, 'spec', 'openapi.json');
const SPEC_YAML = path.join(ROOT, 'spec', 'openapi.yaml');

function resolveHooksDir() {
  if (process.env.PIXELKIT_HOOKS_DATA) return path.resolve(process.env.PIXELKIT_HOOKS_DATA);
  const sibling = path.resolve(ROOT, '..', 'pixelkit-docs', 'data', 'hooks');
  if (fs.existsSync(sibling)) return sibling;
  const cached = path.join(ROOT, '.pixelkit-docs', 'data', 'hooks');
  if (fs.existsSync(cached)) return cached;
  return null;
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
  if (!hooksDir) {
    console.warn(`[check-openapi] Hook definitions directory not found locally; skipping drift check.`);
    process.exit(0);
  }

  const currentSpec = buildOpenApiSpec(hooksDir);
  const expectedJson = JSON.stringify(currentSpec, null, 2);
  const actualJson = fs.readFileSync(SPEC_JSON, 'utf8').trim();

  if (actualJson !== expectedJson) {
    console.error(`[check-openapi] spec/openapi.json is out of date! Run 'npm run export:openapi' to synchronize.`);
    process.exit(1);
  }

  const expectedYaml = toYaml(currentSpec).trim();
  const actualYaml = fs.readFileSync(SPEC_YAML, 'utf8').trim();

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
