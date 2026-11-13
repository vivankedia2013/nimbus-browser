# Changelog

## 1.1.0
**Security**
- Fixed a code-injection hole: bookmark and history entries were inserted into inline event handlers, so a crafted URL could run code with access to the password vault. The UI no longer uses inline handlers and now has a strict Content-Security-Policy.
- Web pages can no longer attach to unapproved partitions or get Node/preload access; IPC is limited to a channel allow-list and to the browser window only.
- Sites must now ask before using the camera, microphone, location, notifications or screen.
- Vault: stronger key derivation (scrypt N=65536), atomic writes with a backup copy, slowed-down password guessing, copied passwords clear after 30 s.

**Fixes**
- Keyboard shortcuts now work while a web page has focus.
- Links that open new windows (`target=_blank`) now open in a new tab.
- Added a right-click menu inside pages (open link in new tab, copy, search Google, inspect).
- Added a friendly error page when a site can't be reached.
- Upgraded Electron to 37 to fix the macOS 26 (Tahoe) system-wide slowdown; added a separate Electron 22 build for macOS 10.13 to 10.15.
- Apple Silicon builds are now ad-hoc signed so they open after Right-click → Open.
- Release workflow now publishes from one job, fixing failed uploads when builds finished at the same time.

**New**
- Save-password prompt, autofill key button, downloads manager, find in page, zoom, private tabs, reopen closed tab, address-bar suggestions, loading indicator, session restore, auto-lock, background image compression.

## 1.0.0
- First release.
