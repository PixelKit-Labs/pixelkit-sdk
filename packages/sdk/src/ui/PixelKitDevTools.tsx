/**
 * @file PixelKitDevTools.tsx
 * @description In-app floating developer HUD for PixelKit.
 *
 * Designed to run strictly in `__DEV__` mode (or when explicitly enabled). Provides a draggable,
 * floating badge that displays real-time frame rates, ADPF thermal throttling levels, Tensor CPU
 * cluster utilization, and memory usage directly on the device screen without opening Logcat or
 * attaching a debugger.
 *
 * @example
 * ```tsx
 * // app/_layout.tsx
 * import { PixelKitDevTools } from '@pixelkit-labs/sdk';
 *
 * export default function RootLayout() {
 *   return (
 *     <>
 *       <Slot />
 *       <PixelKitDevTools />
 *     </>
 *   );
 * }
 * ```
 */

import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCPU } from '../hardware/useCPU';
import { useADPF } from '../hardware/useADPF';
import { useMemory } from '../hardware/useMemory';
import { useHiLight } from '../hardware/useHiLight';

export interface PixelKitDevToolsProps {
  /**
   * Whether DevTools is enabled.
   * Defaults to `__DEV__` in Expo/React Native environments.
   */
  enabled?: boolean;
  /**
   * Initial X/Y screen coordinates for the floating badge.
   * Defaults to top-right of the display: `{ x: 16, y: 64 }`.
   */
  initialPosition?: { x?: number; y?: number };
}

declare const __DEV__: boolean;

/**
 * Outer gate. The hooks live in `DevToolsHud` so toggling `enabled` mounts or unmounts them
 * instead of changing the number of hooks a single component calls.
 */
export function PixelKitDevTools({
  enabled = typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  initialPosition = { x: 16, y: 64 },
}: PixelKitDevToolsProps) {
  if (!enabled) return null;
  return <DevToolsHud initialPosition={initialPosition} />;
}

const NO_VALUE = '—';

function DevToolsHud({ initialPosition }: { initialPosition: { x?: number; y?: number } }) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const cpu = useCPU();
  const adpf = useADPF();
  const memory = useMemory();
  const hilight = useHiLight();

  // Floating draggable coordinates
  const pan = useRef(
    new Animated.ValueXY({
      x: initialPosition.x ?? 16,
      y: initialPosition.y ?? 64,
    })
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        // Only initiate drag if moved more than 4 pixels (distinguishes tap from drag)
        return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          // @ts-ignore animated internals
          x: pan.x._value,
          // @ts-ignore animated internals
          y: pan.y._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  // useADPF reports status 0 ('nominal') before any sample, so a status is only treated as read
  // once a thermal headroom sample exists or the platform reported a non-zero status.
  const hasThermalSample = adpf.thermalHeadroom != null || adpf.thermalStatusCode > 0;
  const thermalStatus = adpf.thermalStatus;
  const thermalColor = !hasThermalSample
    ? '#9E9E9E' // No sample yet: neutral grey
    : thermalStatus === 'nominal'
    ? '#4CAF50' // Normal: Green
    : thermalStatus === 'light'
    ? '#8BC34A' // Light: Light Green
    : thermalStatus === 'moderate'
    ? '#FFC107' // Moderate: Amber
    : thermalStatus === 'severe'
    ? '#FF9800' // Severe: Orange
    : '#F44336'; // Critical: Red

  const thermalLabel = !hasThermalSample
    ? NO_VALUE
    : thermalStatus === 'nominal'
    ? 'NOM'
    : thermalStatus === 'light'
    ? 'LGT'
    : thermalStatus === 'moderate'
    ? 'MOD'
    : thermalStatus === 'severe'
    ? 'SVR'
    : 'CRIT';

  const fpsText = adpf.currentFps != null ? `${Math.round(adpf.currentFps)}` : NO_VALUE;
  const targetHzText = adpf.targetFps != null ? `${adpf.targetFps}` : NO_VALUE;
  const cpuPillText =
    cpu.cpuLoadPercent != null
      ? `${Math.round(cpu.cpuLoadPercent)}%`
      : cpu.appCpuPercent != null
      ? `app ${Math.round(cpu.appCpuPercent)}%`
      : NO_VALUE;
  const hasMemorySample = memory.totalRAMMB > 0;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {!expanded ? (
        // Collapsed Badge: Sleek Floating Pill
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setExpanded(true)}
          style={styles.pill}
        >
          <View style={styles.fpsChip}>
            <Text style={styles.fpsText}>{fpsText} fps</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: thermalColor }]} />
          <Text style={styles.pillText}>{thermalLabel}</Text>
          <Text style={styles.pillSecondary}>{cpuPillText}</Text>
        </TouchableOpacity>
      ) : (
        // Expanded Panel: Detailed Silicon HUD
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>⚡ PixelKit HUD</Text>
              <View style={styles.hwBadge}>
                <Text style={styles.hwBadgeText}>
                  {cpu.source.toUpperCase()}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setExpanded(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* FPS & ADPF Thermal Section */}
          <View style={styles.section}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Display FPS</Text>
              <Text style={styles.metricValue}>
                {fpsText} / {targetHzText} Hz
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Thermal Headroom</Text>
              <Text style={[styles.metricValue, { color: thermalColor }]}>
                {adpf.thermalHeadroom != null
                  ? `${(adpf.thermalHeadroom * 100).toFixed(0)}% (${thermalLabel})`
                  : 'N/A'}
              </Text>
            </View>
          </View>

          {/* Tensor CPU Cluster Telemetry */}
          <View style={styles.section}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>CPU Utilization</Text>
              <Text style={styles.metricValue}>
                {cpu.cpuLoadPercent != null
                  ? `${cpu.cpuLoadPercent}%`
                  : 'N/A'}
              </Text>
            </View>
            {cpu.coreTopology ? (
              <Text style={styles.topologyText} numberOfLines={2}>
                {cpu.coreTopology}
              </Text>
            ) : null}
          </View>

          {/* System Memory Section */}
          <View style={styles.section}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Memory (RAM)</Text>
              <Text style={styles.metricValue}>
                {hasMemorySample ? `${memory.usedRAMMB} / ${memory.totalRAMMB} MB` : NO_VALUE}
              </Text>
            </View>
            <View style={styles.memoryBarContainer}>
              <View
                style={[
                  styles.memoryBarFill,
                  {
                    width: `${Math.min(
                      100,
                      hasMemorySample ? (memory.usedRAMMB / memory.totalRAMMB) * 100 : 0
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Actions Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => memory.purgeCaches()}
            >
              <Text style={styles.actionBtnText}>Purge GC</Text>
            </TouchableOpacity>

            {hilight.availability === 'hardware' ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnAccent]}
                onPress={() => hilight.triggerGeminiPulse(2000)}
              >
                <Text style={styles.actionBtnTextAccent}>Pulse HiLight</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2330',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fpsChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 10,
    marginRight: 6,
  },
  fpsText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  pillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    marginRight: 6,
  },
  pillSecondary: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  panel: {
    width: 290,
    backgroundColor: '#131722',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 199, 250, 0.25)',
    padding: 14,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
  },
  hwBadge: {
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.4)',
  },
  hwBadgeText: {
    color: '#A8C7FA',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  section: {
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  topologyText: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  memoryBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  memoryBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnAccent: {
    backgroundColor: 'rgba(168, 199, 250, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168, 199, 250, 0.4)',
  },
  actionBtnTextAccent: {
    color: '#A8C7FA',
    fontSize: 11,
    fontWeight: '600',
  },
});
