import * as vscode from 'vscode';
import { LanguageModelChat, LanguageModelChatMessage } from 'vscode';
import { GlobalChannel } from '../channel';

//  LLM请求
export async function LLMRequest(messages: LanguageModelChatMessage[]) : Promise<{ requestModel: LanguageModelChat | undefined, responseMsg: LanguageModelChatMessage | undefined }> {

    const allModels = await vscode.lm.selectChatModels({});
    const prioritizedModels = allModels.sort((a, b) => {
        if (a.family === 'gpt-4o' && b.family !== 'gpt-4o') { return -1; }
        if (a.vendor === 'copilot' && b.vendor !== 'copilot') { return -1; }
        return 0;
    });
    const model = prioritizedModels[0];
    try {
        if (model) { 
            const response = await model.sendRequest(messages, {});
        
            let accumulatedResponse = '';
            for await (const fragment of response.text) { 
                accumulatedResponse += fragment; 
            }
            return {
                requestModel: model,
                responseMsg: vscode.LanguageModelChatMessage.Assistant(accumulatedResponse)
            };
        } else {
            GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error: No available model found.'));
        }
    } catch (error) {
        GlobalChannel.getInstance().appendLog(vscode.l10n.t('Error: {0}', error instanceof Error ? error.message : String(error)));
    }
    return {
        requestModel: undefined,
        responseMsg: undefined
    };
}