# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**StockFlow AI** — a Node.js CLI pipeline that discovers local `.jpg` images, generates Shutterstock metadata via local LLMs (Ollama), validates and enriches it with trending tags, then uploads via Playwright browser automation.

## Commands

```bash
# Full pipeline (dry-run by default)
npm start

# Real upload (set dryRun to false)
PIPELINE_DRY_RUN=false npm start

# Fetch trending tags only (no uploads, no metadata generation)
npm run trends

# Disable anti-bot delays for faster local testing
SHUTTERSTOCK_ENABLE_ANTI_BOT_DELAYS=false npm start
```

**Prerequisites before running:**

1. Chrome running with CDP: `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=$(mktemp -d) &`
2. Ollama running locally with `llama3` and `llama3.2-vision` models pulled
3. `.env` file with `SCAN_PICTURES_DIRECTORY`, `SHUTTERSTOCK_USERNAME`, `SHUTTERSTOCK_PASSWORD`, `LOCAL_CHROMIUM_SERVER=http://127.0.0.1:9222`

## Architecture

### Pipeline flow

`index.js` → `PipelineService` (orchestrator) → fetches trending tags via `ShutterStockService`, then per image:
1. `LangChainService.generateMetadata()` — vision model describes image, LLM generates title/description/tags/categories
2. `MetadataValidator.validate()` — enforces Shutterstock constraints (title 8–120 chars, description 80–200 chars, tags 25–45)
3. `TagEnrichmentService.enrich()` — ranks and merges platform trending tags with generated tags
4. `ShutterStockService.uploadImage()` — Playwright CDP automation fills and submits the upload form
5. `CsvService.toRow()` / `writeBatch()` — writes Shutterstock bulk-upload CSV

### Platform abstraction

All platform services extend `services/BaseService/PlatformService.js`. `services/PlatformFactory.js` instantiates them by name (`shutterstock` is the only implementation). To add Getty/Alamy: create a new service extending `PlatformService`, register it in `PlatformFactory.PLATFORM_MAP`, add env vars, and set `SERVICE_PLATFORMS=getty`.

### Config

All configuration lives in `config/index.js`, which reads from `.env` via `dotenv`. Every service imports `{ config }` from there — no service reads `process.env` directly. **Important:** `PIPELINE_DRY_RUN` defaults to `true` (the string `"false"` is the only way to disable it).

### LLM metadata context

`services/LangChainService/index.js` always loads `services/LangChainService/shutterstock-best-practices.md` as the `metadataContext` injected into the LLM system prompt. Edit that file to tune metadata quality without changing code.

### Output files

| File | Purpose |
|------|---------|
| `data/upload-log.json` | JSON log of all processed/failed/dry-run images |
| `data/shutterstock-metadata-batch.csv` | Shutterstock bulk-upload CSV |
| `processed/` | Images moved here after successful upload |
| `failed/` | Images moved here after failure |

Processed images are tracked by `imagePath` in `upload-log.json`; the pipeline skips any image with `status: "processed"`.
