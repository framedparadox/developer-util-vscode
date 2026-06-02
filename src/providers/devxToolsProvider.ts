import * as crypto from 'crypto';
import * as vscode from 'vscode';

// ─── AES KeyIdentifier types & storage helpers ───────────────────────────────
export interface AesKeyIdentifier {
    keyIdentifier: string;
    key: string;
}

export const AES_KEY_IDENTIFIERS_KEY = 'devx.aesKeyIdentifiers';
const DEFAULT_AES_KEY_IDENTIFIER_NAMES = ['DEV', 'FIT', 'UAT', 'PROD'] as const;
const DEFAULT_AES_KEY_IDENTIFIER_VALUES: AesKeyIdentifier[] = DEFAULT_AES_KEY_IDENTIFIER_NAMES.map((keyIdentifier) => ({
    keyIdentifier,
    key: '',
}));

export const DEFAULT_AES_KEY_IDENTIFIERS: AesKeyIdentifier[] = DEFAULT_AES_KEY_IDENTIFIER_VALUES;

function normalizeAesKeyIdentifiers(
    entries: Array<{ keyIdentifier?: string; name?: string; key?: string }> | undefined
): AesKeyIdentifier[] {
    if (!entries || entries.length === 0) {
        return DEFAULT_AES_KEY_IDENTIFIERS;
    }

    const normalized = entries.map((entry) => ({
        keyIdentifier: (entry.keyIdentifier ?? entry.name ?? '').trim(),
        key: entry.key ?? '',
    }));

    const hasAnyValue = normalized.some((entry) => entry.keyIdentifier.length > 0 || entry.key.length > 0);
    return hasAnyValue ? normalized : DEFAULT_AES_KEY_IDENTIFIERS;
}

export async function getAesKeyIdentifiers(context: vscode.ExtensionContext): Promise<AesKeyIdentifier[]> {
    const secretJson = await context.secrets.get(AES_KEY_IDENTIFIERS_KEY);
    if (secretJson !== undefined) {
        try {
            return normalizeAesKeyIdentifiers(JSON.parse(secretJson));
        } catch {
            return DEFAULT_AES_KEY_IDENTIFIERS;
        }
    }
    // One-time migration from plaintext globalState
    const legacy = context.globalState.get<Array<{ keyIdentifier?: string; name?: string; key?: string }>>(
        AES_KEY_IDENTIFIERS_KEY
    );
    if (legacy !== undefined) {
        const normalized = normalizeAesKeyIdentifiers(legacy);
        await context.secrets.store(AES_KEY_IDENTIFIERS_KEY, JSON.stringify(normalized));
        await context.globalState.update(AES_KEY_IDENTIFIERS_KEY, undefined);
        return normalized;
    }
    return DEFAULT_AES_KEY_IDENTIFIERS;
}

export async function setAesKeyIdentifiers(
    context: vscode.ExtensionContext,
    identifiers: AesKeyIdentifier[]
): Promise<void> {
    await context.secrets.store(AES_KEY_IDENTIFIERS_KEY, JSON.stringify(identifiers));
}
// ───────────────────────────────────────────────────────────────────────────

// ─── Sidebar tool definition ────────────────────────────────────────────────
interface SidebarTool {
    label: string;
    description: string;
    command: string;
    iconFile: string;
}

const MULESOFT_AES_TOOL: SidebarTool = {
    label: 'Mulesoft AES Encrypt / Decrypt',
    description: 'Encrypt or decrypt text using AES-256',
    command: 'devx.aesEncryptDecrypt',
    iconFile: 'aes.svg',
};

const SETTINGS_TOOL: SidebarTool = {
    label: 'Settings',
    description: 'Configure AES key identifiers',
    command: 'devx.openSettings',
    iconFile: 'settings.svg',
};
// ───────────────────────────────────────────────────────────────────────────

export class DevXToolsProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _view?: vscode.WebviewView;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._extensionUri = context.extensionUri;
    }

    refresh(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml(this._view.webview);
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'runTool':
                    if (typeof message.toolCommand === 'string') {
                        await vscode.commands.executeCommand(message.toolCommand);
                    }
                    return;
                case 'refresh':
                    this.refresh();
                    return;
            }
        });
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private iconUri(webview: vscode.Webview, file: string): string {
        return webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'icons', file)).toString();
    }

    private renderItem(webview: vscode.Webview, item: SidebarTool): string {
        const iconSrc = this.iconUri(webview, item.iconFile);
        const safeLabel = this.escapeHtml(item.label);
        const safeDescription = this.escapeHtml(item.description);
        const safeCommand = this.escapeHtml(item.command);
        const safeTitle = this.escapeHtml(`${item.label}: ${item.description}`);

        return `<button type="button" class="tool-button compact" data-command="${safeCommand}" title="${safeTitle}">
            <img src="${iconSrc}" class="tool-icon compact" alt="" />
            <span class="tool-content compact">
                <span class="tool-title compact">${safeLabel}</span>
                <span class="tool-description compact">${safeDescription}</span>
            </span>
        </button>`;
    }

    private _getHtml(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

        const mainRows = this.renderItem(webview, MULESOFT_AES_TOOL);
        const bottomRows = this.renderItem(webview, SETTINGS_TOOL);

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
    html,
    body {
        height: 100%;
        margin: 0;
        padding: 8px;
        box-sizing: border-box;
        color: var(--vscode-sideBar-foreground);
        background: var(--vscode-sideBar-background);
        font-family: var(--vscode-font-family);
        overflow: hidden;
    }

    .sidebar-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: 8px;
    }

    .tool-list-main {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .tool-list-bottom {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-top: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        padding-top: 8px;
        flex-shrink: 0;
    }

    .tool-button {
        width: 100%;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: inherit;
        padding: 7px 8px;
        border: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        background: var(--vscode-editorWidget-background);
    }

    .tool-button:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-list-hoverBackground);
    }

    .tool-button:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }

    .tool-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
    }

    .tool-content.compact {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .tool-title.compact {
        font-weight: 600;
        font-size: 12px;
        line-height: 1.2;
        color: var(--vscode-sideBar-foreground);
    }

    .tool-description.compact {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .tool-button.active {
        background: var(--vscode-list-activeSelectionBackground);
        border-color: var(--vscode-focusBorder);
        color: var(--vscode-list-activeSelectionForeground, var(--vscode-sideBar-foreground));
    }

    .tool-button.active .tool-title,
    .tool-button.active .tool-description {
        color: var(--vscode-list-activeSelectionForeground, var(--vscode-sideBar-foreground));
    }
</style>
</head>
<body>
    <div class="sidebar-root">
        <div class="tool-list-main">
            ${mainRows}
        </div>
        <div class="tool-list-bottom">
            ${bottomRows}
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || {};
        const buttons = Array.from(document.querySelectorAll('.tool-button[data-command]'));

        function setActive(command) {
            buttons.forEach(button => {
                button.classList.toggle('active', button.getAttribute('data-command') === command);
            });
            vscode.setState({ activeCommand: command });
        }

        buttons.forEach(button => {
            const command = button.getAttribute('data-command');
            button.addEventListener('click', () => {
                setActive(command);
                vscode.postMessage({
                    command: 'runTool',
                    toolCommand: command
                });
            });
        });

        if (typeof state.activeCommand === 'string' && state.activeCommand.length > 0) {
            setActive(state.activeCommand);
        }
    </script>
</body>
</html>`;
    }
}

// ─── Settings Panel (AES KeyIdentifiers + display mode) ──────────────────────
export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _context: vscode.ExtensionContext;
    private _onSaved?: () => void;

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, onSaved?: () => void) {
        this._panel = panel;
        this._context = context;
        this._onSaved = onSaved;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initHtml();
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'save': {
                        const keyIdentifiers = normalizeAesKeyIdentifiers(message.aesKeyIdentifiers);
                        setAesKeyIdentifiers(this._context, keyIdentifiers);
                        this._panel.webview.postMessage({ command: 'saved' });
                        this._onSaved?.();
                        return;
                    }
                    case 'reset': {
                        setAesKeyIdentifiers(this._context, DEFAULT_AES_KEY_IDENTIFIERS).then(() => this._initHtml());
                        this._onSaved?.();
                        return;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public static render(context: vscode.ExtensionContext, onSaved?: () => void) {
        const column = vscode.ViewColumn.One;
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('devx.settings', 'Settings', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri],
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'settings.svg');
        SettingsPanel.currentPanel = new SettingsPanel(panel, context, onSaved);
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }

    private async _initHtml(): Promise<void> {
        const webview = this._panel.webview;
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const aesKeyIdentifiers = await getAesKeyIdentifiers(this._context);
        const escapeAttr = (value: string): string =>
            value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const iconUri = (file: string) =>
            webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'icons', file)).toString();

        const aesRows = aesKeyIdentifiers
            .map(
                (keyIdentifier) => `<tr>
            <td>
                <input
                    type="text"
                    class="keyidentifier-name"
                    value="${escapeAttr(keyIdentifier.keyIdentifier)}"
                    placeholder="KeyIdentifier" />
            </td>
            <td>
                <div class="key-wrapper">
                    <input
                        type="password"
                        class="keyidentifier-key"
                        value="${escapeAttr(keyIdentifier.key)}"
                        placeholder="Encryption key (min 16 chars)" />
                    <button type="button" class="eye-btn" title="Show key" aria-label="Show key" aria-pressed="false"><svg class="icon-show" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg><svg class="icon-hide" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.05 2.05a.5.5 0 0 1 .7 0l11.2 11.2a.5.5 0 0 1-.7.7l-2.06-2.05A8.7 8.7 0 0 1 8 13c-3.5 0-6.5-2.5-8-5 .8-1.33 2.06-2.84 3.7-3.94L2.05 2.76a.5.5 0 0 1 0-.71zM4.43 5.14C3.13 6 2.07 7.13 1.4 8c1.1 1.45 3.4 3.5 6.6 3.5.95 0 1.83-.18 2.62-.48l-1.4-1.4a2.5 2.5 0 0 1-3.34-3.34L4.43 5.14zM8 3c-.6 0-1.18.07-1.73.2l1.16 1.16A2.5 2.5 0 0 1 10.64 7.57l1.85 1.85C13.6 8.55 14.4 7.6 14.6 7c-1.1-1.45-3.4-3.5-6.6-3.5z"/></svg></button>
                </div>
            </td>
            <td class="table-actions">
                <button type="button" class="del-btn">Delete</button>
            </td>
        </tr>`
            )
            .join('');

        this._panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Settings</title>
<style>
    body {
        padding: 20px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
    }
    .container { max-width: 980px; margin: 0 auto; }
    h2 { display: flex; align-items: center; gap: 10px; margin-top: 0; }
    .header-icon { width: 26px; height: 26px; }

    .card {
        border: 1px solid var(--vscode-input-border);
        border-radius: 12px;
        padding: 18px;
        background-color: var(--vscode-editor-background);
        margin-bottom: 16px;
    }
    .card-title {
        font-size: 1em; font-weight: bold; margin: 0 0 14px;
        display: flex; align-items: center; gap: 7px;
        border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px;
    }

    .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .mode-card {
        border: 1px solid var(--vscode-input-border);
        padding: 10px 12px; position: relative;
        background: var(--vscode-textBlockQuote-background);
        border-color: var(--vscode-textLink-foreground);
    }
    .mode-card-title { font-weight: bold; font-size: 0.88em; margin-bottom: 3px; }
    .mode-card-desc   { font-size: 0.74em; color: var(--vscode-descriptionForeground); line-height: 1.4; }
    .mode-preview {
        font-size: 0.7em; color: var(--vscode-descriptionForeground);
        border-left: 2px solid var(--vscode-input-border);
        padding-left: 5px; margin-top: 7px; line-height: 1.9; font-family: monospace;
    }

    .aes-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    .aes-table thead th:nth-child(1) { width: 180px; }
    .aes-table thead th:nth-child(3) { width: 96px; text-align: center; }
    .aes-table thead th {
        text-align: left;
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .aes-table td {
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
        vertical-align: middle;
        word-break: break-word;
    }
    .aes-table td:last-child { text-align: center; }
    .aes-table tr:last-child td {
        border-bottom: none;
    }
    .key-wrapper {
        display: flex;
        gap: 6px;
        align-items: center;
    }
    .key-wrapper input { flex: 1; }
    .table-actions { width: 90px; text-align: center; }
    input[type=text], input[type=password] {
        width: 100%;
        padding: 7px 8px;
        box-sizing: border-box;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        font-family: monospace;
        font-size: 12.5px;
        border-radius: 6px;
    }

    .tab-actions {
        margin-top: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .actions {
        position: sticky; bottom: -20px;
        margin: 24px -20px -20px; padding: 14px 20px;
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        background: var(--vscode-editor-background);
        border-top: 1px solid var(--vscode-panel-border);
        z-index: 5;
    }
    button {
        padding: 8px 18px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        cursor: pointer;
        font-family: var(--vscode-font-family);
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        text-align: center;
        line-height: 1.2;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .eye-btn { padding: 6px 8px; display: inline-flex; align-items: center; justify-content: center;
               background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
               border: 1px solid var(--vscode-input-border); cursor: pointer; }
    .eye-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .eye-btn .icon-hide { display: none; }
    .eye-btn[aria-pressed="true"] .icon-show { display: none; }
    .eye-btn[aria-pressed="true"] .icon-hide { display: inline-block; }
    .del-btn { background: #c0392b; color: #fff; padding: 6px 10px; }
    .del-btn:hover { background: #e74c3c; }
    #savedMsg { color: #4CAF50; font-weight: bold; display: none; font-size: 0.88em; }
</style>
</head>
<body>
<div class="container">
    <h2>
        <img class="header-icon" src="${iconUri('settings.svg')}" alt="" />
        Settings
    </h2>

    <section class="card" id="aes-settings-section">
        <div class="card-title">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M8 1l6 3v4c0 3.2-2.1 6.4-6 7-3.9-.6-6-3.8-6-7V4l6-3z"/>
            </svg>
            AES KeyIdentifier Settings
        </div>
        <table class="aes-table">
            <thead>
                <tr>
                    <th>KeyIdentifier</th>
                    <th>Encryption Key</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody id="keyIdentifierTable">${aesRows}</tbody>
        </table>
        <div class="tab-actions">
            <button id="addKeyIdentifierBtn" type="button" class="btn-secondary">+ Add KeyIdentifier</button>
        </div>
    </section>

    <section class="card" id="display-mode-section">
        <div class="card-title">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M1 2h14v12H1V2zm1 1v10h12V3H2z"/>
            </svg>
            Display Mode
        </div>
        <div class="mode-grid">
            <div class="mode-card active" data-mode="compact">
                <div class="mode-card-title">Compact</div>
                <div class="mode-card-desc">Icon + title + description inline</div>
                <div class="mode-preview">&#9632; Tool Name <em>desc</em></div>
            </div>
        </div>
    </section>

    <div class="actions">
        <button id="saveBtn">&#10003; Save Changes</button>
        <button id="resetBtn" class="btn-secondary">Reset to Defaults</button>
        <span id="savedMsg">&#10003; Saved!</span>
    </div>
</div>
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const keyIdentifierTable = document.getElementById('keyIdentifierTable');
    function attachRowListeners(row) {
        row.querySelector('.del-btn').addEventListener('click', () => row.remove());
        const eyeBtn = row.querySelector('.eye-btn');
        eyeBtn.addEventListener('click', () => {
            const keyInput = row.querySelector('.keyidentifier-key');
            const willShow = keyInput.type === 'password';
            keyInput.type = willShow ? 'text' : 'password';
            eyeBtn.setAttribute('aria-pressed', String(willShow));
            const label = willShow ? 'Hide key' : 'Show key';
            eyeBtn.setAttribute('aria-label', label);
            eyeBtn.setAttribute('title', label);
        });
    }

    function addRow(keyIdentifier, key) {
        const row = document.createElement('tr');
        row.innerHTML =
            '<td><input type="text" class="keyidentifier-name" placeholder="KeyIdentifier" /></td>' +
            '<td><div class="key-wrapper"><input type="password" class="keyidentifier-key" placeholder="Encryption key (min 16 chars)" />' +
            '<button type="button" class="eye-btn" title="Show key" aria-label="Show key" aria-pressed="false"><svg class="icon-show" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg><svg class="icon-hide" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.05 2.05a.5.5 0 0 1 .7 0l11.2 11.2a.5.5 0 0 1-.7.7l-2.06-2.05A8.7 8.7 0 0 1 8 13c-3.5 0-6.5-2.5-8-5 .8-1.33 2.06-2.84 3.7-3.94L2.05 2.76a.5.5 0 0 1 0-.71zM4.43 5.14C3.13 6 2.07 7.13 1.4 8c1.1 1.45 3.4 3.5 6.6 3.5.95 0 1.83-.18 2.62-.48l-1.4-1.4a2.5 2.5 0 0 1-3.34-3.34L4.43 5.14zM8 3c-.6 0-1.18.07-1.73.2l1.16 1.16A2.5 2.5 0 0 1 10.64 7.57l1.85 1.85C13.6 8.55 14.4 7.6 14.6 7c-1.1-1.45-3.4-3.5-6.6-3.5z"/></svg></button></div></td>' +
            '<td class="table-actions"><button type="button" class="del-btn">Delete</button></td>';
        row.querySelector('.keyidentifier-name').value = keyIdentifier;
        row.querySelector('.keyidentifier-key').value = key;
        keyIdentifierTable.appendChild(row);
        attachRowListeners(row);
    }

    Array.from(keyIdentifierTable.querySelectorAll('tr')).forEach(attachRowListeners);

    document.getElementById('addKeyIdentifierBtn').addEventListener('click', () => {
        addRow('', '');
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        const aesKeyIdentifiers = Array.from(keyIdentifierTable.querySelectorAll('tr')).map((row) => ({
            keyIdentifier: row.querySelector('.keyidentifier-name').value.trim(),
            key: row.querySelector('.keyidentifier-key').value
        }));
        vscode.postMessage({ command: 'save', aesKeyIdentifiers });
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'reset' });
    });

    window.addEventListener('message', e => {
        if (e.data.command === 'saved') {
            const msg = document.getElementById('savedMsg');
            msg.style.display = 'inline';
            setTimeout(() => { msg.style.display = 'none'; }, 3000);
        }
    });
</script>
</body>
</html>`;
    }
}
// ───────────────────────────────────────────────────────────────────────────
