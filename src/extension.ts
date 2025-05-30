/**
 * DevLinker MCP Host Extension
 * 
 * Model Context Protocol (MCP) host implementation for VS Code.
 * This module serves as the extension's entry point, managing initialization,
 * registration of components, and graceful cleanup on deactivation.
 * 
 * The extension provides seamless integration between Model Context Protocol
 * services and VS Code's language model capabilities, enabling advanced
 * AI-assisted development workflows.
 */
import * as vscode from 'vscode';
import { DevlinkerChatParticipant } from './chat';
import { GlobalChannel } from './channel';
import { MCPConnectorManager } from './mcp';
import { AutoFindMCPResourcesTool } from './mcp/resource';

/**
 * Extension Activation Handler
 * 
 * Initializes the DevLinker MCP Host environment when the extension is activated.
 * Performs critical setup tasks with progress notification for enhanced user experience.
 * 
 * Tasks include:
 * - Connection management initialization
 * - UI component setup
 * - Chat integration registration
 * - AI tool registration
 * 
 * @param context - The extension context provided by VS Code
 */
export async function activate(context: vscode.ExtensionContext) {

    // Show progress notification during initialization
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Initializing DevLinker MCP Host..."),
        cancellable: false    
    }, async (progress) => {
        // Clean up existing connections for fresh initialization
        await MCPConnectorManager.getInstance().removeAllConnections();
        // Initialize communication channel and UI components
        GlobalChannel.getInstance().updateConnectionCountBar(0);
        // Register AI-powered chat integration component
        DevlinkerChatParticipant.getInstance().registerChatParticipant(context);
        // Register enterprise resource discovery tool        
        context.subscriptions.push(vscode.lm.registerTool('devlinker-mcp_resources_finder', new AutoFindMCPResourcesTool()));
    });
}

/**
 * Extension Deactivation Handler
 * 
 * Performs graceful shutdown operations when the extension is deactivated.
 * Ensures proper resource cleanup and connection termination to prevent resource leaks.
 * 
 * Operations include:
 * - Terminating all active MCP connections
 * - Updating UI components to reflect disconnected state
 * - Comprehensive error handling with diagnostic logging
 */
export async function deactivate() {
    try {
        await MCPConnectorManager.getInstance().removeAllConnections();
        GlobalChannel.getInstance().updateConnectionCountBar(0);
    } catch (e) {
        GlobalChannel.getInstance().appendLog(vscode.l10n.t("Error on cleaning up linker. {0}", e instanceof Error ? e.message : String(e)));
    }
}