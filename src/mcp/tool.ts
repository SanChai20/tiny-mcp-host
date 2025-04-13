//  mcp 服务Tools概念处理

import * as vscode from 'vscode';
import { AdHocChatTool } from "@vscode/chat-extension-utils";
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolRequest, CallToolResultSchema, Progress } from '@modelcontextprotocol/sdk/types.js';
import { GlobalChannel } from '../channel';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

//  临时创建工具[MCP服务工具]
export class AdHocMCPTool implements AdHocChatTool<any> {

    //  工具描述名称格式等信息
    name: string;
    description: string;
    inputSchema?: object | undefined;
    //  MCP客户端
    _mcpInnerClient: Client;
    constructor(mcpOwnerClient: Client, toolInfo: { name: string; description: string; inputSchema: object | undefined; }) {
        this.name = toolInfo.name;
        this.description = toolInfo.description;
        this.inputSchema = toolInfo.inputSchema;
        this._mcpInnerClient = mcpOwnerClient;
    }
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
                timeout: 300000,// 5mins
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
                // MCP结果转换为LanguageModelToolResult
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

