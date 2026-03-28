import { getCompressionStats } from '../src/compressor.js';

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

console.log('Debug: Testing stats aggregation...\n');
console.log('Input history:', JSON.stringify(history, null, 2));
console.log('\n---\n');

const stats = getCompressionStats(history);

console.log('Output stats:', JSON.stringify(stats, null, 2));
console.log('\n---\n');
console.log('totalRequests:', stats.totalRequests, '(expected: 2)');
console.log('totalTokensSaved:', stats.totalTokensSaved, '(expected: 1850)');
console.log('averageCompressionRatio:', stats.averageCompressionRatio, '(expected: > 0.85)');
console.log('Check 1:', stats.totalRequests === 2);
console.log('Check 2:', stats.totalTokensSaved === 1850);
console.log('Check 3:', stats.averageCompressionRatio > 0.85);
