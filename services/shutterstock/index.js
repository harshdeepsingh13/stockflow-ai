/**
 * @file ShutterStockService - Shutterstock platform implementation for photo uploading
 * @description Handles web automation for Shutterstock using Playwright CDP protocol.
 * Manages browser sessions, login flows, image uploads, metadata uploads via CSV,
 * and trending tag fetching. Implements the PlatformService interface for future
 * extensibility to other stock photo platforms.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { config } = require("../../config");
const PlatformService = require("../BaseService/PlatformService");

const PAGE_STATE = {
  LOGIN: "LOGIN",
  UPLOAD: "UPLOAD",
  CONTRIBUTOR: "CONTRIBUTOR",
  UNKNOWN: "UNKNOWN",
};

/**
 * ShutterStockService - Manages Shutterstock uploads via web automation
 * @class
 * @extends PlatformService
 * @description Platform implementation for Shutterstock. Uses Playwright CDP
 * to control a browser for web automation, including login, image upload,
 * metadata form filling, and CSV-based bulk metadata uploads.
 */
class ShutterStockService extends PlatformService {
  /**
   * Creates a ShutterStockService instance
   * @constructor
   * @param {Object} serviceConfig - Optional service-specific configuration (uses global config if not provided)
   */
  constructor(serviceConfig = null) {
    super(serviceConfig || config.shutterStock);
    this.platformName = "shutterstock";
    this.mode = config.shutterStock.mode;
    this.localChromiumServer = config.localChromiumServer;
    this.settings = config.shutterStock;
    this.enableAntiBotDelays = this.settings.enableAntiBotDelays;
    this.defaultMinDelayMs = this.settings.slowInteractionMinMs;
    this.defaultMaxDelayMs = this.settings.slowInteractionMaxMs;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Get information about the Shutterstock platform
   * @returns {Object} Platform information
   */
  getPlatformInfo() {
    return {
      name: "Shutterstock",
      platformKey: "shutterstock",
      description: "Stock photo platform for image submissions",
      supportedModes: ["web_automation"],
      maxTitleLength: this.settings.uploadTitleMaxLength || 120,
      maxDescriptionLength: this.settings.uploadDescriptionMaxLength || 200,
      maxTagsCount: this.settings.uploadKeywordsMaxCount || 25,
      supportsCsvBulkUpload: true,
    };
  }

  /**
   * Upload a single image to Shutterstock with optional metadata
   * Implements PlatformService.uploadImage() interface
   * @async
   * @param {string|Object} input - Upload input (string path or object with imagePath, metadata, options)
   * @param {string} input.imagePath - Absolute path to the image file
   * @param {Object} input.metadata - Image metadata (title, description, tags, categories)
   * @param {Object} input.options - Upload options (saveDraft, etc)
   * @returns {Promise<Object>} Upload result { status, flow, imagePath, manualActionRequired }
   * @throws {Error} If image path is invalid or upload fails
   */
  async uploadImage(input) {
    const payload =
      typeof input === "string" ? { imagePath: input, metadata: {}, options: { saveDraft: false } } : input || {};

    const { imagePath, metadata = {}, options = {} } = payload;
    if (!imagePath) {
      throw new Error("An image path is required.");
    }

    switch (this.mode) {
      case "web_automation":
        return this.uploadAtWebAutomation(imagePath, metadata, options);
      default:
        console.error(`Unsupported mode: ${this.mode}`);
        break;
    }
  }

  /**
   * Perform web automation-based image upload
   * Connects to browser, fills upload form, and returns result
   * @async
   * @private
   * @param {string} imagePath - Absolute path to the image file
   * @param {Object} metadata - Image metadata
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   * @throws {Error} If image does not exist or upload fails
   */
  async uploadAtWebAutomation(imagePath, metadata = {}, options = {}) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image path does not exist: ${imagePath}`);
    }

    await this.ensureBrowser();

    try {
      await this.randomDelay();
      return await this.handleUploadState(imagePath, metadata, options);
    } finally {
      if (!this.settings.keepBrowserOpenAfterUpload) {
        await this.closeBrowser();
      }
    }
  }

  /**
   * Upload metadata via CSV file to Shutterstock
   * Implements PlatformService.uploadMetadataCsv() interface
   * @async
   * @param {string} csvPath - Absolute path to CSV file with metadata
   * @returns {Promise<Object>} Upload result
   * @throws {Error} If CSV path is invalid
   */
  async uploadMetadataCsv(csvPath) {
    if (!csvPath) {
      throw new Error("A CSV path is required for metadata upload.");
    }

    const resolvedPath = path.resolve(csvPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`CSV path does not exist: ${resolvedPath}`);
    }

    await this.ensureBrowser();
    await this.randomDelay();

    try {
      await this.randomDelay();

      // Navigate to upload page
      await this.page.goto(this.settings.uploadPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.settings.stateCheckTimeoutMs,
      });
      await this.randomDelay();

      // Check if login is required
      const loginState = await this.handleLoginIfVisible();
      if (loginState) {
        return {
          status: "prefilled",
          flow: "csv_upload",
          manualActionRequired: loginState.manualActionRequired || "submit_login",
          csvPath: resolvedPath,
        };
      }
      await this.randomDelay();

      // Try to open CSV upload modal
      const csvUploadModalButton = await this.findFirstAvailable(this.settings.csvUploadModalButtonSelectors);
      if (!csvUploadModalButton) {
        return {
          status: "failed",
          flow: "csv_upload",
          error: "CSV upload modal button was not found.",
          csvPath: resolvedPath,
        };
      }
      await this.randomDelay();
      await csvUploadModalButton.click();
      await this.randomDelay();

      // Find and fill CSV input
      const csvUploadInput = await this.findFirstAvailable(this.settings.csvUploadFileInputSelectors);
      if (!csvUploadInput) {
        return {
          status: "failed",
          flow: "csv_upload",
          error: "CSV upload input was not found.",
          csvPath: resolvedPath,
        };
      }

      await csvUploadInput.setInputFiles(resolvedPath);
      await this.randomDelay();

      // TODO: Implement CSV upload submission and confirmation waiting
      // Once implemented, enable the following:
      // await this.clickFirstAvailable(this.settings.csvUploadSubmitSelectors);
      // const uploadConfirmed = await this.waitForCsvUploadConfirmation();
      // if (!uploadConfirmed) {
      //   return {
      //     status: "submitted",
      //     flow: "csv_upload",
      //     manualActionRequired: "confirm_csv_upload",
      //     csvPath: resolvedPath,
      //   };
      // }

      return {
        status: "uploaded",
        flow: "csv_upload",
        csvPath: resolvedPath,
      };
    } finally {
      if (!this.settings.keepBrowserOpenAfterUpload) {
        await this.closeBrowser();
      }
    }
  }

  //   async runStateFlow(imagePath, metadata = {}, options = {}) {
  //     await this.randomDelay();

  //     const hasRelevantState = await this.waitForRelevantState();
  //     if (!hasRelevantState) {
  //       await this.navigateToUploadPage();
  //     }

  //     const state = await this.detectPageState();
  //     console.log(`[state-machine] detected state=${state} url=${this.page.url()}`);
  //     const result = await this.handleState(state, imagePath, metadata, options);

  //     if (result) {
  //       return result;
  //     }

  //     return {
  //       status: "failed",
  //       error: "Unable to reach Shutterstock login or upload page.",
  //     };
  //   }

  /**
   * Handle different page states and route to appropriate handler
   * @async
   * @private
   * @param {string} state - Page state (LOGIN, UPLOAD, CONTRIBUTOR, UNKNOWN)
   * @param {string} imagePath - Path to image being uploaded
   * @param {Object} metadata - Image metadata
   * @param {Object} options - Upload options
   * @returns {Promise<Object|null>} State handler result or null
   */
  async handleState(state, imagePath, metadata = {}, options = {}) {
    switch (state) {
      case PAGE_STATE.LOGIN:
        return this.handleLoginState();
      case PAGE_STATE.UPLOAD:
        return this.handleUploadState(imagePath, metadata, options);
      case PAGE_STATE.CONTRIBUTOR:
        return this.handleContributorState();
      default:
        return null;
    }
  }

  /**
   * Handle login page state - prefill login form and wait for manual submission
   * @async
   * @private
   * @returns {Promise<Object>} Login state result
   */
  async handleLoginState() {
    if (await this.isAlreadyLoggedIn()) {
      return null;
    }

    await this.prefillLoginForm();
    console.log("Login prefilled. Submit manually to continue.");

    return {
      status: "prefilled",
      flow: "login",
      manualActionRequired: "submit_login",
    };
  }

  /**
   * Handle upload page state - prefill upload form with image and metadata
   * @async
   * @private
   * @param {string} imagePath - Path to image to upload
   * @param {Object} metadata - Image metadata (title, description, tags)
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload state result
   */
  async handleUploadState(imagePath, metadata = {}, options = {}) {
    const loginState = await this.handleLoginIfVisible();
    if (loginState) {
      return loginState;
    }

    await this.prefillUploadForm(imagePath);
    // await this.page.waitForTimeout(20000);
    await this.randomDelay();

    // TODO: Implement automatic metadata form filling and submission
    // Currently requires manual form completion after image upload:
    // await this.prefillMetadataForm(metadata);
    // if (options.saveDraft) { ... }

    return {
      status: "uploaded",
      flow: "upload",
      manualActionRequired: null,
      imagePath,
    };
  }

  /**
   * Handle contributor page state
   * @async
   * @private
   * @returns {Promise<null>} Currently returns null (not implemented)
   */
  async handleContributorState() {
    if (await this.isAlreadyLoggedIn()) {
      return null;
    }
    return null;
  }

  /**
   * Detect the current page state based on URL and visible elements
   * @async
   * @private
   * @returns {Promise<string>} Page state (LOGIN, UPLOAD, CONTRIBUTOR, or UNKNOWN)
   */
  async detectPageState() {
    const currentUrl = this.page.url();

    if (this.urlIncludesAny(currentUrl, this.settings.loginPageUrlIncludes)) {
      return PAGE_STATE.LOGIN;
    }

    if (this.urlIncludesAny(currentUrl, this.settings.uploadPageUrlIncludes)) {
      return PAGE_STATE.UPLOAD;
    }

    if (this.urlIncludesAny(currentUrl, this.settings.contributorPageUrlIncludes)) {
      return PAGE_STATE.CONTRIBUTOR;
    }

    if (await this.isLoginFormVisible()) {
      return PAGE_STATE.LOGIN;
    }

    if (await this.isUploadPageReady()) {
      return PAGE_STATE.UPLOAD;
    }

    return PAGE_STATE.UNKNOWN;
  }

  /**
   * Check if URL includes any of the provided fragments
   * @param {string} url - URL to check
   * @param {Array<string>} fragments - URL fragments to match
   * @returns {boolean} True if any fragment is found in URL
   */
  urlIncludesAny(url, fragments) {
    if (!url || !Array.isArray(fragments) || fragments.length === 0) {
      return false;
    }

    return fragments.some((fragment) => fragment && url.includes(fragment));
  }

  /**
   * Wait for page to reach login or upload page
   * @async
   * @private
   * @returns {Promise<boolean>} True if relevant state reached before timeout
   */
  async waitForRelevantState() {
    try {
      await this.page.waitForURL(
        (url) => {
          const urlStr = url.toString();
          return (
            this.urlIncludesAny(urlStr, this.settings.loginPageUrlIncludes) ||
            this.urlIncludesAny(urlStr, this.settings.uploadPageUrlIncludes)
          );
        },
        { timeout: this.settings.stateCheckTimeoutMs },
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is already logged in
   * @async
   * @private
   * @returns {Promise<boolean>} True if user is logged in
   */
  async isAlreadyLoggedIn() {
    if (await this.findFirstAvailable(this.settings.loggedInSelectors)) {
      return true;
    }

    if (await this.isLoginFormVisible()) {
      return false;
    }

    return this.isUploadPageReady();
  }

  /**
   * Check if login form is currently visible
   * @async
   * @private
   * @returns {Promise<boolean>} True if login form found
   */
  async isLoginFormVisible() {
    return Boolean(await this.findFirstAvailable(this.settings.loginFormSelectors));
  }

  /**
   * Check if upload page is ready for image submission
   * @async
   * @private
   * @returns {Promise<boolean>} True if upload page ready
   */
  async isUploadPageReady() {
    return Boolean(await this.findFirstAvailable(this.settings.uploadReadySelectors));
  }

  /**
   * Authenticate with Shutterstock (implements PlatformService interface)
   * @async
   * @param {string} username - Shutterstock username or email
   * @param {string} password - Shutterstock password
   * @returns {Promise<boolean>} True if authentication successful
   */
  async authenticate(username, password) {
    if (!username || !password) {
      throw new Error("Username and password are required for authentication");
    }
    // Login prefilling happens automatically in prefillLoginForm()
    // Manual submission required due to security (anti-bot) measures
    await this.ensureBrowser();
    await this.prefillLoginForm();
    return true;
  }

  /**
   * Logout from Shutterstock (implements PlatformService interface)
   * @async
   * @returns {Promise<boolean>} Always returns true
   */
  async logout() {
    await this.closeBrowser();
    return true;
  }

  /**
   * Check if currently authenticated (implements PlatformService interface)
   * @async
   * @returns {Promise<boolean>} True if authenticated
   */
  async isAuthenticated() {
    if (!this.page) {
      return false;
    }
    return this.isAlreadyLoggedIn();
  }

  /**
   * Validate metadata against Shutterstock requirements (implements PlatformService interface)
   * @async
   * @param {Object} metadata - Metadata to validate
   * @returns {Promise<Object>} Validation result { isValid: boolean, errors: Array }
   */
  async validateMetadata(metadata) {
    const errors = [];

    if (!metadata || typeof metadata !== "object") {
      errors.push("Metadata must be an object");
      return { isValid: errors.length === 0, errors };
    }

    if (metadata.title) {
      const titleLen = String(metadata.title).length;
      if (titleLen < 8 || titleLen > 120) {
        errors.push(`Title length must be between 8 and 120 characters (got ${titleLen})`);
      }
    }

    if (metadata.description) {
      const descLen = String(metadata.description).length;
      if (descLen < 40 || descLen > 200) {
        errors.push(`Description length must be between 40 and 200 characters (got ${descLen})`);
      }
    }

    if (metadata.tags && Array.isArray(metadata.tags)) {
      if (metadata.tags.length < 10 || metadata.tags.length > 25) {
        errors.push(`Tags count must be between 10 and 25 (got ${metadata.tags.length})`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Close browser connection and cleanup resources
   * @async
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.closeBrowser();
  }

  /**
   * Navigate to Shutterstock upload page (DEPRECATED - not called in current flow)
   * @async
   * @deprecated Use page.goto() directly instead
   * @private
   * @returns {Promise<void>}
   */
  async navigateToUploadPage() {
    await this.page.goto(this.settings.uploadPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: this.settings.stateCheckTimeoutMs,
    });
  }

  /**
   * Navigate to Shutterstock contributor login (DEPRECATED - not called in current flow)
   * @async
   * @deprecated Use page.goto() directly instead
   * @private
   * @returns {Promise<void>}
   */
  async navigateToContributorLogin() {
    await this.page.goto(this.settings.contributorLink, {
      waitUntil: "domcontentloaded",
      timeout: this.settings.stateCheckTimeoutMs,
    });
  }

  /**
   * Ensure browser is connected and ready
   * Connects to Chrome via CDP, gets context and page
   * @async
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If no browser contexts found
   */
  async ensureBrowser() {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.connectOverCDP(this.localChromiumServer);

    const contexts = this.browser.contexts();
    if (!contexts.length) {
      throw new Error("No browser contexts were found for the connected Chrome session.");
    }

    this.context = contexts[0];

    const pages = this.context.pages();
    this.page = this.pickActivePage(pages);

    if (!this.page) {
      this.page = await this.context.newPage();
    }
  }

  /**
   * Select the most appropriate page from available pages
   * Prefers pages already on shutterstock.com if available
   * @param {Array} pages - Array of Playwright page objects
   * @returns {Object|null} Selected page or null if no pages available
   */
  pickActivePage(pages) {
    if (!pages || pages.length === 0) {
      return null;
    }

    const shutterstockPage = pages.find((page) => page.url().includes("shutterstock.com"));

    if (shutterstockPage) {
      return shutterstockPage;
    }

    return pages[pages.length - 1];
  }

  /**
   * Close browser connection and cleanup state
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async closeBrowser() {
    if (this.context) {
      await this.context.close().catch(() => {});
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    this.page = null;
    this.context = null;
    this.browser = null;
  }

  /**
   * Prefill login form with credentials
   * Waits for form fields and fills them with configured username/password
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async prefillLoginForm() {
    if (!this.settings.username && !this.settings.password) {
      return;
    }
    await this.randomDelay();

    const usernameField = await this.findFirstAvailable(this.settings.loginUsernameSelectors);
    console.debug("Username field found for prefill:", Boolean(usernameField));
    const passwordField = await this.findFirstAvailable(this.settings.loginPasswordSelectors);
    console.debug("Password field found for prefill:", Boolean(passwordField));

    if (!usernameField) {
      await this.clickFirstAvailable(this.settings.loginButtonSelectors);
      await this.randomDelay();
    }

    if (this.settings.username) {
      const resolvedUsernameField =
        usernameField || (await this.findFirstAvailable(this.settings.loginUsernameSelectors));
      if (resolvedUsernameField) {
        await resolvedUsernameField.fill(this.settings.username);
        await this.randomDelay();
      }
    }

    if (this.settings.password) {
      const resolvedPasswordField =
        passwordField || (await this.findFirstAvailable(this.settings.loginPasswordSelectors));
      if (resolvedPasswordField) {
        console.debug("Prefilling password field.");
        await resolvedPasswordField.fill(this.settings.password);
        await this.randomDelay();
      }
    }
  }

  /**
   * Prefill image upload form
   * Handles both input[type=file] elements and file chooser dialogs
   * @async
   * @private
   * @param {string} imagePath - Absolute path to image file
   * @returns {Promise<void>}
   */
  async prefillUploadForm(imagePath) {
    await this.randomDelay();
    await this.page.goto(this.settings.uploadPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: this.settings.stateCheckTimeoutMs,
    });
    let uploadTrigger = await this.findFirstAvailable(this.settings.uploadFileInputSelectors);

    if (!uploadTrigger) {
      console.warn("No upload trigger was found on the upload page.");
      await this.randomDelay();
      // Try opening upload modal if trigger not found
      const uploadModalButton = await this.findFirstAvailable(this.settings.uploadModalButtonSelectors);
      if (uploadModalButton) {
        await this.randomDelay();
        await uploadModalButton.click();
        uploadTrigger = await this.findFirstAvailable(this.settings.uploadFileInputSelectors);
      }

      if (!uploadTrigger) {
        console.warn("No upload trigger was found even after opening upload modal.");
        return;
      }
    }

    const triggerTag = await uploadTrigger.evaluate((node) => node.tagName.toLowerCase());

    if (triggerTag === "input") {
      // Direct file input element
      await uploadTrigger.setInputFiles(imagePath);
      await this.randomDelay();
      return;
    }

    // Button that opens file chooser dialog
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: this.settings.uploadSuccessTimeoutMs }),
      uploadTrigger.click(),
    ]);

    if (imagePath) await fileChooser.setFiles(imagePath);
    await this.randomDelay();
  }

  /**
   * Prefill metadata form fields (title, description, tags)
   * Currently not called in main flow - requires manual completion
   * @async
   * @private
   * @param {Object} metadata - Metadata object with title, description, tags
   * @returns {Promise<void>}
   */
  async prefillMetadataForm(metadata = {}) {
    if (!metadata || typeof metadata !== "object") {
      return;
    }

    await this.fillFirstAvailable(this.settings.uploadTitleSelectors, metadata.title || "");
    await this.fillFirstAvailable(this.settings.uploadDescriptionSelectors, metadata.description || "");

    if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      await this.fillFirstAvailable(this.settings.uploadKeywordSelectors, metadata.tags.join(", "));
    }
  }

  /**
   * Fill form field with provided value
   * @async
   * @private
   * @param {Array<string>} selectors - CSS selectors to try
   * @param {string|number} value - Value to fill
   * @returns {Promise<boolean>} True if field was found and filled
   */
  async fillFirstAvailable(selectors, value) {
    if (!value || !selectors || selectors.length === 0) {
      return false;
    }

    const locator = await this.findFirstAvailable(selectors);
    if (!locator) {
      return false;
    }

    await locator.fill(String(value));
    await this.randomDelay();
    return true;
  }

  /**
   * Click save draft button and wait for confirmation
   * @async
   * @private
   * @returns {Promise<boolean>} True if draft was saved
   */
  async saveDraft() {
    const clicked = await this.clickFirstAvailable(this.settings.uploadSaveDraftSelectors);
    if (!clicked) {
      console.warn("Save draft button was not found.");
      return false;
    }

    return this.waitForSaveConfirmation();
  }

  /**
   * Wait for save draft confirmation message/indicator
   * @async
   * @private
   * @returns {Promise<boolean>} True if confirmation found before timeout
   */
  async waitForSaveConfirmation() {
    const selectors = this.settings.uploadSaveConfirmationSelectors || [];
    if (!selectors.length) {
      return false;
    }

    for (const selector of selectors) {
      try {
        await this.page.locator(selector).first().waitFor({ timeout: this.settings.stateCheckTimeoutMs });
        return true;
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  /**
   * Wait for CSV upload confirmation message/indicator
   * @async
   * @private
   * @returns {Promise<boolean>} True if confirmation found before timeout
   */
  async waitForCsvUploadConfirmation() {
    const selectors = this.settings.csvUploadSuccessSelectors || [];
    if (!selectors.length) {
      return false;
    }

    for (const selector of selectors) {
      try {
        await this.page.locator(selector).first().waitFor({ timeout: this.settings.stateCheckTimeoutMs });
        return true;
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  /**
   * Find first element matching any of the provided selectors
   * Tries each selector in order and returns first matching locator
   * @async
   * @private
   * @param {Array<string>} selectors - CSS selectors to try
   * @returns {Promise<Object|null>} Playwright locator object or null
   */
  async findFirstAvailable(selectors) {
    if (!selectors || selectors.length === 0) {
      return null;
    }

    for (const selector of selectors) {
      const locator = this.page.locator(selector).first();

      try {
        if ((await locator.count()) > 0) {
          return locator;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Click first element matching any of the provided selectors
   * @async
   * @private
   * @param {Array<string>} selectors - CSS selectors to try
   * @returns {Promise<boolean>} True if element was found and clicked
   */
  async clickFirstAvailable(selectors) {
    const locator = await this.findFirstAvailable(selectors);

    if (!locator) {
      return false;
    }

    await locator.click();
    return true;
  }

  /**
   * Add random delay to emulate human interaction timing
   * Respects the enableAntiBotDelays configuration flag
   * Helps avoid detection as a bot by Shutterstock's anti-bot measures
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async randomDelay() {
    // Skip delays if disabled via config (useful for testing)
    if (!this.enableAntiBotDelays) {
      return;
    }

    const minDelay = this.defaultMinDelayMs;
    const maxDelay = this.defaultMaxDelayMs;
    const waitTime = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    await this.page.waitForTimeout(waitTime);
  }

  /**
   * Check if login is visible and handle it if found
   * @async
   * @private
   * @returns {Promise<Object|null>} Login state result or null if not logged in
   */
  async handleLoginIfVisible() {
    const currentUrl = this.page.url();
    const isLoginByUrl = this.urlIncludesAny(currentUrl, this.settings.loginPageUrlIncludes);
    const isLoginByForm = await this.isLoginFormVisible();

    if (!isLoginByUrl && !isLoginByForm) {
      return null;
    }

    return this.handleLoginState();
  }

  /**
   * Wait for login to be cleared (user logs in)
   * Periodically checks if login state is cleared within timeout
   * @async
   * @private
   * @param {number} timeoutMs - Maximum time to wait for login to clear
   * @returns {Promise<Object>} Result { required: bool, completed: bool }
   */
  async waitForLoginToClear(timeoutMs = this.settings.stateCheckTimeoutMs) {
    const startedAt = Date.now();
    let loginHandled = false;

    while (Date.now() - startedAt < timeoutMs) {
      const nextUrl = this.page.url();
      const nextIsLoginByUrl = this.urlIncludesAny(nextUrl, this.settings.loginPageUrlIncludes);
      const nextIsLoginByForm = await this.isLoginFormVisible();

      if (!nextIsLoginByUrl && !nextIsLoginByForm) {
        return { required: loginHandled, completed: true };
      }

      if (!loginHandled) {
        await this.handleLoginIfVisible();
        loginHandled = true;
      }

      await this.page.waitForTimeout(500);
    }

    return { required: loginHandled, completed: false };
  }

  /**
   * Fetch trending tags from Shutterstock
   * Implements PlatformService.fetchTrendingTags() interface
   * @async
   * @returns {Promise<Array<string>>} Array of trending tags
   */
  async fetchTrendingTags() {
    if (!this.settings.trendsUrl) {
      console.warn("Trends URL is not configured. Cannot fetch trending tags.");
      return [];
    }

    await this.ensureBrowser();

    try {
      // Navigate to trends page
      await this.page.goto(this.settings.trendsUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.settings.trendsPageLoadTimeoutMs,
      });

      // Check if login is required and handle if needed
      const loginState = await this.waitForLoginToClear(this.settings.stateCheckTimeoutMs);
      console.debug("Login state after waiting on trends page:", loginState);
      if (loginState.required && !loginState.completed) {
        console.warn("Login was prefilled but not completed within timeout. Cannot fetch trending tags yet.");
        return [];
      }

      // Re-navigate if login was required to ensure page loaded after login
      if (loginState.required) {
        await this.page.goto(this.settings.trendsUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.settings.trendsPageLoadTimeoutMs,
        });
      }

      // Try to click "load more" button to get more tags
      let clickedLoadMore = await this.clickFirstAvailable(this.settings.trendsLoadMoreButtonSelectors);
      if (clickedLoadMore) {
        await this.randomDelay();
      } else {
        console.warn("Load more button was not found on trends page. Continuing with visible tags.");
      }

    //   clickedLoadMore = await this.clickFirstAvailable(this.settings.trendsLoadMoreButtonSelectors);
    //   if (clickedLoadMore) {
    //     await this.randomDelay();
    //   } else {
    //     console.warn("Load more button was not found on trends page. Continuing with visible tags.");
    //   }

      // Extract tag text from page
      let tagTexts = [];
      for (const selector of this.settings.trendsTagSelectors || []) {
        console.debug("Checking for trending tags with selector:", selector);
        const locator = this.page.locator(selector);
        const count = await locator.count();
        console.debug(`Found ${count} elements with selector: ${selector}`, count);

        if (count > 0) {
          tagTexts = await locator.allTextContents();
          break;
        }
      }
      console.debug("Extracted tag texts:", tagTexts);
      if (!tagTexts.length) {
        console.warn("No trending tag cells were found on the trends page.");
        return [];
      }

      // Filter and parse tags to get unique English tags
      const englishTagPattern = /^[A-Za-z0-9][A-Za-z0-9\s-]*$/;
      const uniqueTags = new Set();

      for (const cellText of tagTexts) {
        const candidates = String(cellText || "")
          .split(/\r?\n/)
          .map((text) => text.trim())
          .filter(Boolean);

        for (const candidate of candidates) {
          if (englishTagPattern.test(candidate)) {
            uniqueTags.add(candidate);
          }
        }
      }

      return Array.from(uniqueTags);
    } catch (error) {
      console.error("Failed to fetch trending tags.", error);
      return [];
    } finally {
      if (!this.settings.keepBrowserOpenAfterUpload) {
        await this.closeBrowser();
      }
    }
  }
}

module.exports = ShutterStockService;
