<#
.SYNOPSIS
    Automated USB ADB configuration, reverse port forwarding, and optional wireless switch.
.EXAMPLE
    .\setup-usb.ps1 -EnableWireless
#>

[CmdletBinding()]
param(
    [switch]$EnableWireless
)

Write-Host "=== Android USB ADB Wizard ===" -ForegroundColor Cyan

# 1. Start daemon and check devices
& adb start-server
$devOutput = & adb devices -l
Write-Host $devOutput

if ($devOutput -match "unauthorized") {
    Write-Host "`n[!] Device is UNAUTHORIZED." -ForegroundColor Yellow
    Write-Host "    Please unlock your Pixel screen, check 'Always allow from this computer', and tap ALLOW." -ForegroundColor White
    exit 1
}

if ($devOutput -notmatch "device") {
    Write-Host "`n[-] No authorized device found. Check USB-C cable connection." -ForegroundColor Red
    exit 1
}

# 2. Configure reverse port forwarding
Write-Host "`n[*] Configuring reverse port forwarding for MCP and Metro..." -ForegroundColor Yellow
& adb reverse tcp:8080 tcp:8080
& adb reverse tcp:8081 tcp:8081
Write-Host "[+] Forwarded tcp:8080 (MCP Server) and tcp:8081 (Metro Bundler)" -ForegroundColor Green

# 3. Optional: Switch to wireless TCP/IP mode
if ($EnableWireless) {
    Write-Host "`n[*] Switching device to TCP/IP mode on port 5555..." -ForegroundColor Yellow
    & adb tcpip 5555
    Start-Sleep -Seconds 2

    # Query IP address
    $ipOutput = & adb shell ip -f inet addr show
    $ipMatch = [regex]::Match($ipOutput, "inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)")
    if ($ipMatch.Success) {
        $deviceIp = $ipMatch.Groups[1].Value
        Write-Host "[*] Found device IP: $deviceIp" -ForegroundColor Cyan
        & adb connect "${deviceIp}:5555"
        Write-Host "[+] Wireless ADB connected on ${deviceIp}:5555! You may now unplug the USB cable." -ForegroundColor Green
    } else {
        Write-Host "[!] Could not automatically resolve device IP. Run 'adb connect <phone_ip>:5555' manually." -ForegroundColor Yellow
    }
}

Write-Host "`n[*] Active ADB Connections:" -ForegroundColor Cyan
& adb devices -l
