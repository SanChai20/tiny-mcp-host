/**
 * MCP Connection Manager
 * 
 * Solution for managing external connection services and seamless integration with 
 * VS Code chat functionality. This module orchestrates Model Context Protocol (MCP) 
 * connections and their complete lifecycle within the extension environment.
 */
import * as vscode from 'vscode';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { DEFAULT_MCP_TIMEOUT, MCPConnectionStatus, MCPOptions, MCPPrompt, MCPResource, MCPServerStatus, MCPTool } from "./types";
import { GlobalChannel } from "../channel";
import { CreateMessageRequestSchema, ListRootsRequestSchema, ListRootsResultSchema, PromptListChangedNotificationSchema, ResourceListChangedNotificationSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { LLMRequest } from '../chat/utils';

/**
 * MCP Connector Manager
 * 
 * Enterprise-class Singleton implementation that centralizes management of all MCP connections.
 * Delivers robust methods for creating, retrieving, and managing MCP connections with high reliability.
 */
export class MCPConnectorManager {

    private static instance: MCPConnectorManager;    
    /** Callback mechanism triggered when connections are refreshed */
    public onConnectionsRefreshed?: () => void;
    /** High-performance Map for connection ID to MCPConnection object mapping */
    private connections: Map<string, MCPConnection> = new Map();
    /** Controller for efficiently aborting connection operations */
    private abortController: AbortController = new AbortController();
    /** Private constructor to enforce Singleton design pattern */
    private constructor() {}    /**
     * Returns the singleton instance of MCPConnectorManager
     * Creates a new instance if one doesn't already exist, ensuring resource efficiency
     * 
     * @returns The globally accessible MCPConnectorManager instance
     */
    public static getInstance(): MCPConnectorManager {
        if (!MCPConnectorManager.instance) {
            MCPConnectorManager.instance = new MCPConnectorManager();
        }
        return MCPConnectorManager.instance;
    }    
    /**
     * Creates a new MCP connection with the given ID and options
     * Returns existing connection if one with the same ID already exists, optimizing resource usage
     * 
     * @param id - Unique identifier for the connection, used for tracking and management
     * @param options - Comprehensive configuration options for the connection
     * @returns The created or existing MCPConnection instance
     */
    createConnection(id: string, options: MCPOptions): MCPConnection {
        if (!this.connections.has(id)) {
            const connection = new MCPConnection(options);
            this.connections.set(id, connection);
            return connection;
        } else {
            return this.getConnection(id)!;
        }
    }    
    /**
     * Retrieves an existing connection by ID with optimal performance
     * 
     * @param id - Unique identifier for the connection to retrieve
     * @returns The connection instance or undefined if not found in the registry
     */
    getConnection(id: string) {
        return this.connections.get(id);
    }    
      
    /**
     * Validates if a connection with the given ID is in the active connected state
     * Performs comprehensive status verification for reliability
     * 
     * @param id - Unique identifier for the connection to check
     * @returns True if the connection exists and is in connected state, false otherwise
     */
    isConnected(id: string) {
        const connection = this.getConnection(id);
        if (connection !== undefined) {
            const status = connection.getStatus();
            return status.status === 'connected';
        }
        return false;
    }    
      
    /**
     * Removes a connection with the given ID and gracefully closes it
     * Ensures proper resource cleanup and connection termination
     * 
     * @param id - Unique identifier for the connection to remove from the registry
     * @returns True if the connection was found and successfully removed, false otherwise
     */
    async removeConnection(id: string) : Promise<boolean> {
        const connection = this.getConnection(id);
        if (connection) {
            await connection.client.close();
        }

        return this.connections.delete(id);
    }        
    /**
     * Disconnects all MCP connections and optionally clears the connection cache
     * Implements comprehensive error handling and logging for enterprise reliability
     * 
     * @param clear - Whether to clear the connections registry after disconnecting
     */
    async removeAllConnections(clear: boolean = true): Promise<void> {
        try {
            // Disconnect all connections
            const closePromises = Array.from(this.connections.entries()).map(async ([id, connection]) => {
                try {
                    // Abort any pending connection attempts
                    connection.abortController.abort();                    
                    // Close client connection
                    await connection.client.close();
                } catch (e) {
                    // Continue processing even if closing fails
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    GlobalChannel.getInstance().appendLog(vscode.l10n.t("Error closing connection {0}, {1}", id, errorMessage));
                }
            });

            // Wait for all close operations to complete
            await Promise.all(closePromises);            
            // Clear connection map if requested
            if (clear) {
                this.connections.clear();
            }

            // Notify connection refresh
            if (this.onConnectionsRefreshed) {
                this.onConnectionsRefreshed();
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            GlobalChannel.getInstance().appendLog(vscode.l10n.t("Failed to remove all connections {0}", errorMessage));
        }
    }

    setConnections(servers: MCPOptions[], forceRefresh: boolean) {
        let refresh = false;

        // Remove any connections that are no longer in config
        Array.from(this.connections.entries()).forEach(([id, connection]) => {
            if (!servers.find((s) => s.id === id)) {
            refresh = true;
            connection.abortController.abort();
            void connection.client.close();
            this.connections.delete(id);
            }
        });

        // Add any connections that are not yet in manager
        servers.forEach((server) => {
            if (!this.connections.has(server.id)) {
            refresh = true;
            this.connections.set(server.id, new MCPConnection(server));
            }
        });

        // NOTE the id is made by stringifying the options
        if (refresh) {
            void this.refreshConnections(forceRefresh);
        }
    }

    async refreshConnection(serverId: string) {
        const connection = this.getConnection(serverId);
        if (!connection) {
            throw new Error(`MCP Connection ${serverId} not found`);
        }
        await connection.connectClient(true, this.abortController.signal);
        if (this.onConnectionsRefreshed) {
            this.onConnectionsRefreshed();
        }
    }

    async relinkConnections() {
        this.abortController.abort();
        this.abortController = new AbortController();
        
        await Promise.all(
            Array.from(this.connections.keys()).map(async (serverId) => {
                const connection = this.getConnection(serverId);
                if (!connection) {
                    return;
                }                
                try {
                    // 1. Complete client and transport layer reset
                    await connection.hardReset();
    
                    // 2. Create new AbortController
                    connection.abortController = new AbortController();
    
                    // 3. Delay to ensure resource release
                    await new Promise(resolve => setTimeout(resolve, 500));
    
                    // 4. Re-establish connection
                    await connection.connectClient(
                        true, 
                        this.abortController.signal
                    );
    
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    GlobalChannel.getInstance().appendLog(
                        vscode.l10n.t("Error refreshing connection {0}: {1}", 
                        serverId, errorMessage)
                    );
                }
            })
        );
    }


    async refreshConnections(force: boolean) {
        this.abortController.abort();
        this.abortController = new AbortController();
        await Promise.race([
            new Promise((resolve) => {
                this.abortController.signal.addEventListener("abort", () => {
                    resolve(undefined);
                });
            }),
            (async () => {
                await Promise.all(
                    Array.from(this.connections.values()).map(async (connection) => {
                        await connection.connectClient(force, this.abortController.signal);
                    }),
                );
                if (this.onConnectionsRefreshed) {
                    this.onConnectionsRefreshed();
                }
            })(),
        ]);
    }    
    
    /**
     * Retrieves detailed status information for all managed connections
     * Augments status data with client instances for comprehensive reporting
     * 
     * @returns Array of status objects with client references
     */
    getStatuses(): (MCPServerStatus & { client: Client })[] {
        return Array.from(this.connections.values()).map((connection) => ({
            ...connection.getStatus(),
            client: connection.client,
        }));
    }
    
    /**
     * Retrieves all tools from all registered connections
     * Provides comprehensive tool inventory for management purposes
     * 
     * @returns Array of objects containing connection ID and associated tools
     */
    getAllConnectionTools(): { id: string; tools: MCPTool[] }[] {
        return Array.from(this.connections.entries()).map(([id, connection]) => ({
            id: id,
            tools: connection.tools
        }));
    }

    
    /**
     * Retrieves tools from actively connected servers only
     * Filters for operational connections to ensure reliability
     * 
     * @returns Array of objects containing client instance and available tools
     */
    getAvailableConnectionTools() : { client: Client; tools: MCPTool[] }[] {
        return Array.from(this.connections.values()).filter(connection => connection.status === "connected").map(connection => ({
            client: connection.client,
            tools: connection.tools
        }));
    }    
    
    /**
     * Retrieves resources from connected servers with their associated IDs
     * Filters for active connections with available resources
     * 
     * @returns Array of objects containing connection ID and available resources
     */
    getAvailableConnectionResourcesWithId(): { id: string; resources: MCPResource[] }[] {
        return Array.from(this.connections.entries()).filter(([id, connection]) => connection.status === "connected" && connection.resources.length > 0).map(([id, connection]) => ({
            id: id,
            resources: connection.resources
        }));
    }
    
    /**
     * Retrieves resources from connected servers with their client instances
     * Optimized for direct client access when utilizing resources
     * 
     * @returns Array of objects containing client instance and available resources
     */
    getAvailableConnectionResourcesWithClient(): { client: Client; resources: MCPResource[] }[] {
        return Array.from(this.connections.values()).filter(connection => connection.status === "connected" && connection.resources.length > 0).map(connection => ({
            client: connection.client,
            resources: connection.resources
        }));
    }    
    /**
     * Retrieves count of currently available active connections
     * Provides real-time connection health metrics
     * 
     * @returns Number of successfully connected MCP servers
     */
    getAvailableConnectionsCount(): number {
        return Array.from(this.connections.values()).filter((connection) => connection.status === "connected").length;
    }

    /**
     * Locates connection by specific tool name across all connections
     * Enables tool-based routing to appropriate connection endpoints
     * 
     * @param toolName - The name of the tool to search for
     * @returns Object containing connection and ID if found, undefined otherwise
     */
    findConnectionByToolName(toolName: string): { connection: MCPConnection; id: string } | undefined {
        for (const [id, connection] of this.connections.entries()) {
            if (connection.tools.some((tool) => tool.name === toolName)) {
                return { connection, id };
            }
        }
        return undefined;
    }

}

/**
 * MCP Connection Instance
 * 
 * Encapsulates a single Model Context Protocol connection with robust lifecycle management.
 * Handles connection establishment, capability discovery, and resource management.
 */
export class MCPConnection {

    /** Client instance for MCP communications */
    public client: Client;
    /** Transport layer used for connection */
    private transport: Transport;

    /** Promise tracking active connection attempt */
    private connectionPromise: Promise<unknown> | null = null;
    /** Controller for aborting operations */
    public abortController: AbortController;

    /** Current connection status */
    public status: MCPConnectionStatus = "not-connected";
    /** Collection of error messages */
    public errors: string[] = [];

    /** Available prompts from the MCP server */
    public prompts: MCPPrompt[] = [];
    /** Available tools from the MCP server */
    public tools: MCPTool[] = [];
    /** Available resources from the MCP server */
    public resources: MCPResource[] = [];    
    
    /**
     * Creates a new MCP connection instance
     * Initializes transport and client with appropriate configuration
     * 
     * @param options - Configuration options for the connection
     */
    constructor(private readonly options: MCPOptions) {
        this.transport = this.constructTransport(options);
        this.client = new Client(
            {
                name: "devlinker-client",
                version: "0.3.8",
            },
            {
                capabilities: { sampling: {},  roots: {} }
            },
        );

        this.abortController = new AbortController();
    }    
    
    /**
     * Performs a complete reset of the client and transport layer
     * Ensures clean state for connection re-establishment
     */
    async hardReset() {
        // Complete client and transport layer reset
        await this.client.close();
        this.transport = this.constructTransport(this.options);
        this.client = new Client(
            { name: "devlinker-client", version: "0.3.8" },
            { capabilities: { sampling: {},  roots: {} } }
        );
        this.status = "not-connected";
    }    
    
    /**
     * Constructs the appropriate transport layer based on connection options
     * Supports multiple transport protocols for versatile connectivity
     * 
     * @param options - Configuration options containing transport specifications
     * @returns Initialized transport instance
     * @throws Error for unsupported transport types
     */
    private constructTransport(options: MCPOptions): Transport {
        switch (options.transport.type) {
            case "stdio":
                const env: Record<string, string> = options.transport.env || {};
                return new StdioClientTransport({
                    command: options.transport.command,
                    args: options.transport.args,
                    env,
                });
            case "streamableHttp":
                return new StreamableHTTPClientTransport(new URL(options.transport.url), {
                    requestInit: {
                        headers: options.transport.requestHeaders,
                    }
                });
            case "sse":
                return new SSEClientTransport(new URL(options.transport.url));
            default:
                throw new Error(
                    `Unsupported transport type: ${(options.transport as any).type}`,
                );
        }
    }    
    
    /**
     * Returns comprehensive status information for this connection
     * Combines configuration options with current state data
     * 
     * @returns Detailed status object for monitoring and diagnostics
     */
    getStatus(): MCPServerStatus {
        return {
            ...this.options,
            errors: this.errors,
            prompts: this.prompts,
            resources: this.resources,
            tools: this.tools,
            status: this.status,
        };
    }    
    
    /**
     * Refreshes the available tools from the MCP server
     * Updates local tool registry with server-provided capabilities
     * 
     * @param signal - Optional abort signal for cancellation support
     */
    private async refreshTools(signal?: AbortSignal) {
        try {
            const { tools } = await this.client.listTools({}, { signal });
            this.tools = tools;
        } catch (e) {
            let errorMessage = `Error loading tools for MCP Server ${this.options.name}`;
            if (e instanceof Error) {
                errorMessage += `: ${e.message}`;
            }
            this.errors.push(errorMessage);
        }
    }

    /**
     * Refreshes the available resources from the MCP server
     * Updates local resource registry with server-provided capabilities
     * 
     * @param signal - Optional abort signal for cancellation support
     */
    private async refreshResources(signal?: AbortSignal) {
        try {
            const { resources } = await this.client.listResources({}, { signal });
            this.resources = resources;
        } catch (e) {
            let errorMessage = `Error loading resources for MCP Server ${this.options.name}`;
            if (e instanceof Error) {
                errorMessage += `: ${e.message}`;
            }
            this.errors.push(errorMessage);
        }
    }

    /**
     * Refreshes the available prompts from the MCP server
     * Updates local prompt registry with server-provided capabilities
     * 
     * @param signal - Optional abort signal for cancellation support
     */
    private async refreshPrompts(signal?: AbortSignal) {
        try {
            const { prompts } = await this.client.listPrompts({}, { signal });
            this.prompts = prompts;
        } catch (e) {
            let errorMessage = `Error loading prompts for MCP Server ${this.options.name}`;
            if (e instanceof Error) {
                errorMessage += `: ${e.message}`;
            }
            this.errors.push(errorMessage);
        }
    }    /**
     * Establishes a connection to the MCP server
     * Manages connection lifecycle and handles reconnection scenarios
     * 
     * @param forceRefresh - Whether to force reconnection even if already connected
     * @param externalSignal - Signal for external cancellation of connection attempt
     */
    async connectClient(forceRefresh: boolean, externalSignal: AbortSignal) {
        if (!forceRefresh) {
            // Already connected
            if (this.status === "connected") {
                return;
            }

            // Connection is already in progress; wait for it to complete
            if (this.connectionPromise) {
                await this.connectionPromise;
                return;
            }
        }

        this.status = "connecting";
        this.tools = [];
        this.prompts = [];
        this.resources = [];
        this.errors = [];

        this.abortController.abort();
        this.abortController = new AbortController();

        this.connectionPromise = Promise.race([
            // If aborted by a refresh or other, cancel and don't do anything
            new Promise((resolve) => {
                externalSignal.addEventListener("abort", () => {
                    resolve(undefined);
                });
            }),
            new Promise((resolve) => {
                this.abortController.signal.addEventListener("abort", () => {
                    resolve(undefined);
                });
            }),
            (async () => {
                const timeoutController = new AbortController();
                const connectionTimeout = setTimeout(
                    () => timeoutController.abort(),
                    this.options.timeout ?? DEFAULT_MCP_TIMEOUT,
                );

                try {
                    await Promise.race([
                        new Promise((_, reject) => {
                            timeoutController.signal.addEventListener("abort", () => {
                                reject(new Error("Connection timed out"));
                            });
                        }),
                        (async () => {
                            this.transport = this.constructTransport(this.options);
                            try {
                                await this.client.connect(this.transport);
                            } catch (error) {
                                GlobalChannel.getInstance().appendLog(error instanceof Error ? error.message : String(error));
                                // Allow the case where for whatever reason is already connected
                                if (error instanceof Error && error.message.startsWith("StdioClientTransport already started")) {
                                    await this.client.close();
                                    await this.client.connect(this.transport);
                                } else {
                                    throw error;
                                }
                            }

                            //  Roots => ListRootsResultSchema
                            this.client.setRequestHandler(ListRootsRequestSchema, async (request, extra) => {
                                // Get current workspace                                
                                const workspaceFolders = vscode.workspace.workspaceFolders || [];
                                // Convert workspace folder to MCP root directory format
                                const roots = workspaceFolders.map(folder => {
                                    return {
                                        uri: folder.uri.toString(), // Use VS Code URI format
                                        name: folder.name          // Workspace folder name
                                    };
                                });
                                return {
                                    roots: roots
                                };
                            });

                            //  Sampling => CreateMessageResultSchema
                            this.client.setRequestHandler(CreateMessageRequestSchema, async (request, extra) => {
                                const { messages, modelPreferences, systemPrompt, includeContext, temperature, maxTokens, stopSequences, metadata } = request.params;
                                const chatMessages = messages.flatMap(msg => {
                                    if (msg.content.type !== 'text') { return undefined; }
                                    return msg.role === 'user' 
                                        ? [vscode.LanguageModelChatMessage.User(msg.content.text)]
                                        : [vscode.LanguageModelChatMessage.Assistant(msg.content.text)];
                                }).filter((msg): msg is vscode.LanguageModelChatMessage => msg !== undefined);
                        
                                const LLMResponse = await LLMRequest(chatMessages);
                                return {
                                    model: LLMResponse.requestModel?.name,
                                    stopReason: LLMResponse.responseMsg ? 'endTurn' : 'Error',
                                    role: 'assistant',
                                    content: { type: 'text', text: LLMResponse.responseMsg }
                                };
                            });

                            // Register server notification handlers
                            this.client.setNotificationHandler(
                                ToolListChangedNotificationSchema,
                                async (notification) => {
                                    await this.refreshTools(timeoutController.signal);
                                }
                            );
                            
                            this.client.setNotificationHandler(
                                ResourceListChangedNotificationSchema,
                                async (notification) => {
                                    await this.refreshResources(timeoutController.signal);
                                }
                            );
                            
                            this.client.setNotificationHandler(
                                PromptListChangedNotificationSchema,
                                async (notification) => {
                                    await this.refreshPrompts(timeoutController.signal);
                                }
                            );

                            const capabilities = this.client.getServerCapabilities();
                            // Resources <—> Context Provider
                            if (capabilities?.resources) {
                                await this.refreshResources(timeoutController.signal);
                            }

                            // Tools <—> Tools
                            if (capabilities?.tools) {
                                await this.refreshTools(timeoutController.signal);
                            }

                            // Prompts <—> Slash commands
                            if (capabilities?.prompts) {
                                await this.refreshPrompts(timeoutController.signal);
                            }
                            this.status = "connected";
                        })(),
                    ]);
                } catch (error) {
                    // Otherwise it's a connection error
                    let errorMessage = `Failed to connect to MCP server ${this.options.name}`;
                    if (error instanceof Error) {
                        const msg = error.message.toLowerCase();
                        if (msg.includes("spawn") && msg.includes("enoent")) {
                            const command = msg.split(" ")[1];
                            errorMessage += `command "${command}" not found. To use this MCP server, install the ${command} CLI.`;
                        } else {
                            errorMessage += ": " + error.message;
                        }
                    }
                    this.status = "error";
                    this.errors.push(errorMessage);
                } finally {
                    this.connectionPromise = null;
                    clearTimeout(connectionTimeout);
                }
            })(),
        ]);

        await this.connectionPromise;
    }
}