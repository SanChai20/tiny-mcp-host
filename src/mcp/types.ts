// MCP相关辅助结构定义在这里

export type MCPConnectionStatus =
  | "connecting"
  | "connected"
  | "error"
  | "not-connected";

export interface StdioOptions {
    type: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
}

export interface WebSocketOptions {
    type: "websocket";
    url: string;
}

export interface SSEOptions {
    type: "sse";
    url: string;
}

export type TransportOptions = StdioOptions | WebSocketOptions | SSEOptions;

export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: {
        name: string;
        description?: string;
        required?: boolean;
    }[];
}

export interface MCPResource {
    name: string;
    uri: string;
    description?: string;
    mimeType?: string;
}

export interface MCPTool {
    name: string;
    description?: string;
    category?: string;
    inputSchema: {
        type: string;
        properties?: Record<string, any>;
    };
}

export interface MCPOptions {
    name: string;
    id: string;
    transport: TransportOptions;
    faviconUrl?: string;
    timeout?: number;
}

export interface MCPServerStatus extends MCPOptions {
    errors: string[];
    status: MCPConnectionStatus;

    prompts: MCPPrompt[];
    tools: MCPTool[];
    resources: MCPResource[];
}

export const DEFAULT_MCP_TIMEOUT = 20_000; // 20 seconds