<div align="center">

# Nimbus

**A fast, private desktop browser with a built-in AI tab, a CPU and RAM limiter, and an encrypted password vault.**
Google search, custom backgrounds, private tabs, downloads, find-in-page and more, for Windows and macOS.

[Download](../../releases/latest) · [Report a bug](../../issues)

</div>

## Features
- **Google search** in one address bar, with live suggestions from your bookmarks, history and Google.
- **Login page and password vault:** a master password unlocks the browser. Saved logins are encrypted with AES-256-GCM; the key comes from your master password and is never stored. Nimbus offers to save passwords when you sign in, fills them with one click, and clears copied passwords from the clipboard after 30 seconds.
- **Built-in AI tab** (Claude): ask questions or tick *Use current page* to chat about the tab you were just on. Uses your own Anthropic API key, stored encrypted in the vault.
- **CPU and RAM limiter** *(Opera GX style):* set total limits; Nimbus lowers background tab priority and puts the least-recently-used tabs to sleep. Optional per-tab memory cap and idle-tab sleep timer. A live performance panel shows each tab's usage.
- **Make it yours:** 8 gradient backgrounds, your own custom image, an accent colour.
- **Private tabs** *(Firefox / Safari):* nothing saved to history, separate in-memory cookies.
- **Everything a browser needs:** tabs, bookmarks, history, downloads manager, find in page, zoom, reopen closed tab, right-click menus, DevTools, full-screen video, session restore, site permission prompts, and import from Chrome, Edge, Brave, Opera, Opera GX, Firefox or Safari bookmark files.
- **Auto-lock** after you have been idle for a time you choose.

## Requirements
| Your system | Download |
|---|---|
| Windows 10 or 11 (64-bit) | `Nimbus-*-win-x64.exe` |
| macOS 11 to 26, Apple Silicon (M1 and newer) | `Nimbus-*-mac-arm64.dmg` |
| macOS 11 to 26, Intel | `Nimbus-*-mac-x64.dmg` |
| macOS 10.13 to 10.15 (Intel) | `Nimbus-*-mac-x64-legacy.dmg` |

## Install
1. Open the [latest release](../../releases/latest) and download the file for your computer.
2. **Windows:** run the installer. If SmartScreen warns, click *More info*, then *Run anyway*.
3. **macOS:** open the `.dmg`, drag Nimbus to Applications, then right-click it and choose *Open* the first time.
4. On first launch, create your profile and master password. **Write it down: it cannot be recovered.**

## Keyboard shortcuts
Use `Cmd` on Mac and `Ctrl` on Windows. They work even while a web page has focus.

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + T` | New tab (`+ Shift` reopens the last closed tab) |
| `Cmd/Ctrl + Shift + N` | New private tab |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd/Ctrl + L` | Focus the address bar |
| `Cmd/Ctrl + R` or `F5` | Reload |
| `Cmd/Ctrl + F` | Find in page |
| `Cmd/Ctrl + D` | Bookmark page |
| `Cmd/Ctrl + =` / `-` / `0` | Zoom in / out / reset |
| `Cmd/Ctrl + [` / `]` | Back / forward |
| `Ctrl + Tab` (`+ Shift`) | Next / previous tab |
| `Cmd/Ctrl + 1 to 9` | Jump to a tab |
| `F12` or `Cmd + Option + I` | DevTools |

## Good to know
- **No extensions.** Nimbus is built on Electron, which doesn't support the Chrome Web Store.
- **No Widevine DRM,** so Netflix, Spotify Web and similar protected video won't play.
- **Google sign-in may be refused** by Google in embedded browsers. Use the saved-password vault for other sites.
- **The AI tab needs an [Anthropic API key](https://console.anthropic.com).** Signing in with a Google account is not possible for third-party apps.
- The limiter is "soft": it lowers priority and sleeps tabs. The optional heap cap is a hard limit per tab after a restart.
- Installers are not code-signed, so first launch shows a security prompt.
- Nimbus has no cloud sync. Your data stays on your computer.

## Run from source
```
npm install
npm start
```

## Build installers
```
npm run dist:mac    # on a Mac
npm run dist:win    # on Windows
```
Or push a tag (`git tag v1.1.0 && git push --tags`) and GitHub Actions builds Windows and all Mac versions.

## License
MIT. See [LICENSE](LICENSE).
