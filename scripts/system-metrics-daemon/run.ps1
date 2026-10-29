# Start script for the PixelKit System Metrics Daemon on a connected device.
# Usage: run.ps1 [-Serial <adb serial>] [-Rebuild]
param(
    [string]$Serial = "",
    [switch]$Rebuild
)
$ErrorActionPreference = "Stop"

$SCRIPT_DIR = $PSScriptRoot
$JAR_PATH = Join-Path $SCRIPT_DIR "system-metrics-daemon.jar"
$PORT = 11081
$MAIN_CLASS = "com.pixelkit.sysmetrics.SystemMetricsDaemon"
$REMOTE_JAR = "/data/local/tmp/system-metrics-daemon.jar"
$REMOTE_LOG = "/data/local/tmp/system-metrics-daemon.log"

if ($Rebuild -or -not (Test-Path $JAR_PATH)) {
    Write-Host "Building daemon..."
    & (Join-Path $SCRIPT_DIR "build.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build.ps1 failed" }
}

$SDK_DIR = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$ADB = Join-Path $SDK_DIR "platform-tools\adb.exe"
$ADB_ARGS = @()
if ($Serial) { $ADB_ARGS = @("-s", $Serial) }

Write-Host "Checking connected device..."
$DEVICES = & $ADB devices
$HAS_DEVICE = ($DEVICES | Where-Object { $_ -match "\bdevice$" })
if (-not $HAS_DEVICE) {
    Write-Error "No active ADB device detected. Connect your Pixel via USB or Wireless Debugging."
}

Write-Host "Stopping any prior daemon instance (its watchdog restores tracefs after it exits)..."
& $ADB @ADB_ARGS shell "pkill -f $MAIN_CLASS"
Start-Sleep -Milliseconds 3500

Write-Host "Pushing system-metrics-daemon.jar to device..."
& $ADB @ADB_ARGS push $JAR_PATH $REMOTE_JAR
if ($LASTEXITCODE -ne 0) { throw "adb push failed" }

Write-Host "Forwarding port $PORT for dev host..."
& $ADB @ADB_ARGS forward tcp:$PORT tcp:$PORT

Write-Host "Launching SystemMetricsDaemon as shell (uid 2000)..."
& $ADB @ADB_ARGS shell "nohup /system/bin/app_process -Djava.class.path=$REMOTE_JAR /data/local/tmp $MAIN_CLASS > $REMOTE_LOG 2>&1 &"

# The first completed sampling window is available about 1.5 s after launch.
Start-Sleep -Milliseconds 3000

try {
    Write-Host "GET /ping"
    Write-Host (Invoke-RestMethod -Uri "http://127.0.0.1:$PORT/ping" -TimeoutSec 3 | ConvertTo-Json -Compress)
    Write-Host "GET /metrics"
    $RESPONSE = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$PORT/metrics" -TimeoutSec 3
    Write-Host $RESPONSE.Content
    Write-Host "SystemMetricsDaemon is active." -ForegroundColor Green
} catch {
    Write-Warning "Could not reach daemon on http://127.0.0.1:$PORT ($($_.Exception.Message)). Device log:"
    & $ADB @ADB_ARGS shell "cat $REMOTE_LOG"
}
