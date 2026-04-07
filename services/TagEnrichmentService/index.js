/**
 * @file TagEnrichmentService - Merges and ranks generated and trending tags
 * @description Combines LLM-generated tags with platform trending tags,
 * ranking trending tags by relevance to generated content using token overlap.
 */

const { config } = require("../../config");

/**
 * TagEnrichmentService - Enriches tags with trending platform tags
 * @class
 * @description Merges generated tags with trending tags, using Token-based
 * relevance scoring to prioritize trending tags that relate to generated tags.
 */
class TagEnrichmentService {
  /**
   * Creates a TagEnrichmentService instance
   * @constructor
   */
  constructor() {
    this.maxTagCount = config.metadataValidation.maxTagCount;
  }

  /**
   * Enrich generated tags with relevant trending tags
   * Scores trending tags by token overlap with generated tags
   * Returns merged list up to maxTagCount, prioritizing generated then scored trending
   * @param {Object} options - Enrichment options
   * @param {Array<string>} options.generatedTags - LLM-generated tags (default: [])
   * @param {Array<string>} options.trendingTags - Platform trending tags (default: [])
   * @returns {Array<string>} Merged tags up to maxTagCount
   */
  enrich({ generatedTags = [], trendingTags = [] }) {
    const generated = this.normalizeTags(generatedTags);
    const trending = this.normalizeTags(trendingTags);

    const baseTokens = new Set(generated.flatMap((tag) => tag.split(" ")));

    const rankedTrending = trending
      .map((tag) => ({ tag, score: this.scoreTag(tag, baseTokens) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.tag);

    const merged = [];
    const seen = new Set();

    for (const tag of [...generated, ...rankedTrending]) {
      if (seen.has(tag)) {
        continue;
      }

      seen.add(tag);
      merged.push(tag);

      if (merged.length >= this.maxTagCount) {
        break;
      }
    }

    return merged;
  }

  /**
   * Normalize and deduplicate tags
   * Converts to lowercase, normalizes whitespace, removes underscores
   * @param {Array<string>} tags - Array of tag strings
   * @returns {Array<string>} Normalized unique tags
   */
  normalizeTags(tags) {
    const seen = new Set();

    for (const tag of tags || []) {
      const normalized = String(tag || "")
        .toLowerCase()
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (normalized) {
        seen.add(normalized);
      }
    }

    return Array.from(seen);
  }

  /**
   * Score a tag by token overlap with base tokens
   * Higher score = more tokens in common with generated tags
   * @param {string} tag - Tag to score
   * @param {Set<string>} baseTokens - Set of tokens from generated tags
   * @returns {number} Score from 0 to 1 representing relevance
   */
  scoreTag(tag, baseTokens) {
    const tokens = tag.split(" ").filter(Boolean);
    if (tokens.length === 0) {
      return 0;
    }

    let overlap = 0;
    for (const token of tokens) {
      if (baseTokens.has(token)) {
        overlap += 1;
      }
    }

    return overlap / tokens.length;
  }
}

module.exports = TagEnrichmentService;
