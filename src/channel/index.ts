/**
 * AILinker UI Interaction Channel
 * 
 * This module provides a centralized communication channel for displaying 
 * UI elements and logging information within the VS Code environment.
 * It manages output channels and status bar indicators to show MCP service connections.
 */

import * as vscode from 'vscode';

/**
 * Global communication channel for managing UI interactions
 * 
 * Implements the Singleton pattern to ensure a single instance manages
 * all output logging and status bar information throughout the extension.
 */
export class GlobalChannel {

    private static instance: GlobalChannel;
    /**
     * Private constructor to enforce Singleton pattern
     * Initializes output channel and status bar components
     */
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel("Dev Linker");
        this.connectionCountBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this.connectionCountBar.tooltip = vscode.l10n.t("Displays the number of connected MCP services, and clicking will navigate to the output logs.");
        this.connectionCountBar.command = "ailinker.showOutput";
        this.updateConnectionCountBar(0);        
        // Register command
        vscode.commands.registerCommand("ailinker.showOutput", () => {
            this.outputChannel.show();
        });
    }

    /**
     * Returns the singleton instance of GlobalChannel
     * Creates a new instance if one doesn't already exist
     * 
     * @returns The global channel instance
     */
    public static getInstance(): GlobalChannel {
        if (!GlobalChannel.instance) {
            GlobalChannel.instance = new GlobalChannel();
        }
        return GlobalChannel.instance;    
    }

    /** Output channel for extension logging */
    private outputChannel: vscode.OutputChannel;
    /** Status bar item displaying MCP server connection count */
    private connectionCountBar: vscode.StatusBarItem;

    /**
     * Updates the status bar with current MCP server connection count
     * Changes background color based on connection status
     * 
     * @param mcpServerCount - Number of active MCP server connections
     */
    public updateConnectionCountBar(mcpServerCount: number) {
        this.connectionCountBar.text = vscode.l10n.t("{0} MCP Servers: {1}", `$(server)`, mcpServerCount);
        if (mcpServerCount >= 1) {
            this.connectionCountBar.backgroundColor = new vscode.ThemeColor('statusBarItem.successBackground');
        } else {
            this.connectionCountBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }        
        this.connectionCountBar.show();
    }

    /**
     * Appends a timestamped log message to the output channel
     * Uses Beijing time (UTC+8) for timestamps
     * 
     * @param message - The log message to append
     */
    public appendLog(message: string) {
        const now = new Date();
        const offset = 8 * 60 * 60 * 1000; // Beijing time is UTC+8, offset is 8 hours
        const beijingTime = new Date(now.getTime() + offset).toISOString().replace('T', ' ').replace('Z', '');
        this.outputChannel.appendLine(`[${beijingTime}] ${message}`);
    }
}