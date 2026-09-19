<#
.SYNOPSIS
    Interactive & automated helper script for Android Wireless ADB pairing and reverse port forwarding.
.EXAMPLE
    .\connect.ps1 -Ip 10.254.235.42 -PairPort 38472 -PairCode 482915 -ConnectPort 41235
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Ip,

    [Parameter(Mandatory = $false)]
    [int]$PairPort = 0,

    [Parameter(Mandatory = $false)]
    [string]$PairCode = "",

    [Parameter(Mandatory = $false)]
    [int]$ConnectPort = 0
)

Write-Host "=== Android Wireless ADB Wizard ===" -ForegroundColor Cyan

# 1. Pairing step (if pair code provided)
if ($PairCode -and $PairPort -gt 0) {
    Write-Host "[*] Pairing to ${Ip}:${PairPort} with code $PairCode..." -ForegroundColor Yellow
    $pairResult = $PairCode | & adb pair "${Ip}:${PairPort}"
    Write-Host $pairResult
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[-] Pairing failed. Check that the pairing popup is still visible on the phone." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "[+] Successfully paired!" -ForegroundColor Green
}

# 2. Connection step
$targetPort = if ($ConnectPort -gt 0) { $ConnectPort } elseif ($PairPort -gt 0) { $PairPort } else { 5555 }
Write-Host "[*] Connecting to ${Ip}:${targetPort}..." -ForegroundColor Yellow
$connectResult = & adb connect "${Ip}:${targetPort}"
Write-Host $connectResult

# 3. Setup reverse port forwarding
Start-Sleep -Milliseconds 500
Write-Host "[*] Configuring reverse port forwarding..." -ForegroundColor Yellow
& adb reverse tcp:8080 tcp:8080
& adb reverse tcp:8081 tcp:8081
Write-Host "[+] Forwarded tcp:8080 (MCP Server) and tcp:8081 (Metro Bundler)" -ForegroundColor Green

# 4. Final verification
Write-Host "`n[*] Active ADB Devices:" -ForegroundColor Cyan
& adb devices -l
