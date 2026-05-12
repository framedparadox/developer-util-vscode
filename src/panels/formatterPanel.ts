import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class FormatterPanel {
    public static currentPanel: FormatterPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'formatXML':
                        this.handleFormatXML(message.text, message.indent);
                        return;
                    case 'formatJSON':
                        this.handleFormatJSON(message.text, message.indent);
                        return;
                    case 'formatSQL':
                        this.handleFormatSQL(message.text);
                        return;
                    case 'minifyJSON':
                        this.handleMinifyJSON(message.text);
                        return;
                    case 'minifyXML':
                        this.handleMinifyXML(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (FormatterPanel.currentPanel) {
            FormatterPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel('formatterPanel', 'Data Formatter', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'formatter.svg');
            FormatterPanel.currentPanel = new FormatterPanel(panel);
        }
    }

    private handleFormatXML(text: string, indent: number) {
        try {
            const formatted = this.formatXML(text, indent);
            this._panel.webview.postMessage({
                command: 'formatResult',
                result: formatted,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `XML formatting failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleFormatJSON(text: string, indent: number) {
        try {
            const parsed = JSON.parse(text);
            const formatted = JSON.stringify(parsed, null, indent);
            this._panel.webview.postMessage({
                command: 'formatResult',
                result: formatted,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `JSON formatting failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleMinifyJSON(text: string) {
        try {
            const parsed = JSON.parse(text);
            const minified = JSON.stringify(parsed);
            this._panel.webview.postMessage({
                command: 'formatResult',
                result: minified,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `JSON minification failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleMinifyXML(text: string) {
        try {
            const minified = text
                .replace(/>\s+</g, '><')
                .replace(/^\s+|\s+$/gm, '')
                .trim();
            this._panel.webview.postMessage({
                command: 'formatResult',
                result: minified,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `XML minification failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleFormatSQL(text: string) {
        try {
            const formatted = this.formatSQL(text);
            this._panel.webview.postMessage({
                command: 'formatResult',
                result: formatted,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `SQL formatting failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private formatXML(xml: string, indent: number): string {
        const PADDING = ' '.repeat(indent);
        const reg = /(>)(<)(\/*)/g;
        let formatted = '';
        let pad = 0;

        xml = xml.replace(reg, '$1\r\n$2$3');

        xml.split('\r\n').forEach((node) => {
            let padDelta = 0;
            if (node.match(/.+<\/\w[^>]*>$/)) {
                padDelta = 0;
            } else if (node.match(/^<\/\w/) && pad > 0) {
                pad -= 1;
            } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                padDelta = 1;
            } else {
                padDelta = 0;
            }

            formatted += PADDING.repeat(pad) + node + '\r\n';
            pad += padDelta;
        });

        return formatted.trim();
    }

    private formatSQL(sql: string): string {
        const keywords = [
            'SELECT',
            'FROM',
            'WHERE',
            'JOIN',
            'LEFT JOIN',
            'RIGHT JOIN',
            'INNER JOIN',
            'OUTER JOIN',
            'ON',
            'AND',
            'OR',
            'ORDER BY',
            'GROUP BY',
            'HAVING',
            'LIMIT',
            'OFFSET',
            'INSERT',
            'INTO',
            'VALUES',
            'UPDATE',
            'SET',
            'DELETE',
            'CREATE',
            'TABLE',
            'ALTER',
            'DROP',
            'AS',
            'DISTINCT',
            'UNION',
            'CASE',
            'WHEN',
            'THEN',
            'ELSE',
            'END',
        ];

        let formatted = sql;

        // Add line breaks before major keywords
        keywords.forEach((keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            formatted = formatted.replace(regex, `\n${keyword}`);
        });

        // Clean up whitespace
        formatted = formatted
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join('\n');

        // Add indentation
        const lines = formatted.split('\n');
        let indentLevel = 0;
        const indentedLines = lines.map((line) => {
            const upperLine = line.toUpperCase();

            // Top-level clause keywords reset to no indent
            if (
                upperLine.startsWith('SELECT') ||
                upperLine.startsWith('FROM') ||
                upperLine.startsWith('WHERE') ||
                upperLine.startsWith('ORDER BY') ||
                upperLine.startsWith('GROUP BY') ||
                upperLine.startsWith('HAVING') ||
                upperLine.startsWith('UNION') ||
                upperLine.startsWith('INSERT') ||
                upperLine.startsWith('UPDATE') ||
                upperLine.startsWith('DELETE') ||
                upperLine.startsWith('CREATE') ||
                upperLine.startsWith('ALTER') ||
                upperLine.startsWith('DROP')
            ) {
                indentLevel = 0;
            } else if (upperLine.includes('JOIN')) {
                indentLevel = 1;
            } else if (
                upperLine.startsWith('AND') ||
                upperLine.startsWith('OR') ||
                upperLine.startsWith('ON') ||
                upperLine.startsWith('SET') ||
                upperLine.startsWith('VALUES') ||
                upperLine.startsWith('WHEN') ||
                upperLine.startsWith('THEN') ||
                upperLine.startsWith('ELSE') ||
                upperLine.startsWith('END')
            ) {
                indentLevel = 1;
            }

            return '  '.repeat(indentLevel) + line;
        });

        return indentedLines.join('\n');
    }

    public dispose() {
        FormatterPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(): string {
        const webview = this._panel.webview;
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Data Formatter</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 12px 20px;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 20px;
        }

        h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-icon {
            width: 24px;
            height: 24px;
            color: #3794ff;
        }

        .controls {
            display: flex;
            gap: 15px;
            align-items: center;
            flex: 1;
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

        select, input[type="number"] {
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 12px;
        }

        select:focus, input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        input[type="number"] {
            width: 50px;
        }

        .button-group {
            display: flex;
            gap: 8px;
            margin-left: auto;
        }

        button {
            padding: 5px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, var(--vscode-input-border));
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button.secondary svg.btn-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
            flex-shrink: 0;
        }

        /* Split screen container */
        .split-container {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        .pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .pane-header {
            padding: 8px 16px;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }

        .pane-content {
            flex: 1;
            overflow: hidden;
            padding: 0;
        }

        textarea {
            width: 100%;
            height: 100%;
            padding: 16px;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 19px;
            background-color: #1e1e1e;
            color: #d4d4d4;
            border: none;
            resize: none;
            outline: none;
        }

        textarea::placeholder {
            color: #6a6a6a;
        }

        textarea:focus {
            outline: none;
        }

        #output-text {
            background-color: #252526;
        }

        /* Resizer */
        .resizer {
            width: 4px;
            cursor: col-resize;
            background: var(--vscode-panel-border);
            transition: background 0.2s;
        }

        .resizer:hover {
            background: var(--vscode-focusBorder);
        }

        /* Status bar */
        .status-bar {
            padding: 4px 16px;
            background-color: #1e1e1e;
            border-top: 1px solid var(--vscode-panel-border);
            font-size: 11px;
            color: #cccccc;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-icon {
            width: 12px;
            height: 12px;
        }

        .status-icon.success {
            color: #00C853;
        }

        .status-icon.error {
            color: #f44336;
        }

        #message {
            margin-left: auto;
        }

        #message.error {
            color: var(--vscode-errorForeground);
        }

        #message.success {
            color: var(--vscode-charts-green);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <svg class="header-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 7h16v2H4V7zm0 4h10v2H4v-2zm0 4h16v2H4v-2zm14-4h2v2h-2v-2z"/>
                <rect x="16" y="11" width="4" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Data Formatter
        </h1>
        <div class="controls">
            <div class="control-group">
                <label for="format-type">Type:</label>
                <select id="format-type">
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                    <option value="sql">SQL</option>
                </select>
            </div>

            <div class="control-group">
                <label for="indent-size">Indent:</label>
                <input type="number" id="indent-size" min="1" max="8" value="2">
            </div>
        </div>

        <div class="button-group">
            <button id="format-btn">Format</button>
            <button id="minify-btn">Minify</button>
            <button id="copy-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy Output</button>
            <button id="clear-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear All</button>
        </div>
    </div>

    <div class="split-container">
        <!-- Left Pane: Input -->
        <div class="pane">
            <div class="pane-header">INPUT</div>
            <div class="pane-content">
                <textarea id="input-text" placeholder="Paste your JSON, XML, or SQL here..."></textarea>
            </div>
        </div>

        <!-- Resizer -->
        <div class="resizer" id="resizer"></div>

        <!-- Right Pane: Output -->
        <div class="pane">
            <div class="pane-header">OUTPUT</div>
            <div class="pane-content">
                <textarea id="output-text" readonly placeholder="Formatted result will appear here..."></textarea>
            </div>
        </div>
    </div>

    <div class="status-bar">
        <div class="status-item">
            <span id="input-stats">0 lines, 0 chars</span>
        </div>
        <div class="status-item">
            <span>→</span>
        </div>
        <div class="status-item">
            <span id="output-stats">0 lines, 0 chars</span>
        </div>
        <div id="message"></div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const formatType = document.getElementById('format-type');
        const indentSize = document.getElementById('indent-size');
        const inputText = document.getElementById('input-text');
        const outputText = document.getElementById('output-text');
        const formatBtn = document.getElementById('format-btn');
        const minifyBtn = document.getElementById('minify-btn');
        const copyBtn = document.getElementById('copy-btn');
        const clearBtn = document.getElementById('clear-btn');
        const message = document.getElementById('message');
        const inputStats = document.getElementById('input-stats');
        const outputStats = document.getElementById('output-stats');
        const resizer = document.getElementById('resizer');

        let isResizing = false;

        // Update stats
        function updateStats() {
            const inputLines = inputText.value.split('\\n').length;
            const inputChars = inputText.value.length;
            inputStats.textContent = \`\${inputLines} lines, \${inputChars} chars\`;

            const outputLines = outputText.value.split('\\n').length;
            const outputChars = outputText.value.length;
            outputStats.textContent = \`\${outputLines} lines, \${outputChars} chars\`;
        }

        inputText.addEventListener('input', updateStats);

        formatType.addEventListener('change', () => {
            const isSql = formatType.value === 'sql';
            indentSize.disabled = isSql;
            minifyBtn.disabled = isSql;
        });

        formatBtn.addEventListener('click', () => {
            const text = inputText.value.trim();
            if (!text) {
                showMessage('Please enter data to format', 'error');
                return;
            }

            const type = formatType.value;
            const indent = parseInt(indentSize.value);

            switch (type) {
                case 'json':
                    vscode.postMessage({
                        command: 'formatJSON',
                        text: text,
                        indent: indent
                    });
                    break;
                case 'xml':
                    vscode.postMessage({
                        command: 'formatXML',
                        text: text,
                        indent: indent
                    });
                    break;
                case 'sql':
                    vscode.postMessage({
                        command: 'formatSQL',
                        text: text
                    });
                    break;
            }
        });

        minifyBtn.addEventListener('click', () => {
            const text = inputText.value.trim();
            if (!text) {
                showMessage('Please enter data to minify', 'error');
                return;
            }

            const type = formatType.value;
            if (type === 'sql') {
                showMessage('Minify is not available for SQL', 'error');
                return;
            }

            switch (type) {
                case 'json':
                    vscode.postMessage({
                        command: 'minifyJSON',
                        text: text
                    });
                    break;
                case 'xml':
                    vscode.postMessage({
                        command: 'minifyXML',
                        text: text
                    });
                    break;
            }
        });

        copyBtn.addEventListener('click', () => {
            if (!outputText.value) {
                showMessage('No output to copy', 'error');
                return;
            }
            navigator.clipboard.writeText(outputText.value).then(() => {
                showMessage('Copied to clipboard!', 'success');
            });
        });

        clearBtn.addEventListener('click', () => {
            inputText.value = '';
            outputText.value = '';
            message.textContent = '';
            updateStats();
        });

        // Resizer logic
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
        });

        function handleResize(e) {
            if (!isResizing) return;
            const container = document.querySelector('.split-container');
            const containerWidth = container.offsetWidth;
            const newWidth = (e.clientX / containerWidth) * 100;
            if (newWidth > 20 && newWidth < 80) {
                const panes = document.querySelectorAll('.pane');
                panes[0].style.width = newWidth + '%';
                panes[1].style.width = (100 - newWidth) + '%';
            }
        }

        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'formatResult':
                    outputText.value = msg.result;
                    showMessage('Formatting completed successfully!', 'success');
                    updateStats();
                    break;
                case 'error':
                    showMessage(msg.message, 'error');
                    break;
            }
        });

        function showMessage(text, type) {
            message.textContent = text;
            message.className = type;
            setTimeout(() => {
                message.textContent = '';
                message.className = '';
            }, 3000);
        }

        // Initialize stats
        updateStats();
    </script>
</body>
</html>`;
    }
}
