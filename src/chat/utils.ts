/**
 * @fileoverview Utility module for Language Model (LLM) communication.
 * This module provides functionality for sending requests to
 * language models integrated with Visual Studio Code's API.
 * 
 * @module chat/utils
 * @license MIT
 */

import * as vscode from 'vscode';
import { LanguageModelChat, LanguageModelChatMessage } from 'vscode';
import { GlobalChannel } from '../channel';

/**
 * Sends a request to an available Language Model and retrieves the response.
 * 
 * This function selects the most appropriate language model based on a prioritization
 * algorithm that favors high-capability models (gpt-4o) and trusted vendors (copilot).
 * It handles the complete request-response cycle, including streaming response accumulation
 * and comprehensive error management.
 * 
 * @param {LanguageModelChatMessage[]} messages - The array of chat messages to send to the language model
 * @returns {Promise<{ requestModel: LanguageModelChat | undefined, responseMsg: LanguageModelChatMessage | undefined }>}
 *          A promise that resolves to an object containing the model used for the request and the response message.
 *          Both properties may be undefined if the request fails.
 */
export async function LLMRequest(messages: LanguageModelChatMessage[]) : Promise<{ requestModel: LanguageModelChat | undefined, responseMsg: LanguageModelChatMessage | undefined }> {

    // Retrieve all available language models
    const allModels = await vscode.lm.selectChatModels({});
    
    // Prioritize models based on capability and trusted vendors
    // Models are sorted with gpt-4o taking highest priority, followed by Copilot models
    const prioritizedModels = allModels.sort((a, b) => {
        if (a.family === 'gpt-4o' && b.family !== 'gpt-4o') { return -1; }
        if (a.vendor === 'copilot' && b.vendor !== 'copilot') { return -1; }
        return 0;
    });
    
    // Select the highest priority model
    const model = prioritizedModels[0];
    
    try {
        if (model) { 
            // Initialize request to the selected language model
            const response = await model.sendRequest(messages, {});
        
            // Accumulate streaming response fragments into a complete response
            let accumulatedResponse = '';
            for await (const fragment of response.text) { 
                accumulatedResponse += fragment; 
            }
            
            // Return successful response with model information
            return {
                requestModel: model,
                responseMsg: vscode.LanguageModelChatMessage.Assistant(accumulatedResponse)
            };
        } else {
            // Log error when no models are available
            GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error: No available model found.'));
        }
    } catch (error) {
        // Comprehensive error handling with appropriate message extraction
        GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error: {0}', error instanceof Error ? error.message : String(error)));
    }
    
    // Return undefined values in case of failure
    return {
        requestModel: undefined,
        responseMsg: undefined
    };
}