---
name: android-wireless-adb
description: >-
  Interactive AI-guided setup wizard for wireless ADB debugging on Android 11+ and Google Pixel devices.
  Use whenever the user wants to connect their phone wirelessly, set up wireless debugging, pair a device via Wi-Fi code,
  troubleshoot adb pair/connect, or configure port forwarding for MCP and Expo without a USB cable.
---

# Android Wireless ADB Setup Wizard (`android-wireless-adb`)

This skill equips Antigravity to act as an **interactive, step-by-step connection wizard** that guides the user through discovering, pairing, connecting, and verifying wireless ADB debugging with an Android phone (specifically Google Pixel hardware running Android 11 through Android 17).

---

## The Wizard Protocol (Agent Runbook)

When activated, you must guide the user through the following 5 phases in order. Do not overwhelm the user with all phases at once; guide them interactively turn-by-turn.

```
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 1: Host Network Check                                   │
  │ Check host PC Wi-Fi IP and verify local ADB server state      │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 2: Phone Navigation Instructions                        │
  │ Instruct user how to open Wireless Debugging & Pairing popup  │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 3: Interactive Pairing & Connection                     │
  │ Receive Pairing Code & Ports -> Run adb pair & adb connect    │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 4: Port Forwarding & Service Setup                      │
  │ Auto-configure adb reverse for MCP (:8080) and Metro (:8081)  │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 5: Verification & Readiness                             │
  │ Run adb devices -l and confirm online status                  │
  └───────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Host Network & ADB Diagnostic

Before instructing the user, check the host PC's Wi-Fi network address and ensure the ADB server is running:

1. **Check Host IP Address**:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object IPAddress, InterfaceAlias
   ```
2. **Start ADB & Check Existing Connections**:
   ```powershell
   adb start-server ; adb devices -l
   ```
   *Note the host's subnet (e.g. `10.254.235.x` or `192.168.1.x`) so you can inform the user what network prefix their phone should be on.*

---

### Phase 2: User Onboarding Guidance

Give the user clear, minimal, step-by-step instructions to navigate to the pairing screen on their phone:

1. **Verify Wi-Fi**: Phone must be on the **same Wi-Fi network** as the PC.
2. **Unlock Developer Options** *(if not already visible)*:
   - *Settings* → *About phone* → scroll to bottom → tap **Build number 7 times**.
3. **Open Wireless Debugging**:
   - *Settings* → *System* → *Developer options*.
   - Scroll to the **Debugging** section.
   - Tap directly on the **words** **"Wireless debugging"** (not just the toggle switch).
   - Toggle **Use wireless debugging** to **ON**.
   - Check *"Always allow on this network"* and tap **Allow**.
4. **Open Pairing Dialog**:
   - Tap **"Pair device with pairing code"**.
   - Tell the user to keep this popup open on the phone.

---

### Phase 3: Pairing & Connecting

Explain the critical Android architecture rule:
> **Crucial Android Rule**: Android uses **TWO DIFFERENT PORTS**:
> 1. **Pairing Port** (shown on the temporary pairing popup dialog) — used only once with `adb pair`.
> 2. **Connection Port** (shown on the main Wireless Debugging screen under "IP address & Port") — used with `adb connect`.

#### Turn Execution:
Ask the user for the **6-digit pairing code** and the **IP & Pairing Port** shown on the popup.

Once received, execute:

1. **Pairing Command**:
   ```powershell
   # Pass pairing code to stdin
   "PAIRING_CODE" | adb pair <ip>:<pairing_port>
   ```
   *Expected output: `Successfully paired to <ip>:<pairing_port>`*

2. **Connection Command**:
   Instruct the user to dismiss the pairing popup and check the **IP address & Port** on the main Wireless Debugging screen, then run:
   ```powershell
   adb connect <ip>:<connect_port>
   ```
   *Expected output: `connected to <ip>:<connect_port>`*

3. **Verify Device State**:
   ```powershell
   adb devices -l
   ```
   *Must show `<ip>:<connect_port> device` (not `offline` or `unauthorized`).*

---

### Phase 4: Port Forwarding & Service Setup

Immediately after establishing the connection, execute reverse port forwarding so local development tools and MCP work seamlessly without manual IP configuration:

1. **Reverse MCP Server Port (Delta Mobile)**:
   ```powershell
   adb reverse tcp:8080 tcp:8080
   ```
   *Enables desktop Claude Desktop, Cursor, and Antigravity to connect to `http://localhost:8080/mcp`.*

2. **Reverse Metro Bundler Port (Expo / React Native)**:
   ```powershell
   adb reverse tcp:8081 tcp:8081
   ```
   *Enables the phone to load JS bundles from Metro on the PC.*

---

### Phase 5: Reconnection & Persistent IP Troubleshooting

Keep this reference ready if the user encounters common Wi-Fi ADB issues:

| Problem | Cause | Wizard Fix |
| :--- | :--- | :--- |
| **`actively refused it (10061)`** | Connecting to old port or wrong IP | Ports randomize on every Wi-Fi reconnect. Have user re-open Wireless Debugging and check current port. |
| **Device shows `offline`** | Wi-Fi sleep or network interface reset | Toggle Wireless Debugging OFF and back ON on the phone, then run `adb connect <ip>:<port>`. |
| **Device shows `unauthorized`** | RSA key prompt not accepted | Screen was locked during pair. Unlock phone, revoke authorizations in Developer Options, and re-pair. |
| **Fixed Port Setup (Optional)** | Wanting persistent port 5555 | If temporarily connected via USB, run `adb tcpip 5555`. Then phone stays listening on port 5555 until reboot! |
