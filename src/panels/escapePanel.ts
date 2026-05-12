import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class EscapePanel {
    public static currentPanel: EscapePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'escape':
                        this.handleEscape(message.text);
                        return;
                    case 'unescape':
                        this.handleUnescape(message.text, message.tabSize);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (EscapePanel.currentPanel) {
            EscapePanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel('escapePanel', 'Format Text', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'format-text.svg');
            EscapePanel.currentPanel = new EscapePanel(panel);
        }
    }

    private handleEscape(text: string) {
        try {
            const escaped = text.replace(/[\u0000-\u001F"\\]/g, (char) => {
                switch (char) {
                    case '"':
                        return '\\"';
                    case '\\':
                        return '\\\\';
                    case '\b':
                        return '\\b';
                    case '\f':
                        return '\\f';
                    case '\n':
                        return '\\n';
                    case '\r':
                        return '\\r';
                    case '\t':
                        return '\\t';
                    default:
                        return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
                }
            });

            this._panel.webview.postMessage({
                command: 'escapeResult',
                result: escaped,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Escape failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleUnescape(text: string, tabSize: number = 2) {
        try {
            const cleaned = this.stripWrappingQuotes(text);
            const decoded = this.decodeJsonEscapes(cleaned);
            const tabReplacement = ' '.repeat(tabSize);
            const unescaped = decoded.replace(/\t/g, tabReplacement);

            this._panel.webview.postMessage({
                command: 'unescapeResult',
                result: unescaped,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({
                command: 'error',
                message: `Format failed: ${errorMessage}`,
            });
        }
    }

    private stripWrappingQuotes(text: string): string {
        if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
            return text.slice(1, -1);
        }
        return text;
    }

    private decodeJsonEscapes(input: string): string {
        let output = '';

        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            if (char !== '\\') {
                output += char;
                continue;
            }

            if (i === input.length - 1) {
                throw new Error('Invalid escape sequence: trailing backslash');
            }

            const next = input[i + 1];
            switch (next) {
                case '"':
                    output += '"';
                    i++;
                    break;
                case '\\':
                    output += '\\';
                    i++;
                    break;
                case '/':
                    output += '/';
                    i++;
                    break;
                case 'b':
                    output += '\b';
                    i++;
                    break;
                case 'f':
                    output += '\f';
                    i++;
                    break;
                case 'n':
                    output += '\n';
                    i++;
                    break;
                case 'r':
                    output += '\r';
                    i++;
                    break;
                case 't':
                    output += '\t';
                    i++;
                    break;
                case 'u': {
                    if (i + 5 >= input.length) {
                        throw new Error('Invalid unicode escape sequence: incomplete \\uXXXX token');
                    }
                    const hex = input.slice(i + 2, i + 6);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                        throw new Error(`Invalid unicode escape sequence: \\u${hex}`);
                    }
                    output += String.fromCharCode(parseInt(hex, 16));
                    i += 5;
                    break;
                }
                default:
                    throw new Error(`Invalid escape sequence: \\${next}`);
            }
        }

        return output;
    }

    public dispose() {
        EscapePanel.currentPanel = undefined;
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
    <title>Format Text</title>
    <style>
        body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            font-size: 24px;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-icon {
            width: 28px;
            height: 28px;
            color: #6a9955;
        }
        .container {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .section {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        label {
            font-weight: bold;
            font-size: 14px;
        }
        textarea {
            width: 100%;
            min-height: 150px;
            padding: 10px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            resize: vertical;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
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
        .info-box {
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            margin: 10px 0;
            font-size: 12px;
        }
        .info-box ul {
            margin: 8px 0;
            padding-left: 20px;
        }
        .info-box li {
            margin: 4px 0;
        }
        .spec-box {
            margin-top: 16px;
            padding: 14px;
            background-color: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-sideBar-background) 30%);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.5;
        }
        .spec-box h2 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        .spec-box h3 {
            margin: 12px 0 6px 0;
            font-size: 13px;
        }
        .spec-box p {
            margin: 0 0 8px 0;
        }
        .spec-box table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
        }
        .spec-box th,
        .spec-box td {
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 6px;
            text-align: left;
            vertical-align: top;
        }
        .spec-box th {
            background-color: color-mix(in srgb, var(--vscode-sideBar-background) 65%, var(--vscode-editor-background) 35%);
        }
        .spec-box code {
            font-family: var(--vscode-editor-font-family);
        }
        .spec-box ul {
            margin: 8px 0;
            padding-left: 20px;
        }
        .spec-box li {
            margin: 4px 0;
        }
        .error {
            color: var(--vscode-errorForeground);
            font-size: 12px;
            margin-top: 5px;
        }
        .success {
            color: var(--vscode-charts-green);
            font-size: 12px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <h1>
        <svg class="header-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
        Format Text
    </h1>

    <div class="container">
        <div class="section">
            <label for="input-text">Input Text:</label>
            <textarea id="input-text" placeholder="Enter text to escape or unescape..."></textarea>

            <div style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                <label for="tab-size" style="margin: 0;">Tab Size (spaces):</label>
                <select id="tab-size" style="padding: 5px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);">
                    <option value="2" selected>2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="8">8 spaces</option>
                </select>
            </div>

            <div class="button-group">
                <button id="escape-btn">Escape</button>
                <button id="unescape-btn">Unescape</button>
                <button id="clear-input-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear Input</button>
            </div>
        </div>

        <div class="section">
            <label for="output-text">Output:</label>
            <textarea id="output-text" readonly placeholder="Formatted result will appear here..."></textarea>
            <div class="button-group">
                <button id="copy-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy to Clipboard</button>
                <button id="clear-output-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear Output</button>
            </div>
            <div id="message"></div>
        </div>
    </div>

    <div class="info-box">
        <strong>Escape:</strong> Converts special characters to escape sequences (e.g., newline → \\n)
        <br><br>
        <strong>Unescape:</strong> Converts escape sequences to special characters (e.g., \\n → newline)
        <br><br>
        <strong>Supported Sequences:</strong>
        <ul>
            <li><code>\\n</code> - Newline</li>
            <li><code>\\r</code> - Carriage return</li>
            <li><code>\\t</code> - Tab</li>
            <li><code>\\f</code> - Form feed</li>
            <li><code>\\b</code> - Backspace</li>
            <li><code>\\"</code> - Double quote</li>
            <li><code>\\\\</code> - Backslash</li>
        </ul>
    </div>

    <div class="spec-box">
        <h2>JSON Escape Sequences</h2>
        <p>
            According to RFC 8259, these characters must be escaped in a JSON string:
            <code>"</code>, <code>\\</code>, and control characters from <code>U+0000</code> through <code>U+001F</code>.
        </p>
        <h3>Valid Escape Sequences</h3>
        <table>
            <thead>
                <tr>
                    <th>Escape Sequence</th>
                    <th>Character Represented</th>
                    <th>Character Code</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>\\"</code></td>
                    <td>Double quotation mark</td>
                    <td>U+0022</td>
                </tr>
                <tr>
                    <td><code>\\\\</code></td>
                    <td>Backslash (reverse solidus)</td>
                    <td>U+005C</td>
                </tr>
                <tr>
                    <td><code>\\/</code></td>
                    <td>Forward slash (solidus) - Optional</td>
                    <td>U+002F</td>
                </tr>
                <tr>
                    <td><code>\\b</code></td>
                    <td>Backspace</td>
                    <td>U+0008</td>
                </tr>
                <tr>
                    <td><code>\\f</code></td>
                    <td>Form feed</td>
                    <td>U+000C</td>
                </tr>
                <tr>
                    <td><code>\\n</code></td>
                    <td>Newline (line feed)</td>
                    <td>U+000A</td>
                </tr>
                <tr>
                    <td><code>\\r</code></td>
                    <td>Carriage return</td>
                    <td>U+000D</td>
                </tr>
                <tr>
                    <td><code>\\t</code></td>
                    <td>Horizontal tab</td>
                    <td>U+0009</td>
                </tr>
                <tr>
                    <td><code>\\uXXXX</code></td>
                    <td>Unicode character (hex code)</td>
                    <td>U+XXXX</td>
                </tr>
            </tbody>
        </table>
        <h3>Key Rules</h3>
        <ul>
            <li><strong>Forward slash:</strong> <code>\\/</code> is valid, but <code>/</code> can also be used directly.</li>
            <li><strong>Single quotes:</strong> <code>\\'</code> is not a valid JSON escape sequence.</li>
            <li><strong>Unicode:</strong> Any character can be represented as <code>\\uXXXX</code>. Non-BMP characters use UTF-16 surrogate pairs (for example, <code>\\uD83D\\uDE10</code>).</li>
        </ul>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const inputText = document.getElementById('input-text');
        const outputText = document.getElementById('output-text');
        const tabSizeSelect = document.getElementById('tab-size');
        const escapeBtn = document.getElementById('escape-btn');
        const unescapeBtn = document.getElementById('unescape-btn');
        const copyBtn = document.getElementById('copy-btn');
        const clearInputBtn = document.getElementById('clear-input-btn');
        const clearOutputBtn = document.getElementById('clear-output-btn');
        const message = document.getElementById('message');

        escapeBtn.addEventListener('click', () => {
            const text = inputText.value;
            if (!text) {
                showMessage('Please enter text to escape', 'error');
                return;
            }
            const tabSize = parseInt(tabSizeSelect.value);
            vscode.postMessage({
                command: 'escape',
                text: text,
                tabSize: tabSize
            });
        });

        unescapeBtn.addEventListener('click', () => {
            const text = inputText.value;
            if (!text) {
                showMessage('Please enter text to unescape', 'error');
                return;
            }
            const tabSize = parseInt(tabSizeSelect.value);
            vscode.postMessage({
                command: 'unescape',
                text: text,
                tabSize: tabSize
            });
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

        clearInputBtn.addEventListener('click', () => {
            inputText.value = '';
        });

        clearOutputBtn.addEventListener('click', () => {
            outputText.value = '';
            message.textContent = '';
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'escapeResult':
                    outputText.value = msg.result;
                    showMessage('Text escaped successfully!', 'success');
                    break;
                case 'unescapeResult':
                    outputText.value = msg.result;
                    showMessage('Text unescaped successfully!', 'success');
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
    </script>
</body>
</html>`;
    }
}
