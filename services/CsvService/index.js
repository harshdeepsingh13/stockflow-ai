/**
 * @file CsvService - CSV generation for Shutterstock metadata bulk uploads
 * @description Formats metadata into CSV rows compatible with Shutterstock's bulk upload format.
 * Handles escaping, boolean/date formatting, and file I/O operations.
 */

const fs = require("fs");
const path = require("path");
const { config } = require("../../config");

/**
 * CsvService - Generates CSV files for Shutterstock metadata uploads
 * @class
 * @description Converts metadata objects into properly formatted CSV rows
 * and manages bulk CSV file generation and writing.
 */
class CsvService {
  /**
   * Creates a CsvService instance
   * @constructor
   */
  constructor() {
    this.settings = config.pipeline;
  }

  /**
   * Build CSV header row for Shutterstock metadata
   * @returns {Array<string>} Header column names
   */
  buildHeader() {
    return [
      "Filename",
      "Description",
      "Keywords",
      "Categories",
      "Editorial",
      "Mature content",
      "illustration",
      "Upload status",
      "Error",
      "Started at",
      "Finished at",
    ];
  }

  /**
   * Convert a metadata object to a CSV row
   * Handles tag/category formatting and boolean conversion
   * @param {Object} input - Row input data
   * @param {string} input.imagePath - Path to image file
   * @param {Object} input.metadata - Metadata object (description, tags, categories, flags)
   * @param {string} input.status - Upload status (default: "pending")
   * @param {string} input.error - Error message if status is failed (default: "")
   * @param {number} input.startedAt - Start timestamp
   * @param {number} input.finishedAt - End timestamp
   * @returns {Array<string>} CSV row values
   */
  toRow(input = {}) {
    const {
      imagePath,
      metadata = {},
      status = "pending",
      error = "",
      startedAt,
      finishedAt,
    } = input;

    const filename = imagePath ? path.basename(imagePath) : "";
    const categories = [metadata.primaryCategory, metadata.secondaryCategory].filter(Boolean).join(",");
    const keywords = Array.isArray(metadata.tags) ? metadata.tags.join(",") : "";

    return [
      filename,
      metadata.description || "",
      keywords,
      categories,
      this.toCsvYesNo(metadata.editorial, "no"),
      this.toCsvYesNo(metadata.matureContent, "no"),
      this.toCsvYesNo(metadata.illustration, "no"),
      status,
      error || "",
      this.toIsoOrEmpty(startedAt),
      this.toIsoOrEmpty(finishedAt),
    ];
  }

  /**
   * Write batch of CSV rows to file
   * Creates directory if needed, includes header row, returns file info
   * @param {Array<Array<string>>} rows - Array of CSV rows
   * @param {string} outputPath - Target CSV file path (default: configured path)
   * @returns {Object} Result { path: string, rowCount: number }
   */
  writeBatch(rows, outputPath = this.settings.csvOutputPath) {
    const resolvedPath = path.resolve(outputPath);
    const dirPath = path.dirname(resolvedPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const lines = [
      this.buildHeader().map((value) => this.escape(value)).join(","),
      ...rows.map((row) => row.map((value) => this.escape(value)).join(",")),
    ];

    fs.writeFileSync(resolvedPath, `${lines.join("\n")}\n`, "utf8");
    return { path: resolvedPath, rowCount: rows.length };
  }

  /**
   * Escape CSV field value - quotes and escapes as needed
   * @param {*} value - Value to escape
   * @returns {string} Properly escaped CSV field
   */
  escape(value) {
    const asString = String(value ?? "");
    const escaped = asString.replace(/"/g, '""');

    if (/[",\n\r]/.test(escaped)) {
      return `"${escaped}"`;
    }

    return escaped;
  }

  /**
   * Convert value to CSV yes/no string
   * Handles boolean, string, and unknown types with fallback
   * @param {*} value - Value to convert
   * @param {string} fallback - Default if value is unclear (default: "no")
   * @returns {string} "yes" or "no"
   */
  toCsvYesNo(value, fallback = "no") {
    if (typeof value === "boolean") {
      return value ? "yes" : "no";
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "yes" || normalized === "true") {
        return "yes";
      }
      if (normalized === "no" || normalized === "false") {
        return "no";
      }
    }

    return fallback;
  }

  /**
   * Convert timestamp to ISO 8601 string or empty string
   * @param {number|Date|*} value - Timestamp or date value
   * @returns {string} ISO 8601 datetime or empty string
   */
  toIsoOrEmpty(value) {
    if (!value) {
      return "";
    }

    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) {
      return "";
    }

    return asDate.toISOString();
  }
}

module.exports = CsvService;
