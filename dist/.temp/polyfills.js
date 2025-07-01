
exports.debounce = function(fn, delay) {
  let timeout = null;
  let lastCall = 0;
  
  const debounced = function(...args) {
    const now = Date.now();
    
    if (timeout) clearTimeout(timeout);
    
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
  
  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
};

exports.existsSync = function(filepath) {
  const fs = require('fs');
  try {
    fs.statSync(filepath);
    return true;
  } catch {
    return false;
  }
};

exports.resolve = require('path').resolve;
exports.join = require('path').join;
exports.homedir = () => process.env.HOME || process.env.USERPROFILE || '';
