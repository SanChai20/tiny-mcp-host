/**
 * DevLinker Chat Integration Module
 * 
 * This module provides chat integration capabilities for the Model Context Protocol (MCP).
 * It handles various connection methods, resource management, and intelligent chat interactions
 * within the VS Code environment.
 * 
 * Features:
 * - Secure MCP server connections via multiple transport protocols (HTTP, SSE, stdio)
 * - Resource acquisition and management across connected MCP endpoints
 * - Intelligent follow-up suggestion generation with LLM assistance
 * - Comprehensive error handling and connection lifecycle management
 */

import * as vscode from 'vscode';
import * as chatUtils from '@vscode/chat-extension-utils';
import { MCPConnectorManager } from '../mcp';
import { GlobalChannel } from '../channel';
import { MCPOptions, MCPPrompt } from '../mcp/types';
import { findActualExecutable } from 'spawn-rx';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AdHocMCPTool } from '../mcp/tool';
import { getMCPResourceInstruction, getSuggestionPromptsAssistant, getSuggestionPromptsUser, getSystemRole } from './instruction';
import { readExternalResourceByUri } from '../mcp/resource';
import { LLMRequest } from './utils';
import { ResponseCollectorStream } from './streamwrapper';

/**
 * DevLinker Chat Participant
 * 
 * Implements a sophisticated chat participant for VS Code's chat interface.
 * Manages MCP connections, provides command processing, and enables advanced
 * interaction with MCP resources and tools.
 * 
 * Follows the Singleton design pattern to ensure consistent connection management
 * across the application lifecycle.
 */
export class DevlinkerChatParticipant {

    private static instance: DevlinkerChatParticipant;
    constructor() {}

    /**
     * Returns the singleton instance of DevlinkerChatParticipant
     * Creates a new instance if one doesn't already exist
     * 
     * @returns The globally accessible DevlinkerChatParticipant instance
     */
    public static getInstance(): DevlinkerChatParticipant {
        if (!DevlinkerChatParticipant.instance) {
            DevlinkerChatParticipant.instance = new DevlinkerChatParticipant();
        }
        return DevlinkerChatParticipant.instance;
    }

    /**
     * Establishes connection to an HTTP-based MCP server with streaming capabilities
     * Manages connection lifecycle and provides comprehensive error handling
     * 
     * @param stream - VS Code response stream for user feedback
     * @param connectionOptions - Configuration options including URL and headers
     */
    private async connectToStreamableHttp(stream: vscode.ChatResponseStream, connectionOptions: { url: string, requestHeaders?: { [key: string]: string } }) 
    {
        try 
        {
            if (connectionOptions.url === undefined || connectionOptions.url === "") {
                const response = vscode.l10n.t("Connect to MCP server failed. {0}", vscode.l10n.t("Url is invalid."));
                stream.markdown(response);
                return;
            }
            // Create connection options
            const options: MCPOptions = {
                id: connectionOptions.url,
                name: connectionOptions.url,
                transport: {
                    type: "streamableHttp",
                    url: connectionOptions.url,
                    requestHeaders: connectionOptions.requestHeaders
                },
                timeout: 10000 // 10-second timeout
            };            
            // Create and establish connection
            const connection = MCPConnectorManager.getInstance().createConnection(options.id, options);
            // Refresh connection
            await MCPConnectorManager.getInstance().refreshConnection(options.id);
            const connStatus = connection.getStatus();            
            if (connStatus.status === 'connected') {
                const response = vscode.l10n.t("Connected to remote MCP server. The connection id is {0}. If you'd like to disconnect from it, use this id with /disconnect command.", connectionOptions.url);
                GlobalChannel.getInstance().appendLog(response);
                stream.markdown(response);
                // Update connection count bar
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                return;
            } else if (connStatus.status === 'error') {
                const errors = connStatus.errors.join('\n');
                const response = vscode.l10n.t("Connect to MCP server failed. {0}", errors);
                stream.markdown(response);
                return;
            } else {
                const response = vscode.l10n.t("Connect to remote MCP server process timeout");
                stream.markdown(response);
                return;
            }

        } catch (e) {
            const response = vscode.l10n.t("Connect to MCP server failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }

    }

    /**
     * Establishes connection to an SSE (Server-Sent Events) MCP server
     * Manages connection lifecycle with real-time streaming capabilities
     * 
     * @param stream - VS Code response stream for user feedback
     * @param url - The URL endpoint for the SSE server
     */
    private async connectToSSE(stream: vscode.ChatResponseStream, url: string) {
        try 
        {
            if (url === undefined || url === "") {
                const response = vscode.l10n.t("Connect to remote SSE MCP server failed. {0}", vscode.l10n.t("Url is invalid."));
                stream.markdown(response);
                return;
            }            
            // Create connection options
            const options: MCPOptions = {
                id: url,
                name: url,
                transport: {
                    type: 'sse',
                    url
                },
                timeout: 10000 // 10-second timeout
            };            
            // Create and establish connection
            const connection = MCPConnectorManager.getInstance().createConnection(options.id, options);
            // Refresh connection
            await MCPConnectorManager.getInstance().refreshConnection(options.id);
            const connStatus = connection.getStatus();            
            if (connStatus.status === 'connected') {
                const response = vscode.l10n.t("Connected to remote MCP server. The connection id is {0}. If you'd like to disconnect from it, use this id with /disconnect command.", url);
                GlobalChannel.getInstance().appendLog(response);
                stream.markdown(response);
                // Update connection count bar
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                return;
            } else if (connStatus.status === 'error') {
                const errors = connStatus.errors.join('\n');
                const response = vscode.l10n.t("Connect to remote SSE MCP server failed. {0}", errors);
                stream.markdown(response);
                return;
            } else {
                const response = vscode.l10n.t("Connect to remote MCP server process timeout");
                stream.markdown(response);
                return;
            }

        } catch (e) {
            const response = vscode.l10n.t("Connect to remote SSE MCP server failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }
    }

    /**
     * Establishes connection to a local process-based MCP server via stdio
     * Enables secure local execution with environment isolation
     * 
     * @param stream - VS Code response stream for user feedback
     * @param execCmd - The executable command to run
     * @param execArgs - Command line arguments for the executable
     * @returns Promise that resolves when connection attempt completes
     */
    private async connectToStdio(stream: vscode.ChatResponseStream, execCmd: string, execArgs: string[] = []) : Promise<void> {
        if (!execCmd || execCmd.trim() === '') {
            stream.markdown(vscode.l10n.t("Invalid command. Command cannot be empty."));
            return;
        }
        
        try {            
            // Generate a secure unique connection ID
            const safeExecCmd = execCmd.replace(/[^\w-]/g, '_');
            const safeExecArgs = execArgs.map(arg => arg.replace(/[^\w-]/g, '_'));
            const connectionId = `MCP_Connection_${safeExecCmd}_${safeExecArgs.join('_')}`;
            
            // Check if connection already exists
            if (MCPConnectorManager.getInstance().isConnected(connectionId)) {
                stream.markdown(vscode.l10n.t("The server process is already connected with ID: {0}", connectionId));
                return;
            }
            
            const connecting = vscode.l10n.t("Attempting to connect to local MCP server process: {0}", `${execCmd} ${execArgs.join(' ')}`);
            stream.progress(connecting);
            GlobalChannel.getInstance().appendLog(connecting);
            // Determine execution command
            const { cmd: pCmd, args: pArgs } = findActualExecutable(execCmd, execArgs);
            
            // Validate command validity
            if (!pCmd) {
                const response = vscode.l10n.t("Invalid executable. Could not find: {0}", execCmd);
                stream.markdown(response);
                return;
            }
            // Set environment variables
            const env = { ...getDefaultEnvironment() };
            
            // Use timeout setting from configuration or default value
            const timeoutMs = 10000; // Can be read from configuration
            
            // Create connection options
            const options: MCPOptions = {
                id: connectionId,
                name: connectionId,
                transport: {
                    type: 'stdio',
                    command: pCmd,
                    args: pArgs,
                    env
                },
                timeout: timeoutMs
            };
            // Create and connect
            // GlobalChannel.getInstance().appendLog(`Creating connection to: ${pCmd} ${pArgs.join(' ')}`);
            const connection = MCPConnectorManager.getInstance().createConnection(options.id, options);
            
            // Refresh connection
            // GlobalChannel.getInstance().appendLog(`Refreshing connection: ${connectionId}`);
            await MCPConnectorManager.getInstance().refreshConnection(options.id);
    
            const connStatus = connection.getStatus();
            if (connStatus.status === 'connected') {
                const response = vscode.l10n.t("Connected to local MCP server process. The connection id is {0}. If you'd like to disconnect from it, use this id with /disconnect command.", connectionId);
                GlobalChannel.getInstance().appendLog(response);
                stream.markdown(response);
                
                // Update connection count bar
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                return;
            } else if (connStatus.status === 'error') {
                const errors = connStatus.errors.join('\n');
                const response = vscode.l10n.t("Connect to local MCP server process failed. {0}", errors);
                GlobalChannel.getInstance().appendLog(`Connection error: ${errors}`);
                stream.markdown(response);
                  // Attempt to clean up failed connection
                await MCPConnectorManager.getInstance().removeConnection(connectionId);
                return;
            } else {
                const response = vscode.l10n.t("Connect to local MCP server process timeout after {0}ms", timeoutMs);
                GlobalChannel.getInstance().appendLog(`Connection timeout: ${connectionId}`);
                stream.markdown(response);
                  // Attempt to clean up timed-out connection
                await MCPConnectorManager.getInstance().removeConnection(connectionId);
                return;
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            const response = vscode.l10n.t("Connect to local MCP server process failed. {0}", errorMessage);
            GlobalChannel.getInstance().appendLog(`Connection error: ${errorMessage}`);
            stream.markdown(response);
            return;
        }
    }

    /**
     * Disconnects and removes all active MCP server connections
     * Performs complete cleanup of connection resources
     * 
     * @param stream - VS Code response stream for user feedback
     * @returns Promise that resolves when disconnection completes
     */
    private async disconnectToAllServers(stream: vscode.ChatResponseStream) : Promise<void> {
        try {
            await MCPConnectorManager.getInstance().removeAllConnections();
            GlobalChannel.getInstance().updateConnectionCountBar(0);
            const response = vscode.l10n.t("All mcp servers have been removed successfully.");
            stream.markdown(response);
            return;
        } catch (e) {
            const response = vscode.l10n.t("Disconnect failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }
    }

    /**
     * Refreshes all MCP server connections
     * Re-establishes connections that may have timed out or disconnected
     * 
     * @param stream - VS Code response stream for user feedback
     * @returns Promise that resolves when refresh completes
     */
    private async refreshAllServers(stream: vscode.ChatResponseStream) : Promise<void> {
        try {
            await MCPConnectorManager.getInstance().relinkConnections();
            // Update connection count bar
            const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
            GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
            const response = vscode.l10n.t("All mcp connections have been refreshed successfully.");
            stream.markdown(response);
            return;
        } catch (e) {
            const response = vscode.l10n.t("Refresh failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }
    }

    /**
     * Disconnects from a specific MCP server by connection ID
     * Performs targeted resource cleanup for the specified connection
     * 
     * @param stream - VS Code response stream for user feedback
     * @param connectionID - Unique identifier for the connection to disconnect
     * @returns Promise that resolves when disconnection completes
     */
    private async disconnectToServer(stream: vscode.ChatResponseStream, connectionID: string) : Promise<void> {
        try {
            if (connectionID === undefined) {
                const response = vscode.l10n.t("Input params is invalid.");
                stream.markdown(response);
                return;
            }
            stream.progress(vscode.l10n.t("Try to disconnect to the MCP server"));
            const hasRemoved = await MCPConnectorManager.getInstance().removeConnection(connectionID);
            if (hasRemoved) {
                // Update connection count bar
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                const response = vscode.l10n.t("Disconnect success. The MCP server: {0} has been removed.", connectionID);
                stream.markdown(response);
                return;
            } else {
                // Connection not found
                const response = vscode.l10n.t("Disconnect failed. The MCP server: {0} not found.", connectionID);
                stream.markdown(response);
                return;
            }
        } catch (e) {
            const response = vscode.l10n.t("Disconnect failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }
    }

    /**
     * Connects to multiple MCP services defined in a configuration file
     * Supports batch connection establishment for enterprise deployment scenarios
     * 
     * @param request - VS Code chat request containing file references
     * @param stream - VS Code response stream for user feedback
     */
    private async connectServicesFromFile(request: vscode.ChatRequest, stream: vscode.ChatResponseStream) {
        try {
            if (!request.references || request.references.length === 0) {
                stream.markdown(vscode.l10n.t("No reference file found."));
                return;
            }
            const hasUriReference = request.references.some(ref => ref.value instanceof vscode.Uri);
            if (!hasUriReference) {
                stream.markdown(vscode.l10n.t("No valid reference file found. Please drag files here or check files you attached again."));
                return;
            }
            for (const reference of request.references) {
                // Check if reference.value is a Uri
                if (reference.value instanceof vscode.Uri) {
                    try {
                        // Use openTextDocument to open the file
                        const doc = await vscode.workspace.openTextDocument(reference.value);
                        const fileContent = doc.getText();
                        const services = JSON.parse(fileContent);
                        
                        const stdioServices: string[] = services.Stdio || [];
                        const sseServices: string[] = services.SSE || [];
                        const shttpServices: { url: string, requestHeaders?: { [key: string]: string } }[] = services.StreamableHttp || [];

                        if (stdioServices.length === 0 && sseServices.length === 0 && shttpServices.length === 0) {
                            stream.markdown(vscode.l10n.t("No valid mcp service found."));
                            continue;
                        }

                        for (const stdioService of stdioServices) {
                            const parsedResult = this.parseCommands(stdioService);
                            if (parsedResult === undefined) {
                                const response = vscode.l10n.t("Invalid command.");
                                stream.markdown(response);
                                continue;
                            }
                            await this.connectToStdio(stream, parsedResult.execCmd, parsedResult.execArgs);
                        }

                        for (const sseService of sseServices) {
                            await this.connectToSSE(stream, sseService);
                        }

                        for (const shttpService of shttpServices) {
                            await this.connectToStreamableHttp(stream, shttpService);
                        }
                        
                    } catch (err) {
                        stream.markdown(err instanceof Error ? err.message : String(err));
                    }
                }
            }
        } catch (err) {
            stream.markdown(err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * Parses command strings into executable command and arguments
     * Handles quoted parameters and proper tokenization
     * 
     * @param prompt - The command string to parse
     * @returns Parsed command and arguments or undefined if invalid
     */
    private parseCommands(prompt: string | undefined) : { execCmd: string; execArgs: string[] } | undefined {
        if (!prompt || prompt.trim() === '') {
            return undefined;
        }
        
        const result: { execCmd: string; execArgs: string[] } = { execCmd: '', execArgs: [] };
        
        // Process parameters in quotes, supporting "parameter with spaces"
        const regex = /[^\s"]+|"([^"]*)"/gi;
        let match;
        let tokens: string[] = [];
        
        while ((match = regex.exec(prompt)) !== null) {
            // If content within quotes is captured, use it; otherwise, use the full match
            tokens.push(match[1] || match[0]);
        }
        
        if (tokens.length === 0) {
            return undefined;
        }
        
        result.execCmd = tokens[0];
        result.execArgs = tokens.slice(1);
        
        return result;
    }

    /**
     * Enables interactive selection of MCP resources for reference in chat
     * Provides rich UI for resource discovery and selection
     * 
     * @returns Promise resolving to selected resource references
     */
    private async manuallySelectResource(): Promise<vscode.ChatPromptReference[]> {
        // Get all available resources
        const allResources = MCPConnectorManager.getInstance()
        .getAvailableConnectionResourcesWithClient()
        .flatMap(conn => 
            conn.resources.map(r => ({
                id: r.uri,
                label: r.name,
                detail: r.description
            }))
        );

        if (allResources.length === 0) {
            return [];
        }

        // Display a multi-select list
        const selection = await vscode.window.showQuickPick(allResources, {
            placeHolder: vscode.l10n.t('Select resources to reference (Multi-select)'),
            canPickMany: true
        });

        if (selection) {
            return await Promise.all(selection.map(async (element) => {
                return {
                    id: element.id,
                    modelDescription: element.detail,
                    value: await readExternalResourceByUri(element.id)
                };
            }));
        }   
        return [];
    }

    /**
     * Registers this chat participant with VS Code's chat interface
     * Sets up command handling, resource management, and follow-up suggestions
     * 
     * @param context - VS Code extension context for registration
     */
    public registerChatParticipant(context: vscode.ExtensionContext) {
        const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
            const collectorStream = new ResponseCollectorStream(stream);
            
            //  Organize guidance
            let instructions = getSystemRole();
            //  Handle local tools
            let toolsLocal: any[] = [];
            //  Built-in commands
            switch (request.command) {
                case 'disconnectAll':
                    await this.disconnectToAllServers(collectorStream);
                    return; 
                case 'connectSSE':
                    await this.connectToSSE(collectorStream, request.prompt);
                    return;
                case 'connectSHttp':
                    await this.connectToStreamableHttp(collectorStream, { url: request.prompt });
                    return;
                case 'connectStdio':
                    // Use regex to match path and arguments
                    const parsedResult = this.parseCommands(request.prompt);
                    if (parsedResult === undefined) {
                        const response = vscode.l10n.t("Invalid command.");
                        collectorStream.markdown(response);
                        return;
                    }
                    await this.connectToStdio(collectorStream, parsedResult.execCmd, parsedResult.execArgs);
                    return;
                case 'disconnect':
                    await this.disconnectToServer(collectorStream, request.prompt);
                    return;
                case 'load':
                    await this.connectServicesFromFile(request, collectorStream);
                    return;
                case 'refresh':
                    await this.refreshAllServers(collectorStream);
                    return;
                case 'autoContext':
                    // Update and delegate to resource fetching tool for automatic referencing
                    const resourceConnections = MCPConnectorManager.getInstance().getAvailableConnectionResourcesWithId();
                    if (resourceConnections.length > 0) {
                        toolsLocal = vscode.lm.tools.filter(tool => tool.name === "devlinker-mcp_resources_finder");//Currently only adding resource acquisition tool
                        instructions += getMCPResourceInstruction();
                        for (const resourceConnection of resourceConnections) {
                            for (const resource of resourceConnection.resources) {
                                instructions += `\n\n${JSON.stringify(resource)}\n`;
                            }
                        }
                    }
                    break;
            }
            collectorStream.progress(vscode.l10n.t("Processing requests..."));

            //  Handle MCP tools
            let toolsOnMCP: AdHocMCPTool[] = [];
            const availableMCPTools = MCPConnectorManager.getInstance().getAvailableConnectionTools();
            availableMCPTools.forEach(availableConnection => {
                availableConnection.tools.forEach(tool => {
                    toolsOnMCP.push(new AdHocMCPTool(availableConnection.client, {
                        name: tool.name,
                        description: tool.description || 'Description not provided',
                        inputSchema: tool.inputSchema
                    }));
                });
            });

            //  Handle referenced resources
            let enhancedRequest = {...request};
            if (request.command !== 'autoContext') {
                //  User manually selected resource references
                enhancedRequest = {
                    ...request, 
                    references: [ 
                    ...request.references ?? [], 
                    ...await this.manuallySelectResource() 
                ]};
            }
            
            const libResult = chatUtils.sendChatParticipantRequest(
                enhancedRequest,
                chatContext,
                {
                    prompt: instructions,
                    responseStreamOptions: {
                        stream: collectorStream,
                        references: true,
                        responseText: true
                    },
                    tools: [...toolsLocal, ...toolsOnMCP],
                    extensionMode: vscode.ExtensionMode.Production
                },
                token);
            const responseResult = await libResult.result;
            if (responseResult) {
                return {
                    ...responseResult,
                    metadata: {
                        ...(responseResult.metadata || {}),
                        responseContent: collectorStream.responseContent
                    }
                };
            }
            return {
                metadata: {
                    responseContent: collectorStream.responseContent
                }
            };
        };

        // Create chat participant
        const participant = vscode.chat.createChatParticipant('mcp.devlinker', handler);
        participant.iconPath = new vscode.ThemeIcon('link');
        participant.followupProvider =  {
            provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatFollowup[]> {
                //let followupsResult: vscode.ChatFollowup[] = [];
                const generateFollowups = async (): Promise<vscode.ChatFollowup[]> => {
                    let followupsResult: vscode.ChatFollowup[] = [];
                    //  MCP connector management
                    const connectionsCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                    if (connectionsCount > 0) {
                        followupsResult.push({
                            prompt: vscode.l10n.t('Refresh all MCP Connections'),
                            label: vscode.l10n.t('Refresh all MCP Connections'),
                            command: 'refresh',
                            
                        });
                        followupsResult.push({
                            prompt: vscode.l10n.t('Disconnect all servers'),
                            label: vscode.l10n.t('Disconnect all servers'),
                            command: 'disconnectAll'
                        });
                    } else {
                        followupsResult.push({
                            prompt: vscode.l10n.t('Load & Connect MCP Services'),
                            label: vscode.l10n.t('Load & Connect MCP Services'),
                            command: 'load'
                        });
                    }
                    // Then wait for asynchronous addition of suggested followups to complete
                    try {
                        const responseContent = result.metadata?.responseContent as string;
                        if (!responseContent) {
                            return followupsResult;
                        }

                        //  Whether it's appropriate to add followup suggestions, generate if possible
                        const evaluationPrompt = [
                            vscode.LanguageModelChatMessage.Assistant(getSuggestionPromptsAssistant(responseContent)),
                            vscode.LanguageModelChatMessage.User(getSuggestionPromptsUser())
                        ];
                        //  Call LLM request for evaluation
                        const requestResult = await LLMRequest(evaluationPrompt);   // No need to handle tool invocation issues
                        if (!requestResult.responseMsg?.content) {
                            return followupsResult;
                        }

                        try {
                            let textContent = ""
                            let suggestions: Array<{ label: string, prompt: string }> = [];
                            for (const part of requestResult.responseMsg.content) {
                                if (part instanceof vscode.LanguageModelTextPart) {
                                    textContent += part.value;
                                }
                            }

                            try {
                                // Attempt to parse the entire response as a JSON array or object
                                const parsedContent = JSON.parse(textContent);
                                if (Array.isArray(parsedContent)) {
                                    // If it's an array, use directly
                                    suggestions = parsedContent.filter(item => 
                                        typeof item === 'object' && item !== null && 
                                        typeof item.label === 'string' && 
                                        typeof item.prompt === 'string'
                                    );
                                } else if (typeof parsedContent === 'object' && parsedContent !== null && 
                                          typeof parsedContent.label === 'string' && 
                                          typeof parsedContent.prompt === 'string') {
                                    // If it's a single object, put it in an array
                                    suggestions = [parsedContent];
                                }
                            } catch (jsonError) {
                                // JSON parsing failed, try to extract using regular expressions
                                const regex = /\{\s*"?label"?\s*:\s*"([^"]*)"?\s*,\s*"?prompt"?\s*:\s*"([^"]*)"\s*\}/g;
                                let match;
                                while ((match = regex.exec(textContent)) !== null) {
                                    suggestions.push({
                                        label: match[1],
                                        prompt: match[2]
                                    });
                                }
                            }
                            
                            // Add extracted suggestions to followups
                            for (const suggestion of suggestions.slice(0, 3)) { // Maximum of 3 items
                                followupsResult.push({
                                    label: suggestion.label,
                                    prompt: suggestion.prompt
                                });
                            }
                        } catch (error) {
                            GlobalChannel.getInstance().appendLog(
                                vscode.l10n.t('Error generating followup suggestions: {0}', 
                                error instanceof Error ? error.message : String(error))
                            );
                        }

                    } catch (error) {
                        GlobalChannel.getInstance().appendLog(
                            vscode.l10n.t('Error generating followup suggestions: {0}', 
                            error instanceof Error ? error.message : String(error))
                        );
                    }
                    return followupsResult;
                };
                return generateFollowups();
            }
        };
        // Handle chat role disposal
        participant.dispose = async () => {
            try {
                // Clear the followup provider
                participant.followupProvider = undefined;
                await MCPConnectorManager.getInstance().removeAllConnections();
                GlobalChannel.getInstance().updateConnectionCountBar(0);
            } catch (e) {
                GlobalChannel.getInstance().appendLog(vscode.l10n.t("Error on cleaning up linker. {0}", e instanceof Error ? e.message : String(e)));
            }
        };
        // Register chat participant
        context.subscriptions.push(participant);
    }
}