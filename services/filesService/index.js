/**
 * @file FileService - File system operations for image discovery and management
 * @description Discovers image files in directories, organizes into batches,
 * moves files to processed/failed directories, and creates directories as needed.
 */

const { config } = require("../../config");
const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg"]);

/**
 * FileService - Manages file system operations
 * @class
 * @description Handles image file discovery, directory navigation,
 * file moving, and directory creation operations.
 */
class FileService {
  /**
   * Creates a FileService instance
   * @constructor
   */
  constructor() {
    this.dirPath = config.scanPicturesDirPath;
  }

  /**
   * Get image files from directory, organized into batches
   * Recursively searches for .jpg and .jpeg files
   * @param {string} dirPath - Directory path to scan (default: configured path)
   * @param {number} batch - Batch size for grouping files (default: 10)
   * @returns {Array<Array<string>>} Array of batches, each batch is array of file paths
   * @throws {Error} If batch size is invalid
   */
  getImageFiles(dirPath = this.dirPath, batch = 10) {
    const batchSize = Number(batch);
    console.debug("batchSize", batchSize);
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batch must be a positive integer");
    }
    if (!dirPath || !fs.existsSync(dirPath)) {
      return [];
    }

    const imagePaths = [];

    const walk = (currentPath) => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
        //   walk(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const extension = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(extension)) {
          imagePaths.push(entryPath);
        }
      }
    };

    walk(dirPath);

    const batches = [];
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      batches.push(imagePaths.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * @param {string} dirPath - Directory path to create
   * @throws {Error} If directory path is not provided
   * @returns {void}
   */
  ensureDirectory(dirPath) {
    if (!dirPath) {
      throw new Error("Directory path is required");
    }

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Move a file to a destination directory
   * Preserves filename, creates destination directory if needed
   * @param {string} filePath - Absolute path to file to move
   * @param {string} destinationDirectory - Absolute path to destination directory
   * @returns {string} New file path after move
   * @throws {Error} If source file doesn't exist
   */
  moveFileToDirectory(filePath, destinationDirectory) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    this.ensureDirectory(destinationDirectory);
    const destinationPath = path.join(destinationDirectory, path.basename(filePath));
    fs.renameSync(filePath, destinationPath);
    return destinationPath;
  }
}

module.exports = FileService;
