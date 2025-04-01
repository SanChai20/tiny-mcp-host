//  AILinker界面交互渠道

import * as vscode from 'vscode';

export class GlobalChannel {

    private static instance: GlobalChannel;
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel("Dev Linker");
        this.connectionCountBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this.connectionCountBar.tooltip = vscode.l10n.t("Displays the number of connected MCP services, and clicking will navigate to the output logs.");
        this.connectionCountBar.command = "ailinker.showOutput";
        this.updateConnectionCountBar(0);

        // 注册命令
        vscode.commands.registerCommand("ailinker.showOutput", () => {
            this.outputChannel.show();
        });
    }

    public static getInstance(): GlobalChannel {
        if (!GlobalChannel.instance) {
            GlobalChannel.instance = new GlobalChannel();
        }
        return GlobalChannel.instance;
    }
    // 输出频道
    private outputChannel: vscode.OutputChannel;
    // 连接数状态栏
    private connectionCountBar: vscode.StatusBarItem;

    // 更新连接数状态栏
    public updateConnectionCountBar(mcpServerCount: number) {
        this.connectionCountBar.text = vscode.l10n.t("{0} MCP Servers: {1}", `$(server)`, mcpServerCount);
        if (mcpServerCount >= 1) {
            this.connectionCountBar.backgroundColor = new vscode.ThemeColor('statusBarItem.successBackground');
        } else {
            this.connectionCountBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        this.connectionCountBar.show();
    }

    // 输出日志
    public appendLog(message: string) {
        const now = new Date();
        const offset = 8 * 60 * 60 * 1000; // 北京时间是 UTC+8，偏移量为 8 小时
        const beijingTime = new Date(now.getTime() + offset).toISOString().replace('T', ' ').replace('Z', '');
        this.outputChannel.appendLine(`[${beijingTime}] ${message}`);
    }
}