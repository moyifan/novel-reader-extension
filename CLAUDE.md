# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flask-based novel reader that allows uploading `.txt` files and reading them chapter-by-chapter with automatic encoding detection and chapter parsing.

## Running the App

```bash
python book.py
```

App runs at `http://127.0.0.1:5000`. The Flask debug mode is enabled in `book.py`.

## Dependencies

Install via `pip install -r requirements.txt`:
- Flask
- chardet (for encoding detection)

## Architecture

- **book.py**: Main Flask application. Contains all routes, chapter parsing logic, and file handling. Chapters stored in a global `chapters` list as tuples of `(title, content)`.
- **templates/**: Jinja2 templates
  - `index.html` - file upload form
  - `chapter.html` - reading view with chapter navigation
- **uploads/**: Stores uploaded `uploaded_novel.txt` (git-ignored)

## Chapter Parsing

Chapters are split using regex: `r'(\n第[一二三四五六七八九十百千万1234567890]+[章节].*\n)'`
The first segment before the first chapter marker becomes the "前言" (preface).

## Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Show upload form or redirect to chapter 1 |
| `/upload` | POST - save uploaded file and redirect to chapter |
| `/delete` | POST - remove uploaded file and reset |
| `/<int:chapter>` | Render specific chapter |

Encoding detection falls back from detected encoding → UTF-8 → detected encoding with `errors='ignore'`.