import * as vscode from 'vscode';
import * as crypto from 'crypto';

export const MAX_BASE64_INPUT_BYTES = 10 * 1024 * 1024;

export function decodeBase64(value: string): Buffer {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized) {
        return Buffer.alloc(0);
    }
    if (
        normalized.length > Math.ceil((MAX_BASE64_INPUT_BYTES * 4) / 3) + 4 ||
        normalized.length % 4 === 1 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
        normalized.slice(0, -2).includes('=')
    ) {
        throw new Error('Input must be valid Base64 data.');
    }

    const unpadded = normalized.replace(/=+$/, '');
    const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64');
    if (decoded.toString('base64').replace(/=+$/, '') !== unpadded) {
        throw new Error('Input must be valid Base64 data.');
    }
    return decoded;
}

export class Base64Panel {
    public static currentPanel: Base64Panel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'encode':
                        this.handleEncode(message.text, message.isFile);
                        return;
                    case 'decode':
                        this.handleDecode(message.text, message.isFile);
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.One;

        if (Base64Panel.currentPanel) {
            Base64Panel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('base64Tool', 'Base64 Encode/Decode', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'base64.svg');
        Base64Panel.currentPanel = new Base64Panel(panel);
    }

    private handleEncode(text: string, isFile: boolean = false) {
        try {
            let encoded: string;
            if (isFile) {
                // Text is already base64 from file reader
                if (text.length > Math.ceil((MAX_BASE64_INPUT_BYTES * 4) / 3) + 4) {
                    throw new Error('File exceeds the 10 MB limit.');
                }
                encoded = text;
            } else {
                if (Buffer.byteLength(text, 'utf8') > MAX_BASE64_INPUT_BYTES) {
                    throw new Error('Text exceeds the 10 MB limit.');
                }
                encoded = Buffer.from(text, 'utf8').toString('base64');
            }
            this._panel.webview.postMessage({
                command: 'encodeResult',
                result: encoded,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Encoding error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleDecode(text: string, isFile: boolean = false) {
        try {
            const decoded = decodeBase64(text).toString('utf8');
            this._panel.webview.postMessage({
                command: 'decodeResult',
                result: decoded,
                isFile: isFile,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Decoding error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    public dispose() {
        Base64Panel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="${csp}">
            <title>Base64 Encode/Decode</title>
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                }
                .container {
                    max-width: 900px;
                    margin: 0 auto;
                }
                h2 {
                    margin-top: 0;
                    color: var(--vscode-foreground);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .header-icon {
                    width: 28px;
                    height: 28px;
                    color: #3794ff;
                }
                .input-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                textarea {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: 'Courier New', monospace;
                    box-sizing: border-box;
                    resize: vertical;
                    min-height: 120px;
                }
                .button-group {
                    margin: 20px 0;
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                button {
                    padding: 10px 20px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
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
                .result {
                    margin-top: 20px;
                }
                .result-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    margin-top: 10px;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }
                .success {
                    color: var(--vscode-terminal-ansiGreen);
                    margin-top: 10px;
                    padding: 8px;
                }
                .info {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 10px;
                    margin: 10px 0;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                .file-upload-area {
                    border: 2px dashed var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 30px;
                    text-align: center;
                    background-color: var(--vscode-editor-background);
                    margin-bottom: 20px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .file-upload-area:hover {
                    border-color: var(--vscode-textLink-foreground);
                    background-color: var(--vscode-textBlockQuote-background);
                }
                .file-upload-area.drag-over {
                    border-color: var(--vscode-textLink-foreground);
                    background-color: var(--vscode-textBlockQuote-background);
                }
                .file-info {
                    margin-top: 10px;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .mode-toggle {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .mode-btn {
                    flex: 1;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    cursor: pointer;
                }
                .mode-btn.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: var(--vscode-button-background);
                }
                #fileInput {
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>
                    <svg class="header-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5L13.5 3z" fill="#3794ff" fill-opacity="0.16" stroke="#3794ff" stroke-width="1.6" stroke-linejoin="round"/>
                        <path d="M13.5 3v4a1.5 1.5 0 0 0 1.5 1.5h4" stroke="#3794ff" stroke-width="1.6" stroke-linejoin="round"/>
                        <rect x="7.6" y="11.4" width="2.2" height="2.2" rx="0.5" fill="#1e6bb8"/>
                        <rect x="11" y="11.4" width="2.2" height="2.2" rx="0.5" fill="#3794ff" fill-opacity="0.45"/>
                        <rect x="14.4" y="11.4" width="2.2" height="2.2" rx="0.5" fill="#1e6bb8"/>
                        <rect x="7.6" y="14.8" width="2.2" height="2.2" rx="0.5" fill="#3794ff" fill-opacity="0.45"/>
                        <rect x="11" y="14.8" width="2.2" height="2.2" rx="0.5" fill="#1e6bb8"/>
                        <rect x="14.4" y="14.8" width="2.2" height="2.2" rx="0.5" fill="#3794ff" fill-opacity="0.45"/>
                    </svg>
                    Base64 Encode/Decode
                </h2>

                <div class="info">
                    <strong>Base64</strong> is a binary-to-text encoding scheme that represents binary data in ASCII string format.
                    Commonly used for encoding data in URLs, emails, and data URIs.
                </div>

                <div class="mode-toggle">
                    <button class="mode-btn active" id="textModeBtn">Text Input</button>
                    <button class="mode-btn" id="fileModeBtn">File Upload</button>
                </div>

                <div id="textMode">
                    <div class="input-group">
                        <label for="input">Input Text:</label>
                        <textarea id="input" placeholder="Enter text to encode or Base64 string to decode"></textarea>
                    </div>
                </div>

                <div id="fileMode" style="display: none;">
                    <div class="file-upload-area" id="fileUploadArea">
                        <div>📁 Click to select a file or drag & drop here</div>
                        <div class="file-info" id="fileInfo"></div>
                    </div>
                    <input type="file" id="fileInput" />
                </div>

                <div class="button-group">
                    <button id="encodeBtn">Encode to Base64</button>
                    <button id="decodeBtn">Decode from Base64</button>
                    <button id="clearBtn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
                </div>

                <div class="result">
                    <div class="result-actions">
                        <label for="output">Output:</label>
                        <button id="copyBtn" class="secondary" style="padding: 5px 15px;"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy to Clipboard</button>
                    </div>
                    <textarea id="output" readonly></textarea>
                </div>

                <div id="message"></div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                const inputText = document.getElementById('input');
                const outputText = document.getElementById('output');
                const messageDiv = document.getElementById('message');
                const fileUploadArea = document.getElementById('fileUploadArea');
                const fileInput = document.getElementById('fileInput');
                const fileInfo = document.getElementById('fileInfo');
                const textMode = document.getElementById('textMode');
                const fileMode = document.getElementById('fileMode');
                const textModeBtn = document.getElementById('textModeBtn');
                const fileModeBtn = document.getElementById('fileModeBtn');
                const maxFileBytes = ${MAX_BASE64_INPUT_BYTES};

                let currentMode = 'text';
                let currentFile = null;

                // Mode toggle
                textModeBtn.addEventListener('click', () => {
                    currentMode = 'text';
                    textMode.style.display = 'block';
                    fileMode.style.display = 'none';
                    textModeBtn.classList.add('active');
                    fileModeBtn.classList.remove('active');
                    currentFile = null;
                    fileInfo.textContent = '';
                });

                fileModeBtn.addEventListener('click', () => {
                    currentMode = 'file';
                    textMode.style.display = 'none';
                    fileMode.style.display = 'block';
                    fileModeBtn.classList.add('active');
                    textModeBtn.classList.remove('active');
                });

                // File upload click
                fileUploadArea.addEventListener('click', () => {
                    fileInput.click();
                });

                // File selection
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        handleFile(file);
                    }
                });

                // Drag and drop
                fileUploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    fileUploadArea.classList.add('drag-over');
                });

                fileUploadArea.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    fileUploadArea.classList.remove('drag-over');
                });

                fileUploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    fileUploadArea.classList.remove('drag-over');
                    const file = e.dataTransfer.files[0];
                    if (file) {
                        handleFile(file);
                    }
                });

                function handleFile(file) {
                    if (file.size > maxFileBytes) {
                        currentFile = null;
                        fileInput.value = '';
                        fileInfo.textContent = '';
                        showError('File exceeds the 10 MB limit.');
                        return;
                    }
                    currentFile = file;
                    fileInfo.textContent = \`Selected: \${file.name} (\${formatFileSize(file.size)})\`;
                }

                function formatFileSize(bytes) {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
                }

                document.getElementById('encodeBtn').addEventListener('click', () => {
                    if (currentMode === 'text') {
                        const text = inputText.value;
                        if (!text) {
                            showError('Please enter text to encode');
                            return;
                        }
                        vscode.postMessage({
                            command: 'encode',
                            text: text,
                            isFile: false
                        });
                    } else {
                        if (!currentFile) {
                            showError('Please select a file');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const result = e.target && typeof e.target.result === 'string' ? e.target.result : '';
                            const commaIdx = result.indexOf(',');
                            if (commaIdx < 0) {
                                showError('Failed to read file');
                                return;
                            }
                            const base64 = result.slice(commaIdx + 1);
                            vscode.postMessage({
                                command: 'encode',
                                text: base64,
                                isFile: true
                            });
                        };
                        reader.onerror = () => {
                            showError('Failed to read file');
                        };
                        reader.readAsDataURL(currentFile);
                    }
                });

                document.getElementById('decodeBtn').addEventListener('click', () => {
                    const text = currentMode === 'text' ? inputText.value : outputText.value;

                    if (!text) {
                        showError('Please enter Base64 text to decode');
                        return;
                    }

                    vscode.postMessage({
                        command: 'decode',
                        text: text,
                        isFile: currentMode === 'file'
                    });
                });

                document.getElementById('clearBtn').addEventListener('click', () => {
                    inputText.value = '';
                    outputText.value = '';
                    messageDiv.innerHTML = '';
                    currentFile = null;
                    fileInfo.textContent = '';
                    fileInput.value = '';
                });

                document.getElementById('copyBtn').addEventListener('click', () => {
                    const output = outputText.value;
                    if (!output) {
                        showError('Nothing to copy');
                        return;
                    }

                    navigator.clipboard.writeText(output).then(() => {
                        showSuccess('Copied to clipboard!');
                    }).catch(err => {
                        showError('Failed to copy: ' + err);
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.command) {
                        case 'encodeResult':
                            outputText.value = message.result;
                            showSuccess('Successfully encoded to Base64!');
                            break;
                        case 'decodeResult':
                            outputText.value = message.result;
                            showSuccess('Successfully decoded from Base64!');
                            break;
                        case 'error':
                            showError(message.message);
                            break;
                    }
                });

                function showError(msg) {
                    messageDiv.className = 'error';
                    messageDiv.textContent = msg;
                }

                function showSuccess(msg) {
                    messageDiv.className = 'success';
                    messageDiv.textContent = msg;
                }
            </script>
        </body>
        </html>`;
    }
}
