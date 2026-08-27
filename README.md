[English] | [Русский](README.ru.md)

# Kalah

A cross-platform implementation of the classic Kalah board game.

Developed by Researcher Universe Labs

Version 1.0.0

License: GPL-3.0-only

## Overview

Kalah is a digital implementation of the classic board game from the Mancala family. It is an independent project and is not an official version of any third-party product.

The project focuses on a clean implementation of the rules, local player-versus-player matches, play against AI, saved games, statistics, and cross-platform use without a mandatory online service.

## Features

### Game

- Standard Kalah board with 6 pits per player.
- 6 stones per pit and 72 stones in total at the start of a match.
- Captures, extra turns, and automatic collection when one side becomes empty.
- Draws and player resignation.
- Optional restriction preventing the opening move from ending directly in the current player's Kalah.

### Modes and AI

- Local PvP on one device.
- PvAI with Random, Easy, Hard, and Advanced difficulty levels.
- Hard searches several moves ahead.
- Advanced uses a more defensive, opponent-aware evaluation. The AI is not presented as unbeatable.

## Interface

- Responsive interface for Windows desktop and Android portrait/mobile layouts.
- Browser/PWA-compatible frontend.
- Dynamic board orientation in PvP and a human-facing orientation in PvAI.
- Russian and English localization.
- Custom player names.
- Natural-looking decorative stones with exact numeric counters.

## Animations and audio

- Animated stone sowing and landing feedback.
- Capture effects, extra-turn notifications, and game-end effects.
- Sound effects generated with the Web Audio API; no external soundtrack is required.
- Sound enable/disable and volume controls.
- Animation enable/disable and speed control from 25% to 200%.
- Support for the `prefers-reduced-motion` user preference.

## Save and load

Kalah provides exactly 5 manual save slots. A save preserves the complete state of an unfinished match, including the current and first players, AI difficulty, statistics in progress, and other relevant match state. Application settings are stored separately from game saves.

## Statistics

Local match history keeps PvP and PvAI results separate and records the AI difficulty where applicable. Tracked values include wins, losses, draws, moves, captures, captured stones, extra turns, finishes in a Kalah, maximum capture, longest extra-turn streak, and final Kalah scores.

## AI resignation

In PvAI, the computer may resign when defeat has become mathematically inevitable. It does not necessarily resign immediately after such a position is reached.

## Game results

At the end of a match, the result view reports victory, defeat, draw, or resignation together with the final score.

## Platforms

| Platform | Status |
| --- | --- |
| Windows x64 | Supported; installer and portable executable. |
| Android | Supported / testing; Android 7.0+ (API 24), ARM64 and ARMv7. |
| Browser/PWA | Supported as the project frontend and local web version. |
| Linux | Planned; build support is in progress. |
| macOS | Planned. |
| iOS | Not currently planned. |

## Current build targets

- Windows: x86_64, Tauri 2, and WebView2.
- Android: minSdk 24, ARM64 (`arm64-v8a`), and ARMv7 (`armeabi-v7a`).

## Technology

- HTML
- CSS
- Vanilla JavaScript
- Rust
- Tauri 2
- Web Audio API
- Node.js test runner

## Project architecture

The project separates the Game Engine for rules and state from AI move selection, the UI and board view, the animation layer, storage, statistics, audio, and the Tauri application shell. Gameplay logic is kept separate from platform-specific UI and shell code.

## Testing

The current project state has 131 automated tests passing. Coverage includes game rules, AI, Save/Load, stale lifecycle protection, board orientation, statistics, audio, animations, AI resignation, the result dialog, localization, and storage.

Run the test suite with:

```text
npm test
```

## Quick start for developers

Clone the repository, then:

```text
npm install
npm test
npm start
```

Detailed platform build instructions will be provided separately.

## Screenshots

<!-- Screenshots will be added before the public release. -->

## License

Kalah is licensed under the GNU General Public License v3.0 only (GPL-3.0-only).

Copyright © 2026 Researcher Universe Labs.

You may use, study, modify, and distribute the software. Distributed derivative works must comply with GPL-3.0-only. See [LICENSE](LICENSE).

## Contributions

Contributions are welcome. Contribution guidelines will be added separately.

## Support the project

Kalah is free and open-source software. If you find the project useful and would like to support its continued development, voluntary donations are welcome.

## Developer

Researcher Universe Labs

Copyright © 2026 Researcher Universe Labs
