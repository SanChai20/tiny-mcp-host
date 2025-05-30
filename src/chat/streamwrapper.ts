/**
 * @fileoverview Chat Response Stream Management Module
 * 
 * This module provides robust functionality for intercepting, collecting,
 * and forwarding VS Code chat response streams. It enables comprehensive response tracking
 * while maintaining full compatibility with VS Code's ChatResponseStream interface.
 * 
 * @module chat/streamwrapper
 * @license MIT
 */

import * as vscode from 'vscode';

/**
 * ResponseCollectorStream: Enterprise-class Chat Response Interceptor
 * 
 * A high-performance stream wrapper that transparently intercepts and collects
 * chat response data while passing all information to the original stream recipient.
 * This implementation ensures no data loss during stream proxying operations.
 * 
 * Implements the complete VS Code ChatResponseStream interface for maximum compatibility
 * with all extension host and language service provider interactions.
 */
export class ResponseCollectorStream implements vscode.ChatResponseStream {    
    /** Repository for accumulated response content */
    private _responseContent: string = '';
    /** Reference to the original destination stream for delegation */
    private _originalStream: vscode.ChatResponseStream;

    /**
     * Initializes a new ResponseCollectorStream instance
     * 
     * @param originalStream - The destination stream to which all operations will be delegated
     *                         after content collection
     */
    constructor(originalStream: vscode.ChatResponseStream) {
        this._originalStream = originalStream;
    }

    /**
     * Retrieves the complete accumulated response content
     * 
     * @returns The consolidated response content collected during stream processing
     */
    public get responseContent(): string {
        return this._responseContent;
    }    

    /**
     * Processes markdown content in the response stream
     * 
     * Intercepts markdown content for collection, then forwards to the original stream.
     * Handles both string and MarkdownString formats with appropriate type conversion.
     * 
     * @param value - Markdown content to process, either as string or MarkdownString
     */
    markdown(value: string | vscode.MarkdownString): void {
        // Collect response content
        this._responseContent += typeof value === 'string' ? value : value.value;
        // Pass to original stream
        this._originalStream.markdown(value);
    }

    /**
     * Forwards progress information to the original stream
     * 
     * @param value - Progress message to display during processing
     */
    progress(value: string): void {
        this._originalStream.progress(value);
    }

    /**
     * Forwards file tree visualization data to the original stream
     * 
     * @param value - Array of file tree elements to display
     * @param baseUri - Base URI for resolving relative paths in the file tree
     */
    filetree(value: vscode.ChatResponseFileTree[], baseUri: vscode.Uri): void {
        this._originalStream.filetree(value, baseUri);
    }

    /**
     * Forwards reference information to the original stream
     * 
     * @param value - URI or Location to reference
     * @param iconPath - Optional custom icon to display with the reference
     */
    reference(value: vscode.Uri | vscode.Location, iconPath?: vscode.IconPath): void {
        this._originalStream.reference(value, iconPath);
    }

    /**
     * Forwards interactive button commands to the original stream
     * 
     * @param command - Command descriptor for button creation
     */
    button(command: vscode.Command): void {
        this._originalStream.button(command);
    }

    /**
     * Forwards hyperlink anchor creation to the original stream
     * 
     * @param value - URI or Location for the anchor target
     * @param title - Optional display text for the anchor
     */
    anchor(value: vscode.Uri | vscode.Location, title?: string): void {
        this._originalStream.anchor(value, title);
    }

    /**
     * Processes general response parts with type-specific handling
     * 
     * Intelligently intercepts markdown parts for content collection while
     * forwarding all parts to the original stream. Provides comprehensive
     * response part handling for maximum flexibility.
     * 
     * @param part - Response part to process
     */
    push(part: vscode.ChatResponsePart): void {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
            const mdValue = part.value;
            this._responseContent += typeof mdValue === 'string' ? mdValue : mdValue.value;
        }
        this._originalStream.push(part);
    }
}