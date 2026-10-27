import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DataConverter } from '../converter/dataConverter';
import { ConversionFormat, OutputFormat } from '../visualizer/types';

export class DataConverterPanel {
    public static currentPanel: DataConverterPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private converter: DataConverter;

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this.converter = new DataConverter();

        this._panel.webview.html = this._getWebviewContent();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'convert':
                        this.handleConvert(message.content, message.sourceFormat, message.targetFormat);
                        break;
                    case 'loadFile':
                        this.handleLoadFile();
                        break;
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (DataConverterPanel.currentPanel) {
            DataConverterPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel('dataConverter', 'Data Converter', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'converter.svg');
            DataConverterPanel.currentPanel = new DataConverterPanel(panel);
        }
    }

    private async handleLoadFile() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select File to Convert',
            filters: {
                'Data Files': ['json', 'yaml', 'yml', 'xml', 'csv', 'raml'],
                'All Files': ['*'],
            },
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri[0]);
                const text = Buffer.from(content).toString('utf8');
                const fileName = fileUri[0].fsPath.split('/').pop() || '';
                const detectedFormat = DataConverter.detectFormat(fileName, text);

                this._panel.webview.postMessage({
                    command: 'fileLoaded',
                    content: text,
                    fileName,
                    detectedFormat,
                });
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to load file: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }

    private handleConvert(content: string, sourceFormat: ConversionFormat, targetFormat: OutputFormat) {
        const result = this.converter.convert(content, sourceFormat, targetFormat);

        this._panel.webview.postMessage({
            command: 'conversionComplete',
            result,
        });

        if (result.success) {
            vscode.window.showInformationMessage(
                `Converted ${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()} in ${result.metadata.conversionTime}ms`,
            );
        } else {
            vscode.window.showErrorMessage(`Conversion failed: ${result.error}`);
        }
    }

    public dispose() {
        DataConverterPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(): string {
        const nonce = this.getNonce();
        const webview = this._panel.webview;
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Data Converter</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-icon {
            width: 28px;
            height: 28px;
            color: #ce9178;
        }

        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .controls {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            align-items: center;
            flex-wrap: wrap;
        }

        .control-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        label {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 13px;
            cursor: pointer;
        }

        select:hover {
            background: var(--vscode-dropdown-listBackground);
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 3px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button:active {
            transform: translateY(1px);
        }

        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, var(--vscode-input-border));
        }

        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .content {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            overflow: hidden;
        }

        .panel {
            display: flex;
            flex-direction: column;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .panel-header {
            background: var(--vscode-editorGroupHeader-tabsBackground);
            padding: 10px 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .panel-badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
        }

        textarea {
            flex: 1;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: none;
            padding: 15px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            outline: none;
            width: 100%;
            height: 100%;
            min-height: 0; /* Important for flex children */
        }

        #outputContainer {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0; /* Important for proper scrolling */
            overflow: hidden;
        }

        #outputContainer textarea {
            flex: 1;
            min-height: 0;
        }

        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px;
            text-align: center;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 15px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 14px;
            margin-bottom: 10px;
        }

        .empty-state-hint {
            font-size: 12px;
            opacity: 0.7;
        }

        .stats {
            padding: 10px 15px;
            background: var(--vscode-editorWidget-background);
            border-top: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 15px;
        }

        .stat-item {
            display: flex;
            gap: 5px;
        }

        .stat-label {
            opacity: 0.7;
        }

        .stat-value {
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .error {
            color: var(--vscode-errorForeground);
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 12px;
            border-radius: 3px;
            margin: 15px;
            font-size: 13px;
        }

        .success {
            color: var(--vscode-charts-green);
        }

        @media (max-width: 1000px) {
            .content {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <svg class="header-icon" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3.5" width="7.5" height="7.5" rx="1.5" fill="#ce9178" fill-opacity="0.18" stroke="#ce9178" stroke-width="1.6"/>
                <rect x="13.5" y="13" width="7.5" height="7.5" rx="1.5" fill="#ce9178" fill-opacity="0.18" stroke="#ce9178" stroke-width="1.6"/>
                <path d="M14 7.25h2.75a2 2 0 0 1 2 2v3.25" stroke="#ce9178" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16.75 10.5l2 2.25 2-2.25" stroke="#ce9178" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 16.75H7.25a2 2 0 0 1-2-2V11.5" stroke="#ce9178" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7.25 13.75l-2-2.25-2 2.25" stroke="#ce9178" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Data Converter
        </h1>
        <div class="subtitle">Convert between JSON, YAML, XML, CSV, and RAML formats</div>
    </div>

    <div class="controls">
        <div class="control-group">
            <label for="sourceFormat">From:</label>
            <select id="sourceFormat">
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="xml">XML</option>
                <option value="csv">CSV</option>
                <option value="raml">RAML</option>
            </select>
        </div>

        <div class="control-group">
            <label for="targetFormat">To:</label>
            <select id="targetFormat">
                <option value="json" selected>JSON</option>
                <option value="yaml">YAML</option>
                <option value="xml">XML</option>
            </select>
        </div>

        <button id="loadFileBtn" class="secondary">
            📁 Load File
        </button>

        <button id="convertBtn">
            ⚡ Convert
        </button>

        <button id="downloadBtn" class="secondary" style="display: none;">
            💾 Download
        </button>

        <button id="copyBtn" class="secondary" style="display: none;">
            📋 Copy
        </button>
    </div>

    <div class="content">
        <div class="panel">
            <div class="panel-header">
                <span>Source Data</span>
                <span id="sourceSize" class="panel-badge"></span>
            </div>
            <textarea id="sourceInput" placeholder="Paste your data here or load a file..."></textarea>
        </div>

        <div class="panel">
            <div class="panel-header">
                <span>Converted Output</span>
                <span id="outputSize" class="panel-badge"></span>
            </div>
            <div id="outputContainer">
                <div class="empty-state">
                    <div class="empty-state-icon">📄</div>
                    <div class="empty-state-text">No output yet</div>
                    <div class="empty-state-hint">Convert your data to see results here</div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const sourceInput = document.getElementById('sourceInput');
        const sourceFormat = document.getElementById('sourceFormat');
        const targetFormat = document.getElementById('targetFormat');
        const convertBtn = document.getElementById('convertBtn');
        const loadFileBtn = document.getElementById('loadFileBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const copyBtn = document.getElementById('copyBtn');
        const outputContainer = document.getElementById('outputContainer');
        const sourceSize = document.getElementById('sourceSize');
        const outputSize = document.getElementById('outputSize');

        let currentOutput = '';
        let currentFileName = '';

        // Load file
        loadFileBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'loadFile' });
        });

        // Convert
        convertBtn.addEventListener('click', () => {
            const content = sourceInput.value.trim();
            if (!content) {
                showError('Please enter or load some data first');
                return;
            }

            vscode.postMessage({
                command: 'convert',
                content,
                sourceFormat: sourceFormat.value,
                targetFormat: targetFormat.value
            });
        });

        // Download
        downloadBtn.addEventListener('click', () => {
            if (!currentOutput) return;

            let mimeType = 'application/json';
            if (targetFormat.value === 'xml') {
                mimeType = 'application/xml';
            } else if (targetFormat.value === 'yaml') {
                mimeType = 'application/x-yaml';
            }

            const blob = new Blob([currentOutput], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getOutputFileName();
            a.click();
            URL.revokeObjectURL(url);
        });

        // Copy to clipboard
        copyBtn.addEventListener('click', () => {
            if (!currentOutput) return;

            navigator.clipboard.writeText(currentOutput).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            });
        });

        // Update source size on input
        sourceInput.addEventListener('input', () => {
            updateSourceSize();
        });

        function updateSourceSize() {
            const size = new Blob([sourceInput.value]).size;
            sourceSize.textContent = formatBytes(size);
        }

        function getOutputFileName() {
            const ext = targetFormat.value;
            const baseName = currentFileName ?
                currentFileName.replace(/\.[^/.]+$/, '') :
                'converted';
            return \`\${baseName}.\${ext}\`;
        }

        function showError(message) {
            const error = document.createElement('div');
            error.className = 'error';
            error.textContent = '❌ ' + String(message || 'Conversion failed');
            outputContainer.replaceChildren(error);
            downloadBtn.style.display = 'none';
            copyBtn.style.display = 'none';
            currentOutput = '';
            outputSize.textContent = '0 B';
        }

        function showOutput(output) {
            const textarea = document.createElement('textarea');
            textarea.value = output;
            textarea.readOnly = true;
            outputContainer.innerHTML = '';
            outputContainer.appendChild(textarea);

            currentOutput = output;
            downloadBtn.style.display = 'flex';
            copyBtn.style.display = 'flex';

            const size = new Blob([output]).size;
            outputSize.textContent = formatBytes(size);
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'fileLoaded':
                    sourceInput.value = message.content;
                    currentFileName = message.fileName;
                    if (message.detectedFormat) {
                        sourceFormat.value = message.detectedFormat;
                    }
                    updateSourceSize();
                    break;

                case 'conversionComplete':
                    const result = message.result;
                    if (result.success) {
                        showOutput(result.output);
                    } else {
                        showError(result.error);
                    }
                    break;
            }
        });

        // Initialize
        updateSourceSize();
    </script>
</body>
</html>`;
    }

    private getNonce() {
        return crypto.randomBytes(16).toString('base64url');
    }
}
