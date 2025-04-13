// MCP连接管理类 负责对外提供连接服务 与vscode聊天逻辑相接
import * as vscode from 'vscode';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
//import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { DEFAULT_MCP_TIMEOUT, MCPConnectionStatus, MCPOptions, MCPPrompt, MCPResource, MCPServerStatus, MCPTool } from "./types";
import { GlobalChannel } from "../channel";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { CreateMessageRequestSchema, ListRootsRequestSchema, ListRootsResultSchema, PromptListChangedNotificationSchema, ResourceListChangedNotificationSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { LLMRequest } from '../chat/utils';

export class MCPConnectorManager {

    private static instance: MCPConnectorManager;
    public onConnectionsRefreshed?: () => void;
    private connections: Map<string, MCPConnection> = new Map();
    private abortController: AbortController = new AbortController();

    private constructor() {}

    public static getInstance(): MCPConnectorManager {
        if (!MCPConnectorManager.instance) {
            MCPConnectorManager.instance = new MCPConnectorManager();
        }
        return MCPConnectorManager.instance;
    }

    createConnection(id: string, options: MCPOptions): MCPConnection {
        if (!this.connections.has(id)) {
            const connection = new MCPConnection(options);
            this.connections.set(id, connection);
            return connection;
        } else {
            return this.getConnection(id)!;
        }
    }

    getConnection(id: string) {
        return this.connections.get(id);
    }

    isConnected(id: string) {
        const connection = this.getConnection(id);
        if (connection !== undefined) {
            const status = connection.getStatus();
            return status.status === 'connected';
        }
        return false;
    }

    async removeConnection(id: string) : Promise<boolean> {
        const connection = this.getConnection(id);
        if (connection) {
            await connection.client.close();
        }

        return this.connections.delete(id);
    }

    /**
     * 断开所有MCP连接并清除连接缓存
     * @returns 返回成功断开的连接数量
     */
    async removeAllConnections(clear: boolean = true): Promise<void> {
        try {
            // 断开所有连接
            const closePromises = Array.from(this.connections.entries()).map(async ([id, connection]) => {
                try {
                    // 中止任何挂起的连接尝试
                    connection.abortController.abort();
                    // 关闭客户端连接
                    await connection.client.close();
                } catch (e) {
                    // 即使关闭失败也继续处理
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    GlobalChannel.getInstance().appendLog(vscode.l10n.t("Error closing connection {0}, {1}", id, errorMessage));
                }
            });

            // 等待所有关闭操作完成
            await Promise.all(closePromises);

            // 清空连接映射
            if (clear) {
                this.connections.clear();
            }

            // 通知刷新连接
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
                    // 1. 硬重置连接
                    await connection.hardReset();
    
                    // 2. 创建新的AbortController
                    connection.abortController = new AbortController();
    
                    // 3. 延迟确保资源释放
                    await new Promise(resolve => setTimeout(resolve, 500));
    
                    // 4. 重新建立连接
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

    getStatuses(): (MCPServerStatus & { client: Client })[] {
        return Array.from(this.connections.values()).map((connection) => ({
            ...connection.getStatus(),
            client: connection.client,
        }));
    }

    // 获取所有连接的工具
    getAllConnectionTools(): { id: string; tools: MCPTool[] }[] {
        return Array.from(this.connections.entries()).map(([id, connection]) => ({
            id: id,
            tools: connection.tools
        }));
    }

    // 获取已连接服务的工具
    getAvailableConnectionTools() : { client: Client; tools: MCPTool[] }[] {
        return Array.from(this.connections.values()).filter(connection => connection.status === "connected").map(connection => ({
            client: connection.client,
            tools: connection.tools
        }));
    }

    // 获取已连接服务的Resources
    getAvailableConnectionResourcesWithId(): { id: string; resources: MCPResource[] }[] {
        return Array.from(this.connections.entries()).filter(([id, connection]) => connection.status === "connected" && connection.resources.length > 0).map(([id, connection]) => ({
            id: id,
            resources: connection.resources
        }));
    }
    
    // 获取已连接服务的Resources
    getAvailableConnectionResourcesWithClient(): { client: Client; resources: MCPResource[] }[] {
        return Array.from(this.connections.values()).filter(connection => connection.status === "connected" && connection.resources.length > 0).map(connection => ({
            client: connection.client,
            resources: connection.resources
        }));
    }

    getAvailableConnectionsCount(): number {
        return Array.from(this.connections.values()).filter((connection) => connection.status === "connected").length;
    }

    findConnectionByToolName(toolName: string): { connection: MCPConnection; id: string } | undefined {
        for (const [id, connection] of this.connections.entries()) {
            if (connection.tools.some((tool) => tool.name === toolName)) {
                return { connection, id };
            }
        }
        return undefined;
        //return Array.from(this.connections.values()).find((connection) => connection.tools.some((tool) => tool.name === toolName));
    }

}

export class MCPConnection {

    public client: Client;
    private transport: Transport;

    private connectionPromise: Promise<unknown> | null = null;
    public abortController: AbortController;

    public status: MCPConnectionStatus = "not-connected";
    public errors: string[] = [];

    public prompts: MCPPrompt[] = [];
    public tools: MCPTool[] = [];
    public resources: MCPResource[] = [];

    constructor(private readonly options: MCPOptions) {
        this.transport = this.constructTransport(options);
        this.client = new Client(
            {
                name: "devlinker-client",
                version: "1.0.0",
            },
            {
                capabilities: {
                    sampling: {}, // 添加sampling能力
                    roots: {}, // 添加roots能力
                }
            },
        );

        this.abortController = new AbortController();
    }

    async hardReset() {
        // 完全重置客户端和传输层
        await this.client.close();
        this.transport = this.constructTransport(this.options);
        this.client = new Client(
            { name: "devlinker-client", version: "1.0.0" },
            { capabilities: {} }
        );
        this.status = "not-connected";
    }

    private constructTransport(options: MCPOptions): Transport {
        switch (options.transport.type) {
            case "stdio":
                const env: Record<string, string> = options.transport.env || {};
                // if (process.env.PATH !== undefined) {
                //     env.PATH = process.env.PATH;
                // }
                return new StdioClientTransport({
                    command: options.transport.command,
                    args: options.transport.args,
                    env,
                });
            // case "websocket":
            //     return new WebSocketClientTransport(new URL(options.transport.url));
            case "sse":
                return new SSEClientTransport(new URL(options.transport.url));
            default:
                throw new Error(
                    `Unsupported transport type: ${(options.transport as any).type}`,
                );
        }
    }

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
    }

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
                                // 获取当前工作区
                                const workspaceFolders = vscode.workspace.workspaceFolders || [];
                                // 将工作区文件夹转换为MCP根目录格式
                                const roots = workspaceFolders.map(folder => {
                                    return {
                                        uri: folder.uri.toString(), // 使用VS Code URI格式
                                        name: folder.name          // 工作区文件夹名称
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

                            // 注册服务器通知处理器
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