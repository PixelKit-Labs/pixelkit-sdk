import type { PluggedSource } from '@pixelkit-labs/native';

/** Charger attachment, not instantaneous current flow. Null means neither source answered. */
export function connectedToExternalPower(
  pluggedSource: PluggedSource | null,
  expoState: boolean | null,
): boolean | null {
  if (pluggedSource !== null) return pluggedSource !== 'NONE';
  return expoState;
}
