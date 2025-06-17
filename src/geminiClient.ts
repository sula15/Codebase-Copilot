import { GoogleGenerativeAI } from '@google/generative-ai';
import * as vscode from 'vscode';

export class GeminiClient {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    constructor() {
        this.initializeClient();
    }

    private initializeClient() {
        try {
            const config = vscode.workspace.getConfiguration('codebaseCopilot');
            const apiKey = config.get<string>('geminiApiKey');
            
            if (!apiKey || apiKey.trim() === '') {
                throw new Error('Gemini API key not configured. Please set it in VS Code settings.');
            }
            
            this.genAI = new GoogleGenerativeAI(apiKey);
            
            try {
                this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            } catch (error) {
                try {
                    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                } catch (error2) {
                    try {
                        this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
                    } catch (error3) {
                        this.model = this.genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
                    }
                }
            }
            
        } catch (error) {
            console.error('Failed to initialize Gemini client:', error);
            throw error;
        }
    }

    async chat(message: string, codeContext?: string): Promise<string> {
        try {
            if (!this.model) {
                this.initializeClient();
            }

            // Simple, efficient prompt - no formatting instructions
            let prompt = this.buildSimplePrompt(message, codeContext);

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            if (!text || text.trim() === '') {
                throw new Error('Empty response from Gemini API');
            }
            
            return text;
            
        } catch (error) {
            console.error('Gemini API error:', error);
            
            if (error instanceof Error) {
                if (error.message.includes('API key')) {
                    throw new Error('Invalid API key. Please check your Gemini API key in settings.');
                } else if (error.message.includes('quota')) {
                    throw new Error('API quota exceeded. Please check your Gemini API usage.');
                } else if (error.message.includes('not found') || error.message.includes('404')) {
                    throw new Error('Model not found. This might be an API version issue. Try updating the extension or check your API access.');
                } else if (error.message.includes('models/')) {
                    throw new Error('Model access issue. Make sure your API key has access to Gemini models.');
                } else {
                    throw new Error(`Gemini API error: ${error.message}`);
                }
            }
            
            throw new Error('Failed to get response from Gemini API');
        }
    }

    private buildSimplePrompt(message: string, codeContext?: string): string {
        // Detect if user is asking for code generation/modification
        const isCodeRequest = this.isCodeGenerationRequest(message);
        
        if (codeContext && codeContext.trim() !== '') {
            let prompt = `You are a helpful coding assistant. `;
            
            if (isCodeRequest) {
                prompt += `When asked to generate, modify, or add code, provide complete, working code examples. `;
            }
            
            prompt += `Analyze the code and answer the question.

Code Context:
\`\`\`
${codeContext}
\`\`\`

Question: ${message}`;

            if (isCodeRequest) {
                prompt += `

Please provide complete, working code that implements the requested changes. Include the full modified file or function, not just snippets.`;
            }
            
            return prompt;
        } else {
            let prompt = `You are a helpful coding assistant. `;
            
            if (isCodeRequest) {
                prompt += `Provide complete, working code examples when requested. `;
            }
            
            prompt += `Answer this question: ${message}`;
            
            return prompt;
        }
    }

    private isCodeGenerationRequest(message: string): boolean {
        const codeKeywords = [
            'generate', 'create', 'write', 'add', 'modify', 'update', 'change',
            'implement', 'build', 'make', 'show me code', 'give me code',
            'how to add', 'how to implement', 'code for', 'function for',
            'script for', 'example of', 'sample code'
        ];
        
        const lowerMessage = message.toLowerCase();
        return codeKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    async testConnection(): Promise<boolean> {
        try {
            const testModels = [
                "gemini-1.5-flash",
                "gemini-1.5-pro", 
                "gemini-pro",
                "models/gemini-1.5-flash"
            ];
            
            for (const modelName of testModels) {
                try {
                    console.log(`Testing model: ${modelName}`);
                    const testModel = this.genAI?.getGenerativeModel({ model: modelName });
                    if (testModel) {
                        const testPrompt = "Respond with just 'OK' to test the connection.";
                        await testModel.generateContent(testPrompt);
                        console.log(`✅ Model ${modelName} works!`);
                        this.model = testModel;
                        return true;
                    }
                } catch (modelError) {
                    console.log(`❌ Model ${modelName} failed:`, modelError);
                    continue;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
}