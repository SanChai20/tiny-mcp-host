/**
 * Model Context Protocol Tool Integration
 * 
 * Implementation for integrating MCP server tools with VS Code.
 * This module provides a robust framework for dynamically exposing Model Context Protocol
 * capabilities as AI-powered tools within the VS Code language model interface.
 */

import * as vscode from 'vscode';
import { AdHocChatTool } from "@vscode/chat-extension-utils";
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolRequest, CallToolResultSchema, Progress } from '@modelcontextprotocol/sdk/types.js';
import { GlobalChannel } from '../channel';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

/**
 * Dynamic MCP Tool Adapter
 * 
 * Provides seamless integration between Model Context Protocol tools and VS Code language models.
 * This enterprise-class adapter transforms MCP service tools into VS Code-compatible tools
 * that can be invoked within AI-assisted workflows.
 */
export class AdHocMCPTool implements AdHocChatTool<any> {    
    /** Tool identifier used for registration and invocation */
    name: string;
    /** Descriptive information about the tool's functionality */
    description: string;
    /** JSON schema defining the expected input parameters */
    inputSchema?: object | undefined;
    /** Client instance for communicating with the MCP server */
    _mcpInnerClient: Client;
    /**
     * Creates a new MCP tool adapter
     * 
     * @param mcpOwnerClient - Client instance for the MCP server hosting this tool
     * @param toolInfo - Metadata describing the tool's capabilities and interface
     */
    constructor(mcpOwnerClient: Client, toolInfo: { name: string; description: string; inputSchema: object | undefined; }) {
        this.name = toolInfo.name;
        this.description = toolInfo.description;
        this.inputSchema = toolInfo.inputSchema;
        this._mcpInnerClient = mcpOwnerClient;
    }
    /**
     * Invokes the MCP tool with the provided input parameters
     * 
     * Handles the complete lifecycle of a tool invocation, including:
     * - Input validation
     * - Secure transmission to MCP server
     * - Progress tracking
     * - Error handling
     * - Result transformation
     * 
     * @param options - Tool invocation options containing input parameters
     * @returns Formatted tool execution results or error information
     */
    async invoke(options: vscode.LanguageModelToolInvocationOptions<any>) : Promise<vscode.LanguageModelToolResult> {
        try {
            if (options.input === undefined) {
                return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Tool ${this.name} inputs unknown.`)]);
            }
            GlobalChannel.getInstance().appendLog(vscode.l10n.t("Invoke Tool {0}, Parameters: {1}", this.name, JSON.stringify(options.input)));

            const payload: CallToolRequest["params"] = {
                name: this.name,
                arguments: options.input
            };            
            const requestOptions : RequestOptions = {
                timeout: 300000,// 5 minutes - extended timeout for complex operations
                onprogress: (progress: Progress) => { 
                    GlobalChannel.getInstance().appendLog(vscode.l10n.t("Invoke Tool {0}, Progress: {1}", this.name, typeof progress === 'object' ? JSON.stringify(progress): String(progress)));
                } 
            };
            const callingResult = await this._mcpInnerClient.callTool(payload, CallToolResultSchema, requestOptions);
            const parsedCallingResult = CallToolResultSchema.parse(callingResult);

            if (parsedCallingResult.isError) {
                if (parsedCallingResult.content.every(c => c.type === 'text')) {
                    const errorMessageFromContent = parsedCallingResult.content.find(c => c.type === 'text')?.text;
                    if (errorMessageFromContent) {
                        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(errorMessageFromContent)]);
                    }
                }
            } else {                
                // Transform MCP result content to VS Code language model format
                let content: (vscode.LanguageModelTextPart | vscode.LanguageModelPromptTsxPart)[] = [];
                if (Array.isArray(callingResult.content)) {
                    for (const item of callingResult.content) {
                        if (item.type === 'text' && typeof item.text === 'string') {
                            content.push(new vscode.LanguageModelTextPart(item.text));
                        }
                    }
                }
                return new vscode.LanguageModelToolResult(content);
            }
        } catch (err) {
            const response = `Tool ${this.name} invocation failed. ${err instanceof Error ? err.message : String(err)}`;
            GlobalChannel.getInstance().appendLog(response);
            return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(response)]);
        }
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`An error occurred while calling the tool ${this.name}. Please try again.`)]);
    }
}

