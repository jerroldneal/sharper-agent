/**
 * Symbolic Compression Engine
 * 
 * Compresses natural language prompts and code context into symbolic representations.
 * Based on proven 96% token reduction technique from bidirectional-symbolic-compression.md
 * 
 * @module compressor
 */

/**
 * Compress natural language prompt into symbolic format
 * 
 * @param {string} prompt - Natural language user prompt
 * @param {Object} context - Additional context (files, functions, etc.)
 * @param {Object} options - Compression options
 * @param {string} options.domain - Domain type ('code', 'engineering', 'general')
 * @param {string} options.aggressiveness - Compression level ('conservative', 'balanced', 'aggressive')
 * @returns {Object} - Compression result
 * @returns {string} result.symbols - Symbolic representation
 * @returns {Object} result.context - Preserved context for decompression
 * @returns {number} result.ratio - Compression ratio (0-1, higher = more compression)
 * @returns {Object} result.stats - Token count statistics
 */
export function compress(prompt, context = {}, options = {}) {
  const { domain = 'code', aggressiveness = 'balanced' } = options;
  
  try {
    // Choose compressor based on domain
    const compressor = getCompressor(domain);
    const result = compressor(prompt, context, options);
    
    // Calculate compression ratio
    const originalTokens = estimateTokens(prompt + JSON.stringify(context));
    const compressedTokens = estimateTokens(result.symbols);
    const ratio = (originalTokens - compressedTokens) / originalTokens;
    
    return {
      symbols: result.symbols,
      context: {
        ...context,
        ...result.preservedContext,
        original: { prompt }  // Preserve for decompression
      },
      ratio,
      stats: {
        originalTokens,
        compressedTokens,
        tokensSaved: originalTokens - compressedTokens
      }
    };
  } catch (error) {
    // Graceful degradation: return uncompressed on error
    console.error('[compressor] Compression failed, returning uncompressed:', error.message);
    return {
      symbols: prompt,  // Fallback to original
      context: { ...context, original: { prompt } },
      ratio: 0,
      stats: {
        originalTokens: estimateTokens(prompt),
        compressedTokens: estimateTokens(prompt),
        tokensSaved: 0
      },
      error: error.message
    };
  }
}

/**
 * Get domain-specific compressor function
 * @private
 */
function getCompressor(domain) {
  switch (domain) {
    case 'code':
      return compressCode;
    case 'engineering':
      return compressEngineering;
    case 'general':
      return compressGeneral;
    default:
      return compressGeneral;
  }
}

/**
 * Compress code-related prompts using symbolic patch notation
 * @private
 */
function compressCode(prompt, context, options) {
  const symbols = [];
  const preservedContext = {};
  
  // Parse prompt for common code patterns
  const patterns = {
    // Improved file pattern - handles "files X and Y" or "in X, in Y" or standalone paths
    file: /([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,
    function: /function\s+([a-zA-Z0-9_]+)\(|method\s+([a-zA-Z0-9_]+)\(/gi,
    variable: /variable\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)/gi,
    bug: /bug|error|issue|problem|fix/gi,
    add: /add|create|implement|new/gi,
    remove: /remove|delete/gi,
    modify: /modify|change|update|refactor/gi,
    import: /import\s+([a-zA-Z0-9_{}]+)|require\(['"]([a-zA-Z0-9_\-@/]+)['"]\)/gi
  };
  
  // Extract file references - handle multiple files
  const fileMatches = [...prompt.matchAll(patterns.file)];
  if (fileMatches.length > 0) {
    // Add PATCH directive for each unique file found
    const uniqueFiles = [...new Set(fileMatches.map(m => m[1]))];
    uniqueFiles.forEach(file => {
      symbols.push(`PATCH ${file}`);
    });
    preservedContext.targetFile = uniqueFiles[0];  // Preserve first file for context
    if (uniqueFiles.length > 1) {
      preservedContext.targetFiles = uniqueFiles;  // Preserve all files
    }
  }
  
  // Extract function references - handle multiple functions
  const functionMatches = [...prompt.matchAll(patterns.function)];
  if (functionMatches.length > 0) {
    const uniqueFunctions = [...new Set(functionMatches.map(m => m[1] || m[2]))];
    uniqueFunctions.forEach(funcName => {
      symbols.push(`+function:${funcName}()`);
    });
    preservedContext.targetFunction = uniqueFunctions[0];  // Preserve first function
    if (uniqueFunctions.length > 1) {
        preservedContext.targetFunctions = uniqueFunctions;  // Preserve all functions
    }
  }
  
  // Extract variable references - handle multiple variables
  const variableMatches = [...prompt.matchAll(patterns.variable)];
  if (variableMatches.length > 0) {
    const uniqueVars = [...new Set(variableMatches.map(m => m[1] || m[2]))];
    uniqueVars.forEach(varName => {
      symbols.push(`+variable:${varName}`);
    });
  }
  
  // Extract operation type
  if (patterns.add.test(prompt)) {
    symbols.push(`+operation: add`);
  } else if (patterns.remove.test(prompt)) {
    symbols.push(`+operation: remove`);
  } else if (patterns.modify.test(prompt)) {
    symbols.push(`+operation: modify`);
  }
  
  // Extract bug/fix intent
  if (patterns.bug.test(prompt)) {
    symbols.push(`+intent: fix_bug`);
  }
  
  // Extract import requirements
  const importMatches = [...prompt.matchAll(patterns.import)];
  if (importMatches.length > 0) {
    const importName = importMatches[0][1] || importMatches[0][2];
    symbols.push(`+import: ${importName}`);
  }
  
  // Include context files if provided
  if (context.files && Object.keys(context.files).length > 0) {
    symbols.push(`+context_files: ${Object.keys(context.files).length}`);
    preservedContext.files = context.files;
  }
  
  // Fallback: if no symbols extracted, use simplified version
  if (symbols.length === 0) {
    symbols.push(`+task: ${prompt.slice(0, 100)}`);  // First 100 chars as fallback
  }
  
  return {
    symbols: symbols.join('\n'),
    preservedContext
  };
}

/**
 * Compress engineering domain prompts (structural, mechanical, etc.)
 * @private
 */
function compressEngineering(prompt, context, options) {
  const symbols = [];
  const preservedContext = {};
  
  // Engineering patterns
  const patterns = {
    constraint: /constraint|requirement|specification/gi,
    recommendation: /recommend|suggest|propose/gi,
    calculation: /calculate|compute|analyze/gi,
    standard: /standard|code|regulation/gi
  };
  
  if (patterns.constraint.test(prompt)) {
    symbols.push('+constraint: engineering_requirement');
  }
  
  if (patterns.recommendation.test(prompt)) {
    symbols.push('+recommendation: design_proposal');
  }
  
  if (patterns.calculation.test(prompt)) {
    symbols.push('+calculation: analysis_required');
  }
  
  if (patterns.standard.test(prompt)) {
    symbols.push('+standard: code_reference');
  }
  
  // Fallback
  if (symbols.length === 0) {
    symbols.push(`+engineering_task: ${prompt.slice(0, 100)}`);
  }
  
  preservedContext.domain = 'engineering';
  preservedContext.fullPrompt = prompt;  // Need full context for expansion
  
  return {
    symbols: symbols.join('\n'),
    preservedContext
  };
}

/**
 * Compress general text prompts (fallback)
 * @private
 */
function compressGeneral(prompt, context, options) {
  // For general domain, minimal compression
  // Focus on extracting key entities and intent
  
  const symbols = [];
  const preservedContext = {
    fullPrompt: prompt  // Preserve for decompression
  };
  
  // Extract intent keywords
  const intentPatterns = {
    question: /what|why|how|when|where|who/gi,
    request: /please|can you|could you|would you/gi,
    command: /do|make|create|generate|write/gi
  };
  
  let intentFound = false;
  if (intentPatterns.question.test(prompt)) {
    symbols.push('+intent:question');
    intentFound = true;
  } else if (intentPatterns.request.test(prompt)) {
    symbols.push('+intent:request');
    intentFound = true;
  } else if (intentPatterns.command.test(prompt)) {
    symbols.push('+intent:command');
    intentFound = true;
  }
  
  // For general domain, abbreviate the task significantly
  // Only include task if the prompt is long enough to benefit from abbreviation
  const promptLength = prompt.length;
  if (promptLength > 100) {
    // Long prompt - abbreviate heavily
    const abbreviated = prompt.slice(0, Math.min(50, promptLength / 3));
    symbols.push(`+task:${abbreviated}...`);
  } else if (!intentFound) {
    // Short prompt with no intent detected - include abbreviated version
    const abbreviated = prompt.slice(0, 30);
    symbols.push(`+task:${abbreviated}${promptLength > 30 ? '...' : ''}`);
  }
  // If prompt is short AND intent was found, skip task field (intent is enough)
  
  return {
    symbols: symbols.join('\n'),
    preservedContext
  };
}

/**
 * Estimate token count for text
 * @private
 * Rough approximation: ~4 chars per token
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Validate compression result
 * 
 * @param {Object} result - Compression result from compress()
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateCompression(result) {
  if (!result) return false;
  if (!result.symbols || typeof result.symbols !== 'string') return false;
  if (!result.context || typeof result.context !== 'object') return false;
  if (typeof result.ratio !== 'number') return false;
  if (!result.stats || typeof result.stats !== 'object') return false;
  return true;
}

/**
 * Get compression statistics summary
 * 
 * @param {Array<Object>} compressionResults - Array of compression results
 * @returns {Object} - Aggregate statistics
 */
export function getCompressionStats(compressionResults) {
  if (!Array.isArray(compressionResults) || compressionResults.length === 0) {
    return {
      totalRequests: 0,
      totalTokensSaved: 0,
      averageRatio: 0,
      bestRatio: 0,
      worstRatio: 0
    };
  }
  
  const totalTokensSaved = compressionResults.reduce((sum, r) => sum + (r.stats?.tokensSaved || 0), 0);
  const averageRatio = compressionResults.reduce((sum, r) => sum + (r.compressionRatio || r.ratio || 0), 0) / compressionResults.length;
  const ratios = compressionResults.map(r => r.compressionRatio || r.ratio || 0);
  
  return {
    totalRequests: compressionResults.length,
    totalTokensSaved,
    averageCompressionRatio: Math.round(averageRatio * 100) / 100,
    bestCompressionRatio: Math.max(...ratios),
    worstCompressionRatio: Math.min(...ratios)
  };
}
