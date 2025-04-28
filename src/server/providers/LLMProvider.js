export class LLMProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Send a message to the LLM and get a response.
   * @param {Object} params - The parameters for the LLM call.
   * @returns {Promise<Object>} The response from the LLM.
   */
  async sendMessage(params) {
    throw new Error('sendMessage() must be implemented by subclasses');
  }

  /**
   * Handle the full prompt + tool usage loop.
   * @param {Object} params - { query, userId, tools, systemPrompt, mcp, emit, getScriptingRules }
   * @returns {Promise<string>} The final response text.
   */
  async handlePromptLoop(params) {
    throw new Error('handlePromptLoop() must be implemented by subclasses');
  }
} 