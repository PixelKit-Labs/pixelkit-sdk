/**
 * @file mlkit.ts
 * @description The hooks that require `@pixelkit-labs/mlkit`, behind their own entry point.
 *
 * Expo autolinking scans `node_modules` for `expo-module.config.json`; it does not care whether any
 * JavaScript imports the module. So merely having `@pixelkit-labs/mlkit` installed puts 19 ML Kit
 * artifacts in the APK, applies `-Xskip-metadata-version-check`, and pins every `kotlin-stdlib` in
 * the consuming Gradle build. That cost is triggered by installation, not by imports, which is why
 * these four hooks live behind `@pixelkit-labs/sdk/mlkit` rather than the main entry: a project that only
 * wants telemetry never installs the package, never imports this file, and never pays for it.
 *
 * ```ts
 * import { useCPU } from '@pixelkit-labs/sdk';          // @pixelkit-labs/native only
 * import { useGeminiNano } from '@pixelkit-labs/sdk/mlkit';  // requires @pixelkit-labs/mlkit
 * ```
 */

export { useGeminiNano, buildNanoTurn, NANO_SYSTEM_INSTRUCTION, type NanoRunOptions } from './ai/useGeminiNano';
export { useGenAITasks, type TaskTone } from './ai/useGenAITasks';
export { useNaturalLanguageAI } from './ai/useNaturalLanguageAI';
export { useVisionAI } from './ai/useVisionAI';
export { useEmbeddings, type EmbeddingsTelemetry, computeCosineSimilarity } from './ai/useEmbeddings';
