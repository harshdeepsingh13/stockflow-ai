/**
 * @file MetadataValidator - Validates stock photo metadata against platform requirements
 * @description Ensures generated metadata conforms to Shutterstock's length limits, character sets,
 * tag requirements, and category constraints. Normalizes and cleans metadata values.
 */

const { config } = require("../../config");

/**
 * MetadataValidator - Validates metadata for Shutterstock submission
 * @class
 * @description Checks title, description, tags, and categories against
 * Shutterstock's requirements and normalized values for consistency.
 */
class MetadataValidator {
  /**
   * Creates a MetadataValidator instance
   * @constructor
   */
  constructor() {
    this.settings = config.metadataValidation;
    this.allowedTagPattern = /^[a-z0-9][a-z0-9\s-]*$/;
    this.allowedTextPattern = /^[\x20-\x7E\n\r\t]+$/;
    this.allowedCategories = new Map(
      (config.shutterStock.categories || []).map((category) => [String(category || "").toLowerCase(), category]),
    );
  }

  /**
   * Validate metadata against platform requirements
   * Checks length, format, character sets, and category constraints
   * @param {Object} metadata - Metadata object to validate
   * @param {string} metadata.title - Image title
   * @param {string} metadata.description - Image description
   * @param {Array<string>} metadata.tags - Array of tags
   * @param {string} metadata.primaryCategory - Primary category
   * @param {string} metadata.secondaryCategory - Optional secondary category
   * @returns {Object} Validation result { valid: boolean, errors: Array, metadata: Object }
   */
  validate(metadata) {
    const errors = [];
    const normalized = {
      title: this.cleanText(metadata?.title),
      description: this.cleanText(metadata?.description),
      tags: this.normalizeTags(metadata?.tags || []),
      primaryCategory: this.normalizeCategory(
        metadata?.primaryCategory || (Array.isArray(metadata?.categories) ? metadata.categories[0] : ""),
      ),
      secondaryCategory: this.normalizeCategory(
        metadata?.secondaryCategory || (Array.isArray(metadata?.categories) ? metadata.categories[1] : ""),
      ),
    };

    if (normalized.title.length < this.settings.titleMinLength) {
      errors.push(`title is too short (min ${this.settings.titleMinLength})`);
    }

    if (normalized.title.length > this.settings.titleMaxLength) {
      errors.push(`title is too long (max ${this.settings.titleMaxLength})`);
    }

    if (normalized.description.length < this.settings.descriptionMinLength) {
      errors.push(`description is too short (min ${this.settings.descriptionMinLength})`);
    }

    if (normalized.description.length > this.settings.descriptionMaxLength) {
      errors.push(`description is too long (max ${this.settings.descriptionMaxLength})`);
    }

    if (!this.allowedTextPattern.test(normalized.title) || !this.allowedTextPattern.test(normalized.description)) {
      errors.push("title or description contains unsupported characters");
    }

    if (normalized.tags.length < this.settings.minTagCount) {
      errors.push(`not enough tags (min ${this.settings.minTagCount})`);
    }

    if (normalized.tags.length > this.settings.maxTagCount) {
      errors.push(`too many tags (max ${this.settings.maxTagCount})`);
      normalized.tags = normalized.tags.slice(0, this.settings.maxTagCount);
    }

    if (!normalized.primaryCategory) {
      errors.push("primary category is required");
    } else if (!this.isAllowedCategory(normalized.primaryCategory)) {
      errors.push(`invalid primary category: ${normalized.primaryCategory}`);
    }

    if (normalized.secondaryCategory) {
      if (!this.isAllowedCategory(normalized.secondaryCategory)) {
        errors.push(`invalid secondary category: ${normalized.secondaryCategory}`);
      }

      if (normalized.secondaryCategory === normalized.primaryCategory) {
        errors.push("secondary category must differ from primary category");
      }
    }

    for (const tag of normalized.tags) {
      if (!this.allowedTagPattern.test(tag)) {
        errors.push(`invalid tag format: ${tag}`);
      }

      if (tag.length < 2 || tag.length > 50) {
        errors.push(`tag length out of bounds: ${tag}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      metadata: normalized,
    };
  }

  /**
   * Clean and normalize text by removing extra whitespace
   * @param {string|*} value - Text to clean
   * @returns {string} Cleaned text
   */
  cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Normalize and deduplicate tags
   * Converts to lowercase, normalizes whitespace, removes underscores
   * @param {Array<string>} tags - Array of tag strings
   * @returns {Array<string>} Normalized unique tags
   */
  normalizeTags(tags) {
    const unique = new Set();

    for (const tag of tags) {
      const normalized = String(tag || "")
        .toLowerCase()
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (normalized) {
        unique.add(normalized);
      }
    }

    return Array.from(unique);
  }

  /**
   * Normalize category string to allowed Shutterstock category
   * @param {string} value - Raw category string
   * @returns {string} Normalized category or original value if not found
   */
  normalizeCategory(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }

    return this.allowedCategories.get(normalized) || String(value || "").trim();
  }

  /**
   * Check if category is in the allowed categories list
   * @param {string} value - Category to check
   * @returns {boolean} True if category is allowed
   */
  isAllowedCategory(value) {
    if (!value) {
      return false;
    }

    return this.allowedCategories.has(String(value).toLowerCase());
  }
}

module.exports = MetadataValidator;
