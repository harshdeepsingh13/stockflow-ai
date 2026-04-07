/**
 * @file PipelineService - Orchestrates the complete photo upload workflow
 * @description Manages the end-to-end pipeline for image processing, metadata generation,
 * validation, enrichment, and uploading to configured stock photo platforms.
 * Coordinates between LLM services, metadata validators, and platform-specific upload services.
 */

const fs = require("fs");
const path = require("path");
const { config } = require("../../config");
const FileService = require("../filesService");
const PlatformFactory = require("../PlatformFactory");
const LangChainService = require("../LangChainService");
const MetadataValidator = require("../MetadataValidator");
const TagEnrichmentService = require("../TagEnrichmentService");
const CsvService = require("../CsvService");

/**
 * PipelineService - Main orchestration service for the upload workflow
 * @class
 * @description Coordinates image discovery, metadata generation, validation,
 * enrichment with trending tags, and upload to stock photo platforms.
 */
class PipelineService {
  /**
   * Creates a PipelineService instance
   * @constructor
   */
  constructor() {
    this.settings = config.pipeline;
    this.fileService = new FileService();
    this.platformService = PlatformFactory.getPlatformService("shutterstock");
    this.langChainService = new LangChainService();
    this.validator = new MetadataValidator();
    this.tagEnrichment = new TagEnrichmentService();
    this.csvService = new CsvService();
  }

  /**
   * Run the complete upload pipeline
   * Fetches pending images, generates metadata, validates, enriches, and uploads
   * @async
   * @returns {Promise<void>}
   */
  async run() {
    const csvRows = [];

    try {
      const images = this.getPendingImages();
      console.debug("Pending images for processing:", images.length);
      if (!images.length) {
        console.log("No images found in source directory.");
        return;
      }

      const trendingTags = await this.platformService.fetchTrendingTags();
      console.log(`Loaded ${trendingTags.length} trending tags.`);

      for (const imagePath of images) {
        const startedAt = Date.now();
        let metadata = null;

        try {
          metadata = await this.buildValidatedMetadata(imagePath, trendingTags);
          console.log("Metadata ready:", { imagePath, metadata });

          if (this.settings.dryRun) {
            const finishedAt = Date.now();
            this.logResult({
              imagePath,
              status: "dry_run",
              processedPath: null,
              startedAt,
              error: null,
            });

            csvRows.push(
              this.csvService.toRow({
                imagePath,
                metadata,
                status: "dry_run",
                startedAt,
                finishedAt,
              }),
            );
            continue;
          }

          {
            const uploadResult = await this.platformService.uploadImage({
              imagePath,
              metadata,
              options: { saveDraft: false },
            });

            if (!["uploaded", "draft_saved"].includes(uploadResult?.status)) {
              throw new Error(`Upload did not reach uploaded state: ${JSON.stringify(uploadResult)}`);
            }
          }

          const processedPath = this.fileService.moveFileToDirectory(imagePath, config.processedPicturesDirPath);
          const finishedAt = Date.now();
          this.logResult({ imagePath, status: "processed", processedPath, startedAt, error: null });

          csvRows.push(
            this.csvService.toRow({
              imagePath,
              metadata,
              status: "processed",
              startedAt,
              finishedAt,
            }),
          );
        } catch (error) {
          console.error(`Pipeline failed for ${imagePath}`, error.message);
          const finishedAt = Date.now();
          if (
            String(error.message || "")
              .toLowerCase()
              .includes("vision")
          ) {
            console.error("Vision failure hint: verify OLLAMA_VISION_MODEL and run `ollama pull llama3.2-vision`.");
          }

          if (config.failedPicturesDirPath && fs.existsSync(imagePath)) {
            try {
              const failedPath = this.fileService.moveFileToDirectory(imagePath, config.failedPicturesDirPath);
              this.logResult({
                imagePath,
                status: "failed",
                processedPath: failedPath,
                startedAt,
                error: error.message,
              });

              csvRows.push(
                this.csvService.toRow({
                  imagePath,
                  metadata: metadata || {},
                  status: "failed",
                  error: error.message,
                  startedAt,
                  finishedAt,
                }),
              );
              continue;
            } catch (moveError) {
              console.error("Failed to move image to failed directory.", moveError.message);
            }
          }

          this.logResult({ imagePath, status: "failed", processedPath: null, startedAt, error: error.message });

          csvRows.push(
            this.csvService.toRow({
              imagePath,
              metadata: metadata || {},
              status: "failed",
              error: error.message,
              startedAt,
              finishedAt,
            }),
          );
        }
      }

      if (!csvRows.length) {
        console.log("Skipping CSV generation because no rows were collected.");
        return;
      }

      const csvResult = this.csvService.writeBatch(csvRows, this.settings.csvOutputPath);
      console.log(`Saved Shutterstock metadata CSV: ${csvResult.path} (${csvResult.rowCount} rows)`);

      if (this.settings.dryRun) {
        console.log("Dry run enabled. Skipping CSV upload automation.");
        return;
      }

      const csvUploadResult = await this.platformService.uploadMetadataCsv(csvResult.path);
      console.log("CSV upload result:", csvUploadResult);
    } finally {
      await this.platformService.cleanup().catch(() => {});
    }
  }

  /**
   * Get pending images that haven't been processed yet
   * Excludes images already logged in the upload log with "processed" status
   * @returns {Array<string>} Array of image file paths pending processing
   */
  getPendingImages() {
    const batches = this.fileService.getImageFiles(config.scanPicturesDirPath, this.settings.batchSize);
    const allImages = batches.flat();
    const processed = new Set(
      this.getUploadLog()
        .filter((row) => row.status === "processed")
        .map((row) => row.imagePath),
    );
    const pending = allImages.filter((imagePath) => !processed.has(imagePath));
    const maxImages = Number(this.settings.maxImagesPerRun);

    if (!Number.isInteger(maxImages) || maxImages <= 0) {
      return pending;
    }

    return pending.slice(0, maxImages);
  }

  /**
   * Generate, validate, and enrich metadata for a single image
   * Retries metadata generation if validation fails (up to maxMetadataRetries)
   * Enriches generated tags with trending tags and validates against platform requirements
   * @async
   * @param {string} imagePath - Absolute path to the image file
   * @param {Array<string>} trendingTags - Array of trending tags from platform
   * @returns {Promise<Object>} Validated metadata object
   * @throws {Error} If metadata generation fails validation after all retries
   */
  async buildValidatedMetadata(imagePath, trendingTags) {
    let validationErrors = [];

    for (let attempt = 0; attempt <= this.settings.maxMetadataRetries; attempt += 1) {
      let generated = null;
      try {
        generated = await this.langChainService.generateMetadata({
          imagePath,
          trendingTags,
          validationErrors,
        });
      } catch (generationError) {
        console.error(
          `Metadata generation failed for ${imagePath} on attempt ${attempt + 1}.`,
          generationError.message,
        );
        if (attempt === this.settings.maxMetadataRetries) {
          throw new Error(
            `Metadata generation failed after ${this.settings.maxMetadataRetries + 1} attempts: ${generationError.message}`,
          );
        }
        validationErrors = [`Generation error: ${generationError.message}`];
        continue;
      }

      const mergedTags = this.tagEnrichment.enrich({
        generatedTags: generated.tags,
        trendingTags,
      });

      const validationResult = this.validator.validate({
        ...generated,
        tags: mergedTags,
      });

      if (validationResult.valid) {
        return validationResult.metadata;
      }

      validationErrors = validationResult.errors;
      console.warn(
        `Metadata validation failed for ${path.basename(imagePath)} (attempt ${attempt + 1}).`,
        validationErrors,
      );
    }

    throw new Error(`Metadata generation failed validation after ${this.settings.maxMetadataRetries + 1} attempts.`);
  }

  /**
   * Load upload log from JSON file
   * Returns empty array if log doesn't exist, creating it if necessary
   * Handles JSON parse errors gracefully
   * @returns {Array<Object>} Array of upload log entries
   */
  getUploadLog() {
    const logPath = path.resolve(this.settings.uploadLogPath);
    const dirPath = path.dirname(logPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, "[]", "utf8");
      return [];
    }

    const raw = fs.readFileSync(logPath, "utf8") || "[]";
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Upload log was invalid JSON. Reinitializing.");
      fs.writeFileSync(logPath, "[]", "utf8");
      return [];
    }
  }

  /**
   * Log a single upload result to the upload log
   * Appends entry with status, path, error details, and timestamps
   * @param {Object} entry - Log entry information
   * @param {string} entry.imagePath - Path to the image that was processed
   * @param {string} entry.status - Upload status (processed, failed, dry_run)
   * @param {string|null} entry.processedPath - Path where image was moved (if processed)
   * @param {number} entry.startedAt - Timestamp when processing started
   * @param {string|null} entry.error - Error message if status is failed
   * @returns {void}
   */
  logResult({ imagePath, status, processedPath, startedAt, error }) {
    const rows = this.getUploadLog();
    rows.push({
      imagePath,
      status,
      processedPath,
      error,
      startedAt,
      finishedAt: Date.now(),
    });

    const logPath = path.resolve(this.settings.uploadLogPath);
    fs.writeFileSync(logPath, JSON.stringify(rows, null, 2), "utf8");
  }
}

module.exports = PipelineService;
