/**
 * Model Context Protocol Resource Management
 * 
 * Implementation for accessing and managing MCP server resources.
 * This module provides secure and reliable access to external resources through
 * the Model Context Protocol, enabling seamless integration with VS Code language models.
 */
import * as vscode from 'vscode';
import { MCPConnectorManager } from '.';
import { GlobalChannel } from '../channel';

/**
 * Retrieves content from an external MCP resource
 * 
 * Performs secure resource resolution across all available MCP connections,
 * with comprehensive error handling and content validation.
 * 
 * @param resourceUri - The unique URI identifier for the target resource
 * @returns The resource content as a string, or an error message if retrieval fails
 */
export async function readExternalResourceByUri(resourceUri: string): Promise<string> {
    try {        
        const connections = MCPConnectorManager.getInstance().getAvailableConnectionResourcesWithClient();
        let foundClient = null;
        // Search for matching resource URI across all available connections
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

/**
 * Interface for resource lookup parameters
 * 
 * Defines the required parameters for locating and retrieving
 * Model Context Protocol resources via URI identifiers.
 */
export interface IAutoFindMCPResourcesParameters {
    resourceUrl: string;
}

/**
 * AI-powered MCP Resource Discovery Tool
 * 
 * Implements VS Code Language Model Tool interface to dynamically locate
 * and retrieve resources from connected MCP servers. Provides
 * security with optional confirmation workflows.
 */
export class AutoFindMCPResourcesTool implements vscode.LanguageModelTool<IAutoFindMCPResourcesParameters> {    
    /**
     * Invokes the resource discovery and retrieval process
     * 
     * Executes the resource retrieval operation with the provided parameters,
     * returning the content in a format compatible with language model responses.
     * 
     * @param options - Tool invocation options containing input parameters
     * @param _token - Cancellation token for aborting the operation
     * @returns Language model tool result containing the resource content
     */
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IAutoFindMCPResourcesParameters>,
        _token: vscode.CancellationToken
    ) {
        const params = options.input;
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(await readExternalResourceByUri(params.resourceUrl))]);
    }    
    /**
     * Prepares for resource discovery invocation
     * 
     * Configures the user experience before resource retrieval begins,
     * including customizable confirmation dialogs for enhanced security.
     * 
     * @param options - Preparation options containing input parameters
     * @param _token - Cancellation token for aborting the operation
     * @returns Configuration for the invocation UI and security controls
     */
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IAutoFindMCPResourcesParameters>,
        _token: vscode.CancellationToken
    ) {
        // Confirmation required for acquisition
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