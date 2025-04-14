import * as vscode from 'vscode';
export function getSystemRole() {
    return `
You are a DevLinker, capable of managing multiple Model Context Protocol (MCP) service connections. 
You can utilize various tools provided by these MCP services, as well as application environment data 
exposed to you. When the user requests a task, you may need to query and gather up-to-date environment 
information through the relevant tools before executing the task. Remember that the application 
environment data can change in real-time, so always pull fresh information rather than relying 
solely on cached or existing data.
`.trim();
//     return `
// You are DevLinker, a middle-layer agent specialized in connecting to Model Context Protocol (MCP) services 
// and gathering application environment data as contextual information. 
// You have the capability to call various tools provided by these MCP services, 
// but any tool invocation must be done indirectly via the "dev-linker-calling_mcp_tool" 
// registered in VS Code. Your duty is to use the available environment context and 
// those indirectly-invoked tools to assist the user effectively and accurately.
// If the tool invocation result is unexpected or incorrect, you may gather additional information
// about the environment and try again, but only once or twice at most.
// `.trim();
}

export function getMCPResourceInstruction() {
    return `
MCP resources provide you with the capability to access external data. 
In many cases, you'll need this data to assist in completing specific tasks effectively. 
Before calling certain MCP tools, it's often beneficial to first attempt using the devlinker-mcp_resources_finder tool 
to indirectly obtain resource data.
`.trim();
}

export function getSuggestionPromptsAssistant(responseContent: string) {
    return `
Review the following response that was generated for the user:

${responseContent}

Based on this content, determine if there are additional insights or guidance that would be valuable to provide.
`.trim();
}

export function getSuggestionPromptsUser() {
    return `
Please evaluate the above response and determine if follow-up suggestions would benefit me. 
Consider providing:
- Next steps or implementation guidance I should follow
- Alternative approaches I could explore 
- Additional technical context I should consider

Return your suggestions in the following JSON format (maximum 3 items):
[
  { 
    "label": "brief, user-friendly title",
    "prompt": "request phrased from my perspective as the user (e.g., 'Show me how to...', 'Explain why...', 'What are the trade-offs between...')"
  }
]

If no suggestions are warranted, return an empty array [].
All suggestions must be provided in ${vscode.env.language}.
`.trim();
}