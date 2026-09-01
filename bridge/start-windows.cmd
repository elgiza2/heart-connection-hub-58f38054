@echo off
set "MEGSY_BRIDGE_URL=https://ltgampdtawuefwwayncx.supabase.co/functions/v1/device-bridge"
node "%~dp0bridge.mjs" %*
pause
