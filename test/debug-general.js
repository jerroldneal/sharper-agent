import { compress } from '../src/compressor.js';

const GENERAL_PROMPT = `
Can you help me understand how React hooks work?
I want to learn about useState and useEffect.
`;

console.log('Debug: Testing general compression...\n');
console.log('Input:', GENERAL_PROMPT);
console.log('\n---\n');

const result = compress(GENERAL_PROMPT, {}, { domain: 'general', aggressiveness: 'balanced' });

console.log('Output symbols:');
console.log(result.symbols);
console.log('\n---\n');
console.log('Ratio:', result.ratio);
console.log('Ratio >= 0?', result.ratio >= 0);
console.log('Is number?', typeof result.ratio === 'number');
console.log('Is NaN?', isNaN(result.ratio));
console.log('Stats:', result.stats);
console.log('\n---\n');
console.log('Context:', result.context);
