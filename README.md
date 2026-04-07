# StockFlow AI 📸🤖

> **Automated AI-powered stock photo submission pipeline** — Generate compelling metadata, enrich with trending tags, and upload stock photos to Shutterstock with minimal manual intervention.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.59-blue)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

---

## 📖 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Service Architecture](#service-architecture)
- [Extending for New Platforms](#extending-for-new-platforms)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [License](#license)

---

## Project Overview

**social-media-manager-ai-agent** is a Node.js-based automation pipeline that orchestrates the entire stock photo submission workflow:

1. **Discovers** pending images in a source directory
2. **Generates** compelling titles, descriptions, and tags using LLM (Ollama)
3. **Analyzes** images with vision models for accurate metadata
4. **Enriches** tags with platform trending data for better discoverability
5. **Validates** all metadata against Shutterstock requirements
6. **Automates** web-based uploads via Playwright CDP
7. **Logs** all uploads with status tracking and error handling

Perfect for photographers and content creators who want to bulk-upload to stock platforms without manual metadata entry.

---

## Features

✅ **AI-Powered Metadata Generation** — LLM-generated titles, descriptions, and tag suggestions  
✅ **Vision Model Analysis** — Automatic image description using vision models (llama3.2-vision)  
✅ **Trending Tag Integration** — Automatically fetches and ranks platform trending tags  
✅ **Comprehensive Validation** — Checks title length, description length, tag count, categories  
✅ **Web Automation** — Playwright CDP-based Shutterstock login and image upload  
✅ **CSV Bulk Upload Support** — Generate CSV metadata files for batch submissions  
✅ **Upload Tracking** — JSON logging of all processed images with status and errors  
✅ **Configurable Retry Logic** — Automatic retries on metadata validation failures  
✅ **Platform-Agnostic Architecture** — Designed for easy extension to Getty, Alamy, Adobe Stock  
✅ **Anti-Bot Timing** — Configurable human-like delays to avoid detection  
✅ **Comprehensive Error Handling** — Graceful failures with detailed error messages  
✅ **Dry-Run Mode** — Test the pipeline without uploading  

---

## System Architecture

### High-Level Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              social-media-manager-ai-agent Pipeline             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. GET PENDING IMAGES                                          │
│     ↓                                                            │
│     [FileService] → Scan image directory, batch by size          │
│                                                                 │
│  2. FETCH TRENDING TAGS                                         │
│     ↓                                                            │
│     [ShutterStockService] → Browser automation → Parse tags    │
│                                                                 │
│  3. FOR EACH IMAGE ──────────────────────────────────────────  │
│                                                                 │
│     A. GENERATE METADATA                                        │
│        [LangChainService] → Vision model + LLM → JSON output   │
│                                                                 │
│     B. VALIDATE & RETRY                                        │
│        [MetadataValidator] → Check constraints                  │
│        → Retry up to 4 times if invalid                         │
│                                                                 │
│     C. ENRICH TAGS                                             │
│        [TagEnrichmentService] → Score trending tags             │
│        → Merge with generated tags (1-25 total)                │
│                                                                 │
│     D. UPLOAD IMAGE                                            │
│        [ShutterStockService] → Browser automation              │
│        → Fill forms → Submit                                    │
│                                                                 │
│     E. LOG RESULT                                              │
│        [Pipeline] → JSON log + CSV row                          │
│        → Move file to processed/failed directory               │
│                                                                 │
│  4. GENERATE CSV & UPLOAD                                       │
│     ↓                                                            │
│     [CsvService] → Write batch CSV                              │
│     [ShutterStorage] → Upload CSV (if not dry-run)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Service Dependency Graph

```
                    ┌─────────────────────┐
                    │  PipelineService    │ ← Main Orchestrator
                    └──────────┬──────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
     ┌────▼────┐         ┌────▼────┐      ┌──────▼──────┐
     │ FileService        │ Platform │      │LangChainService
     │(file discovery)    │(uploads) │      │(AI metadata)
     └──────────┘         └────┬────┘      └──────┬──────┘
                               │                   │
                    ┌──────────┴────────────┐      │
                    │                      │      │
            ┌───────▼─────────┐   ┌───────▼──────▼────┐
            │ShutterStockSvc  │   │LLM Chain + Config │
            │(web automation) │   │(Ollama)           │
            └─────────────────┘   └──────────────────┘

                    ┌──────────────────────────┐
                    │   Utility Services       │
                    ├──────────────────────────┤
                    │ • MetadataValidator      │
                    │ • TagEnrichmentService   │
                    │ • CsvService            │
                    └──────────────────────────┘
```

### Platform Abstraction

All platform-specific logic extends `PlatformService` base class:

```javascript
PlatformService (Abstract)
  ├── ShutterStockService (✅ Implemented)
  ├── GettyImagesService (🚀 Future)
  ├── AlamyService (🚀 Future)
  └── AdobeStockService (🚀 Future)
```

The `PlatformFactory` handles instantiation based on `SERVICE_PLATFORMS` env variable.

---

## Quick Start

### 1. Prerequisites

- **Node.js** >= 18.0.0
- **Chrome/Chromium** browser with **[Chrome DevTools Protocol (CDP) enabled](https://chromedriver.chromium.org/)**
- **Ollama** running locally with `llama3` and `llama3.2-vision` models

### 2. Installation

```bash
# Clone or download the repository
cd social-media-manager-ai-agent

# Install dependencies
npm install

# Create environment file
cp .env.example .env  # OR create .env with configuration below

# Create required directories
mkdir -p data processed failed
```

### 3. Start Chrome with CDP

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$(mktemp -d) &

# Linux
google-chrome \
  --remote-debugging-port=9222 \
  --no-sandbox \
  --user-data-dir=$(mktemp -d) &

# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\chrome-profile"
```

### 4. Run the Pipeline

```bash
# Full pipeline: generate metadata, validate, upload to Shutterstock
npm start

# Fetch trending tags only (dry run, no uploads)
npm run trends

# Run with specific environment
SERVICE_PLATFORMS=shutterstock PIPELINE_DRY_RUN=true npm start
```

### 5. Monitor Results

- **Upload Log**: `./data/upload-log.json` — JSON log of all processed images
- **CSV Output**: `./data/shutterstock-metadata-batch.csv` — Bulk metadata for Shutterstock
- **Processed Images**: `./processed/` — Successfully uploaded images
- **Failed Images**: `./failed/` — Images that failed validation or upload

---

## Configuration

### Environment Variables

#### Directory Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCAN_PICTURES_DIRECTORY` | - | Source directory containing images to upload |
| `PROCESSED_PICTURES_DIRECTORY` | `./processed` | Destination for successfully uploaded images |
| `FAILED_PICTURES_DIRECTORY` | `./failed` | Destination for images that failed |

#### Shutterstock Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SHUTTERSTOCK_USERNAME` | - | Shutterstock contributor username/email |
| `SHUTTERSTOCK_PASSWORD` | - | Shutterstock password |
| `SHUTTERSTOCK_MODE` | `web_automation` | Upload method (currently only web_automation) |
| `SHUTTERSTOCK_CONTRIBUTOR_LINK` | `https://submit.shutterstock.com/` | Shutterstock portal URL |
| `SHUTTERSTOCK_UPLOAD_PAGE_URL` | Built-in | Shutterstock upload page URL |
| `SHUTTERSTOCK_ENABLE_ANTI_BOT_DELAYS` | `true` | Enable human-like delays (disable for testing) |
| `SHUTTERSTOCK_SLOW_MIN_MS` | `2000` | Minimum delay (milliseconds) |
| `SHUTTERSTOCK_SLOW_MAX_MS` | `4800` | Maximum delay (milliseconds) |

#### LLM Configuration (Ollama)

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3` | Text generation model name |
| `OLLAMA_VISION_MODEL` | `llama3.2-vision` | Image analysis model name |
| `OLLAMA_TEMPERATURE` | `0.2` | LLM creativity (0.0 = deterministic, 1.0 = creative) |
| `OLLAMA_MAX_RETRIES` | `2` | LLM request retries |
| `OLLAMA_TIMEOUT_MS` | `60000` | LLM request timeout |
| `OLLAMA_REQUIRE_VISION` | `true` | Fail if vision model unavailable |

#### Pipeline Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_DRY_RUN` | `true` | Simulate without uploading (set to `false` to upload) |
| `PIPELINE_MAX_IMAGES_PER_RUN` | `1` | Max images to process per run |
| `PIPELINE_BATCH_SIZE` | `1` | Number of images per batch |
| `PIPELINE_MAX_METADATA_RETRIES` | `4` | Retries for metadata generation on validation failure |
| `PIPELINE_UPLOAD_LOG_PATH` | `./data/upload-log.json` | JSON log file path |
| `PIPELINE_CSV_OUTPUT_PATH` | `./data/shutterstock-metadata-batch.csv` | CSV output path |

#### Metadata Validation

| Variable | Default | Description |
|----------|---------|-------------|
| `SHUTTERSTOCK_TITLE_MIN_LENGTH` | `8` | Minimum title length |
| `SHUTTERSTOCK_TITLE_MAX_LENGTH` | `120` | Maximum title length |
| `SHUTTERSTOCK_DESCRIPTION_MIN_LENGTH` | `40` | Minimum description length |
| `SHUTTERSTOCK_DESCRIPTION_MAX_LENGTH` | `200` | Maximum description length |
| `SHUTTERSTOCK_MIN_TAG_COUNT` | `10` | Minimum tags required |
| `SHUTTERSTOCK_MAX_TAGS` | `25` | Maximum tags allowed |

#### Browser & Connectivity

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_CHROMIUM_SERVER` | - | Chrome CDP endpoint (e.g., `http://127.0.0.1:9222`) |

#### Platform (Future-Proofing)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_PLATFORMS` | `shutterstock` | Comma-separated platforms (e.g., `shutterstock,getty,alamy`) |

---

## Service Architecture

### Core Services

#### 🏗️ PipelineService

**Location**: `services/Pipeline/index.js`

Main orchestrator that coordinates the workflow:

- **`run()`** — Execute full pipeline: discover images → generate metadata → validate → enrich → upload
- **`getPendingImages()`** — Get unprocessed images (checks upload log)
- **`buildValidatedMetadata(imagePath, trendingTags)`** — Generate and validate metadata with retries
- **`getUploadLog()`** — Load JSON upload tracking log
- **`logResult(entry)`** — Append result to upload log

```javascript
// Usage
const pipeline = new PipelineService();
await pipeline.run();
```

---

#### 📸 ShutterStockService

**Location**: `services/shutterstock/index.js`  
**Extends**: `PlatformService` (abstract base class)

Handles all Shutterstock-specific operations:

**Upload Operations**:
- **`uploadImage(input)`** — Upload single image with metadata
- **`uploadMetadataCsv(csvPath)`** — Bulk upload metadata via CSV
- **`fetchTrendingTags()`** — Get platform trending tags

**Web Automation**:
- **`prefillUploadForm(imagePath)`** — Fill upload form + select file
- **`prefillLoginForm()`** — Auto-fill credentials (requires manual submit due to bot detection)
- **`prefillMetadataForm(metadata)`** — Fill title/description/tags (currently unused, requires manual completion)

**Browser Management**:
- **`ensureBrowser()`** — Connect via Chrome CDP
- **`closeBrowser()`** — Clean up resources

**Utility Methods**:
- **`randomDelay()`** — Configurable human-like delays (respects `SHUTTERSTOCK_ENABLE_ANTI_BOT_DELAYS`)
- **`findFirstAvailable(selectors)`** — Try multiple CSS selectors
- **`detectPageState()`** — Identify page state (LOGIN, UPLOAD, etc.)

```javascript
// Usage
const service = new ShutterStockService();

// Upload image
await service.uploadImage({
  imagePath: '/path/to/image.jpg',
  metadata: {
    title: 'Sunset Beach',
    description: 'Beautiful sunset at the beach...',
    tags: ['sunset', 'beach', 'golden hour'],
    primaryCategory: 'Nature',
  }
});

// Fetch trending tags
const tags = await service.fetchTrendingTags();
console.log(tags); // ['nature', 'landscape', 'travel', ...]
```

---

#### 🧠 LangChainService

**Location**: `services/LangChainService/index.js`

AI-powered metadata generation using Ollama:

- **`generateMetadata(options)`** — Generate title, description, tags, and categories
  - Analyzes image with vision model
  - Processes filename hints and trending tags
  - Invokes LLM with structured prompt
  - Parses JSON response

- **`describeImageWithVisionModel(imagePath)`** — Get literal image description
- **`normalizeCategory(value)`** — Validate category against allowed list
- **`buildFileHints(imagePath)`** — Extract keywords from filename

```javascript
// Usage
const service = new LangChainService();

const metadata = await service.generateMetadata({
  imagePath: '/path/to/sunset_beach.jpg',
  trendingTags: ['sunset', 'travel', 'photography'],
  validationErrors: [] // From previous retry
});

console.log(metadata);
// {
//   title: 'Serene Sunset at Tropical Beach',
//   description: 'Golden hour sunset over calm beach waters...',
//   tags: ['sunset', 'beach', 'tropical', ...],
//   primaryCategory: 'Nature',
//   secondaryCategory: 'Travel'
// }
```

---

#### ✅ MetadataValidator

**Location**: `services/MetadataValidator/index.js`

Validates metadata against Shutterstock requirements:

- **`validate(metadata)`** — Comprehensive validation
  - Title/description length checks
  - Character set validation (ASCII + newlines)
  - Tag count (10-25) and format
  - Category existence
  - Unique tags

- **`normalizeTags(tags)`** — Deduplicate and lowercase tags
- **`cleanText(value)`** — Remove extra whitespace
- **`normalizeCategory(value)`** — Map to allowed categories

```javascript
// Usage
const validator = new MetadataValidator();

const result = validator.validate({
  title: 'Sunset Beach',
  description: 'Beautiful sunset photograph...',
  tags: ['sunset', 'beach', 'nature'],
  primaryCategory: 'Nature'
});

if (!result.valid) {
  console.log(result.errors); // ['not enough tags (min 10)', ...]
}
```

---

#### 🏷️ TagEnrichmentService

**Location**: `services/TagEnrichmentService/index.js`

Merges generated tags with platform trending tags:

- **`enrich(options)`** — Rank trending tags by relevance to generated tags
  - Scores based on token overlap with generated tags
  - Merges both lists, prioritizing generated
  - Returns up to `maxTagCount` unique tags

- **`scoreTag(tag, baseTokens)`** — Calculate relevance score
- **`normalizeTags(tags)`** — Normalize and deduplicate

```javascript
// Usage
const service = new TagEnrichmentService();

const enriched = service.enrich({
  generatedTags: ['sunset', 'beach', 'tropical'],
  trendingTags: ['sunset', 'travel', 'photography', 'landscape']
});

console.log(enriched);
// ['sunset', 'beach', 'tropical', 'travel', 'photography', ...]
```

---

#### 📊 CsvService

**Location**: `services/CsvService/index.js`

CSV generation for bulk metadata uploads:

- **`toRow(input)`** — Convert metadata to CSV row
- **`writeBatch(rows, outputPath)`** — Write CSV file
- **`escape(value)`** — CSV-escape cell values
- **`toCsvYesNo(value)`** — Boolean to "yes"/"no" conversion
- **`toIsoOrEmpty(value)`** — Timestamp to ISO 8601

---

#### 📁 FileService

**Location**: `services/filesService/index.js`

File system operations:

- **`getImageFiles(dirPath, batch)`** — Recursively find .jpg/.jpeg files, batch by size
- **`moveFileToDirectory(filePath, destDir)`** — Move file with auto-mkdir
- **`ensureDirectory(dirPath)`** — Create directory if needed

---

#### 🔧 PlatformFactory

**Location**: `services/PlatformFactory.js`

Factory for instantiating platform services:

```javascript
// Get single platform service
const shutterstock = PlatformFactory.getPlatformService('shutterstock');

// Get all configured platforms
const services = PlatformFactory.getPlatformServices(); // Reads SERVICE_PLATFORMS env
// { shutterstock: ShutterStockService, getty: GettyImagesService, ... }

// Check platform availability
if (PlatformFactory.isSupported('getty')) { ... }

// Register new platform  (for future implementations)
PlatformFactory.registerPlatform('getty', GettyImagesService);
```

---

#### 🏗️ PlatformService (Abstract Base)

**Location**: `services/BaseService/PlatformService.js`

Abstract interface all platform implementations must follow:

**Required Methods**:
- `uploadImage(input)` — Upload single image
- `uploadMetadataCsv(csvPath)` — Bulk metadata upload
- `fetchTrendingTags()` — Get platform trending tags
- `authenticate(username, password)` — Login
- `logout()` — Logout
- `isAuthenticated()` — Check auth status
- `validateMetadata(metadata)` — Platform-specific validation
- `cleanup()` — Resource cleanup
- `getPlatformInfo()` — Platform capabilities/limits

This design enables adding new platforms (Getty, Alamy, Adobe) with custom implementations.

---

## Extending for New Platforms

Adding a new platform (e.g., **Getty Images**) is straightforward:

### Step 1: Create New Service Class

```javascript
// services/getty/index.js
const PlatformService = require("../BaseService/PlatformService");

class GettyImagesService extends PlatformService {
  constructor() {
    super(config.getty);
    this.platformName = "getty";
  }

  async uploadImage(input) {
    // Getty-specific upload logic
  }

  async uploadMetadataCsv(csvPath) {
    // Getty CSV bulk upload
  }

  async fetchTrendingTags() {
    // Fetch Getty trending tags
  }

  // ... implement other interface methods
}

module.exports = GettyImagesService;
```

### Step 2: Register with Factory

```javascript
// services/PlatformFactory.js

const GettyImagesService = require("../getty");

class PlatformFactory {
  static PLATFORM_MAP = {
    shutterstock: ShutterStockService,
    getty: GettyImagesService,  // ← Add here
  };
}
```

### Step 3: Configure Getty

```bash
# .env
SERVICE_PLATFORMS=shutterstock,getty
GETTY_USERNAME=your_getty_username
GETTY_PASSWORD=your_getty_password
# ... getty-specific config
```

### Step 4: Use in Pipeline

The pipeline automatically uses all configured platforms (or you can explicitly target one):

```javascript
// Upload to all platforms
SERVICE_PLATFORMS=shutterstock,getty npm start

// Or target single platform
const getty = PlatformFactory.getPlatformService('getty');
await getty.uploadImage({ imagePath, metadata });
```

That's it! The pipeline handles the rest.

---

## Development

### Project Scripts

```bash
# Run full pipeline  
npm start

# Fetch trending tags only (useful for testing)
npm run trends

# Dry run (test without uploading)
PIPELINE_DRY_RUN=true npm start

# Test with anti-bot delays disabled (speed up testing)
SHUTTERSTOCK_ENABLE_ANTI_BOT_DELAYS=false npm start

# Lint (once testing framework added)
# npm test
```

### Code Style

- **Naming**: camelCase for variables/methods, PascalCase for classes
- **Comments**: JSDoc for functions, inline comments for complex logic
- **Async**: Always use `async/await`, avoid callbacks
- **Error Handling**: Try-catch with descriptive error messages
- **Logging**: Use `console.log` for info, `console.warn` for warnings, `console.error` for errors

### Adding Logging

Enable debug logging:

```bash
# Verbose upload details
DEBUG=* npm start

# Or check debug logs in files
cat /tmp/uploader-debug.log
```

---

## Troubleshooting

### ❌ "No browser contexts were found"

**Cause**: Chrome not running with CDP or port incorrect  
**Solution**:
```bash
# Start Chrome with CDP
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 &

# Verify connection
curl http://127.0.0.1:9222/json/version
```

### ❌ "Vision request failed"

**Cause**: Ollama vision model not installed  
**Solution**:
```bash
# Pull vision model
ollama pull llama3.2-vision

# Verify it runs
ollama run llama3.2-vision
```

### ❌ "Model did not return JSON output"

**Cause**: LLM response not properly formatted  
**Workaround**: 
- Reduce `OLLAMA_TEMPERATURE` (e.g., 0.1)
- Increase `OLLAMA_MAX_RETRIES`
- Check Ollama is online: `curl http://127.0.0.1:11434/api/tags`

### ❌ Images not uploading

**Cause**: Login required but credentials not submitted  
**Note**: Browser automation currently requires **manual login** due to Shutterstock's bot detection. You'll be prompted to submit login manually when browser opens.

**Workaround**: Set `PIPELINE_DRY_RUN=true` to test without uploads.

### ❌ "Tag length out of bounds"

**Cause**: Generated tags exceed length limits (2-50 chars)  
**Solution**: Update vocabulary in LLM prompt or adjust validation in `MetadataValidator`

### ⚠️ Slow Processing

**Optimization**:
- Disable anti-bot delays for testing: `SHUTTERSTOCK_ENABLE_ANTI_BOT_DELAYS=false`
- Reduce `OLLAMA_TIMEOUT_MS` for faster LLM inference
- Increase `PIPELINE_MAX_IMAGES_PER_RUN` for batch processing
- Use faster LLM: `OLLAMA_MODEL=mistral` instead of llama3

---

## Known Limitations & Future Work

### Current Limitations

❌ **Manual Login Submission** — Browser automation pauses for manual login due to Shutterstock anti-bot measures  
❌ **Web Automation Only** — No direct API integration (Shutterstock doesn't have public submission API)  
❌ **Sequential Processing** — Processes one image at a time (no concurrent uploads)  
❌ **No Email/Notification Alerts** — Relies on log file monitoring  
❌ **Metadata Form Filling Incomplete** — Title/description/tags still require manual entry after image upload  
❌ **Limited Error Recovery** — Failed uploads require manual retry  

### Future Enhancements

🚀 **Multi-Platform Support** — Getty, Alamy, Adobe Stock (architecture ready)  
🚀 **Direct API Integration** — Use official APIs instead of web automation where available  
🚀 **Concurrent Processing** — Upload multiple images in parallel (with rate limiting)  
🚀 **Queue-Based System** — Persistent job queue for large batches  
🚀 **Advanced Error Handling** — Auto-retry with exponential backoff  
🚀 **Email/Slack Notifications** — Alert on upload completion/failure  
🚀 **Web Dashboard** — Monitor pipeline status, logs, and analytics  
🚀 **Scheduled Runs** — Cron-based automated processing  
🚀 **OAuth Authentication** — Securely store credentials instead of env vars  
🚀 **Unit & Integration Tests** — Comprehensive test coverage  
🚀 **Docker Support** — Containerized deployment  

---

## Architecture Decisions

### Why Playwright CDP?

- **Real browser automation** for handling authentication and form filling
- **No API required** for web interactions
- **JavaScript execution** for complex page logic
- **Event-driven** interaction tracking

### Why Ollama (Local LLM)?

- **Privacy** — No data sent to third parties
- **Cost** — Free open-source models
- **Speed** —  Local inference, no network latency
- **Control** — Customize models and prompts freely

### Why Abstract Factory Pattern?

- **Extensibility** — Easy to add new platforms
- **Maintainability** — Platform-specific logic isolated
- **Testability** — Mock platforms for unit tests
- **Configuration-driven** — Platforms loaded via env vars

### Why JSON + CSV Logging?

- **JSON** for programmatic analysis and detailed logging
- **CSV** for direct Shutterstock bulk upload
- **Dual logging** ensures visibility and compatibility

---

## License

MIT © Harshdeep Singh

Feel free to use, modify, and share this project.

---

## Contributing

This project is open for improvements! Common areas for contribution:

- [ ] Add unit/integration tests
- [ ] Implement Getty Images platform
- [ ] Add web dashboard
- [ ] Improve error handling and recovery
- [ ] Document additional platforms
- [ ] Performance optimizations

---

## Support

Found an issue or have a feature request? Open a GitHub issue with:

1. **Environment**: OS, Node version, Chrome version
2. **Steps to reproduce**: Clear reproduction instructions
3. **Expected**  vs **actual** behavior
4. **Logs**: Relevant console output or upload-log.json excerpt

---

## Acknowledgments

- **Playwright** — Powerful browser automation
- **LangChain** — Excellent LLM orchestration framework
- **Ollama** — Accessible local LLM inference
- **Shutterstock** — For the submission platform

---

## Changelog

### v1.0.0 (Current)

✅ Initial release  
✅ Shutterstock integration via web automation  
✅ LLM-powered metadata generation  
✅ Trending tag enrichment  
✅ Comprehensive validation  
✅ Job tracking and logging  
✅ Platform-agnostic architecture  
✅ Comprehensive documentation  

---

**Happy uploading! 📸**
