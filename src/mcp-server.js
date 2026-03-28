#!/usr/bin/env node

/**
 * Sharper Agent MCP Server
 * 
 * Production-ready MCP server for transparent AI prompt compression.
 * Implements the Model Context Protocol with tools for symbolic compression/decompression.
 * 
 * @module mcp-server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import { compress, getCompressionStats } from './compressor.js';
import { decompress, checkLossless } from './decompressor.js';
import { sendPrompt, testConnection, validateConfig } from './model-gateway.js';

// Global state
let config = null;
let compressionHistory = [];

/**
 * Load configuration from config.json
 */
async function loadConfig() {
  try {
    const configData = await readFile('./config.json', 'utf-8');
    config = JSON.parse(configData);
    
    // Validate config
    const validation = validateConfig(config.model);
    if (!validation.valid) {
      console.error('[sharper-agent] Config validation failed:', validation.errors);
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    
    console.error('[sharper-agent] Configuration loaded successfully');
    console.error(`[sharper-agent] Provider: ${config.model.provider}, Model: ${config.model.model}`);
    
    return config;
  } catch (error) {
    console.error('[sharper-agent] Failed to load config:', error.message);
    throw error;
  }
}

/**
 * Main MCP server setup
 */
async function main() {
  // Load configuration
  await loadConfig();
  
  // Create MCP server
  const server = new Server(
    {
      name: 'sharper-agent',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * Tool: sharper_chat
   * Main entry point - compress prompt, send to model, decompress response
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'sharper_chat': {
          const { prompt, context = {}, options = {} } = args;
          
          if (!prompt || typeof prompt !== 'string') {
            throw new Error('prompt is required and must be a string');
          }
          
          // Step 1: Compress prompt
          console.error('[sharper_chat] Compressing prompt...');
          const compressionResult = compress(prompt, context, {
            domain: config.compression.domain,
            aggressiveness: config.compression.aggressiveness,
            ...options
          });
          
          console.error(`[sharper_chat] Compression: ${(compressionResult.ratio * 100).toFixed(1)}% reduction`);
          console.error(`[sharper_chat] Tokens saved: ${compressionResult.stats.tokensSaved}`);
          
          // Step 2: Send to AI model
          console.error('[sharper_chat] Sending to model...');
          const modelResponse = await sendPrompt(
            compressionResult.symbols,
            config.model,
            {
              maxTokens: options.maxTokens || 2000,
              temperature: options.temperature || 0.7
            }
          );
          
          console.error('[sharper_chat] Model response received');
          console.error(`[sharper_chat] Model tokens: ${modelResponse.usage.totalTokens}`);
          
          // Step 3: Decompress response
          console.error('[sharper_chat] Decompressing response...');
          const decompressionResult = decompress(
            modelResponse.text,
            compressionResult.context,
            {
              format: options.format || 'natural',
              verbose: options.verbose !== false
            }
          );
          
          // Step 4: Check losslessness
          const losslessCheck = checkLossless(prompt, decompressionResult.text);
          
          // Store in history
          const historyEntry = {
            timestamp: new Date().toISOString(),
            compressionRatio: compressionResult.ratio,
            stats: compressionResult.stats,
            usage: modelResponse.usage,
            lossless: losslessCheck
          };
          compressionHistory.push(historyEntry);
          
          // Keep history limited
          if (compressionHistory.length > 100) {
            compressionHistory.shift();
          }
          
          console.error(`[sharper_chat] Lossless check: ${losslessCheck.isLossless ? 'PASS' : 'FAIL'} (${(losslessCheck.similarity * 100).toFixed(1)}%)`);
          
          return {
            content: [
              {
                type: 'text',
                text: decompressionResult.text
              }
            ],
            metadata: {
              compression: {
                ratio: compressionResult.ratio,
                tokensSaved: compressionResult.stats.tokensSaved,
                originalTokens: compressionResult.stats.originalTokens,
                compressedTokens: compressionResult.stats.compressedTokens
              },
              model: {
                provider: modelResponse.metadata.provider,
                model: modelResponse.metadata.model,
                usage: modelResponse.usage
              },
              lossless: losslessCheck,
              validated: decompressionResult.validated
            }
          };
        }

        case 'sharper_compress': {
          // Test compression only
          const { text, context = {}, options = {} } = args;
          
          if (!text || typeof text !== 'string') {
            throw new Error('text is required and must be a string');
          }
          
          const result = compress(text, context, {
            domain: config.compression.domain,
            aggressiveness: config.compression.aggressiveness,
            ...options
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  symbols: result.symbols,
                  ratio: result.ratio,
                  stats: result.stats
                }, null, 2)
              }
            ]
          };
        }

        case 'sharper_decompress': {
          // Test decompression only
          const { symbols, context = {}, options = {} } = args;
          
          if (!symbols || typeof symbols !== 'string') {
            throw new Error('symbols is required and must be a string');
          }
          
          const result = decompress(symbols, context, options);
          
          return {
            content: [
              {
                type: 'text',
                text: result.text
              }
            ],
            metadata: result.metadata
          };
        }

        case 'sharper_stats': {
          // Get compression statistics
          const stats = getCompressionStats(compressionHistory);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  server: {
                    uptime: process.uptime(),
                    version: '0.1.0'
                  },
                  compression: stats,
                  configuration: {
                    provider: config.model.provider,
                    model: config.model.model,
                    domain: config.compression.domain,
                    aggressiveness: config.compression.aggressiveness
                  }
                }, null, 2)
              }
            ]
          };
        }

        case 'sharper_test_connection': {
          // Test model connectivity
          const isConnected = await testConnection(config.model);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  connected: isConnected,
                  provider: config.model.provider,
                  model: config.model.model,
                  baseUrl: config.model.baseUrl || 'N/A'
                }, null, 2)
              }
            ]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[${name}] Error:`, error.message);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'sharper_chat',
          description: 'Main entry point for compressed AI interactions. Compresses prompt, sends to model, decompresses response transparently.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Natural language user prompt'
              },
              context: {
                type: 'object',
                description: 'Additional context (files, functions, etc.)',
                properties: {
                  files: {
                    type: 'object',
                    description: 'File contents map (filename -> content)'
                  }
                }
              },
              options: {
                type: 'object',
                description: 'Optional parameters',
                properties: {
                  maxTokens: {
                    type: 'number',
                    description: 'Max tokens in model response'
                  },
                  temperature: {
                    type: 'number',
                    description: 'Sampling temperature (0-1)'
                  },
                  format: {
                    type: 'string',
                    description: 'Output format (natural, markdown, code)'
                  },
                  verbose: {
                    type: 'boolean',
                    description: 'Include detailed explanations'
                  }
                }
              }
            },
            required: ['prompt']
          }
        },
        {
          name: 'sharper_compress',
          description: 'Test compression only. Returns symbolic representation without sending to model.',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to compress'
              },
              context: {
                type: 'object',
                description: 'Additional context'
              },
              options: {
                type: 'object',
                description: 'Compression options'
              }
            },
            required: ['text']
          }
        },
        {
          name: 'sharper_decompress',
          description: 'Test decompression only. Expands symbolic format to natural language.',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'string',
                description: 'Symbolic representation to decompress'
              },
              context: {
                type: 'object',
                description: 'Preserved context from compression'
              },
              options: {
                type: 'object',
                description: 'Decompression options'
              }
            },
            required: ['symbols']
          }
        },
        {
          name: 'sharper_stats',
          description: 'Get compression statistics and server status.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'sharper_test_connection',
          description: 'Test connectivity to configured AI model.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('[sharper-agent] MCP server running on stdio');
  console.error('[sharper-agent] Ready to compress and decompress!');
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('[sharper-agent] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[sharper-agent] Unhandled rejection:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('[sharper-agent] Fatal error:', error);
  process.exit(1);
});
