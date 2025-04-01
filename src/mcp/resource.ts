//  mcp 服务Resources概念处理
import * as vscode from 'vscode';
import { MCPConnectorManager } from '.';
import { GlobalChannel } from '../channel';

export async function readExternalResourceByUri(resourceUri: string): Promise<string> {
    try {
        const connections = MCPConnectorManager.getInstance().getAvailableConnectionResourcesWithClient();
        let foundClient = null;
        // 在所有连接中查找匹配的提示名称
        for (const connection of connections) {
            const resource = connection.resources.find(p => p.uri === resourceUri);
            if (resource) {
                foundClient = connection.client;
                break;
            }
        }
        if (foundClient) {
            try {
                const { contents } = await foundClient.readResource({ uri: resourceUri });
                const results = await Promise.all(contents.map(async (resource) => {
                    const content = resource.text;
                    if (typeof content !== "string") {
                        GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error fetching resource: {0}', vscode.l10n.t('Resource content is not a string')));
                        return "";
                    }
                    return content;
                }));
                const finalResult = results.join('\n');
                if (finalResult !== "") {
                    return finalResult;
                }
            } catch (error) {
                GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error fetching resource: {0}', error instanceof Error ? error.message : String(error)));
            }
        }
    } catch (err) {
        GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error fetching resource: {0}', err instanceof Error ? err.message : String(err)));
    }
    return "Fetching resource failed.";
}

//  借助AI工具自动获得所需的MCP Resource
export interface IAutoFindMCPResourcesParameters {
    resourceUrl: string;
}

export class AutoFindMCPResourcesTool implements vscode.LanguageModelTool<IAutoFindMCPResourcesParameters> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IAutoFindMCPResourcesParameters>,
        _token: vscode.CancellationToken
    ) {
        const params = options.input;
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(await readExternalResourceByUri(params.resourceUrl))]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IAutoFindMCPResourcesParameters>,
        _token: vscode.CancellationToken
    ) {
        // 需要确认获取
		const confirmationMessages = {
			title: vscode.l10n.t('MCP Resource Fetching'),
			message: vscode.l10n.t('Do you confirm to fetch the mcp resource?'),
		};

        return {
            invocationMessage: vscode.l10n.t('Finding necessary MCP resources'),
            //confirmationMessages
        };
    }
}