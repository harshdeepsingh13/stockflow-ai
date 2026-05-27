/**
 * @file LangChainService - LLM-powered metadata generation for stock photos
 * @description Uses Ollama LLM to generate stock photo metadata (title, description, tags, categories)
 * based on image filename hints and vision model descriptions. Integrates LangChain for
 * prompt management and constrains output to Shutterstock's category requirements.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { ChatOllama } = require("@langchain/ollama");
const { config } = require("../../config");

/**
 * LangChainService - Generates stock photo metadata using LLMs
 * @class
 * @description Coordinates with Ollama LLM to generate and validate
 * Shutterstock metadata including title, description, tags, and categories.
 */
class LangChainService {
  /**
   * Creates a LangChainService instance
   * Initializes Ollama LLM and LangChain prompt template
   * @constructor
   */
  constructor() {
    this.settings = config.llm;
    this.metadataValidation = config.metadataValidation || {};
    this.descriptionMinLength = Number(
      this.metadataValidation.descriptionMinLength ?? this.settings.descriptionMinLength ?? 0,
    );
    this.descriptionMaxLength = Number(
      this.metadataValidation.descriptionMaxLength ?? this.settings.descriptionMaxLength ?? 0,
    );
    this.minTagCount = Number(this.metadataValidation.minTagCount ?? 1);
    this.maxTagCount = Number(this.metadataValidation.maxTagCount ?? this.settings.maxTagCount ?? 45);
    this.allowedCategories = new Map(
      (config.shutterStock.categories || []).map((category) => [String(category || "").toLowerCase(), category]),
    );
    this.model = new ChatOllama({
      baseUrl: this.settings.ollamaBaseUrl,
      model: this.settings.model,
      temperature: this.settings.temperature,
      maxRetries: this.settings.maxRetries,
      timeout: this.settings.timeoutMs,
      format: "json",
      think: false,
    });

    this.prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        [
          "Make sure the output strictly follows the rules and format specified below. Do not include any explanations or text outside the JSON.",
          "You are a social media manager writing Shutterstock metadata. ",
          "Your aim to create compelling, accurate, and platform-optimized metadata that helps buyers find and purchase the image. You need to maximize my earnings through the portal",
          "Follow the Shutterstock guidance context exactly when provided.",
          "Shutterstock guidance context:\n{metadataContext}",
          "Allowed categories (choose exact labels only):\n{allowedCategories}",
          "Output strict JSON only with keys: title, description, tags, primaryCategory, secondaryCategory, relevantTrendingTags.",
          "Read the complete Vision model description and then create metadata that fully captures the image content and context. Use the filename hints and trending tags as additional clues to inform your metadata, but do not rely solely on them.",
          "Rules:",
          "- Use English only.",
          "- Keep title concise and marketable.",
          "- Keep description vivid & viral.",
          "- Description length must be between {descriptionMinLength} and {descriptionMaxLength} characters.",
          "- tags must be an array of unique lowercase strings.",
          "- tags count must be between {minTagCount} and {maxTagCount}.",
          "- primaryCategory is required and must be exactly one allowed category.",
          "- secondaryCategory is optional; include it only when a second category clearly fits.",
          "- If secondaryCategory is present, it must be different from primaryCategory.",
          "- Select at least 1 and at most 2 categories total.",
          "- Do not include brand names or trademarked terms.",
          "- No markdown, no explanations.",
          "- relevantTrendingTags must be an array of strings chosen ONLY from the provided Trending tags candidates that are genuinely relevant to THIS specific image. Only include tags you would actually use to describe this image. Can be empty array [].",
          
        ].join("\n"),
      ],
      [
        "human",
        [
          "Image file name: {fileName}",
          "Image path: {imagePath}",
          "Filename hints: {fileHints}",
          "Vision model description: {visionDescription}",
          "Trending tags candidates: {trendingTags}",
          "Previous validation errors (if any): {validationErrors}",
          "Return JSON now.",
        ].join("\n"),
      ],
    ]);
  }

  /**
   * Extract meaningful hints from image filename
   * Converts snake_case and kebab-case to space-separated words
   * @param {string} imagePath - Absolute path to image file
   * @returns {string} Cleaned filename hints (e.g., "sunset beach landscape")
   */
  buildFileHints(imagePath) {
    const fileName = path.basename(imagePath, path.extname(imagePath));
    return fileName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Generate stock photo metadata using LLM
   * Invokes Ollama LLM with image hints, vision description, and trending tags
   * Parses and normalizes LLM response to Shutterstock requirements
   * @async
   * @param {Object} options - Generation options
   * @param {string} options.imagePath - Absolute path to image file
   * @param {Array<string>} options.trendingTags - Trending tags to consider (default: [])
   * @param {Array<string>} options.validationErrors - Previous validation errors for retry context (default: [])
   * @returns {Promise<Object>} Generated metadata { title, description, tags, primaryCategory, secondaryCategory }
   * @throws {Error} If LLM invocation or JSON parsing fails
   */
  async generateMetadata({ imagePath, trendingTags = [], validationErrors = [] }) {
    const metadataContext = this.loadMetadataContext();
    const visionDescription = await this.describeImageWithVisionModel(imagePath);
    console.debug(
      "Generating metadata with context length:",
      metadataContext.length,
      "and vision description length:",
      visionDescription.length,
    );
    console.debug("Vision description:", visionDescription);
    const payload = {
      fileName: path.basename(imagePath),
      imagePath,
      fileHints: this.buildFileHints(imagePath),
      metadataContext,
      visionDescription,
      trendingTags: JSON.stringify(trendingTags.slice(0, 30)),
      validationErrors: JSON.stringify(validationErrors),
      allowedCategories: (config.shutterStock.categories || []).map((category) => `- ${category}`).join("\n"),
      descriptionMinLength: this.descriptionMinLength,
      descriptionMaxLength: this.descriptionMaxLength,
      minTagCount: this.minTagCount,
      maxTagCount: this.maxTagCount,
    };

    const chain = this.prompt.pipe(this.model);
    const response = await chain.invoke(payload);
    console.debug("content from LLM response:", response.content);
    const content = Array.isArray(response.content)
      ? response.content.map((part) => part.text || "").join("\n")
      : String(response.content || "");

    const parsed = this.parseJSON(content);
    return {
      title: String(parsed.title || "").trim(),
      description: String(parsed.description || "").trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .map((tag) =>
              String(tag || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean)
        : [],
      primaryCategory: this.normalizeCategory(
        parsed.primaryCategory || (Array.isArray(parsed.categories) ? parsed.categories[0] : ""),
      ),
      secondaryCategory: this.normalizeCategory(
        parsed.secondaryCategory || (Array.isArray(parsed.categories) ? parsed.categories[1] : ""),
      ),
      relevantTrendingTags: Array.isArray(parsed.relevantTrendingTags)
        ? parsed.relevantTrendingTags
            .map((t) => String(t || "").trim().toLowerCase())
            .filter(Boolean)
        : [],
    };
  }

  /**
   * Normalize and validate category against allowed Shutterstock categories
   * @param {string} value - Raw category string from LLM
   * @returns {string} Normalized category name or empty string if invalid
   */
  normalizeCategory(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      return "";
    }

    return this.allowedCategories.get(normalized) || "";
  }

  /**
   * Extract JSON object from LLM response text
   * Handles cases where LLM includes explanations outside JSON
   * @param {string} rawText - Raw LLM response text
   * @returns {Object} Parsed JSON object
   * @throws {Error} If no valid JSON found in response
   */
  parseJSON(rawText) {
    const cleaned = String(rawText || "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Model did not return JSON output.");
    }

    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }

  /**
   * Load Shutterstock metadata context/guidance from local markdown file
   * @returns {string} Markdown guidance content or default message if file not found
   */
  loadMetadataContext() {
    const configuredPath = path.join(__dirname, "./shutterstock-best-practices.md");
    const contextPath = path.resolve(configuredPath);
    console.debug(`Attempting to load metadata context from ${contextPath}...`);
    console.debug(`Context file exists: ${fs.existsSync(contextPath)}`);
    if (!fs.existsSync(contextPath)) {
      return "No extra Shutterstock guidance context was provided.";
    }

    const raw = fs.readFileSync(contextPath, "utf8").trim();
    console.debug(`Loaded metadata context from ${contextPath} (${raw.length} characters).`);
    if (!raw) {
      return "No extra Shutterstock guidance context was provided.";
    }

    return raw;
  }

  /**
   * Describe image using Ollama vision model
   * Provides literal image description to inform metadata generation
   * Handles vision model unavailability gracefully based on requireVision config
   * @async
   * @param {string} imagePath - Absolute path to image file
   * @returns {Promise<string>} Image description or fallback message
   * @throws {Error} If vision is required but fails
   */
  async describeImageWithVisionModel(imagePath) {
    const imageBuffer = await sharp(imagePath)
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const imageBase64 = imageBuffer.toString("base64");

    let response;
    try {
      response = await fetch(`${this.settings.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.settings.visionModel,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              "Describe this image in English for stock-photo metadata.",
              "We need to make this description/caption SEO friendly and searchable by as many relevant keywords as possible, while keeping it accurate and literal.",
              "Return a single paragraph.",
              `keep the visual description minimum of ${this.settings.descriptionMinLength} characters.`,
              "Act as a Senior social media manager for a big firm.",
              "Avoid assumptions not visible in the image.",
            ].join("\n"),
            images: [imageBase64],
          },
        ],
      }),
      signal: AbortSignal.timeout(this.settings.visionTimeoutMs),
    });
    } catch (fetchError) {
      const cause = fetchError.cause?.code || fetchError.cause?.message || fetchError.message;
      console.error(`[Vision] fetch to Ollama failed. Cause: ${cause}`);
      throw fetchError;
    }

    if (!response.ok) {
      const raw = await response.text();
      const message = `Vision request failed (${response.status}): ${raw}`;
      if (this.settings.requireVision) {
        throw new Error(`${message}. Ensure a vision-capable model is installed and configured (OLLAMA_VISION_MODEL).`);
      }

      console.warn(message);
      return `No vision description available. Filename hint: ${this.buildFileHints(imagePath)}`;
    }

    const data = await response.json();
    const text = String(data?.message?.content || "").trim();

    if (!text) {
      const message = "Vision model returned an empty description.";
      if (this.settings.requireVision) {
        throw new Error(`${message} Verify OLLAMA_VISION_MODEL supports image input (example: llama3.2-vision).`);
      }

      console.warn(message);
      return `No vision description available. Filename hint: ${this.buildFileHints(imagePath)}`;
    }

    return text;
  }
}

module.exports = LangChainService;
