import * as vscode from 'vscode';
import { DevlinkerChatParticipant } from './chat';
import { GlobalChannel } from './channel';
import { MCPConnectorManager } from './mcp';
import { AutoFindMCPResourcesTool } from './mcp/resource';

export async function activate(context: vscode.ExtensionContext) {

    // Show progress notification during initialization
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Initializing DevLinker MCP Host..."),
        cancellable: false
    }, async (progress) => {
        // Remove all connections
        await MCPConnectorManager.getInstance().removeAllConnections();
        // Initialize channel and UI
        GlobalChannel.getInstance().updateConnectionCountBar(0);
        // Register chat participant
        DevlinkerChatParticipant.getInstance().registerChatParticipant(context);
        // Register resource query tool
        context.subscriptions.push(vscode.lm.registerTool('devlinker-mcp_resources_finder', new AutoFindMCPResourcesTool()));
    });
}
// 这个方法在扩展被停用时调用
export async function deactivate() {
    try {
        await MCPConnectorManager.getInstance().removeAllConnections();
        GlobalChannel.getInstance().updateConnectionCountBar(0);
    } catch (e) {
        GlobalChannel.getInstance().appendLog(vscode.l10n.t("Error on cleaning up linker. {0}", e instanceof Error ? e.message : String(e)));
    }
}