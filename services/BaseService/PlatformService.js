/**
 * @file PlatformService - Abstract base class for stock photo platform integrations
 * @description Defines the contract that all platform implementations must follow.
 * This enables future extensibility for platforms like Getty Images, Alamy, Adobe Stock, etc.
 */

/**
 * Abstract base class for platform services
 * @abstract
 * @class PlatformService
 */
class PlatformService {
  /**
   * Creates an instance of PlatformService
   * @param {Object} config - Platform-specific configuration
   * @throws {Error} Cannot instantiate abstract class directly
   */
  constructor(config) {
    if (new.target === PlatformService) {
      throw new Error("Cannot instantiate abstract class PlatformService directly. Extend it instead.");
    }
    this.config = config;
    this.platformName = "UNKNOWN";
  }

  /**
   * Upload a single image with metadata to the platform
   * @abstract
   * @param {Object} input - Upload input configuration
   * @param {string} input.imagePath - Absolute path to the image file
   * @param {Object} input.metadata - Image metadata (title, description, tags, categories)
   * @param {Object} input.options - Upload options (e.g., saveDraft, visibility)
   * @returns {Promise<Object>} Upload result with status, flow, and manualActionRequired fields
   * @throws {Error} If image path is invalid or upload fails
   */
  async uploadImage(input) {
    throw new Error(`${this.constructor.name} must implement uploadImage() method`);
  }

  /**
   * Upload metadata (bulk) via CSV file to the platform
   * @abstract
   * @param {string} csvPath - Absolute path to the CSV file containing metadata
   * @returns {Promise<Object>} Upload result with status and any required manual actions
   * @throws {Error} If CSV path is invalid or upload fails
   */
  async uploadMetadataCsv(csvPath) {
    throw new Error(`${this.constructor.name} must implement uploadMetadataCsv() method`);
  }

  /**
   * Fetch trending tags/keywords for the platform
   * @abstract
   * @returns {Promise<Array<string>>} Array of trending tags
   * @throws {Error} If unable to fetch trending tags
   */
  async fetchTrendingTags() {
    throw new Error(`${this.constructor.name} must implement fetchTrendingTags() method`);
  }

  /**
   * Authenticate with the platform (login)
   * @abstract
   * @param {string} username - Platform username or email
   * @param {string} password - Platform password
   * @returns {Promise<boolean>} True if authentication successful
   * @throws {Error} If authentication fails
   */
  async authenticate(username, password) {
    throw new Error(`${this.constructor.name} must implement authenticate() method`);
  }

  /**
   * Logout from the platform
   * @abstract
   * @returns {Promise<boolean>} True if logout successful
   */
  async logout() {
    throw new Error(`${this.constructor.name} must implement logout() method`);
  }

  /**
   * Check if the service is currently authenticated/logged in
   * @abstract
   * @returns {Promise<boolean>} True if authenticated
   */
  async isAuthenticated() {
    throw new Error(`${this.constructor.name} must implement isAuthenticated() method`);
  }

  /**
   * Validate image metadata against platform requirements
   * @abstract
   * @param {Object} metadata - Metadata object to validate
   * @returns {Promise<Object>} Validation result with isValid and errors array
   */
  async validateMetadata(metadata) {
    throw new Error(`${this.constructor.name} must implement validateMetadata() method`);
  }

  /**
   * Close any resources (browser, connections, etc.)
   * @abstract
   * @returns {Promise<void>}
   */
  async cleanup() {
    throw new Error(`${this.constructor.name} must implement cleanup() method`);
  }

  /**
   * Get platform-specific information (name, capabilities, limits)
   * @abstract
   * @returns {Object} Platform information object
   */
  getPlatformInfo() {
    throw new Error(`${this.constructor.name} must implement getPlatformInfo() method`);
  }
}

module.exports = PlatformService;
