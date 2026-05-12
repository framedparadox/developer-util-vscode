import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class JWTPanel {
    public static currentPanel: JWTPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'decode':
                        this.handleDecode(message.token);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.One;

        if (JWTPanel.currentPanel) {
            JWTPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('jwtDebugger', 'JWT Debugger', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'jwt.svg');
        JWTPanel.currentPanel = new JWTPanel(panel);
    }

    private handleDecode(token: string) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT token format. Expected 3 parts separated by dots.');
            }

            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            const signature = parts[2];

            // Check expiration
            let isExpired = false;
            let expirationInfo = '';
            if (payload.exp) {
                const expDate = new Date(payload.exp * 1000);
                isExpired = expDate < new Date();
                expirationInfo = `Expires: ${expDate.toLocaleString()} (${isExpired ? 'EXPIRED' : 'Valid'})`;
            }

            this._panel.webview.postMessage({
                command: 'decodeResult',
                header: JSON.stringify(header, null, 2),
                payload: JSON.stringify(payload, null, 2),
                signature: signature,
                isExpired: isExpired,
                expirationInfo: expirationInfo,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Decoding error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    public dispose() {
        JWTPanel.currentPanel = undefined;
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
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="${csp}">
            <title>JWT Debugger</title>
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                }
                .container {
                    max-width: 1000px;
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
                    color: #ce9178;
                }
                h3 {
                    color: var(--vscode-foreground);
                    margin-top: 20px;
                    margin-bottom: 10px;
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
                }
                #tokenInput {
                    min-height: 80px;
                }
                .decoded-section {
                    min-height: 200px;
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
                .decoded-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-top: 20px;
                }
                @media (max-width: 768px) {
                    .decoded-grid {
                        grid-template-columns: 1fr;
                    }
                }
                .decoded-box {
                    border: 1px solid var(--vscode-input-border);
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                }
                .signature-box {
                    grid-column: 1 / -1;
                    word-break: break-all;
                }
                .copy-btn-small {
                    padding: 4px 10px;
                    font-size: 0.9em;
                    float: right;
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
                .warning {
                    color: var(--vscode-inputValidation-warningForeground);
                    background-color: var(--vscode-inputValidation-warningBackground);
                    border: 1px solid var(--vscode-inputValidation-warningBorder);
                    padding: 8px;
                    margin: 10px 0;
                }
                .info {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 10px;
                    margin: 10px 0;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                .expiration-badge {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 0.9em;
                    margin-left: 10px;
                }
                .expired {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    color: var(--vscode-errorForeground);
                }
                .valid {
                    background-color: var(--vscode-terminal-ansiGreen);
                    color: var(--vscode-editor-background);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>
                    <svg class="header-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                    </svg>
                    JWT Debugger
                </h2>

                <div class="info">
                    <strong>JWT (JSON Web Token)</strong> is a compact, URL-safe means of representing claims to be transferred between two parties.
                    Paste your JWT token below to decode and inspect its header, payload, and signature.
                </div>

                <div class="input-group">
                    <label for="tokenInput">JWT Token:</label>
                    <textarea id="tokenInput" placeholder="Paste your JWT token here (e.g., eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c)"></textarea>
                </div>

                <div class="button-group">
                    <button id="decodeBtn">Decode JWT</button>
                    <button id="clearBtn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
                </div>

                <div id="message"></div>

                <div id="decodedSection" style="display: none;">
                    <div class="decoded-grid">
                        <div class="decoded-box">
                            <h3>Header <button class="copy-btn-small secondary" data-copy="header"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy</button></h3>
                            <textarea id="headerOutput" readonly class="decoded-section"></textarea>
                        </div>
                        <div class="decoded-box">
                            <h3>Payload <button class="copy-btn-small secondary" data-copy="payload"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy</button></h3>
                            <textarea id="payloadOutput" readonly class="decoded-section"></textarea>
                        </div>
                        <div class="decoded-box signature-box">
                            <h3>Signature <button class="copy-btn-small secondary" data-copy="signature"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy</button></h3>
                            <textarea id="signatureOutput" readonly style="min-height: 60px;"></textarea>
                        </div>
                    </div>
                    <div id="expirationInfo"></div>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                const tokenInput = document.getElementById('tokenInput');
                const messageDiv = document.getElementById('message');
                const decodedSection = document.getElementById('decodedSection');
                const headerOutput = document.getElementById('headerOutput');
                const payloadOutput = document.getElementById('payloadOutput');
                const signatureOutput = document.getElementById('signatureOutput');
                const expirationInfo = document.getElementById('expirationInfo');

                document.getElementById('decodeBtn').addEventListener('click', () => {
                    const token = tokenInput.value.trim();

                    if (!token) {
                        showError('Please enter a JWT token');
                        return;
                    }

                    vscode.postMessage({
                        command: 'decode',
                        token: token
                    });
                });

                document.getElementById('clearBtn').addEventListener('click', () => {
                    tokenInput.value = '';
                    headerOutput.value = '';
                    payloadOutput.value = '';
                    signatureOutput.value = '';
                    messageDiv.replaceChildren();
                    expirationInfo.replaceChildren();
                    decodedSection.style.display = 'none';
                });

                function copyToClipboard(section) {
                    let text = '';
                    if (section === 'header') text = headerOutput.value;
                    else if (section === 'payload') text = payloadOutput.value;
                    else if (section === 'signature') text = signatureOutput.value;

                    if (!text) return;

                    navigator.clipboard.writeText(text).then(() => {
                        showSuccess('Copied to clipboard!');
                    }).catch(err => {
                        showError('Failed to copy: ' + err);
                    });
                }

                document.querySelectorAll('button[data-copy]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        copyToClipboard(btn.getAttribute('data-copy'));
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.command) {
                        case 'decodeResult':
                            headerOutput.value = message.header;
                            payloadOutput.value = message.payload;
                            signatureOutput.value = message.signature;
                            decodedSection.style.display = 'block';

                            if (message.expirationInfo) {
                                const badgeClass = message.isExpired ? 'expired' : 'valid';
                                const wrapper = document.createElement('div');
                                wrapper.className = 'warning';
                                const label = document.createElement('strong');
                                label.textContent = 'Token Expiration: ';
                                const text = document.createTextNode(message.expirationInfo);
                                const badge = document.createElement('span');
                                badge.className = 'expiration-badge ' + badgeClass;
                                badge.textContent = message.isExpired ? 'EXPIRED' : 'VALID';
                                wrapper.appendChild(label);
                                wrapper.appendChild(text);
                                wrapper.appendChild(badge);
                                expirationInfo.replaceChildren(wrapper);
                            } else {
                                expirationInfo.replaceChildren();
                            }

                            showSuccess('JWT token successfully decoded!');
                            break;
                        case 'error':
                            showError(message.message);
                            decodedSection.style.display = 'none';
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
