# MarkItDown_Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

A local web app built on top of `MarkItDown`.

The repository is now organized as a runnable web application with one clear goal: convert local files or URLs into clean Markdown, then preview, copy, and download the result directly in the browser.

![image-20260422011632260](https://ycc123666.oss-cn-beijing.aliyuncs.com/img/image-20260422011632260.png)

![image-20260422011655584](https://ycc123666.oss-cn-beijing.aliyuncs.com/img/image-20260422011655584.png)

## Features

- Single-file conversion
- Batch file conversion
- URL conversion
- Preview / raw Markdown view switching
- Copy the current result
- Download the current result
- Download all batch results as a zip archive
- Optional extension hints
- Optional plugin support
- Optional Data URI preservation

## Stack

- Backend: `FastAPI`
- Frontend: `Vue 3` + `Vite` + `@nuxt/ui`
- Conversion core: `packages/markitdown`

Main directories:

- `frontend-vue/`: frontend source
- `webapp/app.py`: web service entry point
- `packages/markitdown/`: MarkItDown core package

## Getting Started

Using your existing `GraphRag` environment is recommended.

### 1. Install Python dependencies

Run this from the repository root:

```bash
pip install -e 'packages/markitdown[all]'
pip install fastapi uvicorn python-multipart
```

### 2. Install frontend dependencies

```bash
cd frontend-vue
npm install
npm run typecheck
npm run build
cd ..
```

### 3. Start the service

```bash
python -m uvicorn webapp.app:app --host 127.0.0.1 --port 8000 --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## UI Workflow

The page supports two working modes.

### Single

- Upload one file or enter one URL
- Keep the upload area separate from the selected-file list
- Replace or remove the current file before running the conversion
- Convert to Markdown
- View the preview or raw Markdown
- Copy the current Markdown
- Download the current result

### Batch

- Upload multiple files at once
- Add more files in multiple passes
- Remove files one by one or clear the queue
- Run batch conversion
- Switch between per-file results
- Copy the current file's Markdown
- Download the current file's `.md`
- Download every successful `.md` file as one zip archive

## Current Layout

- The left side is the input pane for mode selection, file upload, URL entry, and advanced options.
- In single-file mode, the uploader only receives the file and the selected file is shown in a separate list below it.
- In batch mode, queued files are shown as a dedicated list so they can be reviewed, added, or removed before conversion.
- The right side is the result pane with preview / Markdown switching, copy, current download, and batch download actions.

## Native CLI Usage

If you do not want to use the web UI, you can still run the core CLI directly:

```bash
markitdown input.docx -o output.md
```

## Notes

- The old static frontend has been removed; the project now serves the built output from `frontend-vue`.
- Generated runtime folders such as `__pycache__`, `dist`, and `node_modules` are not business-source code.
