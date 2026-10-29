/**
 * @file useAppFunctions.ts
 * @description Android 16+ (API 36) AppFunctions state and an in-process function registry. The service
 * probe (`serviceFound`, `serviceName`) reads the Android `app_function` system service; the functions
 * listed and executed here live in this hook and are callable through `executeFunction`, they are not
 * registered with the system service or visible to Gemini. Nothing is simulated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PixelNative, { type AppFunctionsInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';
import { nativeAppFunctionError } from '../core/appFunctionResult';

const MODULE = 'useAppFunctions';

export interface AppFunctionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required?: boolean;
}

export interface AppFunctionSchema {
  id: string;
  name: string;
  category: 'device_state' | 'hardware' | 'telemetry' | 'actuator' | 'custom';
  description: string;
  parameters: AppFunctionParameter[];
  returns: string;
  enabledByDefault?: boolean;
}

export interface AppFunctionExecutionResult {
  success: boolean;
  functionId: string;
  data?: any;
  error?: string;
  executionTimeMs: number;
}

export interface AppFunctionsState {
  /** Whether the device OS supports Android AppFunctions (API 36+ / Android 16 QPR & Android 17) */
  isSupported: boolean;
  /** Whether the android.app.appfunctions.IAppFunctionManager system service is active */
  serviceFound: boolean;
  /** Android platform API level reported by the device */
  apiLevel: number | null;
  /** System service name ('app_function') */
  serviceName: string | null;
  /** All registered AppFunction schemas available to Gemini, agents, or local invocation */
  functions: AppFunctionSchema[];
  /** Latest execution or system error */
  error: string | null;
  /** Telemetry provenance */
  source: TelemetrySource;
  /** Manually re-check system service status */
  refresh: () => void;
  /** Executes a registered AppFunction or built-in hardware action */
  executeFunction: (functionId: string, params?: Record<string, any>) => Promise<AppFunctionExecutionResult>;
  /** Registers a custom AppFunction handler accessible to on-device agents */
  registerFunction: (schema: AppFunctionSchema, handler: (params: Record<string, any>) => Promise<any> | any) => void;
  /** Unregisters an AppFunction handler */
  unregisterFunction: (functionId: string) => boolean;
}

/**
 * Built-in hardware function schemas. Each id is handled by `executeFunction` in this hook; the list
 * lives in this hook's memory and is not registered with the Android `app_function` system service.
 */
const BUILTIN_SCHEMAS: AppFunctionSchema[] = [
  {
    id: 'check_phone_thermals',
    name: 'Check Phone Thermals',
    category: 'hardware',
    description: 'Reads PowerManager thermal status and headroom and this app\'s CPU percentage and core count.',
    parameters: [],
    returns: '{ thermalStatus: number, thermalHeadroom: number | null, appCpuPercent: number | null, coreCount: number }',
    enabledByDefault: true,
  },
  {
    id: 'purge_memory_cache',
    name: 'Purge Memory Cache',
    category: 'hardware',
    description: 'Requests a garbage collection pass in this app and returns the memory snapshot taken afterwards. It does not report how much was freed.',
    parameters: [],
    returns: 'MemoryInfo: { totalBytes, availableBytes, lowMemoryThresholdBytes, isLowMemory, appJavaHeapUsedBytes, appJavaHeapMaxBytes, appNativeHeapBytes, memoryClassMB, largeMemoryClassMB }',
    enabledByDefault: true,
  },
  {
    id: 'get_device_silicon_info',
    name: 'Get Device Silicon Info',
    category: 'hardware',
    description: 'Returns SoC identifiers from android.os.Build and the GPU renderer and vendor strings.',
    parameters: [],
    returns: '{ soc: string | null, socManufacturer: string | null, hardware: string, gpuRenderer: string | null, gpuVendor: string | null }',
    enabledByDefault: true,
  },
];

/**
 * Hook exposing Android 16/17 AppFunctions architecture.
 *
 * @example
 * ```typescript
 * const { isSupported, serviceFound, functions, executeFunction, registerFunction } = useAppFunctions();
 *
 * // Execute a built-in hardware action
 * const res = await executeFunction('check_phone_thermals');
 * ```
 */
export function useAppFunctions(): AppFunctionsState {
  const [serviceInfo, setServiceInfo] = useState<AppFunctionsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom function handlers registry
  const customHandlers = useRef<Map<string, (params: Record<string, any>) => Promise<any> | any>>(new Map());
  const [customSchemas, setCustomSchemas] = useState<AppFunctionSchema[]>([]);

  const refresh = useCallback(() => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; AppFunctions unavailable', undefined, 'warn');
      return;
    }
    try {
      const info = PixelNative.getAppFunctionsInfo();
      setServiceInfo(info);
      recordMetric(MODULE, 'serviceFound', info.serviceFound ? 1 : 0, info.serviceFound ? 'hardware' : 'unavailable');
      logEvent(MODULE, 'appfunctions queried', {
        isSupported: info.isSupported,
        serviceFound: info.serviceFound,
        apiLevel: info.apiLevel,
      });
    } catch (e: any) {
      const msg = e?.message ?? 'getAppFunctionsInfo failed';
      setError(msg);
      logEvent(MODULE, 'query error', { message: msg }, 'error');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const registerFunction = useCallback((
    schema: AppFunctionSchema,
    handler: (params: Record<string, any>) => Promise<any> | any,
  ) => {
    customHandlers.current.set(schema.id, handler);
    setCustomSchemas((prev) => [...prev.filter((s) => s.id !== schema.id), schema]);
    logEvent(MODULE, `registered function: ${schema.id}`, { category: schema.category });
  }, []);

  const unregisterFunction = useCallback((functionId: string): boolean => {
    const had = customHandlers.current.delete(functionId);
    if (had) {
      setCustomSchemas((prev) => prev.filter((s) => s.id !== functionId));
      logEvent(MODULE, `unregistered function: ${functionId}`);
    }
    return had;
  }, []);

  const executeFunction = useCallback(async (
    functionId: string,
    params: Record<string, any> = {},
  ): Promise<AppFunctionExecutionResult> => {
    const start = Date.now();

    // 1. Check custom registered handlers
    const customHandler = customHandlers.current.get(functionId);
    if (customHandler) {
      try {
        const res = await customHandler(params);
        const duration = Date.now() - start;
        logEvent(MODULE, `executed custom function: ${functionId}`, { durationMs: duration });
        return { success: true, functionId, data: res, executionTimeMs: duration };
      } catch (e: any) {
        const duration = Date.now() - start;
        const msg = e?.message ?? 'Custom AppFunction failed';
        logEvent(MODULE, `error executing custom function: ${functionId}`, { error: msg }, 'error');
        return { success: false, functionId, error: msg, executionTimeMs: duration };
      }
    }

    // 2. Built-in hardware handlers
    if (!PixelNative) {
      return {
        success: false,
        functionId,
        error: 'PixelNative module not available on this device',
        executionTimeMs: Date.now() - start,
      };
    }

    try {
      let resultData: any;
      if (functionId === 'check_phone_thermals') {
        const thermal = PixelNative.getThermal();
        const cpu = PixelNative.getCpuLoad();
        resultData = {
          thermalStatus: thermal.thermalStatus,
          thermalHeadroom: thermal.thermalHeadroom,
          appCpuPercent: cpu.appCpuPercent,
          coreCount: cpu.cores.length,
        };
      } else if (functionId === 'purge_memory_cache') {
        resultData = PixelNative.requestGc();
      } else if (functionId === 'get_device_silicon_info') {
        const soc = PixelNative.getSocInfo();
        const gpu = PixelNative.getGpuInfo();
        resultData = {
          soc: soc.socModel,
          socManufacturer: soc.socManufacturer,
          hardware: soc.hardware,
          gpuRenderer: gpu.renderer,
          gpuVendor: gpu.vendor,
        };
      } else {
        // Ids listed by PixelNative.getAppFunctions(). The module rejects any other id with
        // E_APP_FUNCTION_UNKNOWN, which the catch below returns as the error.
        const nativeResult = await PixelNative.executeAppFunction(functionId, params);
        const nativeError = nativeAppFunctionError(functionId, nativeResult);
        if (nativeError) {
          setError(nativeError);
          logEvent(MODULE, `native function failed: ${functionId}`, { error: nativeError }, 'error');
          return { success: false, functionId, data: nativeResult, error: nativeError, executionTimeMs: Date.now() - start };
        }
        resultData = nativeResult;
      }

      const duration = Date.now() - start;
      recordMetric(MODULE, `exec_${functionId}`, duration, 'hardware');
      return { success: true, functionId, data: resultData, executionTimeMs: duration };
    } catch (e: any) {
      const duration = Date.now() - start;
      const msg = e?.message ?? 'Hardware execution failed';
      setError(msg);
      return { success: false, functionId, error: msg, executionTimeMs: duration };
    }
  }, []);

  const allFunctions = useMemo(() => {
    return [...BUILTIN_SCHEMAS, ...customSchemas];
  }, [customSchemas]);

  const source: TelemetrySource =
    PixelNative && serviceInfo?.serviceFound ? 'hardware' : 'unavailable';

  return {
    isSupported: serviceInfo?.isSupported ?? false,
    serviceFound: serviceInfo?.serviceFound ?? false,
    apiLevel: serviceInfo?.apiLevel ?? null,
    serviceName: serviceInfo?.serviceName ?? null,
    functions: allFunctions,
    error,
    source,
    refresh,
    executeFunction,
    registerFunction,
    unregisterFunction,
  };
}
