import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import {
    AesDataEncoding,
    AesOperationSettings,
    decodeData,
    decryptAes,
    encodeData,
    encryptAes,
} from '../../security/aesEngine';

type AesOperation = 'encrypt' | 'decrypt';
type AesSourceType = 'text' | 'file' | 'url';
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Returns true for hostnames that resolve to loopback, link-local, or private
 * network ranges that a URL fetch must never reach (SSRF protection). Matches on
 * the URL literal only — it does not perform DNS resolution, so it catches the
 * common attack vectors (localhost, metadata IP, RFC1918 literals) without a
 * blocking lookup.
 */
function isBlockedHost(hostname: string): boolean {
    // URL hostnames keep IPv6 addresses wrapped in brackets.
    const host = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

    if (host === 'localhost' || host.endsWith('.localhost')) {
        return true;
    }

    // IPv6 loopback (::1) and unique-local / link-local ranges (fc00::/7, fe80::/10).
    if (host === '::1' || host === '::' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) {
        return true;
    }

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — strip the prefix and re-check.
    const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    const ipv4 = mapped ? mapped[1] : host;

    const octets = ipv4.split('.');
    if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
        const [a, b] = octets.map(Number);
        if (a === 127 || a === 0 || a === 10) {
            return true; // loopback, "this host", 10.0.0.0/8
        }
        if (a === 169 && b === 254) {
            return true; // link-local incl. 169.254.169.254 metadata endpoint
        }
        if (a === 172 && b >= 16 && b <= 31) {
            return true; // 172.16.0.0/12
        }
        if (a === 192 && b === 168) {
            return true; // 192.168.0.0/16
        }
    }

    return false;
}

interface ProcessAesMessage {
    command: 'processAes';
    operation: AesOperation;
    sourceType: AesSourceType;
    inputEncoding: AesDataEncoding;
    outputEncoding: AesDataEncoding;
    inputText: string;
    fileDataBase64: string;
    url: string;
    settings: AesOperationSettings;
}

export class AesEncryptDecryptPanel {
    public static currentPanel: AesEncryptDecryptPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            async (message: ProcessAesMessage) => {
                if (message.command === 'processAes') {
                    await this.handleProcessAes(message);
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(extensionUri: vscode.Uri): void {
        const column = vscode.ViewColumn.One;

        if (AesEncryptDecryptPanel.currentPanel) {
            AesEncryptDecryptPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('aesEncryptDecryptGeneric', 'AES Encrypt / Decrypt', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'aes.svg');
        AesEncryptDecryptPanel.currentPanel = new AesEncryptDecryptPanel(panel);
    }

    public dispose(): void {
        AesEncryptDecryptPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length > 0) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async handleProcessAes(message: ProcessAesMessage): Promise<void> {
        try {
            const input = await this.resolveInput(message);
            const outputBuffer =
                message.operation === 'encrypt'
                    ? encryptAes(input, message.settings)
                    : this.decryptWithAutoDetectedEncoding(input, message);
            const encodedOutput = encodeData(outputBuffer, message.outputEncoding);

            this._panel.webview.postMessage({
                command: 'operationResult',
                operation: message.operation,
                result: encodedOutput,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private decryptWithAutoDetectedEncoding(input: Buffer, message: ProcessAesMessage): Buffer {
        try {
            return decryptAes(input, message.settings);
        } catch (error) {
            const shouldRetryWithDetection = message.sourceType === 'text' && message.inputEncoding === 'utf8';
            if (!shouldRetryWithDetection) {
                throw error;
            }

            const rawText = message.inputText?.trim() ?? '';
            const encodingsToTry: AesDataEncoding[] = [];
            if (this.looksLikeBase64(rawText)) {
                encodingsToTry.push('base64');
            }
            if (this.looksLikeHex(rawText)) {
                encodingsToTry.push('hex');
            }

            for (const encoding of encodingsToTry) {
                try {
                    const decoded = decodeData(rawText, encoding, 'Input');
                    return decryptAes(decoded, message.settings);
                } catch {
                    // Continue trying remaining fallback encodings.
                }
            }

            throw error;
        }
    }

    private looksLikeBase64(value: string): boolean {
        const normalized = value.replace(/\s+/g, '');
        return normalized.length > 0 && normalized.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(normalized);
    }

    private looksLikeHex(value: string): boolean {
        const normalized = value.replace(/\s+/g, '');
        return normalized.length > 0 && normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(normalized);
    }

    private async resolveInput(message: ProcessAesMessage): Promise<Buffer> {
        let input: Buffer;
        switch (message.sourceType) {
            case 'text':
                if (Buffer.byteLength(message.inputText ?? '', 'utf8') > MAX_INPUT_BYTES) {
                    throw new Error('AES input exceeds the 10 MB limit.');
                }
                input = decodeData(message.inputText ?? '', message.inputEncoding, 'Input');
                break;
            case 'file':
                if (!message.fileDataBase64) {
                    throw new Error('Please provide a file input.');
                }
                if (message.fileDataBase64.length > Math.ceil((MAX_INPUT_BYTES * 4) / 3) + 4) {
                    throw new Error('AES input exceeds the 10 MB limit.');
                }
                input = decodeData(message.fileDataBase64, 'base64', 'File input');
                break;
            case 'url':
                if (!message.url?.trim()) {
                    throw new Error('Please provide a URL.');
                }
                input = await this.fetchUrlContent(message.url.trim());
                break;
            default:
                throw new Error(`Unsupported input type: ${message.sourceType}`);
        }

        if (input.length > MAX_INPUT_BYTES) {
            throw new Error('AES input exceeds the 10 MB limit.');
        }
        return input;
    }

    private async fetchUrlContent(rawUrl: string, redirectCount = 0): Promise<Buffer> {
        if (redirectCount > 4) {
            throw new Error('Too many redirects while fetching URL input.');
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(rawUrl);
        } catch {
            throw new Error('Invalid URL provided.');
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Only HTTP/HTTPS URLs are supported.');
        }
        if (parsedUrl.username || parsedUrl.password) {
            throw new Error('URLs containing embedded credentials are not supported.');
        }
        // Block requests to loopback, link-local, and private network hosts to
        // avoid SSRF against local services or the cloud metadata endpoint. This
        // runs again on every redirect hop because fetchUrlContent recurses.
        if (isBlockedHost(parsedUrl.hostname)) {
            throw new Error('Refusing to fetch URLs that target local or private network addresses.');
        }

        return new Promise<Buffer>((resolve, reject) => {
            const requestLib = parsedUrl.protocol === 'https:' ? https : http;
            const request = requestLib.request(
                parsedUrl,
                {
                    method: 'GET',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'devx-vscode-aes-tool',
                    },
                },
                (response) => {
                    const statusCode = response.statusCode ?? 0;
                    if (statusCode >= 300 && statusCode < 400) {
                        const location = response.headers.location;
                        if (!location) {
                            reject(new Error(`Redirect (${statusCode}) received without a location header.`));
                            return;
                        }
                        const redirectUrl = new URL(location, parsedUrl);
                        if (parsedUrl.protocol === 'https:' && redirectUrl.protocol !== 'https:') {
                            response.resume();
                            reject(new Error('Refusing to follow an HTTPS redirect to an insecure URL.'));
                            return;
                        }
                        response.resume();
                        this.fetchUrlContent(redirectUrl.toString(), redirectCount + 1)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }

                    if (statusCode < 200 || statusCode >= 300) {
                        response.resume();
                        reject(new Error(`URL request failed with status ${statusCode}.`));
                        return;
                    }

                    const declaredLength = Number(response.headers['content-length']);
                    if (Number.isFinite(declaredLength) && declaredLength > MAX_INPUT_BYTES) {
                        response.resume();
                        reject(new Error('URL content exceeds the 10 MB limit.'));
                        return;
                    }

                    const chunks: Buffer[] = [];
                    let receivedBytes = 0;
                    response.on('data', (chunk: Buffer | string) => {
                        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        receivedBytes += buffer.length;
                        if (receivedBytes > MAX_INPUT_BYTES) {
                            response.destroy();
                            reject(new Error('URL content exceeds the 10 MB limit.'));
                            return;
                        }
                        chunks.push(buffer);
                    });
                    response.on('end', () => {
                        resolve(Buffer.concat(chunks));
                    });
                },
            );

            request.setTimeout(10000, () => {
                request.destroy(new Error('URL request timed out after 10 seconds.'));
            });

            request.on('error', (error) => {
                reject(new Error(`Failed to fetch URL input: ${error.message}`));
            });

            request.end();
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>AES Encrypt / Decrypt</title>
    <style>
        :root {
            color-scheme: light dark;
        }

        body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }

        .container {
            max-width: 1040px;
            margin: 0 auto;
        }

        h2 {
            margin-top: 0;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .header-icon {
            width: 30px;
            height: 30px;
        }

        .description {
            margin-top: 0;
            margin-bottom: 16px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }

        .details {
            border: 1px solid var(--vscode-panel-border, var(--vscode-input-border));
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 14px;
        }

        .details-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .details-title {
            margin: 0;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--vscode-descriptionForeground);
        }

        .details-toggle {
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            font-weight: 600;
            padding: 4px 10px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .details-toggle:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .details-toggle .caret {
            display: inline-block;
            transition: transform 0.2s ease;
        }

        .details-content {
            display: none;
            margin-top: 10px;
        }

        .details.expanded .details-content {
            display: block;
        }

        .details.expanded .details-toggle .caret {
            transform: rotate(180deg);
        }

        .details-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
        }

        .detail-column {
            min-width: 0;
        }

        .field {
            margin-bottom: 10px;
        }

        .field:last-child {
            margin-bottom: 0;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 12px;
        }

        .option-inline {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
            font-size: 12px;
            font-weight: 500;
        }

        .option-inline:last-child {
            margin-bottom: 0;
        }

        input[type="text"],
        input[type="number"],
        select,
        textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            padding: 8px;
            border-radius: 4px;
        }

        textarea {
            resize: vertical;
            min-height: 128px;
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
        }

        .iteration-field,
        .custom-salt-field {
            display: none;
            margin-top: 8px;
        }

        .custom-salt-grid,
        .custom-key-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .custom-key-block {
            display: none;
            border: 1px solid var(--vscode-panel-border, var(--vscode-input-border));
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 14px;
        }

        .custom-key-title {
            margin: 0 0 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--vscode-descriptionForeground);
        }

        .passphrase-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto auto;
            gap: 8px;
            align-items: end;
            margin-bottom: 14px;
        }

        .button {
            border: none;
            cursor: pointer;
            padding: 8px 14px;
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-weight: 600;
            white-space: nowrap;
        }

        .button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .input-wrapper,
        .output-wrapper {
            margin-bottom: 14px;
        }

        .input-mode-block {
            display: none;
        }

        .input-mode-block.active {
            display: block;
        }

        .file-zone {
            border: 1px dashed var(--vscode-input-border);
            border-radius: 4px;
            padding: 14px;
            text-align: center;
            cursor: pointer;
            background: var(--vscode-textBlockQuote-background);
        }

        .file-zone.drag-over {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }

        .file-meta {
            margin-top: 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            word-break: break-word;
        }

        .output-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .hint {
            margin-top: 6px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .message {
            display: none;
            padding: 8px;
            border-radius: 4px;
            margin-top: 8px;
        }

        .message.success {
            display: block;
            color: var(--vscode-terminal-ansiGreen);
            background: color-mix(in oklab, var(--vscode-terminal-ansiGreen) 15%, transparent);
        }

        .message.error {
            display: block;
            color: var(--vscode-errorForeground);
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }

        @media (max-width: 900px) {
            .details-grid,
            .custom-salt-grid,
            .custom-key-grid {
                grid-template-columns: 1fr;
            }

            .passphrase-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>
            <svg class="header-icon" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-8-3z" fill="#2aa198"/>
                <rect x="8" y="11" width="8" height="6" rx="1" fill="#f9a825"/>
                <path d="M10 11V9.5a2 2 0 1 1 4 0V11" stroke="#f9a825" stroke-width="1.2"/>
            </svg>
            AES Encrypt / Decrypt
        </h2>
        <p class="description">
            Encrypt or decrypt text, file, or URL content with AES options including key size, mode, padding, key derivation, hash, salt, and iteration controls.
        </p>

        <section class="details" id="detailsSection">
            <div class="details-header">
                <h3 class="details-title">Details</h3>
                <button type="button" class="details-toggle" id="detailsToggleBtn" aria-expanded="false" aria-controls="detailsContent">
                    <span id="detailsToggleLabel">Show</span>
                    <span class="caret">▾</span>
                </button>
            </div>
            <div class="details-content" id="detailsContent">
            <div class="details-grid">
                <div class="detail-column">
                    <div class="field">
                        <label for="inputType">Input Type</label>
                        <select id="inputType">
                            <option value="text">Text</option>
                            <option value="file">File</option>
                            <option value="url">URL</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="inputEncoding">Input Encoding</label>
                        <select id="inputEncoding">
                            <option value="utf8" selected>UTF-8</option>
                            <option value="hex">Hex</option>
                            <option value="base64">Base64</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="outputEncoding">Output Encoding</label>
                        <select id="outputEncoding">
                            <option value="base64" selected>Base64</option>
                            <option value="hex">Hex</option>
                            <option value="utf8">UTF-8</option>
                        </select>
                    </div>
                </div>

                <div class="detail-column">
                    <div class="field">
                        <label for="keySize">Key Size</label>
                        <select id="keySize">
                            <option value="128">128 Bits</option>
                            <option value="192">192 Bits</option>
                            <option value="256" selected>256 Bits</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="mode">Mode</label>
                        <select id="mode">
                            <option value="CBC" selected>CBC</option>
                            <option value="CFB">CFB</option>
                            <option value="CTR">CTR</option>
                            <option value="OFB">OFB</option>
                            <option value="ECB">ECB</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="padding">Padding</label>
                        <select id="padding">
                            <option value="Pkcs7" selected>Pkcs7</option>
                            <option value="Iso97971">Iso97971</option>
                            <option value="AnsiX923">AnsiX923</option>
                            <option value="Iso10126">Iso10126</option>
                            <option value="ZeroPadding">ZeroPadding</option>
                            <option value="NoPadding">NoPadding</option>
                        </select>
                        <div class="hint" id="paddingHint" style="display:none;">Padding is ignored for CFB/CTR/OFB.</div>
                    </div>
                    <div class="field">
                        <label for="keyType">Key Type</label>
                        <select id="keyType">
                            <option value="PBKDF2" selected>PBKDF2</option>
                            <option value="EvpKDF">EvpKDF</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                </div>

                <div class="detail-column">
                    <div class="field">
                        <label for="hash">Hash</label>
                        <select id="hash">
                            <option value="MD5">MD5</option>
                            <option value="SHA1">SHA1</option>
                            <option value="SHA224">SHA224</option>
                            <option value="SHA256" selected>SHA256</option>
                            <option value="SHA384">SHA384</option>
                            <option value="SHA512">SHA512</option>
                            <option value="RIPEMD160">RIPEMD160</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="saltType">Salt Type</label>
                        <select id="saltType">
                            <option value="random" selected>Random</option>
                            <option value="nosalt">No Salt</option>
                            <option value="custom">Custom</option>
                        </select>
                        <div class="custom-salt-field" id="customSaltField">
                            <div class="custom-salt-grid">
                                <div>
                                    <label for="saltEncoding">Salt Encoding</label>
                                    <select id="saltEncoding">
                                        <option value="utf8">UTF-8</option>
                                        <option value="hex" selected>Hex</option>
                                        <option value="base64">Base64</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="saltValue">Salt (8 bytes)</label>
                                    <input type="text" id="saltValue" placeholder="e.g. 1a2b3c4d5e6f7788">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="field">
                        <label>Custom Iteration</label>
                        <label class="option-inline">
                            <input type="radio" name="iterationMode" id="iterationDefault" checked>
                            Use default iteration
                        </label>
                        <label class="option-inline">
                            <input type="radio" name="iterationMode" id="iterationCustom">
                            Use custom iteration
                        </label>
                        <div class="iteration-field" id="iterationField">
                            <label for="iterationValue">Iteration Value</label>
                            <input type="number" id="iterationValue" value="1" min="1" step="1">
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </section>

        <section class="custom-key-block" id="customKeyBlock">
            <h3 class="custom-key-title">Custom Key / IV</h3>
            <div class="custom-key-grid">
                <div>
                    <label for="keyEncoding">Key Encoding</label>
                    <select id="keyEncoding">
                        <option value="utf8">UTF-8</option>
                        <option value="hex" selected>Hex</option>
                        <option value="base64">Base64</option>
                    </select>
                </div>
                <div>
                    <label for="keyValue">Key Value</label>
                    <input type="text" id="keyValue" placeholder="Custom key data">
                </div>
                <div>
                    <label for="ivEncoding">IV Encoding</label>
                    <select id="ivEncoding">
                        <option value="utf8">UTF-8</option>
                        <option value="hex" selected>Hex</option>
                        <option value="base64">Base64</option>
                    </select>
                </div>
                <div>
                    <label for="ivValue">IV Value (not needed for ECB)</label>
                    <input type="text" id="ivValue" placeholder="Custom IV data">
                </div>
            </div>
        </section>

        <div class="passphrase-row">
            <div>
                <label for="passphrase">Passphrase</label>
                <input type="text" id="passphrase" placeholder="Enter passphrase">
            </div>
            <button class="button primary" id="encryptBtn" type="button">Encrypt</button>
            <button class="button primary" id="decryptBtn" type="button">Decrypt</button>
            <button class="button secondary" id="clearBtn" type="button">Clear</button>
        </div>

        <section class="input-wrapper">
            <label>Input</label>
            <div class="input-mode-block active" id="textInputBlock">
                <textarea id="textInput" placeholder="Enter input text here..."></textarea>
            </div>
            <div class="input-mode-block" id="fileInputBlock">
                <div class="file-zone" id="fileZone">
                    Drag and drop a file here, or click to select a file.
                </div>
                <input type="file" id="fileInput" style="display:none;">
                <div class="file-meta" id="fileMeta">No file selected.</div>
            </div>
            <div class="input-mode-block" id="urlInputBlock">
                <input type="text" id="urlInput" placeholder="https://example.com/data.txt">
                <div class="hint">URL content is fetched by the extension host using HTTP/HTTPS.</div>
            </div>
        </section>

        <section class="output-wrapper">
            <div class="output-header">
                <label for="outputText">Output</label>
                <button class="button secondary" id="copyBtn" type="button">Copy</button>
            </div>
            <textarea id="outputText" readonly></textarea>
        </section>

        <div id="messageBox" class="message"></div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const inputTypeEl = document.getElementById('inputType');
        const detailsSectionEl = document.getElementById('detailsSection');
        const detailsToggleBtnEl = document.getElementById('detailsToggleBtn');
        const detailsToggleLabelEl = document.getElementById('detailsToggleLabel');
        const inputEncodingEl = document.getElementById('inputEncoding');
        const outputEncodingEl = document.getElementById('outputEncoding');
        const keySizeEl = document.getElementById('keySize');
        const modeEl = document.getElementById('mode');
        const paddingEl = document.getElementById('padding');
        const paddingHintEl = document.getElementById('paddingHint');
        const keyTypeEl = document.getElementById('keyType');
        const hashEl = document.getElementById('hash');
        const saltTypeEl = document.getElementById('saltType');
        const customSaltFieldEl = document.getElementById('customSaltField');
        const saltEncodingEl = document.getElementById('saltEncoding');
        const saltValueEl = document.getElementById('saltValue');
        const iterationDefaultEl = document.getElementById('iterationDefault');
        const iterationCustomEl = document.getElementById('iterationCustom');
        const iterationFieldEl = document.getElementById('iterationField');
        const iterationValueEl = document.getElementById('iterationValue');
        const customKeyBlockEl = document.getElementById('customKeyBlock');
        const keyEncodingEl = document.getElementById('keyEncoding');
        const keyValueEl = document.getElementById('keyValue');
        const ivEncodingEl = document.getElementById('ivEncoding');
        const ivValueEl = document.getElementById('ivValue');
        const passphraseEl = document.getElementById('passphrase');
        const textInputEl = document.getElementById('textInput');
        const outputTextEl = document.getElementById('outputText');
        const messageBoxEl = document.getElementById('messageBox');
        const textInputBlockEl = document.getElementById('textInputBlock');
        const fileInputBlockEl = document.getElementById('fileInputBlock');
        const urlInputBlockEl = document.getElementById('urlInputBlock');
        const fileZoneEl = document.getElementById('fileZone');
        const fileInputEl = document.getElementById('fileInput');
        const fileMetaEl = document.getElementById('fileMeta');
        const urlInputEl = document.getElementById('urlInput');

        let selectedFile = null;

        function setDetailsExpanded(expanded) {
            detailsSectionEl.classList.toggle('expanded', expanded);
            detailsToggleBtnEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            detailsToggleLabelEl.textContent = expanded ? 'Hide' : 'Show';
        }

        function showMessage(type, message) {
            messageBoxEl.className = 'message ' + type;
            messageBoxEl.textContent = message;
        }

        function clearMessage() {
            messageBoxEl.className = 'message';
            messageBoxEl.textContent = '';
        }

        function setActiveInputBlock(inputType) {
            textInputBlockEl.classList.toggle('active', inputType === 'text');
            fileInputBlockEl.classList.toggle('active', inputType === 'file');
            urlInputBlockEl.classList.toggle('active', inputType === 'url');
        }

        function isBlockMode(mode) {
            return mode === 'CBC' || mode === 'ECB';
        }

        function updateModeAndPaddingState() {
            const blockMode = isBlockMode(modeEl.value);
            paddingEl.disabled = !blockMode;
            paddingHintEl.style.display = blockMode ? 'none' : 'block';
        }

        function updateIterationState() {
            const showCustomIteration = iterationCustomEl.checked && keyTypeEl.value !== 'custom';
            iterationFieldEl.style.display = showCustomIteration ? 'block' : 'none';
        }

        function updateKeyTypeState() {
            const customKeyType = keyTypeEl.value === 'custom';
            customKeyBlockEl.style.display = customKeyType ? 'block' : 'none';
            passphraseEl.disabled = customKeyType;
            hashEl.disabled = customKeyType;
            saltTypeEl.disabled = customKeyType;
            iterationDefaultEl.disabled = customKeyType;
            iterationCustomEl.disabled = customKeyType;

            if (customKeyType) {
                iterationDefaultEl.checked = true;
            }

            updateIterationState();
            updateSaltState();
        }

        function updateSaltState() {
            const showSalt = keyTypeEl.value !== 'custom' && saltTypeEl.value === 'custom';
            customSaltFieldEl.style.display = showSalt ? 'block' : 'none';
        }

        function formatSize(bytes) {
            if (!Number.isFinite(bytes) || bytes < 0) {
                return '0 B';
            }
            if (bytes < 1024) {
                return String(bytes) + ' B';
            }
            if (bytes < 1024 * 1024) {
                return (bytes / 1024).toFixed(2) + ' KB';
            }
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        function arrayBufferToBase64(arrayBuffer) {
            const bytes = new Uint8Array(arrayBuffer);
            const chunk = 0x8000;
            let binary = '';
            for (let i = 0; i < bytes.length; i += chunk) {
                const slice = bytes.subarray(i, i + chunk);
                binary += String.fromCharCode.apply(null, slice);
            }
            return btoa(binary);
        }

        function looksLikeBase64(value) {
            const normalized = value.replace(/\\s+/g, '');
            return normalized.length > 0 && normalized.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(normalized);
        }

        function looksLikeHex(value) {
            const normalized = value.replace(/\\s+/g, '');
            return normalized.length > 0 && normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(normalized);
        }

        async function buildSourcePayload() {
            const sourceType = inputTypeEl.value;
            if (sourceType === 'text') {
                if (!textInputEl.value) {
                    throw new Error('Please provide text input.');
                }
                return { sourceType: 'text', inputText: textInputEl.value, fileDataBase64: '', url: '' };
            }
            if (sourceType === 'file') {
                if (!selectedFile) {
                    throw new Error('Please choose a file input.');
                }
                const fileBuffer = await selectedFile.arrayBuffer();
                const fileDataBase64 = arrayBufferToBase64(fileBuffer);
                return { sourceType: 'file', inputText: '', fileDataBase64: fileDataBase64, url: '' };
            }
            if (!urlInputEl.value.trim()) {
                throw new Error('Please provide a URL input.');
            }
            return { sourceType: 'url', inputText: '', fileDataBase64: '', url: urlInputEl.value.trim() };
        }

        function getSettings() {
            return {
                keySize: Number(keySizeEl.value),
                mode: modeEl.value,
                padding: paddingEl.value,
                keyType: keyTypeEl.value,
                hash: hashEl.value,
                customIteration: iterationCustomEl.checked && keyTypeEl.value !== 'custom',
                iteration: Number(iterationValueEl.value) || 1,
                passphrase: passphraseEl.value || '',
                key: keyValueEl.value || '',
                keyEncoding: keyEncodingEl.value,
                iv: ivValueEl.value || '',
                ivEncoding: ivEncodingEl.value,
                saltType: saltTypeEl.value,
                salt: saltValueEl.value || '',
                saltEncoding: saltEncodingEl.value
            };
        }

        async function runOperation(operation) {
            clearMessage();
            try {
                const source = await buildSourcePayload();
                if (keyTypeEl.value !== 'custom' && !passphraseEl.value) {
                    throw new Error('Passphrase is required for PBKDF2/EvpKDF.');
                }

                let inputEncoding = inputEncodingEl.value;
                let outputEncoding = outputEncodingEl.value;
                if (operation === 'decrypt' && source.sourceType === 'text' && inputEncoding === 'utf8') {
                    const sourceText = source.inputText.trim();
                    if (looksLikeBase64(sourceText)) {
                        inputEncoding = 'base64';
                        inputEncodingEl.value = 'base64';
                    } else if (looksLikeHex(sourceText)) {
                        inputEncoding = 'hex';
                        inputEncodingEl.value = 'hex';
                    }
                }
                if (operation === 'decrypt' && source.sourceType === 'text' && outputEncoding === 'base64') {
                    outputEncoding = 'utf8';
                    outputEncodingEl.value = 'utf8';
                }

                vscode.postMessage({
                    command: 'processAes',
                    operation: operation,
                    sourceType: source.sourceType,
                    inputEncoding: inputEncoding,
                    outputEncoding: outputEncoding,
                    inputText: source.inputText,
                    fileDataBase64: source.fileDataBase64,
                    url: source.url,
                    settings: getSettings()
                });
            } catch (error) {
                showMessage('error', error instanceof Error ? error.message : String(error));
            }
        }

        inputTypeEl.addEventListener('change', () => {
            setActiveInputBlock(inputTypeEl.value);
        });

        detailsToggleBtnEl.addEventListener('click', () => {
            const isExpanded = detailsSectionEl.classList.contains('expanded');
            setDetailsExpanded(!isExpanded);
        });

        modeEl.addEventListener('change', updateModeAndPaddingState);
        keyTypeEl.addEventListener('change', updateKeyTypeState);
        saltTypeEl.addEventListener('change', updateSaltState);
        iterationDefaultEl.addEventListener('change', updateIterationState);
        iterationCustomEl.addEventListener('change', updateIterationState);

        fileZoneEl.addEventListener('click', () => {
            fileInputEl.click();
        });

        fileInputEl.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            selectedFile = file || null;
            fileMetaEl.textContent = selectedFile
                ? 'Selected: ' + selectedFile.name + ' (' + formatSize(selectedFile.size) + ')'
                : 'No file selected.';
        });

        fileZoneEl.addEventListener('dragover', (event) => {
            event.preventDefault();
            fileZoneEl.classList.add('drag-over');
        });

        fileZoneEl.addEventListener('dragleave', (event) => {
            event.preventDefault();
            fileZoneEl.classList.remove('drag-over');
        });

        fileZoneEl.addEventListener('drop', (event) => {
            event.preventDefault();
            fileZoneEl.classList.remove('drag-over');
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (file) {
                selectedFile = file;
                fileMetaEl.textContent = 'Selected: ' + selectedFile.name + ' (' + formatSize(selectedFile.size) + ')';
            }
        });

        document.getElementById('encryptBtn').addEventListener('click', () => {
            runOperation('encrypt');
        });

        document.getElementById('decryptBtn').addEventListener('click', () => {
            runOperation('decrypt');
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            textInputEl.value = '';
            outputTextEl.value = '';
            urlInputEl.value = '';
            passphraseEl.value = '';
            keyValueEl.value = '';
            ivValueEl.value = '';
            saltValueEl.value = '';
            selectedFile = null;
            fileInputEl.value = '';
            fileMetaEl.textContent = 'No file selected.';
            clearMessage();
        });

        document.getElementById('copyBtn').addEventListener('click', () => {
            if (!outputTextEl.value) {
                showMessage('error', 'Nothing to copy.');
                return;
            }
            navigator.clipboard.writeText(outputTextEl.value).then(() => {
                showMessage('success', 'Output copied to clipboard.');
            }).catch((error) => {
                showMessage('error', 'Copy failed: ' + (error && error.message ? error.message : String(error)));
            });
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'operationResult') {
                outputTextEl.value = message.result || '';
                showMessage('success', (message.operation === 'encrypt' ? 'Encryption' : 'Decryption') + ' successful.');
                return;
            }
            if (message.command === 'error') {
                showMessage('error', message.message || 'Unknown error.');
            }
        });

        setActiveInputBlock(inputTypeEl.value);
        setDetailsExpanded(false);
        updateModeAndPaddingState();
        updateKeyTypeState();
    </script>
</body>
</html>`;
    }
}
