import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getCertificateStatus, normalizePem, parseCertificateContent } from '../certificates/certificateUtils';

export class CertificatePanel {
    public static currentPanel: CertificatePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'validateCert':
                        this.handleValidateCert(message.cert);
                        return;
                    case 'decodeCert':
                        this.handleDecodeCert(message.cert);
                        return;
                    case 'extractFromJKS':
                        this.handleExtractFromJKS(message.keystorePath, message.alias);
                        return;
                    case 'convertToPKCS12':
                        this.handleConvertToPKCS12(message.cert, message.key, message.password);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (CertificatePanel.currentPanel) {
            CertificatePanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'certificatePanel',
                'Certificate Tools',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'certificate.svg');
            CertificatePanel.currentPanel = new CertificatePanel(panel);
        }
    }

    private handleValidateCert(certPem: string) {
        try {
            const details = parseCertificateContent(normalizePem(certPem), 'PEM');
            const validFrom = new Date(details.validFrom);
            const validTo = new Date(details.validTo);
            const status = getCertificateStatus(validTo);
            const isWithinValidityWindow = new Date() >= validFrom && status !== 'expired';

            this._panel.webview.postMessage({
                command: 'validateResult',
                result: {
                    valid: isWithinValidityWindow,
                    subject: details.subject,
                    issuer: details.issuer,
                    validFrom: validFrom.toISOString(),
                    validTo: validTo.toISOString(),
                    serialNumber: details.serialNumber,
                    fingerprint: details.fingerprint,
                    message: isWithinValidityWindow ? 'Certificate is valid' : 'Certificate has expired or is not yet valid',
                },
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Certificate validation failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleDecodeCert(certPem: string) {
        try {
            const details = parseCertificateContent(normalizePem(certPem), 'PEM');

            this._panel.webview.postMessage({
                command: 'decodeResult',
                result: JSON.stringify(details, null, 2),
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Certificate decoding failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleExtractFromJKS(keystorePath: string, alias: string) {
        try {
            const pathArg = keystorePath.trim() || 'keystore.jks';
            const aliasArg = alias.trim() || '<alias>';
            const exportCommand = `keytool -exportcert -alias ${this.shellQuote(aliasArg)} -keystore ${this.shellQuote(pathArg)} -rfc -file cert.pem`;
            const convertCommand = `keytool -importkeystore -srckeystore ${this.shellQuote(pathArg)} -destkeystore keystore.p12 -deststoretype PKCS12`;

            this._panel.webview.postMessage({
                command: 'jksResult',
                result:
                    'JKS parsing is not built into Node.js. Use Java keytool from a terminal:\n\n' +
                    `${exportCommand}\n${convertCommand}`,
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `JKS extraction failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private handleConvertToPKCS12(certPem: string, keyPem: string, password: string) {
        try {
            parseCertificateContent(normalizePem(certPem), 'PEM');
            if (!keyPem.includes('PRIVATE KEY')) {
                throw new Error('Private key must be PEM text containing a PRIVATE KEY block.');
            }

            const passwordFlag = password ? ` -password ${this.shellQuote(`pass:${password}`)}` : '';
            const opensslCmd = `openssl pkcs12 -export -out certificate.p12 -inkey private.key -in certificate.crt${passwordFlag}`;

            this._panel.webview.postMessage({
                command: 'convertResult',
                result:
                    `To convert to PKCS12 format, use OpenSSL:\n\n${opensslCmd}\n\n` +
                    'Or save your certificate and key to files and use the command above.',
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    private shellQuote(value: string): string {
        return `'${value.replace(/'/g, "'\\''")}'`;
    }

    public dispose() {
        CertificatePanel.currentPanel = undefined;
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
    <title>Certificate Tools</title>
    <style>
        body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            font-size: 24px;
            margin-bottom: 10px;
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
        .tabs {
            display: flex;
            gap: 5px;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tab {
            padding: 10px 20px;
            background-color: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            font-size: 13px;
        }
        .tab:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .tab.active {
            border-bottom-color: var(--vscode-focusBorder);
            font-weight: bold;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .section {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
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
            font-size: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            resize: vertical;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 8px 10px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        textarea:focus, input:focus {
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
        .result-box {
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 400px;
            overflow-y: auto;
        }
        .result-box.valid {
            border-left-color: var(--vscode-charts-green);
        }
        .result-box.invalid {
            border-left-color: var(--vscode-errorForeground);
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
        .info-box {
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            margin: 10px 0;
            font-size: 12px;
        }
        .field-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    </style>
</head>
<body>
    <h1>
        <svg class="header-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 8c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        Certificate Tools
    </h1>

    <div class="tabs">
        <button class="tab" data-tab="validate">Validate</button>
        <button class="tab active" data-tab="decode">Decode</button>
        <button class="tab" data-tab="jks">Extract from JKS</button>
        <button class="tab" data-tab="convert">Convert to PKCS12</button>
    </div>

    <!-- Validate Tab -->
    <div class="tab-content" id="validate">
        <div class="section">
            <label for="validate-cert">Certificate (PEM format):</label>
            <textarea id="validate-cert" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
            <div class="button-group">
                <button id="validate-btn">Validate Certificate</button>
                <button id="clear-validate-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
            </div>
        </div>
        <div id="validate-result"></div>
        <div id="validate-message"></div>
    </div>

    <!-- Decode Tab -->
    <div class="tab-content active" id="decode">
        <div class="section">
            <label for="decode-cert">Certificate (PEM format):</label>
            <textarea id="decode-cert" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
            <div class="button-group">
                <button id="decode-btn">Decode Certificate</button>
                <button id="copy-decode-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>Copy Result</button>
                <button id="clear-decode-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
            </div>
        </div>
        <div id="decode-result"></div>
        <div id="decode-message"></div>
    </div>

    <!-- Extract from JKS Tab -->
    <div class="tab-content" id="jks">
        <div class="info-box">
            <strong>Note:</strong> JKS extraction requires Java keytool. This tool provides command-line instructions.
        </div>
        <div class="section">
            <div class="field-group">
                <label for="jks-path">JKS Keystore Path:</label>
                <input type="text" id="jks-path" placeholder="keystore.jks">
            </div>
            <div class="field-group">
                <label for="jks-alias">Alias:</label>
                <input type="text" id="jks-alias" placeholder="Enter certificate alias">
            </div>
            <div class="button-group">
                <button id="extract-btn">Extract</button>
                <button id="clear-jks-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
            </div>
        </div>
        <div id="jks-result"></div>
        <div id="jks-message"></div>
    </div>

    <!-- Convert to PKCS12 Tab -->
    <div class="tab-content" id="convert">
        <div class="info-box">
            <strong>Note:</strong> PKCS12 conversion requires OpenSSL. This tool provides command-line instructions.
        </div>
        <div class="section">
            <div class="field-group">
                <label for="convert-cert">Certificate (PEM format):</label>
                <textarea id="convert-cert" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
            </div>
            <div class="field-group">
                <label for="convert-key">Private Key (PEM format):</label>
                <textarea id="convert-key" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
            </div>
            <div class="field-group">
                <label for="convert-password">PKCS12 Password:</label>
                <input type="password" id="convert-password" placeholder="Enter password for PKCS12 file">
            </div>
            <div class="button-group">
                <button id="convert-btn">Generate Instructions</button>
                <button id="clear-convert-btn" class="secondary"><svg class="btn-icon" viewBox="0 0 16 16"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>Clear</button>
            </div>
        </div>
        <div id="convert-result"></div>
        <div id="convert-message"></div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');

                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById(tabName).classList.add('active');
            });
        });

        // Validate tab
        document.getElementById('validate-btn').addEventListener('click', () => {
            const cert = document.getElementById('validate-cert').value.trim();
            if (!cert) {
                showMessage('validate-message', 'Please enter a certificate', 'error');
                return;
            }
            vscode.postMessage({ command: 'validateCert', cert });
        });

        document.getElementById('clear-validate-btn').addEventListener('click', () => {
            document.getElementById('validate-cert').value = '';
            document.getElementById('validate-result').innerHTML = '';
            document.getElementById('validate-message').textContent = '';
        });

        // Decode tab
        document.getElementById('decode-btn').addEventListener('click', () => {
            const cert = document.getElementById('decode-cert').value.trim();
            if (!cert) {
                showMessage('decode-message', 'Please enter a certificate', 'error');
                return;
            }
            vscode.postMessage({ command: 'decodeCert', cert });
        });

        document.getElementById('copy-decode-btn').addEventListener('click', () => {
            const result = document.getElementById('decode-result').textContent;
            if (!result) {
                showMessage('decode-message', 'No result to copy', 'error');
                return;
            }
            navigator.clipboard.writeText(result).then(() => {
                showMessage('decode-message', 'Copied to clipboard!', 'success');
            });
        });

        document.getElementById('clear-decode-btn').addEventListener('click', () => {
            document.getElementById('decode-cert').value = '';
            document.getElementById('decode-result').innerHTML = '';
            document.getElementById('decode-message').textContent = '';
        });

        // JKS tab
        document.getElementById('extract-btn').addEventListener('click', () => {
            const keystorePath = document.getElementById('jks-path').value.trim();
            const alias = document.getElementById('jks-alias').value;

            if (!alias) {
                showMessage('jks-message', 'Please enter a certificate alias', 'error');
                return;
            }
            vscode.postMessage({ command: 'extractFromJKS', keystorePath, alias });
        });

        document.getElementById('clear-jks-btn').addEventListener('click', () => {
            document.getElementById('jks-path').value = '';
            document.getElementById('jks-alias').value = '';
            document.getElementById('jks-result').innerHTML = '';
            document.getElementById('jks-message').textContent = '';
        });

        // Convert tab
        document.getElementById('convert-btn').addEventListener('click', () => {
            const cert = document.getElementById('convert-cert').value.trim();
            const key = document.getElementById('convert-key').value.trim();
            const password = document.getElementById('convert-password').value;

            if (!cert || !key || !password) {
                showMessage('convert-message', 'Please fill in all fields', 'error');
                return;
            }
            vscode.postMessage({ command: 'convertToPKCS12', cert, key, password });
        });

        document.getElementById('clear-convert-btn').addEventListener('click', () => {
            document.getElementById('convert-cert').value = '';
            document.getElementById('convert-key').value = '';
            document.getElementById('convert-password').value = '';
            document.getElementById('convert-result').innerHTML = '';
            document.getElementById('convert-message').textContent = '';
        });

        // Message handling
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'validateResult':
                    displayValidateResult(msg.result);
                    break;
                case 'decodeResult':
                    document.getElementById('decode-result').innerHTML =
                        '<div class="result-box">' + escapeHtml(msg.result) + '</div>';
                    showMessage('decode-message', 'Certificate decoded successfully!', 'success');
                    break;
                case 'convertResult':
                    document.getElementById('convert-result').innerHTML =
                        '<div class="result-box">' + escapeHtml(msg.result) + '</div>';
                    showMessage('convert-message', 'Instructions generated!', 'success');
                    break;
                case 'jksResult':
                    document.getElementById('jks-result').innerHTML =
                        '<div class="result-box">' + escapeHtml(msg.result) + '</div>';
                    showMessage('jks-message', 'Instructions generated!', 'success');
                    break;
                case 'error':
                    const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
                    showMessage(activeTab + '-message', msg.message, 'error');
                    break;
            }
        });

        function displayValidateResult(result) {
            const resultDiv = document.getElementById('validate-result');
            const className = result.valid ? 'valid' : 'invalid';

            let html = '<div class="result-box ' + className + '">';
            html += '<strong>Status:</strong> ' + escapeHtml(result.message) + '\\n\\n';

            if (result.subject) {
                html += '<strong>Subject:</strong> ' + escapeHtml(result.subject) + '\\n';
                html += '<strong>Issuer:</strong> ' + escapeHtml(result.issuer) + '\\n';
                html += '<strong>Valid From:</strong> ' + escapeHtml(result.validFrom) + '\\n';
                html += '<strong>Valid To:</strong> ' + escapeHtml(result.validTo) + '\\n';
                html += '<strong>Serial Number:</strong> ' + escapeHtml(result.serialNumber) + '\\n';
                html += '<strong>Fingerprint:</strong> ' + escapeHtml(result.fingerprint) + '\\n';
            }

            html += '</div>';
            resultDiv.innerHTML = html;
            showMessage('validate-message', 'Validation complete!', 'success');
        }

        function showMessage(elementId, text, type) {
            const element = document.getElementById(elementId);
            element.textContent = text;
            element.className = type;
            setTimeout(() => {
                element.textContent = '';
                element.className = '';
            }, 5000);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}
