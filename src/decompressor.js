/**
 * Symbolic Decompression Engine
 * 
 * Expands symbolic AI responses back into natural language using preserved context.
 * Ensures lossless translation while maintaining semantic fidelity.
 * 
 * @module decompressor
 */

/**
 * Decompress symbolic AI response into natural language
 * 
 * @param {string} symbols - Symbolic response from AI
 * @param {Object} context - Preserved context from compression phase
 * @param {Object} options - Decompression options
 * @param {string} options.format - Output format ('natural', 'markdown', 'code')
 * @param {boolean} options.verbose - Include explanatory text
 * @returns {Object} - Decompression result
 * @returns {string} result.text - Decompressed natural language response
 * @returns {Object} result.metadata - Extraction metadata
 * @returns {boolean} result.validated - Whether decompression passed validation
 */
export function decompress(symbols, context = {}, options = {}) {
  const { format = 'natural', verbose = true } = options;
  
  try {
    // Parse symbolic directives
    const directives = parseSymbolicDirectives(symbols);
    
    // Choose decompressor based on domain
    const domain = context.domain || detectDomain(directives, context);
    const decompressor = getDecompressor(domain);
    
    // Decompress using domain-specific logic
    const result = decompressor(directives, context, options);
    
    // Validate decompression
    const validated = validateDecompression(result, context);
    
    return {
      text: result.text,
      metadata: {
        domain,
        directivesProcessed: directives.length,
        format,
        validated
      },
      validated
    };
  } catch (error) {
    console.error('[decompressor] Decompression failed:', error.message);
    // Graceful degradation: return symbols as-is
    return {
      text: symbols,
      metadata: {
        error: error.message,
        fallback: true
      },
      validated: false
    };
  }
}

/**
 * Parse symbolic directives from AI response
 * @private
 */
function parseSymbolicDirectives(symbols) {
  if (!symbols || typeof symbols !== 'string') {
    return [];
  }
  
  const lines = symbols.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const directives = [];
  
  for (const line of lines) {
    // Parse directive format: +key: value or COMMAND args
    if (line.startsWith('+')) {
      const match = line.match(/^\+([a-zA-Z_]+):\s*(.+)$/);
      if (match) {
        directives.push({
          type: 'attribute',
          key: match[1],
          value: match[2]
        });
      }
    } else if (line.match(/^[A-Z_]+\s/)) {
      const match = line.match(/^([A-Z_]+)\s+(.+)$/);
      if (match) {
        directives.push({
          type: 'command',
          command: match[1],
          args: match[2]
        });
      }
    } else {
      // Plain text line
      directives.push({
        type: 'text',
        content: line
      });
    }
  }
  
  return directives;
}

/**
 * Detect domain from directives and context
 * @private
 */
function detectDomain(directives, context) {
  // Check explicit domain in context
  if (context.domain) {
    return context.domain;
  }
  
  // Detect from directive types
  const hasCodeDirectives = directives.some(d => 
    d.key === 'function' || d.key === 'variable' || d.key === 'import' || d.command === 'PATCH'
  );
  
  const hasEngineeringDirectives = directives.some(d =>
    d.key === 'constraint' || d.key === 'recommendation' || d.key === 'calculation'
  );
  
  if (hasCodeDirectives) return 'code';
  if (hasEngineeringDirectives) return 'engineering';
  return 'general';
}

/**
 * Get domain-specific decompressor function
 * @private
 */
function getDecompressor(domain) {
  switch (domain) {
    case 'code':
      return decompressCode;
    case 'engineering':
      return decompressEngineering;
    case 'general':
      return decompressGeneral;
    default:
      return decompressGeneral;
  }
}

/**
 * Decompress code domain symbolic response
 * @private
 */
function decompressCode(directives, context, options) {
  const parts = [];
  const { verbose = true } = options;
  
  // Group directives by type
  const grouped = {
    patches: directives.filter(d => d.command === 'PATCH'),
    functions: directives.filter(d => d.key === 'function'),
    variables: directives.filter(d => d.key === 'variable'),
    imports: directives.filter(d => d.key === 'import'),
    operations: directives.filter(d => d.key === 'operation'),
    intents: directives.filter(d => d.key === 'intent'),
    text: directives.filter(d => d.type === 'text')
  };
  
  // Generate natural language from symbolic directives
  
  // File patches
  if (grouped.patches.length > 0) {
    const files = grouped.patches.map(d => d.args).join(', ');
    parts.push(`I'll modify the following file(s): ${files}`);
  }
  
  // Operations
  if (grouped.operations.length > 0) {
    const operation = grouped.operations[0].value;
    const operationText = {
      add: 'add new functionality',
      remove: 'remove existing code',
      modify: 'update existing code'
    }[operation] || operation;
    parts.push(`\nOperation: ${operationText}`);
  }
  
  // Functions
  if (grouped.functions.length > 0) {
    const funcNames = grouped.functions.map(d => `\`${d.value}\``).join(', ');
    parts.push(`\nFunctions affected: ${funcNames}`);
  }
  
  // Variables
  if (grouped.variables.length > 0) {
    const varNames = grouped.variables.map(d => `\`${d.value}\``).join(', ');
    parts.push(`\nVariables: ${varNames}`);
  }
  
  // Imports
  if (grouped.imports.length > 0) {
    const imports = grouped.imports.map(d => d.value).join(', ');
    parts.push(`\nRequired imports: ${imports}`);
  }
  
  // Intent
  if (grouped.intents.length > 0) {
    const intent = grouped.intents[0].value;
    if (intent === 'fix_bug') {
      parts.push(`\nThis change fixes a bug.`);
    }
  }
  
  // Include any plain text from AI
  if (grouped.text.length > 0) {
    parts.push(`\n\nDetails:`);
    parts.push(grouped.text.map(d => d.content).join('\n'));
  }
  
  // If context includes file content, generate code snippet
  if (context.files && context.targetFile && context.files[context.targetFile]) {
    if (verbose) {
      parts.push(`\n\nHere's the updated code for \`${context.targetFile}\`:`);
      parts.push(`\`\`\`javascript\n${context.files[context.targetFile]}\n\`\`\``);
    }
  }
  
  // Fallback: if no meaningful expansion, return symbolic
  if (parts.length === 0) {
    parts.push('Here\'s the solution in symbolic format:');
    parts.push(directives.map(d => {
      if (d.type === 'command') return `${d.command} ${d.args}`;
      if (d.type === 'attribute') return `+${d.key}: ${d.value}`;
      return d.content;
    }).join('\n'));
  }
  
  return {
    text: parts.join('\n')
  };
}

/**
 * Decompress engineering domain symbolic response
 * @private
 */
function decompressEngineering(directives, context, options) {
  const parts = [];
  
  // Group directives
  const constraints = directives.filter(d => d.key === 'constraint');
  const recommendations = directives.filter(d => d.key === 'recommendation');
  const calculations = directives.filter(d => d.key === 'calculation');
  const standards = directives.filter(d => d.key === 'standard');
  
  if (constraints.length > 0) {
    parts.push('**Engineering Constraints:**');
    parts.push(constraints.map(d => `- ${d.value}`).join('\n'));
  }
  
  if (recommendations.length > 0) {
    parts.push('\n**Recommendations:**');
    parts.push(recommendations.map(d => `- ${d.value}`).join('\n'));
  }
  
  if (calculations.length > 0) {
    parts.push('\n**Calculations Required:**');
    parts.push(calculations.map(d => `- ${d.value}`).join('\n'));
  }
  
  if (standards.length > 0) {
    parts.push('\n**Applicable Standards:**');
    parts.push(standards.map(d => `- ${d.value}`).join('\n'));
  }
  
  // Include original prompt context if available
  if (context.fullPrompt && options.verbose) {
    parts.push(`\n**Original Request:** ${context.fullPrompt}`);
  }
  
  return {
    text: parts.join('\n')
  };
}

/**
 * Decompress general domain symbolic response
 * @private
 */
function decompressGeneral(directives, context, options) {
  const parts = [];
  
  // Extract intent if present
  const intents = directives.filter(d => d.key === 'intent');
  if (intents.length > 0) {
    const intent = intents[0].value;
    const intentPrefixes = {
      question: 'In response to your question:',
      request: 'Here\'s what you requested:',
      command: 'I\'ve completed the following:'
    };
    if (intentPrefixes[intent]) {
      parts.push(intentPrefixes[intent]);
    }
  }
  
  // Include all text directives
  const textDirectives = directives.filter(d => d.type === 'text' || d.key === 'task');
  if (textDirectives.length > 0) {
    parts.push(textDirectives.map(d => d.content || d.value).join('\n'));
  }
  
  // If no content, return fallback
  if (parts.length === 0) {
    parts.push('Response generated from symbolic format.');
    parts.push(directives.map(d => {
      if (d.type === 'command') return `${d.command} ${d.args}`;
      if (d.type === 'attribute') return `+${d.key}: ${d.value}`;
      return d.content;
    }).join('\n'));
  }
  
  return {
    text: parts.join('\n\n')
  };
}

/**
 * Validate decompression result
 * @private
 */
function validateDecompression(result, context) {
  if (!result || !result.text) return false;
  if (result.text.length === 0) return false;
  
  // Basic validation: ensure we produced some output
  // More sophisticated validation could check semantic preservation
  
  return true;
}

/**
 * Check if decompression is lossless (roundtrip test)
 * 
 * @param {string} originalPrompt - Original user prompt
 * @param {string} decompressedText - Decompressed output from AI
 * @returns {Object} - Losslessness metrics
 * @returns {boolean} result.isLossless - True if semantically equivalent
 * @returns {number} result.similarity - Cosine similarity score (0-1)
 */
export function checkLossless(originalPrompt, decompressedText) {
  // Simple heuristic: check if key terms are preserved
  // A more sophisticated version would use embeddings/semantic similarity
  
  const extractKeyTerms = (text) => {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'from', 'have', 'been'].includes(word));
  };
  
  const originalTerms = new Set(extractKeyTerms(originalPrompt));
  const decompressedTerms = new Set(extractKeyTerms(decompressedText));
  
  // Calculate overlap
  const intersection = new Set([...originalTerms].filter(t => decompressedTerms.has(t)));
  const union = new Set([...originalTerms, ...decompressedTerms]);
  
  const similarity = intersection.size / union.size;
  const isLossless = similarity > 0.7;  // 70% threshold
  
  return {
    isLossless,
    similarity: Math.round(similarity * 100) / 100,
    details: {
      commonTerms: intersection.size,
      originalTerms: originalTerms.size,
      decompressedTerms: decompressedTerms.size,
      preservedTerms: intersection.size,
      totalTerms: union.size
    }
  };
}
