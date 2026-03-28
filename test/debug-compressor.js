import { compress } from '../src/compressor.js';

const TEST_PROMPT = `
In files src/handler.js and src/validator.js, add new functionality:
- Add function validateInput(data) that checks for null values
- Add function sanitizeOutput(result) that removes sensitive fields
- Import lodash for deep cloning
- The operation is to add error handling to existing functions
- This fixes bug #142 where null values crash the app
`;

console.log('Debug: Testing compressor...\n');
console.log('Input prompt:', TEST_PROMPT);
console.log('\n---\n');

const result = compress(TEST_PROMPT, {}, { domain: 'code', aggressiveness: 'balanced' });

console.log('Output symbols:');
console.log(result.symbols);
console.log('\n---\n');
console.log('Ratio:', result.ratio);
console.log('Stats:', result.stats);
console.log('\n---\n');
console.log('Context:', result.context);
