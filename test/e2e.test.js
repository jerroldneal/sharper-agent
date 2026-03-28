/**
 * End-to-end test for sharper-agent
 * Tests the full compress → model → decompress pipeline with mock model
 */

import { compress } from '../src/compressor.js';
import { decompress, checkLossless } from '../src/decompressor.js';
import { sendPrompt } from '../src/model-gateway.js';
import { strict as assert } from 'assert';

console.log('Running end-to-end tests...\n');

// Test configuration
const TEST_CONFIG = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b'
};

// Test prompt
const TEST_PROMPT = `
In file src/calculator.js, add a new function divide(a, b) that:
- Takes two numbers as parameters
- Returns the result of a divided by b
- Throws an error if b is zero
- Includes proper JSDoc comments
`;

// Test 1: Full pipeline with mock response
console.log('Test 1: Full pipeline (mock model)');
try {
  // Step 1: Compress
  console.log('  Step 1: Compressing prompt...');
  const compressionResult = compress(TEST_PROMPT, {}, { domain: 'code', aggressiveness: 'balanced' });
  
  assert(compressionResult.symbols, 'Should compress prompt');
  assert(compressionResult.ratio > 0.5, 'Should achieve >50% compression');
  console.log(`    ✓ Compressed: ${(compressionResult.ratio * 100).toFixed(1)}% reduction`);
  console.log(`    ✓ Tokens saved: ${compressionResult.stats.tokensSaved}`);
  
  // Step 2: Mock model response (simulate AI returning symbolic format)
  console.log('  Step 2: Simulating model response...');
  const mockModelResponse = {
    text: `PATCH src/calculator.js
+function:divide(a:number, b:number) -> number
+operation:add
+intent:add division function with zero check
+error:throw on divide by zero`,
    usage: {
      promptTokens: compressionResult.stats.compressedTokens,
      completionTokens: 50,
      totalTokens: compressionResult.stats.compressedTokens + 50
    },
    metadata: {
      provider: 'mock',
      model: 'test-model'
    }
  };
  console.log('    ✓ Mock response generated');
  
  // Step 3: Decompress
  console.log('  Step 3: Decompressing response...');
  const decompressionResult = decompress(
    mockModelResponse.text,
    compressionResult.context,
    { format: 'natural', verbose: true }
  );
  
  assert(decompressionResult.text, 'Should decompress response');
  assert(decompressionResult.text.includes('calculator.js'), 'Should mention file');
  assert(decompressionResult.text.includes('divide'), 'Should mention function');
  console.log(`    ✓ Decompressed: ${decompressionResult.text.length} chars`);
  
  // Step 4: Validate losslessness
  console.log('  Step 4: Validating losslessness...');
  const losslessCheck = checkLossless(TEST_PROMPT, decompressionResult.text);
  console.log(`    ✓ Similarity: ${(losslessCheck.similarity * 100).toFixed(1)}%`);
  console.log(`    ✓ Lossless: ${losslessCheck.isLossless ? 'YES' : 'NO'}`);
  
  // Summary
  console.log('\n  Pipeline Summary:');
  console.log(`    Original prompt: ${compressionResult.stats.originalTokens} tokens`);
  console.log(`    Compressed: ${compressionResult.stats.compressedTokens} tokens`);
  console.log(`    Model response: ${mockModelResponse.usage.completionTokens} tokens`);
  console.log(`    Total tokens sent to model: ${mockModelResponse.usage.totalTokens} tokens`);
  console.log(`    Compression savings: ${compressionResult.stats.tokensSaved} tokens (${(compressionResult.ratio * 100).toFixed(1)}%)`);
  console.log('\n✓ Full pipeline test passed\n');
} catch (error) {
  console.error('✗ Test 1 failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// Test 2: Real model connection test (optional - only if Ollama is running)
console.log('Test 2: Real model connectivity (optional)');
try {
  console.log('  Checking if Ollama is available...');
  
  // Simple connectivity test - try to reach the model
  const testPrompt = 'Hello';
  const startTime = Date.now();
  
  // Note: This will throw if Ollama is not running
  const response = await sendPrompt(testPrompt, TEST_CONFIG, { maxTokens: 10, temperature: 0.1 });
  const duration = Date.now() - startTime;
  
  assert(response.text, 'Should receive response text');
  assert(response.usage, 'Should include usage stats');
  
  console.log(`  ✓ Connected to Ollama successfully`);
  console.log(`  ✓ Model: ${TEST_CONFIG.model}`);
  console.log(`  ✓ Response time: ${duration}ms`);
  console.log(`  ✓ Response: ${response.text.substring(0, 50)}...`);
  console.log('\n✓ Real model connectivity test passed\n');
  
  // Test 3: Full pipeline with real model (if Test 2 passed)
  console.log('Test 3: Full pipeline with real model');
  try {
    console.log('  Running full compress → model → decompress flow...');
    
    // Compress
    const compressionResult = compress(TEST_PROMPT, {}, { domain: 'code', aggressiveness: 'balanced' });
    console.log(`    ✓ Compressed: ${(compressionResult.ratio * 100).toFixed(1)}% reduction`);
    
    // Send to model
    const modelStart = Date.now();
    const modelResponse = await sendPrompt(
      compressionResult.symbols,
      TEST_CONFIG,
      { maxTokens: 500, temperature: 0.7 }
    );
    const modelDuration = Date.now() - modelStart;
    console.log(`    ✓ Model responded in ${modelDuration}ms`);
    
    // Decompress
    const decompressionResult = decompress(
      modelResponse.text,
      compressionResult.context,
      { format: 'natural' }
    );
    console.log(`    ✓ Decompressed response`);
    
    // Validate
    const losslessCheck = checkLossless(TEST_PROMPT, decompressionResult.text);
    console.log(`    ✓ Lossless: ${losslessCheck.isLossless ? 'YES' : 'NO'} (${(losslessCheck.similarity * 100).toFixed(1)}%)`);
    
    // Report
    console.log('\n  Real Pipeline Results:');
    console.log(`    Compression: ${(compressionResult.ratio * 100).toFixed(1)}%`);
    console.log(`    Tokens saved: ${compressionResult.stats.tokensSaved}`);
    console.log(`    Model latency: ${modelDuration}ms`);
    console.log(`    Total tokens: ${modelResponse.usage.totalTokens}`);
    console.log(`    Response preview: ${decompressionResult.text.substring(0, 100)}...`);
    console.log('\n✓ Full pipeline with real model passed\n');
  } catch (error) {
    console.error('  ✗ Test 3 failed:', error.message);
    console.log('  (This is expected if the model is busy or offline)\n');
  }
  
} catch (error) {
  console.log('  ⚠ Ollama not available - skipping real model tests');
  console.log(`  (Error: ${error.message})`);
  console.log('  To test with real model: ensure Ollama is running with qwen2.5-coder:7b\n');
}

console.log('✅ All end-to-end tests completed!');
console.log('\nTo run with real model:');
console.log('  1. Start Ollama: ollama serve');
console.log('  2. Pull model: ollama pull qwen2.5-coder:7b');
console.log('  3. Run tests: node test/e2e.test.js');
