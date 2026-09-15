# Recipe 08: Cloud Hardware Agents & Google ADK Diagnostic Teams

## Objective
Verify autonomous multi-turn reasoning loops, Google Agent Development Kit (ADK) integration, and hardware tool execution across Google Pixel hardware:
1. Unified Hardware Tool Registry (`registerHardwareTools`, `runTool`)
2. Autonomous Cloud Agent Loop (`runCloudAgent`, `maxSteps`, `onStep`)
3. Google Agent Development Kit (ADK) Tool Bridge (`createADKTool`, `ADKTool`)
4. Autonomous Multi-Agent Diagnostic Team (`createDiagnosticSpecialists`, `runDiagnosticTeam`)
5. Real-Time Gemini 3.8 Live & Extended Thinking model presets

## Target Application
- App Name: `PixelKit` or `PixelKit Template`
- Package: `com.pixelkit.sdk` (or `com.pixelkit.template`)

---

## Verification Flow

### 1. Hardware Tool Registry Initialization & Execution
- Navigate to **AI Lab** -> **Agents** tab.
- Verify that physical hardware actuators and sensors are registered:
  - `set_torch` (camera-bar flashlight & strobe)
  - `play_haptic` (linear resonant haptic actuator)
  - `set_hilight` (camera-bar LED ring animation)
  - `get_thermal_headroom` (ADPF CPU/GPU headroom)
  - `get_barometer` (ICAO atmospheric pressure & climb rate)
  - `get_thermometer` (MLX90632 FIR non-contact temperature)
  - `set_battery_share` (reverse wireless charging Qi TX)
  - `get_battery_health` (state of health %, cycles, and wattage)
  - `get_wifi7_status` (Wi-Fi 7 MLO multilink bonding)
- Verify that tool invocations adhere to the **Zero-Simulation Principle** (unavailable sensors return `{ ok: false, error: ... }` rather than dummy metrics).

### 2. Autonomous Cloud Agent Multi-Turn Loop (`runCloudAgent`)
- Navigate to **AI Lab** -> **Chat** tab.
- Select `gemini-3.8-flash` or `gemini-3.8-pro` in the active model selector.
- Issue an action-oriented prompt: `"Turn on the flashlight and check my device temperature"`.
- Observe autonomous tool execution:
  - Model emits parallel or sequential function calls (`set_torch`, `get_thermometer`).
  - Tools execute on physical hardware and fold results back into conversation turns.
  - Final synthesis text confirms hardware state without fabricated metrics.
  - Verify that runaway loops are bounded by `maxSteps` (default: 6).

### 3. Google ADK Multi-Agent Hardware Diagnostic Team (`runDiagnosticTeam`)
- Navigate to **AI Lab** -> **Agents** tab.
- Trigger **Run Diagnostic Sweep**:
  - **Silicon Specialist Agent** executes `get_thermal_headroom` and `get_thermometer`.
  - **Battery Specialist Agent** executes `get_battery_health` and checks `set_battery_share`.
  - **Radios Specialist Agent** executes `get_wifi7_status` and `get_barometer`.
- Observe **Lead Diagnostic Coordinator** synthesis:
  - Generates structured `DiagnosticReport`:
    - `verdict`: `healthy` | `warning` | `critical`
    - `summary`: Root cause explanation derived strictly from real telemetry readings.
    - `specialistResults`: Execution audit trail from each specialist.
    - `recommendations`: Actionable remediation steps.

### 4. Gemini 3.8 Live & Extended Thinking Speech Dialogue
- On compatible builds with microphone and speaker permissions:
  - Inspect model preset selector for `gemini-3.8-live` and `gemini-3.8-live-extended-thinking`.
  - Verify background reasoning (`thinkingBudget: 4096`) processes complex queries asynchronously while low-latency speech streams.
  - Test audio barge-in: verify speaker buffer flushes immediately when user speech interrupts model turn.

---

## Logcat & Error Diagnostics
- Filter logcat for `PixelKit:ToolRegistry` and `PixelKit:ADK`.
- Verify no uncaught exceptions during tool execution or parameter schema validation.
