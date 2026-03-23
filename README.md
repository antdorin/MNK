# Remote Control — iOS App

Control your Windows PC mouse and keyboard wirelessly from your iPhone.

Connects to the **Alarm Clock** Electron app on your PC over local Wi-Fi via WebSocket.

## Features
- **Trackpad** — drag to move mouse cursor, tap to left-click, scroll buttons
- **Keyboard** — native iOS keyboard with full key capture, special key shortcuts
- **One-tap connection** — enter PC IP (shown in the Alarm Clock app) and connect

## Requirements
- iPhone running iOS 16+
- PC running the Alarm Clock Electron app
- Both on the same Wi-Fi network

## Install (AltStore sideload)
1. Download the latest `RemoteControl.ipa` from [GitHub Actions → Artifacts](../../actions)
2. Open AltStore on your PC → Install the `.ipa` onto your iPhone
3. Trust the app in **Settings → General → VPN & Device Management**

## Usage
1. Open the Alarm Clock app on your PC — note the **PC Address** shown in the Remote Control section
2. Open this app on your iPhone → **Connect** tab → enter the PC address → **Connect**
3. Use the **Trackpad** tab to move the mouse and click
4. Use the **Keyboard** tab to type text and send special keys

## Development
```bash
# Install xcodegen (macOS)
brew install xcodegen

# Generate Xcode project
xcodegen generate

# Open in Xcode
open RemoteControl.xcodeproj
```
