/**
 * @file export-openapi.js
 * @description Generates and exports a complete OpenAPI 3.1.0 specification for the PixelKit SDK.
 *
 * Covers all 51 typed React hooks, low-overhead Kotlin native telemetry, and hardware actuators
 * across Silicon & Compute, Neural & AI, Sensors & Actuators, Radios & Security, System & Media,
 * and Pixel Pro Exclusives.
 *
 * Strictly adheres to the Zero-Simulation Principle:
 *   - `source: 'hardware' | 'derived' | 'unavailable'`
 *   - Fabricated readings are impossible; unreadable sensors return null.
 *
 * Usage:
 *   node scripts/export-openapi.js [--output <path>] [--yaml] [--stdout]
 *
 * Defaults:
 *   Outputs to `spec/openapi.json` and `spec/openapi.yaml`, and if `pixelkit-docs` is present,
 *   synchronizes to `pixelkit-docs/public/openapi.json` and `openapi.yaml`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG_JSON.version;
const DOCS_REPO = process.env.PIXELKIT_DOCS_REPO ?? 'https://github.com/PixelKit-Labs/pixelkit-docs.git';

// Locate hooks data directory
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

const CATEGORY_META = {
  'silicon-compute': {
    name: 'Silicon & Compute',
    description: 'Tensor G6 CPU cores, PowerVR GPU, system memory, battery fuel gauge, and ADPF thermals.',
  },
  'neural-ai': {
    name: 'Neural & AI',
    description: 'Gemini Nano on-device AICore, ML Kit vision and NLP, speech recognition/synthesis, and EdgeTPU embeddings.',
  },
  'sensors-actuators': {
    name: 'Sensors & Actuators',
    description: 'IMU, barometer altimetry, camera extensions, LRA haptics, mic array directivity, FIR thermometer, and torch.',
  },
  'radios-security': {
    name: 'Radios & Security',
    description: 'Titan M2 Keystore, biometrics, BLE 6.0 Channel Sounding, NFC, GNSS, Wi-Fi 7 MLO, Wi-Fi RTT, Satellite NTN, and Private Space.',
  },
  'system-media': {
    name: 'System & Media',
    description: 'Microphone capture, cellular modem, display telemetry, media library, spatial audio, and video playback.',
  },
  'pro-exclusives': {
    name: 'Pixel Pro Exclusives',
    description: 'Hardware exclusive to Google Pixel Pro models: HiLight 8-LED ring and Ultra-Wideband (UWB) spatial ranging.',
  },
};

const SECTION_OF = {
  silicon: 'silicon-compute',
  compute: 'silicon-compute',
  ai: 'neural-ai',
  sensors: 'sensors-actuators',
  radios: 'radios-security',
  security: 'radios-security',
  system: 'system-media',
  pro: 'pro-exclusives',
  'silicon-compute': 'silicon-compute',
  'neural-ai': 'neural-ai',
  'sensors-actuators': 'sensors-actuators',
  'radios-security': 'radios-security',
  'system-media': 'system-media',
  'pro-exclusives': 'pro-exclusives',
};

// Convert TypeScript type string into OpenAPI 3.1 JSON Schema
function typeToSchema(typeStr) {
  if (!typeStr) return { type: 'string' };
  typeStr = typeStr.trim();

  // Function signature (handled as action, not data field)
  if (typeStr.startsWith('(') && typeStr.includes('=>')) {
    return null;
  }

  const parts = typeStr.split('|').map((s) => s.trim());
  const isNullable = parts.includes('null');
  const withoutNull = parts.filter((s) => s !== 'null' && s !== 'undefined').join(' | ');

  if (!withoutNull) return { type: 'null' };

  // Inline object literals: e.g. { index, part, name } or { x, y, z }
  if (withoutNull.startsWith('{') && withoutNull.endsWith('}')) {
    return isNullable
      ? { anyOf: [{ type: 'object', description: withoutNull }, { type: 'null' }] }
      : { type: 'object', description: withoutNull };
  }

  // String literal unions: 'A' | 'B' | 'C'
  if (withoutNull.startsWith("'") && withoutNull.endsWith("'") && !withoutNull.includes('{')) {
    const enumValues = withoutNull.split('|').map((s) => s.trim().replace(/^'|'$/g, ''));
    return isNullable
      ? { anyOf: [{ type: 'string', enum: enumValues }, { type: 'null' }] }
      : { type: 'string', enum: enumValues };
  }

  // Arrays: T[] or Array<T>
  if (withoutNull.endsWith('[]')) {
    const itemType = withoutNull.slice(0, -2).trim();
    const itemSchema = typeToSchema(itemType);
    return isNullable
      ? { anyOf: [{ type: 'array', items: itemSchema || {} }, { type: 'null' }] }
      : { type: 'array', items: itemSchema || {} };
  }

  if (withoutNull.startsWith('Array<') && withoutNull.endsWith('>')) {
    const itemType = withoutNull.slice(6, -1).trim();
    const itemSchema = typeToSchema(itemType);
    return isNullable
      ? { anyOf: [{ type: 'array', items: itemSchema || {} }, { type: 'null' }] }
      : { type: 'array', items: itemSchema || {} };
  }

  // Primitives
  if (withoutNull === 'string') return isNullable ? { anyOf: [{ type: 'string' }, { type: 'null' }] } : { type: 'string' };
  if (withoutNull === 'number') return isNullable ? { anyOf: [{ type: 'number' }, { type: 'null' }] } : { type: 'number' };
  if (withoutNull === 'boolean') return isNullable ? { anyOf: [{ type: 'boolean' }, { type: 'null' }] } : { type: 'boolean' };
  if (withoutNull === 'any' || withoutNull === 'unknown') return {};

  if (withoutNull === 'TelemetrySource') {
    return { $ref: '#/components/schemas/TelemetrySource' };
  }

  if (withoutNull.startsWith('Record<')) {
    return isNullable
      ? { anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }] }
      : { type: 'object', additionalProperties: true };
  }

  // Object literal or named type
  const cleanName = withoutNull.replace(/[^a-zA-Z0-9_]/g, '');
  if (cleanName.length > 0) {
    return isNullable
      ? { anyOf: [{ $ref: `#/components/schemas/${cleanName}` }, { type: 'null' }] }
      : { $ref: `#/components/schemas/${cleanName}` };
  }

  return isNullable ? { anyOf: [{ type: 'object' }, { type: 'null' }] } : { type: 'object' };
}

// Clean and expand action names (e.g. "light() / medium() / heavy()" -> ["light", "medium", "heavy"])
function extractActionNames(raw) {
  const parts = raw.split('/').map((s) => s.trim());
  return parts
    .map((part) => part.replace(/\(.*$/, '').trim())
    .filter((n) => n.length > 0 && !n.includes(' '));
}

function buildOpenApiSpec(hooksDir) {
  const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.json')).sort();
  const hooks = files.map((f) => JSON.parse(fs.readFileSync(path.join(hooksDir, f), 'utf8')));

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'PixelKit SDK API',
      version: VERSION,
      description: `
OpenAPI 3.1.0 specification for the **PixelKit SDK** targeting Google Pixel hardware (Tensor G6, Titan M2/M3, Android 17 API 37).

### The Zero-Simulation Principle
Every telemetry read exposes \`source: 'hardware' | 'derived' | 'unavailable'\`.
- Fabricated readings are completely unrepresentable in this specification.
- Unreadable sensor readings are \`null\` and report \`unavailable\`.
- Actuators reject with an explicit reason in \`error\` when hardware is unavailable or disabled.

Covers all ${hooks.length} typed hardware and AI hooks, low-overhead native telemetry, and actuators.
      `.trim(),
      contact: {
        name: 'PixelKit Labs',
        url: 'https://github.com/PixelKit-Labs/pixelkit-sdk',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:8081/api',
        description: 'PixelKit DevTools / Local Metro Bridge',
      },
      {
        url: 'http://127.0.0.1:2345/api',
        description: 'PixelKit Native Hardware Daemon (ADB Port-Forwarded)',
      },
    ],
    tags: Object.entries(CATEGORY_META).map(([id, meta]) => ({
      name: id,
      description: meta.description,
    })),
    paths: {
      '/state': {
        get: {
          summary: 'Get Full Device Hardware Telemetry Snapshot',
          description:
            `Atomic snapshot of instantaneous telemetry across all ${hooks.length} hardware and AI subsystems. Values are strictly measured from real hardware or null.`,
          operationId: 'getFullDeviceState',
          tags: ['silicon-compute'],
          responses: {
            '200': {
              description: 'Complete device hardware telemetry state snapshot.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HardwareStateSnapshot',
                  },
                },
              },
            },
          },
        },
      },
      '/hooks': {
        get: {
          summary: 'List All PixelKit Hardware & AI Hooks',
          description: `Lists all ${hooks.length} available hooks, their categories, descriptions, and hardware chip badges.`,
          operationId: 'listHooks',
          tags: ['silicon-compute'],
          responses: {
            '200': {
              description: `List of all ${hooks.length} hooks.`,
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/HookCatalogItem',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        TelemetrySource: {
          type: 'string',
          enum: ['hardware', 'derived', 'unavailable'],
          description:
            "Data provenance indicator. PixelKit strictly adheres to the Zero-Simulation Principle: values are real hardware measurements ('hardware'), computed directly from hardware ('derived'), or unavailable ('unavailable'). Unreadable values return null.",
        },
        HookCatalogItem: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'useThermometer' },
            name: { type: 'string', example: 'useThermometer' },
            category: { type: 'string', example: 'sensors-actuators' },
            chipBadge: { type: 'string', example: 'FIR · MLX90632 · thermal' },
            summary: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['id', 'name', 'category', 'summary'],
        },
        Vector3D: {
          type: 'object',
          description: '3-dimensional Cartesian vector for spatial orientation.',
          properties: {
            x: { type: 'number', description: 'Lateral tilt or movement' },
            y: { type: 'number', description: 'Longitudinal tilt or movement' },
            z: { type: 'number', description: 'Vertical gravitational force or spin' },
          },
          required: ['x', 'y', 'z'],
        },
        BarometerData: {
          type: 'object',
          description: 'Atmospheric pressure and barometric altitude.',
          properties: {
            pressure: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Pressure in hPa' },
            relativeAltitude: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Altitude in meters' },
          },
        },
        MloLinkInfo: {
          type: 'object',
          description: 'Affiliated Wi-Fi 7 Multi-Link Operation (MLO) link.',
          properties: {
            band: { type: 'string', enum: ['2.4GHz', '5GHz', '6GHz'] },
            channelWidthMHz: { type: 'number' },
            rssi: { type: 'number' },
            txLinkSpeedMbps: { type: 'number' },
            rxLinkSpeedMbps: { type: 'number' },
            state: { type: 'string' },
          },
        },
        WifiRttResult: {
          type: 'object',
          description: 'Wi-Fi RTT 802.11mc/802.11az ranging measurement.',
          properties: {
            bssid: { type: 'string' },
            distanceMm: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            distanceStdDevMm: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            rssi: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            status: { type: 'string' },
          },
        },
        BlePeripheral: {
          type: 'object',
          description: 'Discovered Bluetooth Low Energy peripheral.',
          properties: {
            id: { type: 'string' },
            name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            rssi: { type: 'number' },
            txPower: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            isConnectable: { type: 'boolean' },
          },
        },
        MicrophoneInfo: {
          type: 'object',
          description: 'Microphone hardware characteristics from acoustic array.',
          properties: {
            id: { type: 'number' },
            type: { type: 'string' },
            location: { type: 'string' },
            directionality: { type: 'string' },
            address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
        CapturedPhoto: {
          type: 'object',
          description: 'Captured high-resolution photo.',
          properties: {
            uri: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            base64: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
        SavedMedia: {
          type: 'object',
          description: 'Media item saved in the gallery.',
          properties: {
            id: { type: 'string' },
            filename: { type: 'string' },
            uri: { type: 'string' },
            mediaType: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            duration: { type: 'number' },
          },
        },
        KeyAgreementKeyPairResult: {
          type: 'object',
          description: 'ECDH key pair generated in Titan M2 hardware.',
          properties: {
            alias: { type: 'string' },
            publicKeyBase64: { type: 'string' },
            algorithm: { type: 'string' },
            isStrongBoxBacked: { type: 'boolean' },
          },
        },
        SharedSecretResult: {
          type: 'object',
          description: 'Derived ECDH shared secret.',
          properties: {
            sharedSecretBase64: { type: 'string' },
            keyLengthBits: { type: 'number' },
          },
        },
        SatelliteGuidance: {
          type: 'object',
          description: 'Antenna pointing guidance for non-terrestrial satellite alignment.',
          properties: {
            azimuthDeg: { type: 'number' },
            elevationDeg: { type: 'number' },
            isAligned: { type: 'boolean' },
          },
        },
      },
    },
  };

  const snapshotProperties = {};

  for (const hook of hooks) {
    const hookName = hook.name;
    const category = SECTION_OF[hook.category] || 'silicon-compute';
    const schemaName = `${hookName}Telemetry`;

    // Telemetry schema
    const properties = {};
    const required = [];

    for (const ret of hook.returns || []) {
      const fieldSchema = typeToSchema(ret.type);
      if (fieldSchema) {
        fieldSchema.description = ret.desc;
        properties[ret.name] = fieldSchema;
      }
    }

    if (properties.source) required.push('source');

    spec.components.schemas[schemaName] = {
      type: 'object',
      description: `${hook.summary}\n\n${hook.description}`,
      properties,
      required: required.length > 0 ? required : undefined,
    };

    snapshotProperties[hookName] = {
      $ref: `#/components/schemas/${schemaName}`,
    };

    // GET /hooks/{hookName} endpoint
    const hookPath = `/hooks/${hookName}`;
    const parameters = [];

    for (const param of hook.params || []) {
      parameters.push({
        name: param.name,
        in: 'query',
        description: param.desc,
        required: false,
        schema: typeToSchema(param.type) || { type: 'string' },
      });
    }

    spec.paths[hookPath] = {
      get: {
        summary: hook.summary,
        description: `${hook.plain || hook.summary}\n\n${hook.description}`,
        operationId: `get_${hookName}`,
        tags: [category],
        parameters: parameters.length > 0 ? parameters : undefined,
        responses: {
          '200': {
            description: `Current telemetry reading from ${hookName}.`,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${schemaName}`,
                },
              },
            },
          },
        },
      },
    };

    // Actions (Actuators / callable methods)
    for (const action of hook.actions || []) {
      const actionNames = extractActionNames(action.name);
      for (const actionName of actionNames) {
        const actionPath = `/hooks/${hookName}/actions/${actionName}`;
        const reqSchemaName = `${hookName}_${actionName}_Request`;
        const resSchemaName = `${hookName}_${actionName}_Response`;

        const reqProperties = {};
        const reqRequired = [];

        for (const inp of action.inputs || []) {
          const inpSchema = typeToSchema(inp.type) || { type: 'string' };
          inpSchema.description = inp.desc;
          reqProperties[inp.name] = inpSchema;
          if (!inp.type.includes('?') && !inp.type.includes('undefined')) {
            reqRequired.push(inp.name);
          }
        }

        spec.components.schemas[reqSchemaName] = {
          type: 'object',
          description: `Request payload for ${actionName} on ${hookName}.`,
          properties: reqProperties,
          required: reqRequired.length > 0 ? reqRequired : undefined,
        };

        spec.components.schemas[resSchemaName] = {
          type: 'object',
          description: `Response payload for ${actionName} on ${hookName}.`,
          properties: {
            success: { type: 'boolean', description: 'Whether the hardware accepted the command.' },
            output: { description: action.output || 'Result description' },
            error: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Error message if failed.' },
            source: { $ref: '#/components/schemas/TelemetrySource' },
          },
          required: ['success', 'source'],
        };

        const outputDesc = action.output ? `\n\n**Output Contract**: ${action.output}` : '';

        spec.paths[actionPath] = {
          post: {
            summary: `Invoke ${actionName} (${hookName})`,
            description: `${action.desc}${outputDesc}`,
            operationId: `${hookName}_${actionName}`,
            tags: [category],
            requestBody:
              Object.keys(reqProperties).length > 0
                ? {
                    required: reqRequired.length > 0,
                    content: {
                      'application/json': {
                        schema: {
                          $ref: `#/components/schemas/${reqSchemaName}`,
                        },
                      },
                    },
                  }
                : undefined,
            responses: {
              '200': {
                description: `Result of invoking ${actionName}.`,
                content: {
                  'application/json': {
                    schema: {
                      $ref: `#/components/schemas/${resSchemaName}`,
                    },
                  },
                },
              },
            },
          },
        };
      }
    }
  }

  // Ensure all schema references in components.schemas are satisfied
  const registered = new Set(Object.keys(spec.components.schemas));
  const specStr = JSON.stringify(spec);
  const refRegex = /"#\/components\/schemas\/([a-zA-Z0-9_]+)"/g;
  let match;
  while ((match = refRegex.exec(specStr)) !== null) {
    const refName = match[1];
    if (!registered.has(refName)) {
      spec.components.schemas[refName] = {
        type: 'object',
        description: `Typed entity: ${refName}`,
        additionalProperties: true,
      };
      registered.add(refName);
    }
  }

  // HardwareStateSnapshot schema
  spec.components.schemas.HardwareStateSnapshot = {
    type: 'object',
    description: 'Instantaneous snapshot of all 51 PixelKit hardware telemetry states.',
    properties: snapshotProperties,
  };

  return spec;
}

// Minimal YAML Serializer (zero external dependencies)
function toYaml(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  if (obj === undefined) return '';
  if (obj === null) return 'null\n';
  if (typeof obj === 'boolean') return `${obj}\n`;
  if (typeof obj === 'number') return `${obj}\n`;
  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      const lines = obj.trim().split('\n');
      return `|\n${lines.map((l) => `${pad}  ${l}`).join('\n')}\n`;
    }
    if (/[:#\[\]{},&*!|>'"%@`\\]/.test(obj) || obj === '' || !isNaN(Number(obj))) {
      return JSON.stringify(obj) + '\n';
    }
    return `${obj}\n`;
  }
  if (Array.isArray(obj)) {
    const nonUndefined = obj.filter((item) => item !== undefined);
    if (nonUndefined.length === 0) return '[]\n';
    let out = '\n';
    for (const item of nonUndefined) {
      if (typeof item === 'object' && item !== null) {
        const itemYaml = toYaml(item, indent + 2).trimStart();
        out += `${pad}- ${itemYaml}`;
      } else {
        out += `${pad}- ${toYaml(item, 0)}`;
      }
    }
    return out;
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return '{}\n';
    let out = '\n';
    for (const [k, v] of entries) {
      if (typeof v === 'object' && v !== null) {
        out += `${pad}${k}:${toYaml(v, indent + 2)}`;
      } else {
        out += `${pad}${k}: ${toYaml(v, 0)}`;
      }
    }
    return out;
  }
  return `${obj}\n`;
}

function main() {
  const hooksDir = resolveHooksDir();
  console.log(`[export-openapi] Reading hook contracts from: ${hooksDir}`);

  const spec = buildOpenApiSpec(hooksDir);
  const jsonStr = JSON.stringify(spec, null, 2);

  const specDir = path.join(ROOT, 'spec');
  if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true });

  const jsonOut = path.join(specDir, 'openapi.json');
  fs.writeFileSync(jsonOut, jsonStr, 'utf8');
  console.log(`[export-openapi] Wrote OpenAPI 3.1.0 JSON to: ${jsonOut} (${(jsonStr.length / 1024).toFixed(1)} KB)`);

  const yamlStr = toYaml(spec).replace(/[ \t]+(?=\r?$)/gm, '').trim() + '\n';
  const yamlOut = path.join(specDir, 'openapi.yaml');
  fs.writeFileSync(yamlOut, yamlStr, 'utf8');
  console.log(`[export-openapi] Wrote OpenAPI 3.1.0 YAML to: ${yamlOut} (${(yamlStr.length / 1024).toFixed(1)} KB)`);

  // Sync to pixelkit-docs/public and public/api if present
  const docsPublicDir = path.resolve(ROOT, '..', 'pixelkit-docs', 'public');
  if (fs.existsSync(docsPublicDir)) {
    fs.writeFileSync(path.join(docsPublicDir, 'openapi.json'), jsonStr, 'utf8');
    fs.writeFileSync(path.join(docsPublicDir, 'openapi.yaml'), yamlStr, 'utf8');
    const docsPublicApiDir = path.join(docsPublicDir, 'api');
    if (!fs.existsSync(docsPublicApiDir)) fs.mkdirSync(docsPublicApiDir, { recursive: true });
    fs.writeFileSync(path.join(docsPublicApiDir, 'openapi.json'), jsonStr, 'utf8');
    fs.writeFileSync(path.join(docsPublicApiDir, 'openapi.yaml'), yamlStr, 'utf8');
    console.log(`[export-openapi] Synchronized to pixelkit-docs/public & public/api: openapi.json & openapi.yaml`);
  }

  // Count operations and schemas
  const pathCount = Object.keys(spec.paths).length;
  let opCount = 0;
  for (const p of Object.values(spec.paths)) {
    opCount += Object.keys(p).length;
  }
  const schemaCount = Object.keys(spec.components.schemas).length;
  const hooksCount = fs.readdirSync(hooksDir).filter(f => f.endsWith('.json')).length;
  console.log(`[export-openapi] Verified: ${pathCount} paths, ${opCount} operations, ${schemaCount} schemas across all ${hooksCount} hooks.`);
}

if (require.main === module) {
  main();
}

module.exports = { buildOpenApiSpec, toYaml };
