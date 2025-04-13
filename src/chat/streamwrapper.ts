import * as vscode from 'vscode';
/**
 * 响应流包装类，用于在传递内容到原始流的同时收集响应内容
 */
export class ResponseCollectorStream implements vscode.ChatResponseStream {
    private _responseContent: string = '';
    private _originalStream: vscode.ChatResponseStream;

    /**
     * 构造函数
     * @param originalStream 原始响应流
     */
    constructor(originalStream: vscode.ChatResponseStream) {
        this._originalStream = originalStream;
    }

    /**
     * 获取收集到的响应内容
     */
    public get responseContent(): string {
        return this._responseContent;
    }

    markdown(value: string | vscode.MarkdownString): void {
        // 收集响应内容
        this._responseContent += typeof value === 'string' ? value : value.value;
        // 传递给原始流
        this._originalStream.markdown(value);
    }

    progress(value: string): void {
        this._originalStream.progress(value);
    }

    filetree(value: vscode.ChatResponseFileTree[], baseUri: vscode.Uri): void {
        this._originalStream.filetree(value, baseUri);
    }

    reference(value: vscode.Uri | vscode.Location, iconPath?: vscode.IconPath): void {
        this._originalStream.reference(value, iconPath);
    }

    button(command: vscode.Command): void {
        this._originalStream.button(command);
    }

    anchor(value: vscode.Uri | vscode.Location, title?: string): void {
        this._originalStream.anchor(value, title);
    }

    push(part: vscode.ChatResponsePart): void {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
            const mdValue = part.value;
            this._responseContent += typeof mdValue === 'string' ? mdValue : mdValue.value;
        }
        this._originalStream.push(part);
    }
}