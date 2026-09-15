#!/usr/bin/env node
/**
 * PixelKit E2E Test Runner using Google ARTEMIS.
 *
 * Usage:
 *   npm run test:e2e
 *   node scripts/run-artemis-e2e.js [recipe_name] [--profile flash|pro]
 */

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RECIPES = {
  silicon: path.join(__dirname, '../test/artemis/recipes/01-silicon-telemetry.md'),
  actuators: path.join(__dirname, '../test/artemis/recipes/02-actuators-and-haptics.md'),
  sensors: path.join(__dirname, '../test/artemis/recipes/03-sensors-and-capture.md'),
  ai: path.join(__dirname, '../test/artemis/recipes/04-ai-gemini-nano.md'),
  full: path.join(__dirname, '../test/artemis/recipes/05-full-sanity-suite.md'),
  hardware: path.join(__dirname, '../test/artemis/recipes/06-pixel-11-pro-hardware.md'),
  pixel11: path.join(__dirname, '../test/artemis/recipes/06-pixel-11-pro-hardware.md'),
  nextgen: path.join(__dirname, '../test/artemis/recipes/07-next-gen-hardware.md'),
  expansion: path.join(__dirname, '../test/artemis/recipes/07-next-gen-hardware.md'),
  agents: path.join(__dirname, '../test/artemis/recipes/08-cloud-agents-and-adk.md'),
  adk: path.join(__dirname, '../test/artemis/recipes/08-cloud-agents-and-adk.md'),
  live: path.join(__dirname, '../test/artemis/recipes/08-cloud-agents-and-adk.md'),
};

function resolveArtemisBinary() {
  // 1. Check local bin in user profile
  const localBin = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.local/bin',
    process.platform === 'win32' ? 'artemis.exe' : 'artemis'
  );
  if (fs.existsSync(localBin)) return localBin;

  // 2. Check sibling artemis directory venv
  const siblingVenv = path.join(
    __dirname,
    '../../artemis/.venv',
    process.platform === 'win32' ? 'Scripts/artemis.exe' : 'bin/artemis'
  );
  if (fs.existsSync(siblingVenv)) return siblingVenv;

  // 3. Fallback to PATH
  return process.platform === 'win32' ? 'artemis.exe' : 'artemis';
}

function checkAdbDevices() {
  try {
    const result = spawnSync('adb', ['devices'], { encoding: 'utf-8' });
    if (result.error) return null;
    const lines = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('List of devices'));
    return lines.map((l) => l.split(/\s+/)[0]);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  let targetRecipe = 'silicon';
  let profile = 'flash';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile' && args[i + 1]) {
      profile = args[++i];
    } else if (arg === '--pro') {
      profile = 'pro';
    } else if (arg === '--flash') {
      profile = 'flash';
    } else if (RECIPES[arg.toLowerCase()]) {
      targetRecipe = arg.toLowerCase();
    } else if (!arg.startsWith('-')) {
      targetRecipe = arg;
    }
  }

  const recipePath = RECIPES[targetRecipe] || path.resolve(targetRecipe);
  if (!fs.existsSync(recipePath)) {
    console.error(`❌ Recipe file not found: ${recipePath}`);
    console.log(`Available recipes: ${Object.keys(RECIPES).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`  PixelKit E2E Test Runner (ARTEMIS)`);
  console.log(`======================================================`);
  console.log(`  Recipe:  ${path.basename(recipePath)}`);
  console.log(`  Profile: ${profile.toUpperCase()}`);

  const devices = checkAdbDevices();
  if (!devices || devices.length === 0) {
    console.warn(`\n⚠️  No connected Android devices or emulators detected.`);
    console.warn(`   Please connect your Pixel device via USB (with USB Debugging enabled)`);
    console.warn(`   or start an Android emulator, then re-run.\n`);
    process.exit(1);
  }
  console.log(`  Devices: ${devices.join(', ')}\n`);

  const artemisBin = resolveArtemisBinary();
  const recipeContent = fs.readFileSync(recipePath, 'utf-8');

  // Build the prompt from the recipe instructions
  const prompt = `Execute the PixelKit verification plan described below on the connected device:\n\n${recipeContent}`;

  const runner = spawn(artemisBin, ['run', prompt, '--profile', profile], {
    stdio: 'inherit',
    env: process.env,
  });

  runner.on('close', (code) => {
    if (code === 0) {
      console.log(`\n✔ Artemis verification completed successfully!`);
    } else {
      console.error(`\n✖ Artemis verification exited with code ${code}`);
    }
    process.exit(code);
  });
}

main();
