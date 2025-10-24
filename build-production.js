#!/usr/bin/env node

/**
 * Production Build Script for Cricket Auction App
 * Removes all debug console statements for deployment
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'index.html');
const OUTPUT_FILE = path.join(__dirname, 'index-production.html');

console.log('🏏 Building production version of Cricket Auction App...\n');

// Read the source file
let content = fs.readFileSync(INPUT_FILE, 'utf8');

// Count console statements before cleaning
const beforeCount = {
  debug: (content.match(/console\.debug\(/g) || []).length,
  log: (content.match(/console\.log\(/g) || []).length,
  warn: (content.match(/console\.warn\(/g) || []).length,
  error: (content.match(/console\.error\(/g) || []).length,
  info: (content.match(/console\.info\(/g) || []).length
};

console.log('📊 Console statements before cleaning:');
console.log(`   - console.debug: ${beforeCount.debug}`);
console.log(`   - console.log: ${beforeCount.log}`);
console.log(`   - console.warn: ${beforeCount.warn}`);
console.log(`   - console.error: ${beforeCount.error}`);
console.log(`   - console.info: ${beforeCount.info}`);
console.log(`   - Total: ${Object.values(beforeCount).reduce((a, b) => a + b, 0)}\n`);

// Remove console.debug statements
content = content.replace(/\s*console\.debug\([^;]*\);?\n?/g, '');

// Remove console.log statements (except the styled initialization messages)
content = content.replace(/\s*console\.log\((?!'%c)([^;]*)\);?\n?/g, '');

// Remove console.warn statements
content = content.replace(/\s*console\.warn\([^;]*\);?\n?/g, '');

// Remove console.info statements
content = content.replace(/\s*console\.info\([^;]*\);?\n?/g, '');

// Keep console.error for critical production issues, but make them conditional
content = content.replace(
  /console\.error\(/g,
  "typeof console !== 'undefined' && console.error && console.error("
);

// Count console statements after cleaning
const afterCount = {
  debug: (content.match(/console\.debug\(/g) || []).length,
  log: (content.match(/console\.log\(/g) || []).length,
  warn: (content.match(/console\.warn\(/g) || []).length,
  error: (content.match(/console\.error\(/g) || []).length,
  info: (content.match(/console\.info\(/g) || []).length
};

// Add production mode flag at the beginning of script
content = content.replace(
  '<script>',
  `<script>
    // Production Mode - Debug logging disabled
    const PRODUCTION_MODE = true;
    if (PRODUCTION_MODE) {
      // Stub out console methods in production
      const noop = () => {};
      if (typeof console !== 'undefined') {
        console.debug = noop;
        console.info = noop;
        // Keep console.error for critical issues
        // Keep styled console.log for initialization message
      }
    }
  `
);

// Write the production file
fs.writeFileSync(OUTPUT_FILE, content, 'utf8');

console.log('✅ Production build completed!\n');
console.log('📊 Console statements after cleaning:');
console.log(`   - console.debug: ${afterCount.debug}`);
console.log(`   - console.log: ${afterCount.log}`);
console.log(`   - console.warn: ${afterCount.warn}`);
console.log(`   - console.error: ${afterCount.error} (kept for critical errors)`);
console.log(`   - console.info: ${afterCount.info}`);
console.log(`   - Total removed: ${Object.values(beforeCount).reduce((a, b) => a + b, 0) - Object.values(afterCount).reduce((a, b) => a + b, 0)}\n`);

// Calculate file sizes
const originalSize = fs.statSync(INPUT_FILE).size;
const productionSize = fs.statSync(OUTPUT_FILE).size;
const reduction = ((originalSize - productionSize) / originalSize * 100).toFixed(2);

console.log('📦 File sizes:');
console.log(`   - Original: ${(originalSize / 1024).toFixed(2)} KB`);
console.log(`   - Production: ${(productionSize / 1024).toFixed(2)} KB`);
console.log(`   - Reduction: ${reduction}%\n`);

console.log(`✨ Production file created: ${OUTPUT_FILE}`);
console.log('🚀 Ready for deployment!\n');
console.log('📋 Deployment checklist:');
console.log('   ✓ Debug logs removed');
console.log('   ✓ Production mode enabled');
console.log('   ✓ Critical errors preserved');
console.log('   ✓ File size optimized');
console.log('\n💡 To deploy: Upload index-production.html to your web server');
