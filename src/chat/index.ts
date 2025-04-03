import * as vscode from 'vscode';
import * as chatUtils from '@vscode/chat-extension-utils';
import { MCPConnectorManager } from '../mcp';
import { GlobalChannel } from '../channel';
import { MCPOptions, MCPPrompt } from '../mcp/types';
import { findActualExecutable } from 'spawn-rx';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AdHocMCPTool } from '../mcp/tool';
import { getMCPResourceInstruction, getSystemRole } from './instruction';
import { readExternalResourceByUri } from '../mcp/resource';

export class DevlinkerChatParticipant {

    private static instance: DevlinkerChatParticipant;
    constructor() {}

    public static getInstance(): DevlinkerChatParticipant {
        if (!DevlinkerChatParticipant.instance) {
            DevlinkerChatParticipant.instance = new DevlinkerChatParticipant();
        }
        return DevlinkerChatParticipant.instance;
    }

    private async connectToRemoteServer(stream: vscode.ChatResponseStream, url: string) {
        try 
        {
            if (url === undefined || url === "") {
                const response = vscode.l10n.t("Connect to remote websocket MCP server failed. {0}", vscode.l10n.t("Url is invalid."));
                stream.markdown(response);
                return;
            }
            // 创建连接选项
            const options: MCPOptions = {
                id: url,
                name: url,
                transport: {
                    type: 'websocket',
                    url
                },
                timeout: 10000 // 10秒超时
            };
            // 创建并连接
            const connection = MCPConnectorManager.getInstance().createConnection(options.id, options);
            // 刷新连接
            await MCPConnectorManager.getInstance().refreshConnection(options.id);
            const connStatus = connection.getStatus();
            if (connStatus.status === 'connected') {
                const response = vscode.l10n.t("Connected to remote MCP server. The connection id is {0}. If you'd like to disconnect from it, use this id with /disconnect command.", url);
                GlobalChannel.getInstance().appendLog(response);
                stream.markdown(response);
                // 更新连接计数栏
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                return;
            } else if (connStatus.status === 'error') {
                const errors = connStatus.errors.join('\n');
                const response = vscode.l10n.t("Connect to remote websocket MCP server failed. {0}", errors);
                stream.markdown(response);
                return;
            } else {
                const response = vscode.l10n.t("Connect to remote MCP server process timeout");
                stream.markdown(response);
                return;
            }

        } catch (e) {
            const response = vscode.l10n.t("Connect to remote websocket MCP server failed. {0}", e instanceof Error ? e.message : String(e));
            stream.markdown(response);
            return;
        }
    }

    private async connectToLocalServer(stream: vscode.ChatResponseStream, execCmd: string, execArgs: string[] = []) : Promise<void> {
        if (!execCmd || execCmd.trim() === '') {
            stream.markdown(vscode.l10n.t("Invalid command. Command cannot be empty."));
            return;
        }
        
        try {
            // 生成一个安全的唯一连接ID
            const safeExecCmd = execCmd.replace(/[^\w-]/g, '_');
            const safeExecArgs = execArgs.map(arg => arg.replace(/[^\w-]/g, '_'));
            const connectionId = `MCP_Connection_${safeExecCmd}_${safeExecArgs.join('_')}`;
            
            // 检查连接是否已存在
            if (MCPConnectorManager.getInstance().isConnected(connectionId)) {
                stream.markdown(vscode.l10n.t("The server process is already connected with ID: {0}", connectionId));
                return;
            }
            
            const connecting = vscode.l10n.t("Attempting to connect to local MCP server process: {0}", `${execCmd} ${execArgs.join(' ')}`);
            stream.progress(connecting);
            GlobalChannel.getInstance().appendLog(connecting);
            
            // 确定执行命令
            const { cmd: pCmd, args: pArgs } = findActualExecutable(execCmd, execArgs);
            
            // 验证命令有效性
            if (!pCmd) {
                const response = vscode.l10n.t("Invalid executable. Could not find: {0}", execCmd);
                stream.markdown(response);
                return;
            }
            
            // 设置环境变量
            const env = { ...getDefaultEnvironment() };
            
            // 使用配置或默认值的超时设置
            const timeoutMs = 10000; // 可以从配置中读取
            
            // 创建连接选项
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
            
            // 创建并连接
            //GlobalChannel.getInstance().appendLog(`Creating connection to: ${pCmd} ${pArgs.join(' ')}`);
            const connection = MCPConnectorManager.getInstance().createConnection(options.id, options);
            
            // 刷新连接
            //GlobalChannel.getInstance().appendLog(`Refreshing connection: ${connectionId}`);
            await MCPConnectorManager.getInstance().refreshConnection(options.id);
    
            const connStatus = connection.getStatus();
            
            if (connStatus.status === 'connected') {
                const response = vscode.l10n.t("Connected to local MCP server process. The connection id is {0}. If you'd like to disconnect from it, use this id with /disconnect command.", connectionId);
                GlobalChannel.getInstance().appendLog(response);
                stream.markdown(response);
                
                // 更新连接计数栏
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                return;
            } else if (connStatus.status === 'error') {
                const errors = connStatus.errors.join('\n');
                const response = vscode.l10n.t("Connect to local MCP server process failed. {0}", errors);
                GlobalChannel.getInstance().appendLog(`Connection error: ${errors}`);
                stream.markdown(response);
                
                // 尝试清理失败的连接
                await MCPConnectorManager.getInstance().removeConnection(connectionId);
                return;
            } else {
                const response = vscode.l10n.t("Connect to local MCP server process timeout after {0}ms", timeoutMs);
                GlobalChannel.getInstance().appendLog(`Connection timeout: ${connectionId}`);
                stream.markdown(response);
                
                // 尝试清理超时的连接
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

    private async refreshAllServers(stream: vscode.ChatResponseStream) : Promise<void> {
        try {
            await MCPConnectorManager.getInstance().relinkConnections();
            // 更新连接计数栏
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
                // 更新连接计数栏
                const connectionCount = MCPConnectorManager.getInstance().getAvailableConnectionsCount();
                GlobalChannel.getInstance().updateConnectionCountBar(connectionCount);
                const response = vscode.l10n.t("Disconnect success. The MCP server: {0} has been removed.", connectionID);
                stream.markdown(response);
                return;
            } else {
                //找不到连接
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
                // 判断 reference.value 是否为 Uri
                if (reference.value instanceof vscode.Uri) {
                    try {
                        // 使用 openTextDocument 打开文件
                        const doc = await vscode.workspace.openTextDocument(reference.value);
                        const fileContent = doc.getText();
                        const services = JSON.parse(fileContent);

                        const localServices: string[] = services.local || [];
                        const remoteServices: string[] = services.remote || [];

                        if (localServices.length === 0 && remoteServices.length === 0) {
                            stream.markdown(vscode.l10n.t("No valid mcp service found."));
                            continue;
                        }

                        for (const localCmd of localServices) {
                            const parsedResult = this.parseCommands(localCmd);
                            if (parsedResult === undefined) {
                                const response = vscode.l10n.t("Invalid command.");
                                stream.markdown(response);
                                continue;
                            }
                            await this.connectToLocalServer(stream, parsedResult.execCmd, parsedResult.execArgs);
                        }

                        for (const remoteCmd of remoteServices) {
                            await this.connectToRemoteServer(stream, remoteCmd);
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

    private parseCommands(prompt: string | undefined) : { execCmd: string; execArgs: string[] } | undefined {
        if (!prompt || prompt.trim() === '') {
            return undefined;
        }
        
        const result: { execCmd: string; execArgs: string[] } = { execCmd: '', execArgs: [] };
        
        // 处理引号内的参数，支持 "parameter with spaces"
        const regex = /[^\s"]+|"([^"]*)"/gi;
        let match;
        let tokens: string[] = [];
        
        while ((match = regex.exec(prompt)) !== null) {
            // 如果捕获了引号内的内容，使用它；否则使用完整匹配
            tokens.push(match[1] || match[0]);
        }
        
        if (tokens.length === 0) {
            return undefined;
        }
        
        result.execCmd = tokens[0];
        result.execArgs = tokens.slice(1);
        
        return result;
    }

    // 手动选择资源当作引用
    private async manuallySelectResource(): Promise<vscode.ChatPromptReference[]> {
        // 获取所有可用资源
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

        // 显示多选列表
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

    public registerChatParticipant(context: vscode.ExtensionContext) {
        const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
            //  组织引导
            let instructions = getSystemRole();
            //  处理本地工具
            let toolsLocal: any[] = [];
            //  内置命令
            switch (request.command) {
                case 'disconnectAll':
                    await this.disconnectToAllServers(stream);
                    return; 
                case 'connectRemote':
                    await this.connectToRemoteServer(stream, request.prompt);
                    return;
                case 'connectLocal':
                    // 使用正则表达式匹配路径和参数
                    const parsedResult = this.parseCommands(request.prompt);
                    if (parsedResult === undefined) {
                        const response = vscode.l10n.t("Invalid command.");
                        stream.markdown(response);
                        return;
                    }
                    await this.connectToLocalServer(stream, parsedResult.execCmd, parsedResult.execArgs);
                    return;
                case 'disconnect':
                    await this.disconnectToServer(stream, request.prompt);
                    return;
                case 'load':
                    await this.connectServicesFromFile(request, stream);
                    return;
                case 'refresh':
                    await this.refreshAllServers(stream);
                    return;
                case 'autoContext':
                    // 更新并委托资源获取工具来自动引用
                    const resourceConnections = MCPConnectorManager.getInstance().getAvailableConnectionResourcesWithId();
                    if (resourceConnections.length > 0) {
                        toolsLocal = vscode.lm.tools.filter(tool => tool.name === "devlinker-mcp_resources_finder");//目前只添加资源获取工具
                        instructions += getMCPResourceInstruction();
                        for (const resourceConnection of resourceConnections) {
                            for (const resource of resourceConnection.resources) {
                                instructions += `\n\n${JSON.stringify(resource)}\n`;
                            }
                        }
                    }
                    break;
            }
            stream.progress(vscode.l10n.t("Processing requests..."));

            //  处理MCP工具
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

            //  处理引用的资源
            let enhancedRequest = {...request};
            if (request.command !== 'autoContext') {
                //  用户手选资源引用
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
                        stream,
                        references: true,
                        responseText: true
                    },
                    tools: [...toolsLocal, ...toolsOnMCP],
                    extensionMode: vscode.ExtensionMode.Production
                },
                token);
            return await libResult.result;
        };

        // 创建聊天参与者
        const participant = vscode.chat.createChatParticipant('mcp.devlinker', handler);
        participant.iconPath = new vscode.ThemeIcon('link');
        participant.followupProvider =  {
            provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatFollowup[]> {
                let followupsResult: vscode.ChatFollowup[] = [];
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
                return followupsResult;
            }
        };
        // 聊天角色释放时处理
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
        // 注册聊天参与者
        context.subscriptions.push(participant);
    }
}