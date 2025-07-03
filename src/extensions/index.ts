// Main entry point for the extension system

// Core extension system exports
export { ExtensionRegistry } from './registry.js'
export type { Extension, ExtensionContext, ExtensionHooks } from './interfaces.js'

// Built-in extensions
// export { default as LargeResponseHandlerExtension } from './large-response-handler/index.js' // Temporarily disabled

// Placeholder comments for future extensions
// export { default as MetricsExtension } from './metrics/index.js'
// export { default as RequestLoggerExtension } from './request-logger/index.js'
// export { default as RateLimiterExtension } from './rate-limiter/index.js'
// export { default as CacheExtension } from './cache/index.js'
// export { default as AuthExtension } from './auth/index.js'
// export { default as ErrorHandlerExtension } from './error-handler/index.js'
// export { default as TransformExtension } from './transform/index.js'