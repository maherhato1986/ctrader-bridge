@echo off
cd /d C:\Users\HUAWEI\Desktop\ctrader-bridge

echo Starting BRIDGE...
start "BRIDGE" powershell -NoExit -Command "$host.ui.RawUI.WindowTitle='BRIDGE'; node src/modules/execution/ctrader.bridge.js"

timeout /t 4 >nul

echo Starting APP...
start "APP" powershell -NoExit -Command "$host.ui.RawUI.WindowTitle='APP'; node src/app.js"

timeout /t 2 >nul

echo Starting TEST...
start "TEST" powershell -NoExit -Command "$host.ui.RawUI.WindowTitle='TEST'; Write-Host 'TEST window ready';"

exit