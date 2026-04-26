# Claude Code

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension novel reader. Upload `.txt` files, auto-detect encoding, parse chapters, and read with eye-care themes.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this directory

## Architecture

```text
background/
  service-worker.js    # Message routing, data persistence via chrome.storage
content/
  content-script.js    # Keyboard shortcuts (←/→ for chapter nav)
popup/
  popup.html           # Main UI (book list, upload button)
  popup.js             # Upload logic, file reading
pages/
  reader.html          # Reading page
  reader.css           # 4 theme styles
  reader.js            # Chapter nav, settings, bookmarks
  settings.html        # Standalone settings page
  settings.js          # Settings logic
shared/
  constants.js         # Storage keys, default settings, themes, regex
  encoding.js          # TextDecoder-based encoding detection
  parser.js            # Chapter splitting with regex
  storage.js           # chrome.storage API wrappers
  utils.js             # escapeHtml, generateId, showToast
icons/
  icon16.png, icon48.png, icon128.png
manifest.json          # MV3 extension manifest
```

## Key Patterns

- All storage access via `chrome.runtime.sendMessage` to service worker
- No ES module imports in popup/page scripts (compatibility issue)
- Inline helper functions where needed
- Service worker handles: books, settings, bookmarks CRUD

## Chapter Parsing

Regex: `/\n第[一二三四五六七八九十百千万1234567890]+[章节].*\n/`

## Themes

- `light` - white background
- `sepia` - warm paper
- `dark` - dark mode
- `eye-care` - green background (default)
