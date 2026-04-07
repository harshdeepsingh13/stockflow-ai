/**
 * @file PlatformFactory - Factory for instantiating platform service implementations
 * @description Provides a centralized way to instantiate the correct platform service
 * based on configuration. Enables easy addition of new platforms in the future.
 */

const ShutterStockService = require("./shutterstock");
const { config } = require("../config");

/**
 * Factory class for creating platform service instances
 */
class PlatformFactory {
  /**
   * Supported platform names and their service implementations
   * @private
   */
  static PLATFORM_MAP = {
    shutterstock: ShutterStockService,
    // Future platforms:
    // getty: gettyImagesService,
    // alamy: alamyService,
    // adobe: adobeStockService,
  };

  /**
   * Get a platform service instance by name
   * @param {string} platformName - Name of the platform (e.g., 'shutterstock')
   * @returns {Object} Instance of the platform service
   * @throws {Error} If platform name is not supported
   */
  static getPlatformService(platformName = "shutterstock") {
    const normalizedName = String(platformName)
      .toLowerCase()
      .trim();

    if (!this.PLATFORM_MAP[normalizedName]) {
      const supported = Object.keys(this.PLATFORM_MAP).join(", ");
      throw new Error(
        `Unsupported platform: '${normalizedName}'. Supported platforms: ${supported}`,
      );
    }

    const ServiceClass = this.PLATFORM_MAP[normalizedName];
    return new ServiceClass();
  }

  /**
   * Get all available platform names
   * @returns {Array<string>} Array of available platform names
   */
  static getAvailablePlatforms() {
    return Object.keys(this.PLATFORM_MAP);
  }

  /**
   * Check if a platform is supported
   * @param {string} platformName - Name of the platform
   * @returns {boolean} True if platform is supported
   */
  static isSupported(platformName) {
    const normalizedName = String(platformName)
      .toLowerCase()
      .trim();
    return Boolean(this.PLATFORM_MAP[normalizedName]);
  }

  /**
   * Register a new platform service implementation
   * @param {string} platformName - Name to register the platform under
   * @param {class} ServiceClass - Platform service class extending PlatformService
   * @throws {Error} If platform name is already registered
   */
  static registerPlatform(platformName, ServiceClass) {
    const normalizedName = String(platformName)
      .toLowerCase()
      .trim();

    if (this.PLATFORM_MAP[normalizedName]) {
      throw new Error(`Platform '${normalizedName}' is already registered`);
    }

    this.PLATFORM_MAP[normalizedName] = ServiceClass;
  }

  /**
   * Get platform services for all configured platforms
   * @description Parses SERVICE_PLATFORMS env variable (comma-separated)
   * and returns instances of all configured platforms
   * @returns {Object} Object with platform name as key and service instance as value
   * @throws {Error} If any configured platform is not supported
   */
  static getPlatformServices() {
    const platformsEnv = config.platforms || "shutterstock";
    const platformNames = platformsEnv
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const services = {};

    for (const platformName of platformNames) {
      if (!this.isSupported(platformName)) {
        throw new Error(`Platform '${platformName}' configured but not supported. Check SERVICE_PLATFORMS env variable.`);
      }
      services[platformName] = this.getPlatformService(platformName);
    }

    return services;
  }
}

module.exports = PlatformFactory;
