# 🤖 Codebase Copilot

An intelligent VS Code extension that lets you chat with your codebase using Google's Gemini AI. Get instant explanations, code suggestions, and debugging help directly in your editor.

![Codebase Copilot Demo](https://img.shields.io/badge/VS%20Code-Extension-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Gemini AI](https://img.shields.io/badge/AI-Gemini%201.5%20Flash-orange)

## ✨ Features

- 🧠 **Smart Context Analysis** - Automatically finds relevant files for your questions
- 📁 **File Selector** - Choose exactly which files to include in analysis
- ⚡ **Fast Performance** - Optimized for speed with client-side formatting
- 🎨 **Beautiful Responses** - Professional formatting with code highlighting
- 🔧 **Multiple Context Modes** - Current file, selected files, auto-detect, or entire codebase
- 💡 **Code Generation** - Generate, modify, and improve code with AI assistance

## 🚀 Quick Start

### Prerequisites

- VS Code 1.74.0 or higher
- Node.js 14.x or higher
- [Google Gemini API key](https://makersuite.google.com/app/apikey) (free tier available)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/codebase-copilot.git
   cd codebase-copilot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile the extension**
   ```bash
   npm run compile
   ```

4. **Launch in VS Code**
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - Configure your Gemini API key in settings

### Configuration

1. Open VS Code Settings (`Ctrl/Cmd + ,`)
2. Search for "Codebase Copilot"
3. Enter your Gemini API key
4. Optionally adjust max context files (default: 5)

## 🎮 Usage

### Basic Chat
1. Open the **Codebase Copilot** panel in the Explorer sidebar
2. Ask questions about your code:
   ```
   "What does this function do?"
   "How can I improve this code?"
   "Find potential bugs in my project"
   ```

### Context Modes

Choose how the AI analyzes your code:

- **🤖 Auto** - Smart detection of relevant files
- **📄 Current** - Only the currently open file
- **☑️ Selected** - Manually select specific files
- **📚 All** - Analyze entire codebase

### Example Queries

```bash
# Code Analysis
"Explain how authentication works in this project"
"What design patterns are used here?"
"Find all database-related code"

# Code Generation
"Add a contact_number field to the login form"
"Create a function to validate email addresses"
"Generate unit tests for this component"

# Debugging
"Why is this function not working?"
"Find potential security issues"
"How can I optimize this for performance?"
```

## 🛠️ Development

### Project Structure

```
codebase-copilot/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── geminiClient.ts       # Gemini API integration
│   ├── codebaseAnalyzer.ts   # Code analysis utilities
│   └── chatProvider.ts       # Chat interface provider
├── package.json              # Extension manifest
└── README.md
```

### Build Commands

```bash
# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Package extension
vsce package
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📋 Requirements

- **VS Code**: 1.74.0+
- **Node.js**: 14.x+
- **Gemini API Key**: [Get yours here](https://makersuite.google.com/app/apikey)

## ⚙️ Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `codebaseCopilot.geminiApiKey` | `""` | Your Gemini API key |
| `codebaseCopilot.maxContextFiles` | `5` | Maximum files to include in context |

## 🎯 Performance

- **Optimized prompting** - Minimal token usage for faster responses
- **Client-side formatting** - Beautiful output without AI overhead
- **Smart file filtering** - Ignores build files, node_modules, etc.
- **Context-aware analysis** - Only processes relevant code

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Open in VS Code and press `F5` to launch development host
4. Make changes and test
5. Submit a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** - For providing the powerful language model
- **VS Code Extension API** - For the excellent development platform
- **TypeScript** - For making development enjoyable

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/yourusername/codebase-copilot/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/yourusername/codebase-copilot/discussions)
- 📧 **Email**: your.email@example.com

## 🔮 Roadmap

- [ ] Support for more AI providers (OpenAI, Claude)
- [ ] Code refactoring suggestions
- [ ] Integration with Git for diff analysis
- [ ] Custom prompt templates
- [ ] Team collaboration features
- [ ] Plugin marketplace integration

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with ❤️ by [Your Name](https://github.com/yourusername)

</div>