import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getAesKeyIdentifiers } from '../../providers';

export class MulesoftAesEncryptDecryptPanel {
    public static currentPanel: MulesoftAesEncryptDecryptPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _context: vscode.ExtensionContext;

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._context = context;

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._initHtml();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'encrypt':
                        this.handleEncrypt(message.text, message.key);
                        return;
                    case 'decrypt':
                        this.handleDecrypt(message.text, message.key);
                        return;
                    case 'loadKeyIdentifiers':
                        this._initHtml();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(context: vscode.ExtensionContext) {
        const column = vscode.ViewColumn.One;
        const extensionUri = context.extensionUri;

        if (MulesoftAesEncryptDecryptPanel.currentPanel) {
            MulesoftAesEncryptDecryptPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mulesoftAesEncryptDecrypt',
            'Mulesoft AES Encrypt / Decrypt',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'aes.svg');
        MulesoftAesEncryptDecryptPanel.currentPanel = new MulesoftAesEncryptDecryptPanel(panel, context);
    }

    private handleEncrypt(text: string, key: string) {
        try {
            // MuleSoft format: Use first 16 characters of key as IV
            if (key.length < 16) {
                throw new Error('Key must be at least 16 characters long');
            }

            const ivString = key.substring(0, 16);
            const iv = Buffer.from(ivString, 'utf8');
            const keyBuffer = Buffer.from(key, 'utf8');

            // Use AES-128-CBC or AES-256-CBC based on key length
            const algorithm =
                keyBuffer.length === 16 ? 'aes-128-cbc' : keyBuffer.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';

            const cipher = crypto.createCipheriv(
                algorithm,
                keyBuffer.slice(0, algorithm === 'aes-256-cbc' ? 32 : 16),
                iv
            );

            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');

            // Wrap in MuleSoft format: ![base64]
            const result = `![${encrypted}]`;

            this._panel.webview.postMessage({
                command: 'encryptResult',
                result: result,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Encryption error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleDecrypt(text: string, key: string) {
        try {
            if (key.length < 16) {
                throw new Error('Key must be at least 16 characters long');
            }

            // Remove MuleSoft wrapper ![...] if present
            let encryptedText = text.trim();
            if (encryptedText.startsWith('![') && encryptedText.endsWith(']')) {
                encryptedText = encryptedText.substring(2, encryptedText.length - 1);
            }

            // Use first 16 characters of key as IV
            const ivString = key.substring(0, 16);
            const iv = Buffer.from(ivString, 'utf8');
            const keyBuffer = Buffer.from(key, 'utf8');

            // Use AES-128-CBC or AES-256-CBC based on key length
            const algorithm =
                keyBuffer.length === 16 ? 'aes-128-cbc' : keyBuffer.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';

            const decipher = crypto.createDecipheriv(
                algorithm,
                keyBuffer.slice(0, algorithm === 'aes-256-cbc' ? 32 : 16),
                iv
            );

            let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            this._panel.webview.postMessage({
                command: 'decryptResult',
                result: decrypted,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Decryption error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    public dispose() {
        MulesoftAesEncryptDecryptPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    public refreshKeyIdentifiers(): void {
        this._initHtml();
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private maskKeyForDisplay(key: string): string {
        if (key.length <= 8) {
            return '*'.repeat(key.length);
        }

        return `${key.substring(0, 5)}${'*'.repeat(key.length - 8)}${key.substring(key.length - 3)}`;
    }

    private async _initHtml(): Promise<void> {
        const webview = this._panel.webview;
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const keyIdentifiers = await getAesKeyIdentifiers(this._context);
        const firstKey = keyIdentifiers[0]?.key ?? '';
        const firstKeyMasked = this.maskKeyForDisplay(firstKey);
        const keyIdentifierOptions = keyIdentifiers
            .map(
                (keyIdentifier, index) =>
                    `<option value="${this.escapeHtml(keyIdentifier.key)}"${index === 0 ? ' selected' : ''}>${this.escapeHtml(keyIdentifier.keyIdentifier)}</option>`
            )
            .join('');

        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="${csp}">
            <title>MuleSoft Secure Properties</title>
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
                    width: 32px;
                    height: 32px;
                }
                .input-group {
                    margin-bottom: 20px;
                }
                .key-row {
                    display: flex;
                    gap: 10px;
                    align-items: flex-end;
                }
                .key-input {
                    flex: 1;
                    position: relative;
                }
                .key-input-wrapper {
                    position: relative;
                    display: flex;
                    gap: 5px;
                }
                .toggle-visibility {
                    padding: 8px 12px;
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 1px solid var(--vscode-input-border);
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    white-space: nowrap;
                    min-width: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .toggle-visibility:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .toggle-visibility svg {
                    width: 18px;
                    height: 18px;
                    fill: currentColor;
                }
                .keyidentifier-select {
                    width: 150px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                textarea, input[type="text"], input[type="password"], select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-font-family);
                    box-sizing: border-box;
                    resize: vertical;
                }
                textarea {
                    min-height: 100px;
                    font-family: 'Courier New', monospace;
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
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
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
            </style>
        </head>
        <body>
            <div class="container">
                <h2>
                    <svg class="header-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L4 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-8-3z" fill="#4CAF50" opacity="0.9"/>
                        <path d="M12 2L4 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-8-3z" fill="none" stroke="#2E7D32" stroke-width="0.5"/>
                        <text x="12" y="13" font-family="Arial, sans-serif" font-size="6" font-weight="bold" fill="white" text-anchor="middle">AES</text>
                        <rect x="9" y="15" width="6" height="4" rx="0.5" fill="#FFC107"/>
                        <path d="M10.5 15v-1.5a1.5 1.5 0 0 1 3 0V15" fill="none" stroke="#FFC107" stroke-width="1"/>
                    </svg>
                    MuleSoft Secure Properties
                </h2>

                <div class="info">
                    <strong>Note:</strong> This tool uses AES/CBC/PKCS5 encryption compatible with MuleSoft secure configuration properties.
                    Encrypted values are wrapped in ![...] format.
                </div>

                <div class="input-group">
                    <div class="key-row">
                        <div class="key-input">
                            <label for="key">Encryption Key (min 16 chars, 32 for AES-256):</label>
                            <div class="key-input-wrapper">
                                <input type="text" id="key" placeholder="Enter your encryption key" value="${this.escapeHtml(firstKeyMasked)}" />
                                <button type="button" id="toggleKeyVisibility" class="toggle-visibility" title="Hide key">
                                    <svg id="eyeIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="keyidentifier-select">
                            <label for="keyIdentifier">KeyIdentifier:</label>
                            <select id="keyIdentifier">
                                <option value="">Custom</option>
                                ${keyIdentifierOptions}
                            </select>
                        </div>
                    </div>
                </div>

                <div class="input-group">
                    <label for="input">Input Text:</label>
                    <textarea id="input" placeholder="Enter text to encrypt or encrypted text (![...]) to decrypt"></textarea>
                </div>

                <div class="button-group">
                    <button id="encryptBtn">Encrypt</button>
                    <button id="decryptBtn">Decrypt</button>
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

                const keyInput = document.getElementById('key');
                const keyIdentifierSelect = document.getElementById('keyIdentifier');
                const inputText = document.getElementById('input');
                const outputText = document.getElementById('output');
                const messageDiv = document.getElementById('message');
                const toggleKeyBtn = document.getElementById('toggleKeyVisibility');

                let isKeyVisible = true;
                let isKeyIdentifierSelected = false;
                let actualKeyValue = '';

                // SVG icons
                const eyeOpenIcon = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                const eyeClosedIcon = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';

                // Function to mask key (show first 5 and last 3 chars)
                function maskKey(key) {
                    if (key.length <= 8) {
                        return '*'.repeat(key.length);
                    }
                    const first5 = key.substring(0, 5);
                    const last3 = key.substring(key.length - 3);
                    const middleMask = '*'.repeat(key.length - 8);
                    return first5 + middleMask + last3;
                }

                function updateToggleButton() {
                    if (isKeyIdentifierSelected) {
                        toggleKeyBtn.disabled = true;
                        toggleKeyBtn.innerHTML = eyeClosedIcon;
                        toggleKeyBtn.title = 'KeyIdentifier key is masked';
                        return;
                    }

                    toggleKeyBtn.disabled = false;
                    toggleKeyBtn.innerHTML = isKeyVisible ? eyeOpenIcon : eyeClosedIcon;
                    toggleKeyBtn.title = isKeyVisible ? 'Hide key' : 'Show key';
                }

                function applyKeyIdentifierSelection(selectedKey) {
                    if (selectedKey) {
                        isKeyIdentifierSelected = true;
                        isKeyVisible = false;
                        actualKeyValue = selectedKey;
                        keyInput.value = maskKey(selectedKey);
                    } else {
                        isKeyIdentifierSelected = false;
                        isKeyVisible = true;
                        actualKeyValue = '';
                        keyInput.value = '';
                    }

                    updateToggleButton();
                }

                function switchToCustomModeForTyping() {
                    if (!isKeyIdentifierSelected) {
                        return;
                    }

                    keyIdentifierSelect.value = '';
                    isKeyIdentifierSelected = false;
                    isKeyVisible = true;
                    actualKeyValue = '';
                    keyInput.value = '';
                    updateToggleButton();
                }

                applyKeyIdentifierSelection(keyIdentifierSelect.value);

                // Toggle key visibility
                toggleKeyBtn.addEventListener('click', () => {
                    if (isKeyIdentifierSelected) {
                        return;
                    }

                    if (isKeyVisible) {
                        // Hide key
                        actualKeyValue = keyInput.value;
                        if (actualKeyValue) {
                            keyInput.value = maskKey(actualKeyValue);
                        }
                        isKeyVisible = false;
                    } else {
                        // Show key
                        keyInput.value = actualKeyValue;
                        isKeyVisible = true;
                    }

                    updateToggleButton();
                });

                // Track actual value when typing (if visible)
                keyInput.addEventListener('input', () => {
                    if (isKeyVisible) {
                        actualKeyValue = keyInput.value;
                    }
                });

                // Prevent editing when masked
                keyInput.addEventListener('keydown', (e) => {
                    if (isKeyIdentifierSelected) {
                        const isCharacterInput = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
                        const isDeleteKey = e.key === 'Backspace' || e.key === 'Delete';

                        if (isCharacterInput || isDeleteKey) {
                            switchToCustomModeForTyping();

                            if (isDeleteKey) {
                                e.preventDefault();
                            }
                        }

                        return;
                    }

                    if (!isKeyVisible) {
                        // Allow delete/backspace to clear, but prevent other edits
                        if (e.key === 'Backspace' || e.key === 'Delete') {
                            actualKeyValue = '';
                            keyInput.value = '';
                        } else if (e.key.length === 1) {
                            e.preventDefault();
                        }
                    }
                });

                keyInput.addEventListener('paste', () => {
                    if (isKeyIdentifierSelected) {
                        switchToCustomModeForTyping();
                    }
                });

                // Handle keyIdentifier selection
                keyIdentifierSelect.addEventListener('change', () => {
                    const selectedKey = keyIdentifierSelect.value;
                    applyKeyIdentifierSelection(selectedKey);
                });

                document.getElementById('encryptBtn').addEventListener('click', () => {
                    const key = isKeyVisible ? keyInput.value : actualKeyValue;
                    const text = inputText.value;

                    if (!key || !text) {
                        showError('Please enter both key and text');
                        return;
                    }

                    if (key.length < 16) {
                        showError('Key must be at least 16 characters long');
                        return;
                    }

                    vscode.postMessage({
                        command: 'encrypt',
                        key: key,
                        text: text
                    });
                });

                document.getElementById('decryptBtn').addEventListener('click', () => {
                    const key = isKeyVisible ? keyInput.value : actualKeyValue;
                    const text = inputText.value;

                    if (!key || !text) {
                        showError('Please enter both key and text');
                        return;
                    }

                    if (key.length < 16) {
                        showError('Key must be at least 16 characters long');
                        return;
                    }

                    vscode.postMessage({
                        command: 'decrypt',
                        key: key,
                        text: text
                    });
                });

                document.getElementById('clearBtn').addEventListener('click', () => {
                    inputText.value = '';
                    outputText.value = '';
                    messageDiv.innerHTML = '';
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
                        case 'encryptResult':
                            outputText.value = message.result;
                            showSuccess('Encryption successful! Output format: ![base64]');
                            break;
                        case 'decryptResult':
                            outputText.value = message.result;
                            showSuccess('Decryption successful!');
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
