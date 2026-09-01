# Megsy Desktop Bridge for Windows

The bridge lets your Megsy account queue approved work on your own Windows computer. It runs locally, stores its device token in `%APPDATA%\MegsyBridge\config.json`, and never asks for your Megsy password.

## Start

1. In Megsy, open **Settings → My computer**, create a device, and copy the 8-character pairing code.
2. Install Node.js 20+ on Windows.
3. Open PowerShell in this folder and run:

```powershell
$env:MEGSY_BRIDGE_URL="https://ltgampdtawuefwwayncx.supabase.co/functions/v1/device-bridge"
node .\bridge.mjs --pair YOUR_CODE
```

The token is saved locally. After pairing, run:

```powershell
node .\bridge.mjs
```

Keep the window open while Megsy works. Use `Ctrl+C` to stop it.

## Permissions

The bridge only executes capabilities enabled in Megsy settings. In **ask** mode, every non-read command waits for approval in the app. Start with Shell and Files disabled, enable one capability at a time, and use a dedicated work folder. Never use full automatic mode for an untrusted account.

## Build an installer

This folder is intentionally dependency-free. Package it with your preferred signed Windows installer or run it with Node.js. Review the source before installing; do not run a downloaded copy you cannot verify.
