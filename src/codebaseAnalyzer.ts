import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

export interface CodeFile {
    path: string;
    content: string;
    size: number;
}

export class CodebaseAnalyzer {
    private workspaceRoot: string;
    private ignoreFilter: any;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.setupIgnoreFilter();
    }

    private setupIgnoreFilter() {
        this.ignoreFilter = ignore();
        
        // Default ignores
        this.ignoreFilter.add([
            'node_modules/**',
            '.git/**',
            'dist/**',
            'build/**',
            'out/**',
            'target/**',
            '.vscode/**',
            '*.log',
            '.env*',
            '*.min.js',
            '*.min.css',
            'package-lock.json',
            'yarn.lock',
            '.DS_Store',
            'Thumbs.db'
        ]);

        // Load .gitignore if exists
        try {
            const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                this.ignoreFilter.add(gitignoreContent);
            }
        } catch (error) {
            console.warn('Could not load .gitignore:', error);
        }
    }

    async getCurrentFileContent(): Promise<string | null> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        return activeEditor.document.getText();
    }

    getCurrentFileName(): string | null {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        return path.basename(activeEditor.document.fileName);
    }

    async getRelevantFiles(query: string, maxFiles: number = 5): Promise<CodeFile[]> {
        const files: CodeFile[] = [];
        
        try {
            if (!this.workspaceRoot) {
                console.warn('No workspace root found');
                return files;
            }

            const allFiles = await this.getAllCodeFiles();
            
            if (allFiles.length === 0) {
                console.warn('No code files found in workspace');
                return files;
            }

            // Simple relevance scoring based on filename and content
            const scoredFiles = allFiles.map(file => ({
                ...file,
                score: this.calculateRelevanceScore(file, query)
            })).sort((a, b) => b.score - a.score);

            return scoredFiles.slice(0, maxFiles);
            
        } catch (error) {
            console.error('Error getting relevant files:', error);
            return files;
        }
    }

    private async getAllCodeFiles(): Promise<CodeFile[]> {
        const files: CodeFile[] = [];
        const codeExtensions = [
            '.js', '.ts', '.jsx', '.tsx',
            '.py', '.java', '.cpp', '.c', '.h',
            '.cs', '.go', '.rs', '.php', '.rb',
            '.swift', '.kt', '.scala', '.clj',
            '.html', '.css', '.scss', '.sass',
            '.json', '.xml', '.yaml', '.yml',
            '.md', '.txt', '.sh', '.bat'
        ];
        
        const searchFiles = async (dir: string) => {
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const relativePath = path.relative(this.workspaceRoot, fullPath);
                    
                    if (this.ignoreFilter.ignores(relativePath)) {
                        continue;
                    }
                    
                    const stat = fs.statSync(fullPath);
                    
                    if (stat.isDirectory()) {
                        await searchFiles(fullPath);
                    } else if (codeExtensions.includes(path.extname(item).toLowerCase())) {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            
                            // Limit file size to avoid overwhelming the API
                            if (content.length < 50000) { // 50KB limit
                                files.push({
                                    path: relativePath,
                                    content: content,
                                    size: content.length
                                });
                            }
                        } catch (error) {
                            // Skip files that can't be read
                            console.warn(`Could not read file ${fullPath}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Could not read directory ${dir}:`, error);
            }
        };

        if (this.workspaceRoot && fs.existsSync(this.workspaceRoot)) {
            await searchFiles(this.workspaceRoot);
        }
        
        return files;
    }

    private calculateRelevanceScore(file: CodeFile, query: string): number {
        const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
        let score = 0;
        
        // Score based on filename (higher weight)
        queryWords.forEach(word => {
            if (file.path.toLowerCase().includes(word)) {
                score += 10;
            }
        });
        
        // Score based on file extension relevance
        const fileExt = path.extname(file.path).toLowerCase();
        queryWords.forEach(word => {
            if (word.includes(fileExt.substring(1))) { // Remove the dot
                score += 5;
            }
        });
        
        // Score based on content (simple keyword matching)
        const content = file.content.toLowerCase();
        queryWords.forEach(word => {
            const matches = (content.match(new RegExp(word, 'gi')) || []).length;
            score += Math.min(matches, 5); // Cap at 5 to avoid overwhelming single-word files
        });
        
        // Bonus for smaller files (easier to process)
        if (file.size < 1000) {
            score += 2;
        } else if (file.size < 5000) {
            score += 1;
        }
        
        return score;
    }

    getWorkspaceStats(): { totalFiles: number; workspaceRoot: string } {
        return {
            totalFiles: 0, // Will be calculated when needed
            workspaceRoot: this.workspaceRoot
        };
    }
}
