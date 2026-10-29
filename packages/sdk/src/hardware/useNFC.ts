/**
 * @file useNFC.ts
 * @description Real NFC: adapter state and NDEF tag reading and writing through reader mode.
 *
 * Nothing here is simulated. `startReader` enables `NfcAdapter` reader mode on the foreground
 * Activity; every tag that enters the field arrives as an event carrying its identifier, supported
 * technologies, capacity, writability and decoded NDEF records. `writeText` queues a text record
 * that is written to the next tag presented.
 *
 * Two constraints come from the platform and are surfaced rather than hidden. Reader mode needs a
 * foreground Activity, so it stops when the app is backgrounded and must be started again on
 * resume. And a tag is only readable while it is physically in the field, so a read either happens
 * within that window or reports why it did not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PixelNative, { type NdefRecordInfo, type NfcTagEvent } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { NFCTag } from '../core/types';

const MODULE = 'useNFC';

/** A tag read from the field, with its records decoded. */
export interface ScannedTag extends NFCTag {
  techs: string[];
  records: NdefRecordInfo[];
  maxSize: number | null;
  writable: boolean | null;
  ndefType: string | null;
}

/** Picks the most useful single string from a tag's records for a one-line display. */
function summarisePayload(records: NdefRecordInfo[]): string {
  if (records.length === 0) return '';
  const withUri = records.find(r => r.uri);
  if (withUri?.uri) return withUri.uri;
  const withText = records.find(r => r.payload.length > 0);
  return withText?.payload ?? '';
}

export function useNFC() {
  const [isReading, setIsReading] = useState<boolean>(false);
  const [lastScannedTag, setLastScannedTag] = useState<ScannedTag | null>(null);
  const [tagCount, setTagCount] = useState<number>(0);
  const [pendingWrite, setPendingWrite] = useState<string | null>(null);
  const [lastWriteOk, setLastWriteOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  const nativeInfo = PixelNative?.getRadioInfo?.()?.nfc;
  const isSupported = nativeInfo?.supported ?? false;
  const isEnabled = nativeInfo?.enabled ?? false;
  const observeModeSupported = nativeInfo?.observeModeSupported ?? false;
  const antennaState = nativeInfo?.antennaState ?? 'UNAVAILABLE';

  /** Everything this hook reports comes from the adapter or from a physical tag. */
  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; NFC unavailable', undefined, 'warn');
      return;
    }
    logEvent(MODULE, 'adapter', { supported: isSupported, enabled: isEnabled, antennaState, observeModeSupported });

    const tagSub = PixelNative.addListener('onNfcTag', (e: NfcTagEvent) => {
      const tag: ScannedTag = {
        id: e.id,
        payload: summarisePayload(e.records),
        tech: e.techs.includes('Ndef') ? 'Ndef' : (e.techs[0] ?? null),
        timestamp: e.timestamp,
        techs: e.techs,
        records: e.records,
        maxSize: e.maxSize,
        writable: e.writable,
        ndefType: e.type,
      };
      setLastScannedTag(tag);
      setTagCount(n => n + 1);
      if (e.written) {
        setLastWriteOk(true);
        setPendingWrite(null);
      } else if (e.writeError) {
        setLastWriteOk(false);
        setPendingWrite(null);
        setError(e.writeError);
        logEvent(MODULE, 'write failed', { message: e.writeError }, 'error');
      }
      if (startedAt.current != null) {
        recordMetric(MODULE, 'timeToTagMs', Date.now() - startedAt.current, 'hardware');
      }
      logEvent(MODULE, 'tag read', {
        id: e.id,
        techs: e.techs.join(','),
        records: e.records.length,
        bytes: e.maxSize,
        writable: e.writable,
        written: e.written,
      });
    });

    const errSub = PixelNative.addListener('onNfcError', (e) => {
      setError(e.message);
      logEvent(MODULE, 'tag error', { id: e.id, message: e.message }, 'error');
    });

    return () => {
      tagSub.remove();
      errSub.remove();
      // Reader mode is bound to the Activity; release it when the screen goes away.
      PixelNative?.stopNfcReader?.().catch(() => undefined);
    };
    // Adapter values are read per render; subscribe once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Enables reader mode. Refuses, with a reason, when the radio is missing or off. */
  const startReader = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!PixelNative?.startNfcReader) {
      setError('NFC reader is not available in this build');
      return false;
    }
    if (!isSupported) {
      setError('This device has no NFC radio');
      logEvent(MODULE, 'reader refused', { reason: 'unsupported' }, 'warn');
      return false;
    }
    if (!isEnabled) {
      setError('NFC is switched off in system settings');
      logEvent(MODULE, 'reader refused', { reason: 'disabled' }, 'warn');
      return false;
    }
    try {
      const res = await traced(MODULE, 'startReader', () => PixelNative!.startNfcReader());
      if (!res.success) {
        setError(res.error ?? 'Could not start the reader');
        return false;
      }
      startedAt.current = Date.now();
      setIsReading(true);
      return true;
    } catch (e) {
      setError(logError(MODULE, 'startReader failed', e).message);
      return false;
    }
  }, [isEnabled, isSupported]);

  const stopReader = useCallback(async (): Promise<void> => {
    try {
      const res = await PixelNative?.stopNfcReader?.();
      if (res && !res.success) setError(res.error ?? 'Could not stop the reader');
    } catch (e) {
      logError(MODULE, 'stopReader failed', e);
    } finally {
      startedAt.current = null;
      setIsReading(false);
      setPendingWrite(null);
      logEvent(MODULE, 'reader stopped', { tagsRead: tagCount });
    }
  }, [tagCount]);

  /**
   * Queues a text record for the next tag presented. The reader must be running; the outcome
   * arrives with the tag event as `lastWriteOk`.
   */
  const writeText = useCallback(async (text: string): Promise<boolean> => {
    setError(null);
    setLastWriteOk(null);
    if (!PixelNative?.writeNdefText) {
      setError('NFC writing is not available in this build');
      return false;
    }
    if (!isReading) {
      setError('Start the reader before queuing a write');
      return false;
    }
    try {
      const res = await traced(MODULE, 'queueWrite', () => PixelNative!.writeNdefText(text), { chars: text.length });
      if (!res.success) {
        setError(res.error ?? 'Could not queue the write');
        return false;
      }
      setPendingWrite(text);
      logEvent(MODULE, 'write queued', { bytes: res.queuedBytes ?? null });
      return true;
    } catch (e) {
      setError(logError(MODULE, 'queueWrite failed', e).message);
      return false;
    }
  }, [isReading]);

  const clearTag = useCallback(() => {
    setLastScannedTag(null);
    setLastWriteOk(null);
  }, []);

  return {
    /** Whether the device has an NFC radio. */
    isSupported,
    /** Whether NFC is switched on in system settings. */
    isEnabled,
    /** Whether Android 15 Observe Mode is available. */
    observeModeSupported,
    /** Current antenna state. */
    antennaState,
    /** Whether reader mode is running. Stops when the app leaves the foreground. */
    isReading,
    /** The last tag read from the field, with decoded NDEF records. */
    lastScannedTag,
    /** How many tags have been read this session. */
    tagCount,
    /** Text waiting to be written to the next tag, or null. */
    pendingWrite,
    /** Whether the last queued write succeeded. Null when none has been attempted. */
    lastWriteOk,
    /** Why the last operation failed. */
    error,
    source,

    startReader,
    stopReader,
    writeText,
    clearTag,
  };
}
