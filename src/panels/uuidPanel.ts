import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class UUIDPanel {
    public static currentPanel: UUIDPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    // Monotonic state for UUID v1 so values generated within the same
    // millisecond remain unique and time-ordered.
    private _v1LastMs = 0n;
    private _v1Counter = 0n;

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'generateUUID1':
                        this.generateUUID1();
                        return;
                    case 'generateUUID4':
                        this.generateUUID4();
                        return;
                    case 'generateUUID7':
                        this.generateUUID7();
                        return;
                    case 'generateNull':
                        this.generateNullUUID();
                        return;
                    case 'generateBulk':
                        this.generateBulk(message.count, message.type);
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.One;

        if (UUIDPanel.currentPanel) {
            UUIDPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('uuidGenerator', 'UUID Generator', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'uuid.svg');
        UUIDPanel.currentPanel = new UUIDPanel(panel);
    }

    private generateUUID1() {
        // UUID v1 (timestamp-based)
        const uuid = this.uuidv1();
        this._panel.webview.postMessage({
            command: 'result',
            uuid: uuid,
            type: 'UUID v1',
        });
    }

    private generateUUID4() {
        // UUID v4 (random)
        const uuid = crypto.randomUUID();
        this._panel.webview.postMessage({
            command: 'result',
            uuid: uuid,
            type: 'UUID v4',
        });
    }

    private generateUUID7() {
        // UUID v7 (timestamp-based, sortable)
        const uuid = this.uuidv7();
        this._panel.webview.postMessage({
            command: 'result',
            uuid: uuid,
            type: 'UUID v7',
        });
    }

    private generateNullUUID() {
        const uuid = '00000000-0000-0000-0000-000000000000';
        this._panel.webview.postMessage({
            command: 'result',
            uuid: uuid,
            type: 'Null UUID',
        });
    }

    private generateBulk(count: number, type: string) {
        // Never trust the count coming from the webview: a crafted or buggy
        // message could send a non-integer or an enormous value and freeze the
        // extension host. Clamp to the same 1–1000 range the UI enforces.
        if (!Number.isInteger(count) || count < 1) {
            this._panel.webview.postMessage({
                command: 'error',
                message: 'Bulk count must be an integer between 1 and 1000.',
            });
            return;
        }
        const safeCount = Math.min(count, 1000);

        if (type !== 'v1' && type !== 'v4' && type !== 'v7') {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Unsupported UUID type: ${String(type)}`,
            });
            return;
        }

        const uuids: string[] = [];
        for (let i = 0; i < safeCount; i++) {
            switch (type) {
                case 'v1':
                    uuids.push(this.uuidv1());
                    break;
                case 'v4':
                    uuids.push(crypto.randomUUID());
                    break;
                case 'v7':
                    uuids.push(this.uuidv7());
                    break;
            }
        }
        this._panel.webview.postMessage({
            command: 'bulkResult',
            uuids: uuids.join('\n'),
            count: safeCount,
            type: type,
        });
    }

    // UUID v1 implementation (RFC 4122, section 4.5: random node ID)
    private uuidv1(): string {
        const nowMs = BigInt(Date.now());
        // Bump a sub-millisecond counter so multiple UUIDs minted in the same
        // millisecond stay unique and ordered. Each tick = 100 ns; cap the
        // counter at the 10000 ticks that fit in one millisecond.
        if (nowMs > this._v1LastMs) {
            this._v1LastMs = nowMs;
            this._v1Counter = 0n;
        } else {
            this._v1Counter += 1n;
            if (this._v1Counter >= 10000n) {
                // Exhausted this millisecond; advance time to the next one.
                this._v1LastMs += 1n;
                this._v1Counter = 0n;
            }
        }

        const timestamp = this._v1LastMs * 10000n + this._v1Counter + 0x01b21dd213814000n;

        const timeLow = (timestamp & 0xffffffffn).toString(16).padStart(8, '0');
        const timeMid = ((timestamp >> 32n) & 0xffffn).toString(16).padStart(4, '0');
        const timeHi = (((timestamp >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, '0');

        const clockSeq = crypto.randomBytes(2);
        clockSeq[0] = (clockSeq[0] & 0x3f) | 0x80;

        // Random node ID: set the multicast bit (least-significant bit of the
        // first octet) to mark it as non-MAC, per RFC 4122.
        const node = crypto.randomBytes(6);
        node[0] = node[0] | 0x01;

        return `${timeLow}-${timeMid}-${timeHi}-${clockSeq.toString('hex')}-${node.toString('hex')}`;
    }

    // UUID v7 implementation
    private uuidv7(): string {
        const timestamp = Date.now();
        // 48-bit timestamp split into: 32 high bits, then 16 low bits
        const timeHex = timestamp.toString(16).padStart(12, '0');
        const timeLow32 = timeHex.substring(0, 8);
        const timeMid16 = timeHex.substring(8, 12);

        const randBytes = crypto.randomBytes(10);
        // version nibble (7) occupies top 4 bits of the 3rd group
        const ver =
            ((randBytes[0] & 0x0f) | 0x70).toString(16).padStart(2, '0') + randBytes[1].toString(16).padStart(2, '0');
        // variant bits (10xx) for the 4th group
        randBytes[2] = (randBytes[2] & 0x3f) | 0x80;
        const variant = randBytes.toString('hex', 2, 4);
        const node = randBytes.toString('hex', 4, 10);

        return `${timeLow32}-${timeMid16}-${ver}-${variant}-${node}`;
    }

    public dispose() {
        UUIDPanel.currentPanel = undefined;
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
            <title>UUID Generator</title>
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
                    color: #c586c0;
                }
                .info {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 10px;
                    margin: 10px 0 20px 0;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                .uuid-type-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 20px 0;
                }
                .uuid-card {
                    border: 1px solid var(--vscode-input-border);
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .uuid-card:hover {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-color: var(--vscode-textLink-foreground);
                }
                .uuid-card h3 {
                    margin: 0 0 5px 0;
                    font-size: 1.1em;
                    color: var(--vscode-foreground);
                }
                .uuid-card p {
                    margin: 0;
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                }
                .result-section {
                    margin: 30px 0;
                }
                .uuid-output {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    margin: 10px 0;
                }
                .uuid-display {
                    flex: 1;
                    padding: 12px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    color: var(--vscode-input-foreground);
                    font-family: 'Courier New', monospace;
                    font-size: 1.1em;
                }
                .bulk-section {
                    margin-top: 30px;
                    padding-top: 30px;
                    border-top: 1px solid var(--vscode-input-border);
                }
                .bulk-controls {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                    align-items: center;
                }
                input[type="number"], select {
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-font-family);
                }
                textarea {
                    width: 100%;
                    min-height: 150px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: 'Courier New', monospace;
                    box-sizing: border-box;
                    resize: vertical;
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
                .success {
                    color: var(--vscode-terminal-ansiGreen);
                    margin: 10px 0;
                    padding: 8px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    margin: 10px 0;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>
                    <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="#c586c0" stroke-width="1.7" stroke-linecap="round">
                        <path d="M5 9.2a8 8 0 0 1 14 0"/>
                        <path d="M7.6 10.5a5 5 0 0 1 8.8 0v2.3"/>
                        <path d="M10.2 11.5a2.4 2.4 0 0 1 4 1.8c0 2.3-.3 4-1 5.6"/>
                        <path d="M12 13.2v3.2c0 1.3-.3 2.4-.8 3.4"/>
                        <path d="M7.4 14.4c.3 2.2-.1 4-1.1 5.6"/>
                        <path d="M16.4 15.6a12 12 0 0 1-.9 4.2"/>
                    </svg>
                    UUID Generator
                </h2>

                <div class="info">
                    <strong>UUID (Universally Unique Identifier)</strong> is a 128-bit label used for information in computer systems.
                    Click on any UUID type below to generate instantly.
                </div>

                <div class="uuid-type-grid">
                    <div class="uuid-card" id="uuid1Card">
                        <h3>UUID v1</h3>
                        <p>Timestamp-based with random node ID</p>
                    </div>
                    <div class="uuid-card" id="uuid4Card">
                        <h3>UUID v4</h3>
                        <p>Random generated (most common)</p>
                    </div>
                    <div class="uuid-card" id="uuid7Card">
                        <h3>UUID v7</h3>
                        <p>Timestamp-ordered for databases</p>
                    </div>
                    <div class="uuid-card" id="nullCard">
                        <h3>Null UUID</h3>
                        <p>All zeros (00000000-...)</p>
                    </div>
                </div>

                <div class="result-section" id="resultSection" style="display: none;">
                    <h3 id="resultType">Generated UUID</h3>
                    <div class="uuid-output">
                        <div class="uuid-display" id="uuidDisplay"></div>
                        <button id="copyBtn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy</button>
                    </div>
                    <div id="message"></div>
                </div>

                <div class="bulk-section">
                    <h3>Bulk Generate</h3>
                    <div class="bulk-controls">
                        <label>Count:</label>
                        <input type="number" id="bulkCount" value="10" min="1" max="1000" style="width: 80px;">
                        <label>Type:</label>
                        <select id="bulkType">
                            <option value="v1">UUID v1</option>
                            <option value="v4" selected>UUID v4</option>
                            <option value="v7">UUID v7</option>
                        </select>
                        <button id="generateBulkBtn">Generate</button>
                        <button id="copyBulkBtn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy All</button>
                    </div>
                    <textarea id="bulkOutput" placeholder="Generated UUIDs will appear here..." readonly></textarea>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                const uuidDisplay = document.getElementById('uuidDisplay');
                const resultSection = document.getElementById('resultSection');
                const resultType = document.getElementById('resultType');
                const messageDiv = document.getElementById('message');
                const bulkOutput = document.getElementById('bulkOutput');

                // Single UUID generation
                document.getElementById('uuid1Card').addEventListener('click', () => {
                    vscode.postMessage({ command: 'generateUUID1' });
                });

                document.getElementById('uuid4Card').addEventListener('click', () => {
                    vscode.postMessage({ command: 'generateUUID4' });
                });

                document.getElementById('uuid7Card').addEventListener('click', () => {
                    vscode.postMessage({ command: 'generateUUID7' });
                });

                document.getElementById('nullCard').addEventListener('click', () => {
                    vscode.postMessage({ command: 'generateNull' });
                });

                // Copy single UUID
                document.getElementById('copyBtn').addEventListener('click', () => {
                    const uuid = uuidDisplay.textContent;
                    navigator.clipboard.writeText(uuid).then(() => {
                        showSuccess('Copied to clipboard!');
                    });
                });

                // Bulk generation
                document.getElementById('generateBulkBtn').addEventListener('click', () => {
                    const count = parseInt(document.getElementById('bulkCount').value);
                    const type = document.getElementById('bulkType').value;

                    if (count < 1 || count > 1000) {
                        alert('Count must be between 1 and 1000');
                        return;
                    }

                    vscode.postMessage({
                        command: 'generateBulk',
                        count: count,
                        type: type
                    });
                });

                // Copy bulk
                document.getElementById('copyBulkBtn').addEventListener('click', () => {
                    const text = bulkOutput.value;
                    if (!text) return;

                    navigator.clipboard.writeText(text).then(() => {
                        showSuccess('All UUIDs copied to clipboard!');
                    });
                });

                // Handle messages
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.command) {
                        case 'result':
                            uuidDisplay.textContent = message.uuid;
                            resultType.textContent = message.type + ' Generated';
                            resultSection.style.display = 'block';
                            break;
                        case 'bulkResult':
                            bulkOutput.value = message.uuids;
                            showSuccess(\`Generated \${message.count} UUIDs (\${message.type})\`);
                            break;
                        case 'error':
                            showError(message.message);
                            break;
                    }
                });

                function showSuccess(msg) {
                    messageDiv.className = 'success';
                    messageDiv.textContent = msg;
                    setTimeout(() => {
                        messageDiv.textContent = '';
                    }, 3000);
                }

                function showError(msg) {
                    messageDiv.className = 'error';
                    messageDiv.textContent = msg || 'An error occurred.';
                }
            </script>
        </body>
        </html>`;
    }
}
