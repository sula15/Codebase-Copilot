import * as vscode from 'vscode';
import { GeminiClient } from './geminiClient';
import { CodebaseAnalyzer, CodeFile } from './codebaseAnalyzer';

interface ChatMessage {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
}

interface ContextSelection {
    mode: 'current' | 'selected' | 'auto' | 'whole';
    selectedFiles: string[];
}

export class ChatProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private geminiClient: GeminiClient;
    private codebaseAnalyzer: CodebaseAnalyzer;
    private chatHistory: ChatMessage[] = [];
    private availableFiles: CodeFile[] = [];
    private contextSelection: ContextSelection = {
        mode: 'auto',
        selectedFiles: []
    };

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.geminiClient = new GeminiClient();
        this.codebaseAnalyzer = new CodebaseAnalyzer();
        
        // Listen for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateWelcomeMessage();
            this.refreshAvailableFiles();
        });

        // Initial load of available files
        this.refreshAvailableFiles();
    }

    private async refreshAvailableFiles() {
        try {
            this.availableFiles = await this.codebaseAnalyzer.getRelevantFiles('', 50); // Get more files for selection
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateFileList',
                    files: this.availableFiles.map(f => ({
                        path: f.path,
                        size: f.size
                    }))
                });
            }
        } catch (error) {
            console.error('Error refreshing available files:', error);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleChatMessage(data.message);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'testConnection':
                    await this.testConnection();
                    break;
                case 'refreshContext':
                    this.updateWelcomeMessage();
                    this.refreshAvailableFiles();
                    break;
                case 'updateContextMode':
                    this.contextSelection.mode = data.mode;
                    this.updateContextInfo();
                    break;
                case 'updateSelectedFiles':
                    this.contextSelection.selectedFiles = data.selectedFiles;
                    this.updateContextInfo();
                    break;
                case 'requestFileList':
                    this.refreshAvailableFiles();
                    break;
            }
        });

        // Send initial data
        this.updateWelcomeMessage();
        this.refreshAvailableFiles();
    }

    private updateContextInfo() {
        if (!this._view) return;

        let contextInfo = '';
        const currentFileName = this.codebaseAnalyzer.getCurrentFileName();

        switch (this.contextSelection.mode) {
            case 'current':
                contextInfo = currentFileName ? `Using: ${currentFileName}` : 'Using: Current file (none open)';
                break;
            case 'selected':
                if (this.contextSelection.selectedFiles.length > 0) {
                    contextInfo = `Using: ${this.contextSelection.selectedFiles.length} selected files`;
                } else {
                    contextInfo = 'Using: No files selected';
                }
                break;
            case 'auto':
                contextInfo = 'Using: Auto-detect relevant files';
                break;
            case 'whole':
                contextInfo = 'Using: Entire codebase';
                break;
        }

        this._view.webview.postMessage({
            type: 'updateContextInfo',
            info: contextInfo
        });
    }

    private updateWelcomeMessage() {
        if (!this._view) return;

        const stats = this.codebaseAnalyzer.getWorkspaceStats();
        const currentFileName = this.codebaseAnalyzer.getCurrentFileName();
        const activeEditor = vscode.window.activeTextEditor;
        
        let welcomeMessage = '👋 Welcome to Codebase Copilot!\n\n';
        
        if (stats.workspaceRoot) {
            welcomeMessage += `📁 Workspace: ${stats.workspaceRoot}\n`;
        }
        
        if (currentFileName && activeEditor) {
            const relativePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
            welcomeMessage += `📄 Current file: ${relativePath}\n\n`;
        }
        
        welcomeMessage += 'Use the context selector above to choose which files to analyze.\n\n';
        welcomeMessage += 'Ask me anything about your code!';
        
        this._view.webview.postMessage({
            type: 'welcomeMessage',
            message: welcomeMessage
        });

        this.updateContextInfo();
    }

    private async handleChatMessage(message: string) {
        if (!this._view) return;

        try {
            // Add user message to history
            const userMessage: ChatMessage = {
                id: Date.now().toString(),
                text: message,
                isUser: true,
                timestamp: new Date()
            };
            this.chatHistory.push(userMessage);

            // Show user message in UI
            this._view.webview.postMessage({
                type: 'userMessage',
                message: message
            });

            // Show thinking state with context info
            let thinkingMessage = this.getThinkingMessage();

            this._view.webview.postMessage({
                type: 'thinking',
                message: thinkingMessage
            });

            // Get context for the AI based on selection
            const context = await this.buildContextFromSelection(message);

            // Get AI response
            const response = await this.geminiClient.chat(message, context);

            // Add AI response to history
            const aiMessage: ChatMessage = {
                id: Date.now().toString() + '_ai',
                text: response,
                isUser: false,
                timestamp: new Date()
            };
            this.chatHistory.push(aiMessage);

            // Send response back to webview
            this._view.webview.postMessage({
                type: 'aiResponse',
                message: response
            });

        } catch (error) {
            console.error('Error handling chat message:', error);
            
            let errorMessage = 'An unexpected error occurred.';
            if (error instanceof Error) {
                errorMessage = error.message;
            }

            this._view.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        }
    }

    private getThinkingMessage(): string {
        const currentFileName = this.codebaseAnalyzer.getCurrentFileName();
        
        switch (this.contextSelection.mode) {
            case 'current':
                return currentFileName ? `Analyzing ${currentFileName}...` : 'No current file to analyze...';
            case 'selected':
                return `Analyzing ${this.contextSelection.selectedFiles.length} selected files...`;
            case 'auto':
                return 'Auto-detecting and analyzing relevant files...';
            case 'whole':
                return 'Analyzing entire codebase...';
            default:
                return 'Analyzing...';
        }
    }

    private async buildContextFromSelection(query: string): Promise<string> {
        let context = '';

        try {
            switch (this.contextSelection.mode) {
                case 'current':
                    context = await this.buildCurrentFileContext();
                    break;
                case 'selected':
                    context = await this.buildSelectedFilesContext();
                    break;
                case 'auto':
                    context = await this.buildAutoContext(query);
                    break;
                case 'whole':
                    context = await this.buildWholeCodebaseContext();
                    break;
            }

            if (context.trim() === '') {
                context = 'No specific code context found. Please provide general programming assistance.';
            }

        } catch (error) {
            console.error('Error building context:', error);
            context = 'Error accessing codebase context. Providing general assistance.';
        }

        return context;
    }

    private async buildCurrentFileContext(): Promise<string> {
        const currentFile = await this.codebaseAnalyzer.getCurrentFileContent();
        const currentFileName = this.codebaseAnalyzer.getCurrentFileName();
        
        if (currentFile && currentFileName) {
            const activeEditor = vscode.window.activeTextEditor;
            const relativePath = activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : currentFileName;
            return `Current file: ${relativePath}\n\nContent:\n${currentFile}`;
        }
        
        return 'No current file is open.';
    }

    private async buildSelectedFilesContext(): Promise<string> {
        if (this.contextSelection.selectedFiles.length === 0) {
            return 'No files selected. Please select files using the file selector.';
        }

        let context = `Selected files (${this.contextSelection.selectedFiles.length}):\n\n`;
        
        for (const filePath of this.contextSelection.selectedFiles) {
            const file = this.availableFiles.find(f => f.path === filePath);
            if (file) {
                context += `--- File: ${file.path} ---\n`;
                context += `${file.content}\n\n`;
            }
        }

        return context;
    }

    private async buildAutoContext(query: string): Promise<string> {
        // This is the original smart context building
        let context = '';
        const config = vscode.workspace.getConfiguration('codebaseCopilot');
        const maxFiles = config.get<number>('maxContextFiles') || 3;
        
        // Always prioritize the current file if available
        const currentFile = await this.codebaseAnalyzer.getCurrentFileContent();
        const currentFileName = this.codebaseAnalyzer.getCurrentFileName();
        
        if (currentFile && currentFileName) {
            const activeEditor = vscode.window.activeTextEditor;
            const relativePath = activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : currentFileName;
            
            context += `Currently viewing file: ${relativePath}\nContent:\n${currentFile}\n\n`;
            
            // Check if the query is specifically about the current file
            const isCurrentFileQuery = this.isQueryAboutCurrentFile(query, currentFileName);
            
            if (isCurrentFileQuery) {
                return context + `User is asking about the current file (${relativePath}). Focus primarily on this file.`;
            }
        }

        // For broader queries, include relevant files from codebase
        const relevantFiles = await this.codebaseAnalyzer.getRelevantFiles(query, Math.min(maxFiles, 2));
        
        if (relevantFiles.length > 0) {
            context += 'Additional relevant files:\n\n';
            relevantFiles.forEach((file, index) => {
                // Don't duplicate the current file
                if (currentFileName && file.path.includes(currentFileName)) {
                    return;
                }
                context += `--- File ${index + 1}: ${file.path} ---\n`;
                const truncatedContent = file.content.length > 2000 
                    ? file.content.substring(0, 2000) + '\n... (truncated)'
                    : file.content;
                context += `${truncatedContent}\n\n`;
            });
        }

        return context;
    }

    private async buildWholeCodebaseContext(): Promise<string> {
        const allFiles = await this.codebaseAnalyzer.getRelevantFiles('', 20); // Get up to 20 files
        
        let context = `Entire codebase (${allFiles.length} files):\n\n`;
        
        allFiles.forEach((file, index) => {
            context += `--- File ${index + 1}: ${file.path} ---\n`;
            // Truncate large files to avoid token limits
            const truncatedContent = file.content.length > 1500 
                ? file.content.substring(0, 1500) + '\n... (truncated)'
                : file.content;
            context += `${truncatedContent}\n\n`;
        });

        return context;
    }

    private isQueryAboutCurrentFile(query: string, currentFileName: string): boolean {
        const lowerQuery = query.toLowerCase();
        const lowerFileName = currentFileName.toLowerCase();
        
        if (lowerQuery.includes(lowerFileName) || lowerQuery.includes('this file') || lowerQuery.includes('current file')) {
            return true;
        }
        
        const currentFileIndicators = [
            'what does this do',
            'explain this',
            'how does this work',
            'what is this',
            'improve this',
            'fix this',
            'debug this',
            'this function',
            'this class',
            'this code'
        ];
        
        return currentFileIndicators.some(indicator => lowerQuery.includes(indicator));
    }

    private async testConnection() {
        if (!this._view) return;

        try {
            this._view.webview.postMessage({
                type: 'thinking',
                message: 'Testing API connection...'
            });

            const isConnected = await this.geminiClient.testConnection();
            
            if (isConnected) {
                this._view.webview.postMessage({
                    type: 'connectionTest',
                    success: true,
                    message: '✅ Connection successful! Gemini API is working.'
                });
            } else {
                this._view.webview.postMessage({
                    type: 'connectionTest',
                    success: false,
                    message: '❌ Connection failed. Please check your API key.'
                });
            }
        } catch (error) {
            this._view.webview.postMessage({
                type: 'connectionTest',
                success: false,
                message: `❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private clearChat() {
        this.chatHistory = [];
        if (this._view) {
            this._view.webview.postMessage({
                type: 'clearChat'
            });
            this.updateWelcomeMessage();
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Codebase Copilot</title>
            <style>
                * {
                    box-sizing: border-box;
                }
                
                body { 
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                
                .header {
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                }
                
                .header-title {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                }
                
                .header-buttons {
                    display: flex;
                    gap: 5px;
                }
                
                .header-button {
                    padding: 4px 8px;
                    font-size: 11px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                }
                
                .header-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .context-selector {
                    margin-top: 8px;
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }

                .context-mode {
                    margin-bottom: 8px;
                }

                .context-mode label {
                    font-size: 11px;
                    font-weight: 500;
                    margin-bottom: 4px;
                    display: block;
                }

                .mode-selector {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 8px;
                }

                .mode-button {
                    padding: 4px 8px;
                    font-size: 10px;
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 2px;
                    cursor: pointer;
                    flex: 1;
                    text-align: center;
                }

                .mode-button.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .mode-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .file-selector {
                    max-height: 120px;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    background-color: var(--vscode-input-background);
                    margin-bottom: 6px;
                }

                .file-item {
                    padding: 4px 8px;
                    font-size: 11px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .file-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .file-item.selected {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    color: var(--vscode-list-activeSelectionForeground);
                }

                .file-checkbox {
                    margin: 0;
                }

                .file-path {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .file-size {
                    font-size: 10px;
                    opacity: 0.7;
                }

                .context-info {
                    font-size: 10px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }

                .hidden {
                    display: none;
                }
                
                #chat-container { 
                    flex: 1;
                    overflow-y: auto; 
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .message { 
                    padding: 8px 12px;
                    border-radius: 8px;
                    max-width: 85%;
                    word-wrap: break-word;
                    line-height: 1.4;
                }
                
                .user-message { 
                    background-color: var(--vscode-textLink-foreground);
                    color: white;
                    align-self: flex-end;
                    margin-left: auto;
                }
                
                .ai-message { 
                    background-color: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    align-self: flex-start;
                }
                
                .welcome-message {
                    background-color: var(--vscode-textPreformat-background);
                    border: 1px solid var(--vscode-focusBorder);
                    align-self: center;
                    text-align: left;
                    max-width: 95%;
                    font-size: 13px;
                    white-space: pre-line;
                }
                
                .thinking { 
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    align-self: flex-start;
                    font-style: italic;
                    opacity: 0.8;
                    animation: pulse 1.5s infinite;
                }
                
                .error-message {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                    align-self: center;
                    max-width: 95%;
                }
                
                .connection-test {
                    align-self: center;
                    max-width: 95%;
                    text-align: center;
                    font-weight: 500;
                }
                
                .connection-test.success {
                    background-color: var(--vscode-terminal-ansiGreen);
                    color: white;
                }
                
                .connection-test.failure {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 0.8; }
                    50% { opacity: 0.4; }
                }

                /* Enhanced formatting for AI responses */
                .message h1, .message h2, .message h3 {
                    margin: 12px 0 8px 0;
                    color: var(--vscode-textLink-foreground);
                    font-weight: 600;
                }
                
                .message h1 { font-size: 18px; }
                .message h2 { font-size: 16px; }
                .message h3 { font-size: 14px; }
                
                .message p {
                    margin: 8px 0;
                    line-height: 1.5;
                }
                
                .message ul, .message ol {
                    margin: 8px 0;
                    padding-left: 20px;
                }
                
                .message li {
                    margin: 4px 0;
                    line-height: 1.4;
                }
                
                .message blockquote {
                    margin: 8px 0;
                    padding: 8px 12px;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                    background-color: var(--vscode-textBlockQuote-background);
                    font-style: italic;
                }
                
                .message strong {
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                }
                
                #input-container { 
                    padding: 10px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                    display: flex;
                    gap: 8px;
                }
                
                #message-input { 
                    flex: 1; 
                    padding: 8px 12px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    resize: none;
                    min-height: 36px;
                    max-height: 100px;
                }
                
                #message-input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                #send-button { 
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                    min-width: 60px;
                }
                
                #send-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                #send-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                /* Code blocks in messages */
                .message pre {
                    background-color: var(--vscode-textPreformat-background);
                    padding: 8px;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 8px 0;
                }
                
                .message code {
                    background-color: var(--vscode-textPreformat-background);
                    padding: 2px 4px;
                    border-radius: 2px;
                    font-family: var(--vscode-editor-font-family);
                }
                
                /* Scrollbar styling */
                #chat-container::-webkit-scrollbar,
                .file-selector::-webkit-scrollbar {
                    width: 8px;
                }
                
                #chat-container::-webkit-scrollbar-track,
                .file-selector::-webkit-scrollbar-track {
                    background: var(--vscode-scrollbarSlider-background);
                }
                
                #chat-container::-webkit-scrollbar-thumb,
                .file-selector::-webkit-scrollbar-thumb {
                    background: var(--vscode-scrollbarSlider-activeBackground);
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-title">
                    <h3>🤖 Codebase Copilot</h3>
                    <div class="header-buttons">
                        <button class="header-button" onclick="refreshContext()">Refresh</button>
                        <button class="header-button" onclick="testConnection()">Test API</button>
                        <button class="header-button" onclick="clearChat()">Clear</button>
                    </div>
                </div>
                
                <div class="context-selector">
                    <div class="context-mode">
                        <label>Context Source:</label>
                        <div class="mode-selector">
                            <button class="mode-button active" data-mode="auto" onclick="setContextMode('auto')">Auto</button>
                            <button class="mode-button" data-mode="current" onclick="setContextMode('current')">Current</button>
                            <button class="mode-button" data-mode="selected" onclick="setContextMode('selected')">Selected</button>
                            <button class="mode-button" data-mode="whole" onclick="setContextMode('whole')">All</button>
                        </div>
                    </div>
                    
                    <div id="file-selector-container" class="hidden">
                        <div class="file-selector" id="file-selector">
                            <!-- Files will be populated here -->
                        </div>
                    </div>
                    
                    <div class="context-info" id="context-info">
                        Using: Auto-detect relevant files
                    </div>
                </div>
            </div>
            
            <div id="chat-container"></div>
            
            <div id="input-container">
                <textarea id="message-input" placeholder="Ask about your code..." rows="1"></textarea>
                <button id="send-button">Send</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-button');
                const fileSelector = document.getElementById('file-selector');
                const fileSelectorContainer = document.getElementById('file-selector-container');
                const contextInfo = document.getElementById('context-info');
                
                let isWaitingForResponse = false;
                let currentMode = 'auto';
                let selectedFiles = [];
                let availableFiles = [];

                // Auto-resize textarea
                messageInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
                });

                // Smart client-side formatter - no AI prompting needed!
                function smartFormatResponse(text) {
                    let formatted = text;
                    
                    // 1. Format code blocks first (highest priority)
                    formatted = formatted.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, (match, lang, code) => {
                        const language = lang || '';
                        const languageClass = language ? \` class="language-\${language}"\` : '';
                        return \`<pre><code\${languageClass}>\${escapeHtml(code.trim())}</code></pre>\`;
                    });
                    
                    // Handle single-line code blocks
                    formatted = formatted.replace(/\`\`\`([^\`\\n]+)\`\`\`/g, '<code>$1</code>');
                    
                    // Inline code
                    formatted = formatted.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
                    
                    // 2. Structure detection - numbered sections
                    formatted = formatted.replace(/^(\\d+)\\. \\*\\*(.*?)\\*\\*/gm, '<h3>$1. $2</h3>');
                    formatted = formatted.replace(/^\\*\\*(.*?):\\*\\*/gm, '<h3>$1:</h3>');
                    
                    // 3. Bold text
                    formatted = formatted.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
                    
                    // 4. Smart list detection
                    const lines = formatted.split('\\n');
                    let result = [];
                    let inList = false;
                    let listType = null;
                    
                    for (let line of lines) {
                        const trimmed = line.trim();
                        
                        // Bullet points
                        if (trimmed.match(/^[-•·]\\s+/)) {
                            if (!inList || listType !== 'ul') {
                                if (inList) result.push(\`</\${listType}>\`);
                                result.push('<ul>');
                                inList = true;
                                listType = 'ul';
                            }
                            result.push(\`<li>\${trimmed.replace(/^[-•·]\\s+/, '')}</li>\`);
                        }
                        // Numbered lists (but not headers)
                        else if (trimmed.match(/^\\d+\\.\\s+/) && !trimmed.includes('**')) {
                            if (!inList || listType !== 'ol') {
                                if (inList) result.push(\`</\${listType}>\`);
                                result.push('<ol>');
                                inList = true;
                                listType = 'ol';
                            }
                            result.push(\`<li>\${trimmed.replace(/^\\d+\\.\\s+/, '')}</li>\`);
                        }
                        // Regular line
                        else {
                            if (inList) {
                                result.push(\`</\${listType}>\`);
                                inList = false;
                                listType = null;
                            }
                            result.push(line);
                        }
                    }
                    
                    if (inList) result.push(\`</\${listType}>\`);
                    formatted = result.join('\\n');
                    
                    // 5. Important notes/warnings
                    formatted = formatted.replace(/^(Note:|Warning:|Important:|Security:)\\s*(.*$)/gm, 
                        '<blockquote><strong>$1</strong> $2</blockquote>');
                    
                    // 6. Paragraph formatting
                    formatted = formatted.replace(/\\n\\s*\\n/g, '</p><p>');
                    
                    // Wrap in paragraphs if needed
                    if (!formatted.includes('<h') && !formatted.includes('<ul>') && 
                        !formatted.includes('<ol>') && !formatted.includes('<pre>')) {
                        formatted = '<p>' + formatted + '</p>';
                    }
                    
                    // Clean up
                    formatted = formatted.replace(/<p>\\s*<\\/p>/g, '');
                    formatted = formatted.replace(/<p>(<h[1-6])/g, '$1');
                    formatted = formatted.replace(/(<\\/h[1-6]>)<\\/p>/g, '$1');
                    
                    return formatted;
                }

                function addMessage(message, className, isHtml = false) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${className}\`;
                    
                    if (isHtml) {
                        messageDiv.innerHTML = message;
                    } else if (className === 'ai-message') {
                        // Use smart formatting for AI responses
                        messageDiv.innerHTML = smartFormatResponse(message);
                    } else {
                        // Simple text for other messages
                        messageDiv.textContent = message;
                    }
                    
                    chatContainer.appendChild(messageDiv);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    return messageDiv;
                }

                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }

                // File selector functions
                function setContextMode(mode) {
                    currentMode = mode;
                    
                    document.querySelectorAll('.mode-button').forEach(btn => {
                        btn.classList.remove('active');
                        if (btn.dataset.mode === mode) {
                            btn.classList.add('active');
                        }
                    });
                    
                    if (mode === 'selected') {
                        fileSelectorContainer.classList.remove('hidden');
                        vscode.postMessage({ type: 'requestFileList' });
                    } else {
                        fileSelectorContainer.classList.add('hidden');
                    }
                    
                    vscode.postMessage({ type: 'updateContextMode', mode });
                }

                function updateFileList(files) {
                    availableFiles = files;
                    fileSelector.innerHTML = '';
                    
                    files.forEach(file => {
                        const fileItem = document.createElement('div');
                        fileItem.className = 'file-item';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'file-checkbox';
                        checkbox.checked = selectedFiles.includes(file.path);
                        checkbox.addEventListener('change', () => toggleFileSelection(file.path));
                        
                        const filePath = document.createElement('span');
                        filePath.className = 'file-path';
                        filePath.textContent = file.path;
                        filePath.title = file.path;
                        
                        const fileSize = document.createElement('span');
                        fileSize.className = 'file-size';
                        fileSize.textContent = formatFileSize(file.size);
                        
                        fileItem.appendChild(checkbox);
                        fileItem.appendChild(filePath);
                        fileItem.appendChild(fileSize);
                        
                        fileItem.addEventListener('click', (e) => {
                            if (e.target !== checkbox) {
                                checkbox.checked = !checkbox.checked;
                                toggleFileSelection(file.path);
                            }
                        });
                        
                        fileSelector.appendChild(fileItem);
                    });
                }

                function toggleFileSelection(filePath) {
                    if (selectedFiles.includes(filePath)) {
                        selectedFiles = selectedFiles.filter(f => f !== filePath);
                    } else {
                        selectedFiles.push(filePath);
                    }
                    
                    updateFileItemStates();
                    vscode.postMessage({ type: 'updateSelectedFiles', selectedFiles });
                }

                function updateFileItemStates() {
                    document.querySelectorAll('.file-item').forEach((item, index) => {
                        const file = availableFiles[index];
                        if (file && selectedFiles.includes(file.path)) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                }

                function formatFileSize(bytes) {
                    if (bytes < 1024) return bytes + 'B';
                    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
                    return Math.round(bytes / (1024 * 1024)) + 'MB';
                }

                function removeThinkingMessages() {
                    const thinkingMessages = chatContainer.querySelectorAll('.thinking');
                    thinkingMessages.forEach(msg => msg.remove());
                }

                function sendMessage() {
                    const message = messageInput.value.trim();
                    if (message && !isWaitingForResponse) {
                        isWaitingForResponse = true;
                        sendButton.disabled = true;
                        sendButton.textContent = 'Sending...';
                        
                        vscode.postMessage({ type: 'sendMessage', message });
                        messageInput.value = '';
                        messageInput.style.height = 'auto';
                    }
                }

                function clearChat() {
                    vscode.postMessage({ type: 'clearChat' });
                }

                function testConnection() {
                    vscode.postMessage({ type: 'testConnection' });
                }

                function refreshContext() {
                    vscode.postMessage({ type: 'refreshContext' });
                }

                function resetSendButton() {
                    isWaitingForResponse = false;
                    sendButton.disabled = false;
                    sendButton.textContent = 'Send';
                }

                // Event listeners
                sendButton.addEventListener('click', sendMessage);
                
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'welcomeMessage':
                            const existingWelcome = chatContainer.querySelector('.welcome-message');
                            if (existingWelcome && chatContainer.children.length === 1) {
                                existingWelcome.remove();
                            }
                            addMessage(message.message, 'welcome-message');
                            break;
                            
                        case 'userMessage':
                            addMessage(message.message, 'user-message');
                            break;
                            
                        case 'thinking':
                            addMessage(message.message, 'thinking');
                            break;
                            
                        case 'aiResponse':
                            removeThinkingMessages();
                            addMessage(message.message, 'ai-message'); // Smart formatting applied here
                            resetSendButton();
                            break;
                            
                        case 'error':
                            removeThinkingMessages();
                            addMessage(\`❌ \${message.message}\`, 'error-message');
                            resetSendButton();
                            break;
                            
                        case 'connectionTest':
                            removeThinkingMessages();
                            const className = message.success ? 'connection-test success' : 'connection-test failure';
                            addMessage(message.message, className);
                            break;
                            
                        case 'clearChat':
                            chatContainer.innerHTML = '';
                            resetSendButton();
                            break;
                            
                        case 'updateFileList':
                            updateFileList(message.files);
                            break;
                            
                        case 'updateContextInfo':
                            contextInfo.textContent = message.info;
                            break;
                    }
                });

                // Initialize
                messageInput.focus();
                vscode.postMessage({ type: 'requestFileList' });
            </script>
        </body>
        </html>`;
    }
}