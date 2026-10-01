/**
 * @file useMediaLibrary.ts
 * @description Saving captures to the device gallery and reading them back, on `expo-media-library`.
 *
 * Without this, a photo from `useCamera().takePicture()` or a clip from `startRecording()` lives in
 * the app's cache directory and disappears when the system reclaims it. `save()` promotes a capture
 * into the user's own media store, where it survives and is visible to every other app.
 *
 * SDK 57 uses the class API (`Asset.create`, `Album.create`, `Query`) rather than the deprecated
 * `createAssetAsync` helpers, which now throw at runtime.
 *
 * Permission matters here: Android 13 and later grant read access per media type, and the user can
 * choose to share only selected items, so a granted permission does not mean access to everything.
 */

import { useCallback, useEffect, useState } from 'react';
import { Album, Asset, AssetField, Query, requestPermissionsAsync, getPermissionsAsync } from 'expo-media-library';
import { logError, logEvent, traced, tracedSafe, type TelemetrySource } from '../core/observability';

const MODULE = 'useMediaLibrary';

/** A saved item, flattened from the async Asset accessors into something renderable. */
export interface SavedMedia {
  id: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  /** Seconds for video; null for stills. */
  durationSeconds: number | null;
  creationTime: number | null;
}

async function describe(asset: Asset): Promise<SavedMedia> {
  const [uri, filename, width, height, duration, creationTime] = await Promise.all([
    asset.getUri(),
    asset.getFilename(),
    asset.getWidth(),
    asset.getHeight(),
    asset.getDuration().catch(() => null),
    asset.getCreationTime().catch(() => null),
  ]);
  return {
    id: asset.id,
    uri,
    filename,
    width,
    height,
    durationSeconds: duration ?? null,
    creationTime: creationTime ?? null,
  };
}

export function useMediaLibrary() {
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [writePermissionGranted, setWritePermissionGranted] = useState<boolean>(false);
  /** Android 13+: the user may have shared only some items rather than the whole library. */
  const [hasLimitedAccess, setHasLimitedAccess] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [recent, setRecent] = useState<SavedMedia[]>([]);
  const [lastSaved, setLastSaved] = useState<SavedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = permissionGranted || writePermissionGranted ? 'hardware' : 'unavailable';

  useEffect(() => {
    void tracedSafe(MODULE, 'readPermissionStatus', () => getPermissionsAsync(false), null)
      .then(p => {
        if (!p) { setError('Could not check media library read permission'); return; }
        setPermissionGranted(p.granted);
        setHasLimitedAccess(p.accessPrivileges === 'limited');
      });
    void tracedSafe(MODULE, 'writePermissionStatus', () => getPermissionsAsync(true), null)
      .then(p => {
        if (p) setWritePermissionGranted(p.granted);
        else setError('Could not check media library write permission');
      });
  }, []);

  /** Asks for library access. Pass true when the app only needs to write. */
  const requestPermission = useCallback(async (writeOnly = false): Promise<boolean> => {
    try {
      const p = await traced(MODULE, 'requestPermission', () => requestPermissionsAsync(writeOnly), { writeOnly });
      if (writeOnly) {
        setWritePermissionGranted(p.granted);
      } else {
        setPermissionGranted(p.granted);
        setHasLimitedAccess(p.accessPrivileges === 'limited');
      }
      logEvent(MODULE, 'permission', { granted: p.granted, privileges: p.accessPrivileges, writeOnly });
      return p.granted;
    } catch (e) {
      setError(logError(MODULE, 'permissionFailed', e).message);
      return false;
    }
  }, []);

  /**
   * Copies a local file into the user's media store, optionally into a named album.
   * Takes the URI that `useCamera` or `useAudio` returned.
   */
  const save = useCallback(async (localUri: string, albumName?: string): Promise<SavedMedia | null> => {
    setError(null);
    setIsSaving(true);
    try {
      if (!writePermissionGranted) {
        const granted = await requestPermission(true);
        if (!granted) {
          setError('Media library write permission denied');
          return null;
        }
      }
      let album: Album | undefined;
      if (albumName) {
        if (!permissionGranted && !await requestPermission(false)) {
          setError('Media library read permission is required to select an album');
          return null;
        }
        album = (await traced(MODULE, 'findAlbum', () => Album.get(albumName))) ?? undefined;
      }
      const asset = await traced(MODULE, 'createAsset', () => Asset.create(localUri, album));
      if (albumName && !album) {
        try {
          await traced(MODULE, 'createAlbum', () => Album.create(albumName, [asset], false));
        } catch (e) {
          setError(`Saved media but could not create album: ${logError(MODULE, 'albumFailed', e).message}`);
        }
      }
      const described = await traced(MODULE, 'describeSavedAsset', () => describe(asset));
      setLastSaved(described);
      logEvent(MODULE, 'saved', { filename: described.filename, album: albumName ?? null });
      return described;
    } catch (e) {
      setError(logError(MODULE, 'saveFailed', e).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [permissionGranted, writePermissionGranted, requestPermission]);

  /** Reads the newest items, most recent first. */
  const loadRecent = useCallback(async (limit = 20): Promise<SavedMedia[]> => {
    setError(null);
    setIsLoading(true);
    try {
      if (!permissionGranted) {
        const granted = await requestPermission(false);
        if (!granted) return [];
      }
      // Newest first: creationTime descending.
      const assets = await new Query()
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(limit)
        .exe();
      const described = await Promise.all(assets.map(describe));
      setRecent(described);
      logEvent(MODULE, 'recent loaded', { count: described.length });
      return described;
    } catch (e: any) {
      setError(e?.message ?? 'Could not read the media library');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [permissionGranted, requestPermission]);

  /** Removes an asset from the device. The system may show its own confirmation. */
  const remove = useCallback(async (media: SavedMedia): Promise<boolean> => {
    try {
      await new Asset(media.id).delete();
      setRecent(prev => prev.filter(m => m.id !== media.id));
      logEvent(MODULE, 'deleted', { id: media.id });
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete that item');
      return false;
    }
  }, []);

  return {
    /** Whether library access has been granted. */
    permissionGranted,
    /** Android 13+: true when the user shared only selected items. */
    hasLimitedAccess,
    isSaving,
    isLoading,
    /** Newest items from the last `loadRecent()` call. */
    recent,
    /** The item most recently written by this app. */
    lastSaved,
    error,
    source,

    requestPermission,
    save,
    loadRecent,
    remove,
  };
}
