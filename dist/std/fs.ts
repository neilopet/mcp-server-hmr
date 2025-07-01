
// Export everything from global polyfills
module.exports = global.__denoStd;
// Also export specific named exports
module.exports.debounce = global.__denoStd.debounce;
module.exports.DebouncedFunction = global.__denoStd.DebouncedFunction;
module.exports.parse = global.__denoStd.parse;
module.exports.existsSync = global.__denoStd.existsSync;
module.exports.resolve = global.__denoStd.resolve;
module.exports.join = global.__denoStd.join;
module.exports.ensureDir = global.__denoStd.ensureDir;
module.exports.homedir = global.__denoStd.homedir;
