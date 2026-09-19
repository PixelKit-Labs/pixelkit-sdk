/** Apply the locally built recognition hook to the sibling's installed SDK for USB validation.
 * Development override only: npm install replaces it; release consumption needs a published SDK.
 * Run npm run build -w @pixelkit-labs/sdk first. Records exact hashes, never credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const consumer = path.resolve(root, '../delta-mobile/node_modules/@pixelkit-labs/sdk');
const files = ['build/ai/useSpeechAI.js', 'build/ai/useSpeechAI.d.ts', 'src/ai/useSpeechAI.ts'];
const evidence = { date: new Date().toISOString(), sdkVersion: JSON.parse(fs.readFileSync(path.join(root, 'packages/sdk/package.json'))).version, consumer, files: [] };
for (const file of files) {
  const source = fs.readFileSync(path.join(root, 'packages/sdk', file));
  const target = path.join(consumer, file);
  if (!fs.existsSync(target)) throw new Error('Expected installed SDK file missing: ' + target);
  fs.writeFileSync(target, source);
  evidence.files.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
}
fs.writeFileSync(path.join(root, 'docs/harness-review/speech-sdk-device-override.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('Applied local recognition hook; recorded exact source/build hashes.');
