---
name: android-usb-adb
description: >-
  Interactive AI-guided setup wizard and diagnostic runbook for USB-connected Android devices and Google Pixel phones.
  Use whenever connecting a phone via USB-C cable, resolving 'unauthorized' or 'authorizing' ADB states,
  configuring reverse port forwarding (:8080 for MCP, :8081 for Metro), setting up USB tethering,
  or switching from USB to wireless ADB mode via 'adb tcpip 5555'.
---

# Android USB ADB Setup Wizard & Diagnostics (`android-usb-adb`)

This skill equips Antigravity to act as an **expert USB connection wizard** that guides the user through detecting, authorizing, configuring, and troubleshooting physical USB-C connections with Google Pixel and Android hardware.

---

## The USB Wizard Protocol (Agent Runbook)

When activated, you must guide the user through the following 4 phases turn-by-turn:

```
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 1: Physical Hardware & PnP Diagnostic                   │
  │ Inspect Windows USB PnP devices for Google VID (18D1)         │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 2: ADB Daemon & Device Authorization State              │
  │ Check adb devices -l (handle 'unauthorized' / 'authorizing')  │
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 3: Service Port Reverse Forwarding                      │
  │ Auto-configure adb reverse tcp:8080 (MCP) and tcp:8081 (Metro)│
  └───────────────────────────────┬───────────────────────────────┘
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ PHASE 4: Optional Wireless Detach ('adb tcpip 5555')          │
  │ Transition to wireless TCP/IP mode and unplug cable           │
  └───────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Physical Hardware & Cable Diagnostics

Run the following commands to determine if the operating system detects the physical device:

1. **Check Windows PnP Device Registry**:
   ```powershell
   Get-PnpDevice | Where-Object { $_.InstanceId -like "*18D1*" -or $_.FriendlyName -like "*Pixel*" } | Select-Object Status, Problem, InstanceId, FriendlyName
   ```
   - If `Status: OK` and not `CM_PROB_PHANTOM`: Device is physically connected.
   - If `Problem: CM_PROB_PHANTOM`: The cable is disconnected, faulty, or charging-only.

2. **Start ADB Daemon & Inspect State**:
   ```powershell
   adb start-server ; adb devices -l
   ```

---

### Phase 2: Resolving Authorization States

When `adb devices -l` reports the device, handle the exact state reported:

| State | Meaning | Exact Remediation Step |
| :--- | :--- | :--- |
| **`device`** | Fully authorized & ready | Proceed immediately to Phase 3. |
| **`authorizing`** | Phone is negotiating RSA key | Wait 2 seconds and re-check `adb devices -l`. |
| **`unauthorized`** | Phone screen has RSA prompt | **Instruct user:** Unlock phone, look for *"Allow USB debugging?"* dialog, check *"Always allow from this computer"*, and tap **Allow**. |
| **`offline`** | Connection hung or sleeping | Run `adb kill-server ; adb start-server`, then unplug and replug the cable. |

#### If the "Allow USB debugging?" popup NEVER appears:
1. On the phone, go to: *Settings → System → Developer options*.
2. Scroll to the *Debugging* section and tap **"Revoke USB debugging authorizations"** → Tap OK.
3. Unplug the USB-C cable and plug it back in.
4. Unlock the phone screen — the RSA prompt will pop up immediately.

---

### Phase 3: Service Port Forwarding (MCP & Metro)

Once the device state is `device`, automatically configure the necessary port tunnels:

1. **Reverse MCP Server Port (Delta Mobile / PixelKit)**:
   ```powershell
   adb reverse tcp:8080 tcp:8080
   ```
   *Enables desktop tools (Claude Desktop, Cursor, Antigravity) to access `http://localhost:8080/mcp` directly on the phone.*

2. **Reverse Metro Bundler Port (Expo / React Native)**:
   ```powershell
   adb reverse tcp:8081 tcp:8081
   ```
   *Allows the phone to load local JavaScript bundles from the PC's Metro bundler.*

3. **Verify Reverse Port List**:
   ```powershell
   adb reverse --list
   ```
   *Should show `tcp:8080 tcp:8080` and `tcp:8081 tcp:8081`.*

---

### Phase 4: Wireless Detach Mode (`adb tcpip 5555`)

If the user wants to unplug the cable and keep working wirelessly (even on a cellular hotspot where the native Wi-Fi pairing menu is disabled):

1. **Switch Phone Daemon to TCP/IP Mode**:
   ```powershell
   adb tcpip 5555
   ```
   *Expected output: `restarting in TCP mode port: 5555`*

2. **Query Phone IP Address**:
   ```powershell
   adb shell ip route | Select-String "wlan|rndis|ap"
   ```
   Or query the Wi-Fi/hotspot interface:
   ```powershell
   adb shell ip addr show wlan0
   ```

3. **Connect Over TCP/IP**:
   ```powershell
   adb connect <phone_ip>:5555
   ```

4. **Instruct User to Unplug**:
   The user can now safely unplug the USB cable. `adb devices -l` will show `<phone_ip>:5555 device`.

---

### Phase 5: USB Tethering Coexistence

If the user is using the phone's hotspot to provide internet to the PC:
1. Connect via USB-C.
2. Go to *Settings → Network & internet → Hotspot & tethering* on the phone.
3. Toggle **USB tethering** to **ON**.
4. Both high-speed internet tethering and full ADB debugging run simultaneously across the single cable with zero packet loss.
