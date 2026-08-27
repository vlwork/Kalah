# Changelog

All notable changes to Kalah will be documented in this file.

## [1.0.0] - 2026-08-27

### Added

- Classic Kalah rules with 6 pits per player and 6 stones in each pit.
- Local PvP and PvAI game modes.
- Random, Easy, Hard, and Advanced AI difficulty levels.
- First-player selection and an optional restriction preventing the opening move from ending directly in Kalah.
- Extra turns, captures, draws, and player resignation.
- AI resignation when defeat has become mathematically inevitable.
- Exactly 5 manual save slots and local match statistics.
- Russian and English localization with custom player names.
- Responsive interface and dynamic board orientation.
- Stone-sowing, capture, and game-end animations.
- Animation speed controls and support for `prefers-reduced-motion`.
- Web Audio sound effects with sound and volume controls.
- Game result dialog.
- Windows x64 desktop builds through Tauri 2, including installer and portable variants.
- Android build support for Android 7.0+ (API 24), ARM64, and ARMv7.
- Browser/PWA frontend.
- Automated test suite.

### Fixed

- Protected the application lifecycle from stale AI and animation callbacks.
- Improved Save/Load stability.
- Ensured consistent board orientation.
- Synchronized animation phases with game state updates.

### Technical

- Built the frontend with HTML, CSS, and Vanilla JavaScript.
- Added a Rust and Tauri 2 desktop shell.
- Kept gameplay logic separate from the UI and platform shell.
- Used the Node.js automated test runner.
- Confirmed 131 tests passing at release preparation time.

Copyright © 2026 Researcher Universe Labs. Licensed under GPL-3.0-only.
