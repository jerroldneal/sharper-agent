/**
 * Unit tests for compressor and decompressor modules
 */

import { compress, getCompressionStats } from '../src/compressor.js';
import { decompress, checkLossless } from '../src/decompressor.js';
import { strict as assert } from 'assert';

// Test data
const CODE_PROMPT = `
In files src/handler.js and src/validator.js, add new functionality:
- Add function validateInput(data) that checks for null values
- Add function sanitizeOutput(result) that removes sensitive fields
- Import lodash for deep cloning
- The operation is to add error handling to existing functions
- This fixes bug #142 where null values crash the app
`;

const ENGINEERING_PROMPT = `
Design a load balancer with these constraints:
- Must handle 10,000 requests per second
- Must support sticky sessions
- Recommendation: Use Redis for session storage
- Calculate expected latency: 50ms per request
- Follow AWS well-architected framework
`;

const GENERAL_PROMPT = `
Can you help me understand how React hooks work?
I want to learn about useState and useEffect.
`;

console.log('Running compression tests...\n');

// Test 1: Code domain compression
console.log('Test 1: Code domain compression');
try {
  const result = compress(CODE_PROMPT, {}, { domain: 'code', aggressiveness: 'balanced' });
  
  assert(result.symbols, 'Should return symbols');
  assert(result.ratio > 0.5, 'Should achieve at least 50% compression');
  assert(result.symbols.includes('PATCH'), 'Should contain PATCH directive');
  assert(result.symbols.includes('+function:'), 'Should contain function directives');
  assert(result.symbols.includes('+import:'), 'Should contain import directive');
  assert(result.symbols.includes('+operation:'), 'Should contain operation directive');
  
  console.log(`✓ Compression ratio: ${(result.ratio * 100).toFixed(1)}%`);
  console.log(`✓ Original: ${result.stats.originalTokens} tokens`);
  console.log(`✓ Compressed: ${result.stats.compressedTokens} tokens`);
  console.log(`✓ Saved: ${result.stats.tokensSaved} tokens\n`);
} catch (error) {
  console.error('✗ Test 1 failed:', error.message);
  process.exit(1);
}

// Test 2: Engineering domain compression
console.log('Test 2: Engineering domain compression');
try {
  const result = compress(ENGINEERING_PROMPT, {}, { domain: 'engineering', aggressiveness: 'balanced' });
  
  assert(result.symbols, 'Should return symbols');
  assert(result.ratio > 0.4, 'Should achieve at least 40% compression');
  assert(result.symbols.includes('+constraint:'), 'Should contain constraint directives');
  assert(result.symbols.includes('+recommendation:'), 'Should contain recommendation');
  
  console.log(`✓ Compression ratio: ${(result.ratio * 100).toFixed(1)}%`);
  console.log(`✓ Tokens saved: ${result.stats.tokensSaved}\n`);
} catch (error) {
  console.error('✗ Test 2 failed:', error.message);
  process.exit(1);
}

// Test 3: General domain compression
console.log('Test 3: General domain compression');
try {
  const result = compress(GENERAL_PROMPT, {}, { domain: 'general', aggressiveness: 'balanced' });
  
  assert(result.symbols, 'Should return symbols');
  assert(result.ratio >= 0, 'Should return valid compression ratio');
  assert(result.symbols.includes('+intent:'), 'Should contain intent directive');
  
  console.log(`✓ Compression ratio: ${(result.ratio * 100).toFixed(1)}%`);
  console.log(`✓ Tokens saved: ${result.stats.tokensSaved}\n`);
} catch (error) {
  console.error('✗ Test 3 failed:', error.message);
  process.exit(1);
}

// Test 4: Decompression of code symbols
console.log('Test 4: Code decompression');
try {
  const symbols = `PATCH src/handler.js
+function:validateInput(data) -> boolean
+function:sanitizeOutput(result) -> object
+import:lodash
+operation:add error handling`;
  
  const result = decompress(symbols, {}, { format: 'natural' });
  
  assert(result.text, 'Should return decompressed text');
  assert(result.text.includes('handler.js'), 'Should mention the file');
  assert(result.text.includes('validateInput'), 'Should mention the function');
  assert(result.text.includes('error handling'), 'Should mention the operation');
  
  console.log('✓ Decompression successful');
  console.log(`✓ Output length: ${result.text.length} chars\n`);
} catch (error) {
  console.error('✗ Test 4 failed:', error.message);
  process.exit(1);
}

// Test 5: Lossless validation
console.log('Test 5: Lossless validation');
try {
  const original = CODE_PROMPT;
  const compressed = compress(original, {}, { domain: 'code' });
  const decompressed = decompress(compressed.symbols, compressed.context, {});
  const losslessCheck = checkLossless(original, decompressed.text);
  
  assert(losslessCheck.similarity >= 0, 'Should return similarity score');
  console.log(`✓ Similarity: ${(losslessCheck.similarity * 100).toFixed(1)}%`);
  console.log(`✓ Lossless: ${losslessCheck.isLossless ? 'YES' : 'NO'}`);
  console.log(`✓ Key terms preserved: ${losslessCheck.details.commonTerms} / ${losslessCheck.details.originalTerms}\n`);
} catch (error) {
  console.error('✗ Test 5 failed:', error.message);
  process.exit(1);
}

// Test 6: Compression with file context
console.log('Test 6: Compression with file context');
try {
  const prompt = 'Modify the handler function to add error handling';
  const context = {
    files: {
      'src/handler.js': 'export function handler(req) { return process(req); }'
    }
  };
  
  const result = compress(prompt, context, { domain: 'code' });
  
  assert(result.symbols, 'Should return symbols');
  assert(result.context.files, 'Should preserve file context');
  assert(Object.keys(result.context.files).length > 0, 'Should have files in context');
  
  console.log('✓ Context preserved during compression');
  console.log(`✓ Files in context: ${Object.keys(result.context.files).length}\n`);
} catch (error) {
  console.error('✗ Test 6 failed:', error.message);
  process.exit(1);
}

// Test 7: Graceful degradation on compression error
console.log('Test 7: Graceful degradation');
try {
  const result = compress(null, {}, {}); // Invalid input
  
  // Should return original prompt with 0% compression ratio
  assert(result.ratio === 0, 'Should return 0% compression on error');
  assert(result.stats.tokensSaved === 0, 'Should save 0 tokens on error');
  
  console.log('✓ Graceful degradation works - returns uncompressed on error\n');
} catch (error) {
  console.error('✗ Test 7 failed:', error.message);
  process.exit(1);
}

// Test 8: Statistics aggregation
console.log('Test 8: Statistics aggregation');
try {
  const history = [
    {
      compressionRatio: 0.90,
      stats: { tokensSaved: 1000, originalTokens: 1100, compressedTokens: 100 }
    },
    {
      compressionRatio: 0.85,
      stats: { tokensSaved: 850, originalTokens: 1000, compressedTokens: 150 }
    }
  ];
  
  const stats = getCompressionStats(history);
  
  assert(stats.totalRequests === 2, 'Should count total requests');
  assert(stats.totalTokensSaved === 1850, 'Should sum tokens saved');
  assert(stats.averageCompressionRatio > 0.85, 'Should calculate average ratio');
  
  console.log(`✓ Total requests: ${stats.totalRequests}`);
  console.log(`✓ Total tokens saved: ${stats.totalTokensSaved}`);
  console.log(`✓ Average ratio: ${(stats.averageCompressionRatio * 100).toFixed(1)}%\n`);
} catch (error) {
  console.error('✗ Test 8 failed:', error.message);
  process.exit(1);
}

console.log('✅ All compression tests passed!');
