# Build script for the PixelKit System Metrics Daemon (javac -> d8 -> dex jar for app_process)
$ErrorActionPreference = "Stop"

$SCRIPT_DIR = $PSScriptRoot
$SRC_DIR = Join-Path $SCRIPT_DIR "src"
$BUILD_DIR = Join-Path $SCRIPT_DIR "build"
$CLASSES_DIR = Join-Path $BUILD_DIR "classes"
$OUTPUT_JAR = Join-Path $SCRIPT_DIR "system-metrics-daemon.jar"

$SDK_DIR = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$ANDROID_JAR = Join-Path $SDK_DIR "platforms\android-37.0\android.jar"
if (-not (Test-Path $ANDROID_JAR)) {
    $ANDROID_JAR = Join-Path $SDK_DIR "platforms\android-36\android.jar"
}
if (-not (Test-Path $ANDROID_JAR)) {
    Write-Error "android.jar not found under $SDK_DIR\platforms (set ANDROID_HOME)."
}

$D8 = Get-ChildItem -Path "$SDK_DIR\build-tools" -Filter "d8.bat" -Recurse | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $D8) {
    Write-Error "d8.bat not found under $SDK_DIR\build-tools (set ANDROID_HOME)."
}

Write-Host "Compiling SystemMetricsDaemon with javac..."
if (Test-Path $CLASSES_DIR) { Remove-Item -Recurse -Force $CLASSES_DIR }
New-Item -ItemType Directory -Path $CLASSES_DIR -Force | Out-Null

$JAVA_FILES = Get-ChildItem -Path $SRC_DIR -Filter "*.java" -Recurse | Select-Object -ExpandProperty FullName
& javac --release 8 -cp $ANDROID_JAR -d $CLASSES_DIR $JAVA_FILES
if ($LASTEXITCODE -ne 0) { throw "javac failed with exit code $LASTEXITCODE" }

Write-Host "Converting classes to DEX with d8..."
$CLASS_FILES = Get-ChildItem -Path $CLASSES_DIR -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName

if (Test-Path $OUTPUT_JAR) { Remove-Item -Force $OUTPUT_JAR }
& $D8 --lib $ANDROID_JAR --output $OUTPUT_JAR $CLASS_FILES
if ($LASTEXITCODE -ne 0) { throw "d8 failed with exit code $LASTEXITCODE" }

Write-Host "Built: $OUTPUT_JAR"
