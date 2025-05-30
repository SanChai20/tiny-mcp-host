/**
 * Model Context Protocol Type Definitions
 * 
 * This module contains definitions for the Model Context Protocol (MCP)
 * integration. It provides comprehensive type safety and structural contracts for
 * communication with MCP services throughout the application.
 */

/**
 * Connection status for MCP servers
 * 
 * Provides standardized states for tracking the lifecycle of MCP connections,
 * enabling reliable status monitoring and error handling.
 */
export type MCPConnectionStatus =
  | "connecting"
  | "connected"
  | "error"
  | "not-connected";

/**
 * Standard I/O Transport Configuration
 * 
 * Defines the configuration for process-based MCP communication using standard input/output.
 * Enables secure and reliable communication with child processes.
 */
export interface StdioOptions {
    type: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
}

/**
 * HTTP Streaming Transport Configuration
 * 
 * Defines the configuration for HTTP-based streaming communication with MCP services.
 * Supports custom headers for authentication and specialized service integration.
 */
export interface StreamableHttpOptions {
    type: "streamableHttp",
    url: string;
    requestHeaders?: { [key: string]: string };
}

/**
 * Server-Sent Events Transport Configuration
 * 
 * Defines the configuration for SSE-based communication with MCP services.
 * Enables efficient one-way real-time data streaming from the server.
 */
export interface SSEOptions {
    type: "sse";
    url: string;
}

/**
 * Unified Transport Options Type
 * 
 * Combines all supported transport configurations into a single type.
 * Enables flexible protocol selection while maintaining type safety.
 */
export type TransportOptions = StdioOptions | SSEOptions | StreamableHttpOptions;

/**
 * MCP Prompt Definition
 * 
 * Defines the structure of prompts available through MCP services.
 * Supports complex parameter definitions with validation requirements.
 */
export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: {
        name: string;
        description?: string;
        required?: boolean;
    }[];
}

/**
 * MCP Resource Definition
 * 
 * Defines the structure of resources accessible through MCP services.
 * Provides comprehensive metadata for content handling and display.
 */
export interface MCPResource {
    name: string;
    uri: string;
    description?: string;
    mimeType?: string;
}

/**
 * MCP Tool Definition
 * 
 * Defines the structure of tools provided by MCP services.
 * Includes schema validation support for ensuring input correctness.
 */
export interface MCPTool {
    name: string;
    description?: string;
    category?: string;
    inputSchema: {
        type: string;
        properties?: Record<string, any>;
    };
}

/**
 * MCP Connection Configuration
 * 
 * Comprehensive configuration interface for establishing MCP connections.
 * Provides all necessary parameters for secure and reliable service communication.
 */
export interface MCPOptions {
    name: string;
    id: string;
    transport: TransportOptions;
    faviconUrl?: string;
    timeout?: number;
}

/**
 * MCP Server Status Information
 * 
 * Extended interface that combines connection configuration with runtime status data.
 * Provides comprehensive monitoring capabilities for service health and capabilities.
 */
export interface MCPServerStatus extends MCPOptions {
    errors: string[];
    status: MCPConnectionStatus;

    prompts: MCPPrompt[];
    tools: MCPTool[];
    resources: MCPResource[];
}

/**
 * Default timeout for MCP connection attempts
 * 
 * Ensures connection reliability by limiting wait time for unresponsive servers.
 * Balances responsiveness with adequate time for network latency.
 */
export const DEFAULT_MCP_TIMEOUT = 20_000; // 20 seconds