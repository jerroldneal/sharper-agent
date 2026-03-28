/**
 * Model Gateway
 * 
 * Abstracts AI model API calls across different providers (Ollama, Claude, OpenAI).
 * Handles authentication, rate limiting, retries, and response normalization.
 * 
 * @module model-gateway
 */

/**
 * Send prompt to AI model and get response
 * 
 * @param {string} prompt - Prompt to send (can be symbolic or natural language)
 * @param {Object} config - Model configuration
 * @param {string} config.provider - Provider name ('ollama', 'claude', 'openai')
 * @param {string} config.baseUrl - API base URL
 * @param {string} config.model - Model identifier
 * @param {string} config.apiKey - API key (required for Claude/OpenAI)
 * @param {Object} options - Request options
 * @param {boolean} options.stream - Whether to stream response
 * @param {number} options.maxTokens - Max tokens in response
 * @param {number} options.temperature - Sampling temperature (0-1)
 * @returns {Promise<Object>} - Model response
 * @returns {string} response.text - Response text
 * @returns {Object} response.usage - Token usage statistics
 * @returns {Object} response.metadata - Provider-specific metadata
 */
export async function sendPrompt(prompt, config, options = {}) {
  const {
    provider = 'ollama',
    baseUrl,
    model,
    apiKey
  } = config;
  
  const {
    stream = false,
    maxTokens = 2000,
    temperature = 0.7
  } = options;
  
  try {
    // Select provider-specific implementation
    switch (provider.toLowerCase()) {
      case 'ollama':
        return await sendToOllama(prompt, { baseUrl, model }, { maxTokens, temperature });
      case 'claude':
      case 'anthropic':
        return await sendToClaude(prompt, { apiKey, model }, { maxTokens, temperature });
      case 'openai':
      case 'gpt':
        return await sendToOpenAI(prompt, { apiKey, model }, { maxTokens, temperature });
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error(`[model-gateway] Request failed for ${provider}:`, error.message);
    
    // Retry logic for transient errors
    if (isTransientError(error) && !options._retryCount) {
      console.log('[model-gateway] Retrying after transient error...');
      await sleep(1000);
      return sendPrompt(prompt, config, { ...options, _retryCount: 1 });
    }
    
    throw error;
  }
}

/**
 * Send prompt to Ollama
 * @private
 */
async function sendToOllama(prompt, config, options) {
  const { baseUrl = 'http://localhost:11434', model = 'qwen2.5-coder:7b' } = config;
  const { maxTokens = 2000, temperature = 0.7 } = options;
  
  const url = `${baseUrl}/api/generate`;
  
  const requestBody = {
    model,
    prompt,
    stream: false,
    options: {
      num_predict: maxTokens,
      temperature
    }
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    text: data.response || '',
    usage: {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
    },
    metadata: {
      model: data.model,
      provider: 'ollama',
      totalDuration: data.total_duration,
      loadDuration: data.load_duration
    }
  };
}

/**
 * Send prompt to Claude (Anthropic)
 * @private
 */
async function sendToClaude(prompt, config, options) {
  const { apiKey, model = 'claude-3-5-sonnet-20241022' } = config;
  const { maxTokens = 2000, temperature = 0.7 } = options;
  
  if (!apiKey) {
    throw new Error('Anthropic API key required for Claude');
  }
  
  const url = 'https://api.anthropic.com/v1/messages';
  
  const requestBody = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    text: data.content[0]?.text || '',
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    },
    metadata: {
      model: data.model,
      provider: 'claude',
      stopReason: data.stop_reason
    }
  };
}

/**
 * Send prompt to OpenAI (GPT)
 * @private
 */
async function sendToOpenAI(prompt, config, options) {
  const { apiKey, model = 'gpt-4' } = config;
  const { maxTokens = 2000, temperature = 0.7 } = options;
  
  if (!apiKey) {
    throw new Error('OpenAI API key required for GPT models');
  }
  
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const requestBody = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    text: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    },
    metadata: {
      model: data.model,
      provider: 'openai',
      finishReason: data.choices[0]?.finish_reason
    }
  };
}

/**
 * Check if error is transient (retryable)
 * @private
 */
function isTransientError(error) {
  const transientMessages = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    '503',
    '429',
    'rate limit'
  ];
  
  return transientMessages.some(msg => 
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

/**
 * Sleep utility for retry logic
 * @private
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test model connectivity
 * 
 * @param {Object} config - Model configuration
 * @returns {Promise<boolean>} - True if model is reachable
 */
export async function testConnection(config) {
  try {
    const response = await sendPrompt('Test connection', config, {
      maxTokens: 10,
      temperature: 0.1
    });
    return response && response.text && response.text.length > 0;
  } catch (error) {
    console.error('[model-gateway] Connection test failed:', error.message);
    return false;
  }
}

/**
 * Get supported providers list
 * 
 * @returns {Array<string>} - List of supported provider names
 */
export function getSupportedProviders() {
  return ['ollama', 'claude', 'anthropic', 'openai', 'gpt'];
}

/**
 * Validate model configuration
 * 
 * @param {Object} config - Model configuration to validate
 * @returns {Object} - Validation result
 * @returns {boolean} result.valid - Whether config is valid
 * @returns {Array<string>} result.errors - Validation error messages
 */
export function validateConfig(config) {
  const errors = [];
  
  if (!config) {
    return { valid: false, errors: ['Configuration is required'] };
  }
  
  if (!config.provider) {
    errors.push('Provider is required');
  } else if (!getSupportedProviders().includes(config.provider.toLowerCase())) {
    errors.push(`Unsupported provider: ${config.provider}`);
  }
  
  if (!config.model) {
    errors.push('Model identifier is required');
  }
  
  // Provider-specific validation
  if (config.provider === 'ollama' && !config.baseUrl) {
    errors.push('baseUrl is required for Ollama');
  }
  
  if ((config.provider === 'claude' || config.provider === 'anthropic') && !config.apiKey) {
    errors.push('apiKey is required for Claude');
  }
  
  if ((config.provider === 'openai' || config.provider === 'gpt') && !config.apiKey) {
    errors.push('apiKey is required for OpenAI');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
