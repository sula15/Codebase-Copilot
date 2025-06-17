import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';
import { GeminiClient } from './geminiClient';

export function activate(context: vscode.ExtensionContext) {
    console.log('🤖 Codebase Copilot extension is now active');

    try {
        // Check if API key is configured
        const config = vscode.workspace.getConfiguration('codebaseCopilot');
        const apiKey = config.get<string>('geminiApiKey');
        
        if (!apiKey) {
            vscode.window.showWarningMessage(
                'Codebase Copilot: Please configure your Gemini API key in settings',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'codebaseCopilot.geminiApiKey');
                }
            });
        }

        // Register chat provider
        const provider = new ChatProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('codebaseCopilot.chatView', provider)
        );

        // Enable chat view
        vscode.commands.executeCommand('setContext', 'codebaseCopilot.chatViewEnabled', true);

        // Register commands
        const openChatCommand = vscode.commands.registerCommand('codebaseCopilot.openChat', () => {
            vscode.commands.executeCommand('codebaseCopilot.chatView.focus');
        });

        const analyzeFileCommand = vscode.commands.registerCommand('codebaseCopilot.analyzeFile', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const document = activeEditor.document;
                vscode.window.showInformationMessage(`Analyzing ${document.fileName}...`);
                // Focus on chat view and send analysis request
                vscode.commands.executeCommand('codebaseCopilot.chatView.focus');
            } else {
                vscode.window.showWarningMessage('No file is currently open');
            }
        });

        context.subscriptions.push(openChatCommand, analyzeFileCommand);

        // Show welcome message
        vscode.window.showInformationMessage('🤖 Codebase Copilot is ready!');

    } catch (error) {
        console.error('Error activating Codebase Copilot:', error);
        vscode.window.showErrorMessage(`Failed to activate Codebase Copilot: ${error}`);
    }
}

export function deactivate() {
    console.log('🤖 Codebase Copilot extension is now deactivated');
}
