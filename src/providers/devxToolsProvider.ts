import * as crypto from 'crypto';
import * as vscode from 'vscode';

// ─── Configure Sidebar Panel ───────────────────────────────────────────────
export class ConfigSidebarPanel {
    public static currentPanel: ConfigSidebarPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _context: vscode.ExtensionContext;
    private _onRefresh?: () => void;

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, onRefresh?: () => void) {
        this._panel = panel;
        this._context = context;
        this._onRefresh = onRefresh;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initHtml();
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'save': {
                        const visibility = normalizeVisibility(message.visibility);
                        const mode = normalizeDisplayMode(message.mode);
                        const preferences = normalizeGeneralPreferences(message.preferences);
                        await Promise.all([
                            this._context.globalState.update(SIDEBAR_VISIBILITY_KEY, visibility),
                            this._context.globalState.update(SIDEBAR_DISPLAY_MODE_KEY, mode),
                            this._context.globalState.update(GENERAL_PREFERENCES_KEY, preferences),
                        ]);
                        await this._panel.webview.postMessage({ command: 'saved' });
                        this._onRefresh?.();
                        return;
                    }
                    case 'reset': {
                        await Promise.all([
                            this._context.globalState.update(SIDEBAR_VISIBILITY_KEY, buildVisibilityDefaults()),
                            this._context.globalState.update(SIDEBAR_DISPLAY_MODE_KEY, 'compact'),
                            this._context.globalState.update(GENERAL_PREFERENCES_KEY, DEFAULT_GENERAL_PREFERENCES),
                        ]);
                        this._initHtml();
                        this._onRefresh?.();
                        return;
                    }
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(context: vscode.ExtensionContext, onRefresh?: () => void) {
        const column = vscode.ViewColumn.One;
        if (ConfigSidebarPanel.currentPanel) {
            ConfigSidebarPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('devx.configureSidebar', 'Settings', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri],
        });
        ConfigSidebarPanel.currentPanel = new ConfigSidebarPanel(panel, context, onRefresh);
    }

    public dispose() {
        ConfigSidebarPanel.currentPanel = undefined;
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
        const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const visibility = getVisibility(this._context);
        const mode = getDisplayMode(this._context);
        const preferences = getGeneralPreferences(this._context);
        const iconUri = (file: string) =>
            webview
                .asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'icons', file))
                .toString();

        const modeData = [
            {
                id: 'compact',
                title: 'Compact',
                desc: 'Icon + title + description inline',
                preview: '&#9632; Tool Name <em>desc</em>',
            },
            { id: 'simple', title: 'Simple', desc: 'Icon + title only', preview: '&#9632; Tool Name' },
            {
                id: 'comfy',
                title: 'Comfy',
                desc: 'Extensions-style cards with two-line descriptions',
                preview: '&#9632; Tool Name<br><em style="opacity:.7">description here</em>',
            },
            {
                id: 'icons',
                title: 'Icons',
                desc: 'Icons only, minimal',
                preview: '&#9632; &nbsp; &#9632; &nbsp; &#9632;',
            },
        ];
        const modeCards = modeData
            .map(
                (m) =>
                    `<div class="mode-card${mode === m.id ? ' active' : ''}" data-mode="${m.id}">
                <input type="radio" name="mode" value="${m.id}"${mode === m.id ? ' checked' : ''}>
                <div class="mode-card-title">${m.title}</div>
                <div class="mode-card-desc">${m.desc}</div>
                <div class="mode-preview">${m.preview}</div>
            </div>`,
            )
            .join('');

        const toolRows = ALL_TOOLS.map((t) => {
            const checked = visibility[t.label] !== false ? 'checked' : '';
            return `<label class="tool-row">
                <span class="switch"><input type="checkbox" data-tool="${t.label}" ${checked}><span class="slider"></span></span>
                <span class="tool-meta">
                    <span class="tool-name">${t.label}</span>
                    <span class="tool-desc">${t.description}</span>
                </span>
            </label>`;
        }).join('');

        const prefRows = [
            {
                key: 'showRefreshMessage',
                title: 'Show refresh success message',
                desc: 'Display a confirmation toast when the refresh command is used',
                checked: preferences.showRefreshMessage,
            },
        ]
            .map(
                (pref) => `<label class="pref-row">
            <span class="switch"><input type="checkbox" data-pref="${pref.key}" ${pref.checked ? 'checked' : ''}><span class="slider"></span></span>
            <span class="pref-content">
                <span class="pref-title">${pref.title}</span>
                <span class="pref-desc">${pref.desc}</span>
            </span>
        </label>`,
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
    .tab-nav {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 20px 0;
    }
    .tab-btn {
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-foreground);
        font-size: 1.05em;
        font-weight: 600;
        padding: 15px;
        display: block;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tab-btn:hover {
        background-color: var(--vscode-textBlockQuote-background);
        border-color: var(--vscode-textLink-foreground);
    }
    .tab-btn.active {
        border-color: var(--vscode-textLink-foreground);
        background-color: var(--vscode-textBlockQuote-background);
    }

    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    .card-grid {
        display: grid;
        grid-template-columns: minmax(320px, 1.6fr) minmax(260px, 1fr);
        gap: 16px;
        align-items: start;
    }
    .card {
        border: 1px solid var(--vscode-input-border);
        border-radius: 12px;
        padding: 18px;
        background-color: var(--vscode-editor-background);
    }
    .panel-lead {
        margin: 0 0 14px;
        color: var(--vscode-descriptionForeground);
        font-size: 0.84em;
        line-height: 1.5;
    }
    .card-title {
        font-size: 1em; font-weight: bold; margin: 0 0 14px;
        display: flex; align-items: center; gap: 7px;
        border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px;
    }
    .card-counter {
        margin-left: auto; font-size: 0.78em; font-weight: 500;
        color: var(--vscode-descriptionForeground);
        padding: 2px 8px; border-radius: 999px;
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-input-border);
    }
    .tool-toolbar {
        display: flex; align-items: center; gap: 8px;
        margin: 0 0 12px; flex-wrap: wrap;
    }
    .tool-toolbar input[type=search] {
        flex: 1; min-width: 140px;
        padding: 5px 8px; border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border-radius: 4px; font-size: 0.85em;
    }
    .tool-toolbar input[type=search]:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
    .btn-link {
        background: transparent; border: none; cursor: pointer;
        color: var(--vscode-textLink-foreground); font-size: 0.82em;
        padding: 4px 6px; text-decoration: none;
    }
    .btn-link:hover { text-decoration: underline; }
    .empty-state {
        text-align: center; color: var(--vscode-descriptionForeground);
        font-size: 0.85em; padding: 12px; margin: 0;
    }

    .tool-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: 10px;
        padding: 8px;
        border-radius: 8px;
        cursor: pointer;
        border: 1px solid transparent;
        margin-bottom: 4px;
    }
    .tool-row:last-child { margin-bottom: 0; }
    .tool-row:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-panel-border);
    }
    .tool-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .tool-name { font-size: 0.88em; line-height: 1.35; font-weight: 600; }
    .tool-desc { font-size: 0.76em; color: var(--vscode-descriptionForeground); line-height: 1.45; }

    .switch { position: relative; display: inline-block; width: 38px; height: 21px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0;
               background: var(--vscode-input-border); border-radius: 21px; transition: .25s; }
    .slider:before { content: ''; position: absolute; height: 15px; width: 15px;
                     left: 3px; bottom: 3px; background: white;
                     border-radius: 50%; transition: .25s; }
    input:checked + .slider { background: #4CAF50; }
    input:checked + .slider:before { transform: translateX(17px); }

    .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .mode-card {
        border: 1px solid var(--vscode-input-border);
        padding: 10px 12px; cursor: pointer;
        transition: all 0.15s; position: relative;
        background: var(--vscode-editor-background);
    }
    .mode-card:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder); }
    .mode-card.active {
        background: var(--vscode-textBlockQuote-background);
        border-color: var(--vscode-textLink-foreground);
    }
    .mode-card input[type=radio] { position: absolute; opacity: 0; pointer-events: none; }
    .mode-card-title { font-weight: bold; font-size: 0.88em; margin-bottom: 3px; }
    .mode-card-desc   { font-size: 0.74em; color: var(--vscode-descriptionForeground); line-height: 1.4; }
    .mode-preview {
        font-size: 0.7em; color: var(--vscode-descriptionForeground);
        border-left: 2px solid var(--vscode-input-border);
        padding-left: 5px; margin-top: 7px; line-height: 1.9; font-family: monospace;
    }

    input[type=text] {
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

    .pref-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        margin-bottom: 4px;
    }
    .pref-row:last-child { margin-bottom: 0; }
    .pref-row:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-panel-border);
    }
    .pref-content { display: flex; flex-direction: column; gap: 2px; }
    .pref-title { font-size: 0.88em; }
    .pref-desc { font-size: 0.76em; color: var(--vscode-descriptionForeground); line-height: 1.4; }

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
    #savedMsg { color: #4CAF50; font-weight: bold; display: none; font-size: 0.88em; }

    @media (max-width: 860px) {
        .card-grid { grid-template-columns: 1fr; }
        .tab-actions { justify-content: flex-start; }
    }
</style>
</head>
<body>
<div class="container">
    <h2>
        <img class="header-icon" src="${iconUri('settings.svg')}" alt="" />
        Settings
    </h2>

    <div class="tab-nav" role="tablist" aria-label="Settings tabs">
        <button type="button" class="tab-btn active" data-tab="sidebar">Sidebar Config</button>
        <button type="button" class="tab-btn" data-tab="preferences">General Preferences</button>
    </div>

    <section class="tab-panel active" data-tab-panel="sidebar">
        <div class="card-grid">
            <section class="card" id="sidebar-section">
                <div class="card-title">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                        <path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z"/>
                    </svg>
                    Configure Sidebar
                    <span class="card-counter" id="toolCounter"></span>
                </div>
                <div class="tool-toolbar">
                    <input type="search" id="toolFilter" placeholder="Filter tools..." aria-label="Filter tools" />
                    <button type="button" class="btn-link" id="selectAllToolsBtn">Select all</button>
                    <button type="button" class="btn-link" id="clearAllToolsBtn">Clear all</button>
                </div>
                <div id="toolRowsContainer">${toolRows}</div>
                <p class="empty-state" id="toolFilterEmpty" hidden>No tools match.</p>
            </section>

            <section class="card" id="display-mode-section">
                <div class="card-title">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                        <path d="M1 2h14v12H1V2zm1 1v10h12V3H2z"/>
                    </svg>
                    Display Mode
                </div>
                <div class="mode-grid">
                    ${modeCards}
                </div>
            </section>
        </div>
    </section>

    <section class="tab-panel" data-tab-panel="preferences">
        <section class="card" id="general-preferences-section">
            <div class="card-title">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M8 1l2 2h3v3l2 2-2 2v3h-3l-2 2-2-2H3v-3L1 8l2-2V3h3l2-2zm0 4a3 3 0 100 6 3 3 0 000-6z"/>
                </svg>
                General Preferences
            </div>
            ${prefRows}
        </section>
    </section>

    <div class="actions">
        <button id="saveBtn">&#10003; Save Changes</button>
        <button id="resetBtn" class="btn-secondary">Reset to Defaults</button>
        <span id="savedMsg">&#10003; Saved! Sidebar refreshing...</span>
    </div>
</div>
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function setActiveTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
        });
    }

    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });

    const toolRowsAll = Array.from(document.querySelectorAll('#toolRowsContainer .tool-row'));
    const toolCounter = document.getElementById('toolCounter');
    const toolFilter = document.getElementById('toolFilter');
    const toolFilterEmpty = document.getElementById('toolFilterEmpty');

    function updateToolCounter() {
        const total = toolRowsAll.length;
        const visible = toolRowsAll.filter(r => r.querySelector('input[type=checkbox]').checked).length;
        toolCounter.textContent = visible + ' of ' + total + ' visible';
    }
    function applyToolFilter() {
        const q = (toolFilter.value || '').trim().toLowerCase();
        let shown = 0;
        toolRowsAll.forEach(row => {
            const name = row.querySelector('.tool-name').textContent.toLowerCase();
            const desc = row.querySelector('.tool-desc').textContent.toLowerCase();
            const match = !q || name.includes(q) || desc.includes(q);
            row.hidden = !match;
            if (match) shown++;
        });
        toolFilterEmpty.hidden = shown !== 0;
    }
    toolFilter.addEventListener('input', applyToolFilter);
    document.getElementById('selectAllToolsBtn').addEventListener('click', () => {
        toolRowsAll.forEach(r => { if (!r.hidden) r.querySelector('input[type=checkbox]').checked = true; });
        updateToolCounter();
    });
    document.getElementById('clearAllToolsBtn').addEventListener('click', () => {
        toolRowsAll.forEach(r => { if (!r.hidden) r.querySelector('input[type=checkbox]').checked = false; });
        updateToolCounter();
    });
    toolRowsAll.forEach(r => r.querySelector('input[type=checkbox]').addEventListener('change', updateToolCounter));
    updateToolCounter();

    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type=radio]').checked = true;
        });
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        const visibility = {};
        document.querySelectorAll('input[data-tool]').forEach(cb => {
            visibility[cb.dataset.tool] = cb.checked;
        });
        const modeEl = document.querySelector('input[name=mode]:checked');
        const mode = modeEl ? modeEl.value : 'compact';
        const preferences = {};
        document.querySelectorAll('input[data-pref]').forEach(cb => {
            preferences[cb.dataset.pref] = cb.checked;
        });
        vscode.postMessage({ command: 'save', visibility, mode, preferences });
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
// ─── Sidebar configuration types & storage helpers ──────────────────────────
export type SidebarDisplayMode = 'compact' | 'simple' | 'comfy' | 'icons';
export const SIDEBAR_VISIBILITY_KEY = 'devx.sidebarVisibility';
export const SIDEBAR_DISPLAY_MODE_KEY = 'devx.sidebarDisplayMode';
export const GENERAL_PREFERENCES_KEY = 'devx.generalPreferences';

export interface GeneralPreferences {
    showRefreshMessage: boolean;
}

export const DEFAULT_GENERAL_PREFERENCES: GeneralPreferences = {
    showRefreshMessage: true,
};

export interface SidebarTool {
    label: string;
    description: string;
    command: string;
    icon: string;
    defaultVisible: boolean;
}

export const ALL_TOOLS: SidebarTool[] = [
    {
        label: 'Base64 Encode/Decode',
        description: 'Encode or decode Base64 strings',
        command: 'devx.base64Tool',
        icon: 'base64.svg',
        defaultVisible: true,
    },
    {
        label: 'JWT Debugger',
        description: 'Decode and validate JWT tokens',
        command: 'devx.jwtDebugger',
        icon: 'jwt.svg',
        defaultVisible: true,
    },
    {
        label: 'UUID Generator',
        description: 'Generate UUID v1, v4, v7, and Null UUIDs',
        command: 'devx.uuidGenerator',
        icon: 'uuid.svg',
        defaultVisible: true,
    },
    {
        label: 'Format Text',
        description: 'Format escaped text sequences',
        command: 'devx.escapeTool',
        icon: 'format-text.svg',
        defaultVisible: true,
    },
    {
        label: 'Data Formatter',
        description: 'Format XML, JSON, and SQL',
        command: 'devx.formatterTool',
        icon: 'formatter.svg',
        defaultVisible: true,
    },
    {
        label: 'AES Encrypt / Decrypt',
        description: 'Encrypt or decrypt text, files, and URLs with AES',
        command: 'devx.aesEncryptDecryptGeneric',
        icon: 'aes.svg',
        defaultVisible: true,
    },
    {
        label: 'Certificate Tools',
        description: 'Validate, decode, and convert certificates',
        command: 'devx.certificateTool',
        icon: 'certificate.svg',
        defaultVisible: false,
    },
    {
        label: 'Certificate Expiry Checker',
        description: 'Check certificate expiration dates',
        command: 'devx.certificateExpiryChecker',
        icon: 'cert-expiry.svg',
        defaultVisible: false,
    },
    {
        label: 'Data Visualizer',
        description: 'Visualize JSON, YAML, XML, CSV, RAML data',
        command: 'devx.visualizerTool',
        icon: 'visualizer.svg',
        defaultVisible: false,
    },
    {
        label: 'Data Converter',
        description: 'Convert between JSON, YAML, XML, CSV, RAML',
        command: 'devx.dataConverter',
        icon: 'converter.svg',
        defaultVisible: false,
    },
];

function buildVisibilityDefaults(): { [label: string]: boolean } {
    const d: { [label: string]: boolean } = {};
    ALL_TOOLS.forEach((t) => {
        d[t.label] = t.defaultVisible;
    });
    return d;
}

export function getVisibility(context: vscode.ExtensionContext): { [label: string]: boolean } {
    return normalizeVisibility(context.globalState.get<unknown>(SIDEBAR_VISIBILITY_KEY));
}

export function getDisplayMode(context: vscode.ExtensionContext): SidebarDisplayMode {
    return normalizeDisplayMode(context.globalState.get<unknown>(SIDEBAR_DISPLAY_MODE_KEY));
}

export function getGeneralPreferences(context: vscode.ExtensionContext): GeneralPreferences {
    return normalizeGeneralPreferences(context.globalState.get<unknown>(GENERAL_PREFERENCES_KEY));
}

function normalizeVisibility(value: unknown): { [label: string]: boolean } {
    const defaults = buildVisibilityDefaults();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return defaults;
    }

    const saved = value as Record<string, unknown>;
    for (const tool of ALL_TOOLS) {
        const isVisible = saved[tool.label];
        if (typeof isVisible === 'boolean') {
            defaults[tool.label] = isVisible;
        }
    }
    return defaults;
}

function normalizeDisplayMode(value: unknown): SidebarDisplayMode {
    return value === 'simple' || value === 'comfy' || value === 'icons' ? value : 'compact';
}

function normalizeGeneralPreferences(value: unknown): GeneralPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_GENERAL_PREFERENCES };
    }

    const saved = value as Record<string, unknown>;
    return {
        showRefreshMessage:
            typeof saved.showRefreshMessage === 'boolean'
                ? saved.showRefreshMessage
                : DEFAULT_GENERAL_PREFERENCES.showRefreshMessage,
    };
}
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarViewItem {
    label: string;
    description: string;
    command: string;
    iconFile: string;
}

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
                    if (
                        typeof message.toolCommand === 'string' &&
                        (message.toolCommand === 'devx.configureSidebar' ||
                            ALL_TOOLS.some((tool) => tool.command === message.toolCommand))
                    ) {
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

    private renderItem(webview: vscode.Webview, item: SidebarViewItem, mode: SidebarDisplayMode): string {
        const iconSrc = this.iconUri(webview, item.iconFile);
        const safeLabel = this.escapeHtml(item.label);
        const safeDescription = this.escapeHtml(item.description);
        const safeCommand = this.escapeHtml(item.command);
        const safeTitle = this.escapeHtml(`${item.label}: ${item.description}`);

        if (mode === 'icons') {
            return `<button type="button" class="tool-button icon-only" data-command="${safeCommand}" title="${safeTitle}" aria-label="${safeTitle}">
                <img src="${iconSrc}" class="tool-icon icon-only" alt="" />
            </button>`;
        }

        if (mode === 'simple') {
            return `<button type="button" class="tool-button simple" data-command="${safeCommand}" title="${safeTitle}">
                <img src="${iconSrc}" class="tool-icon simple" alt="" />
                <span class="tool-title simple">${safeLabel}</span>
            </button>`;
        }

        if (mode === 'comfy') {
            return `<button type="button" class="tool-button comfy" data-command="${safeCommand}" title="${safeTitle}">
                <img src="${iconSrc}" class="tool-icon comfy" alt="" />
                <span class="tool-content">
                    <span class="tool-title comfy">${safeLabel}</span>
                    <span class="tool-description comfy">${safeDescription}</span>
                </span>
            </button>`;
        }

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
        const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const visibility = getVisibility(this._context);
        const mode = getDisplayMode(this._context);

        const toolItems: SidebarViewItem[] = ALL_TOOLS.filter((tool) => visibility[tool.label] !== false).map(
            (tool) => ({
                label: tool.label,
                description: tool.description,
                command: tool.command,
                iconFile: tool.icon,
            }),
        );

        const adminItems: SidebarViewItem[] = [
            {
                label: 'Settings',
                description: 'Configure sidebar visibility and display mode',
                command: 'devx.configureSidebar',
                iconFile: 'settings.svg',
            },
        ];

        const mainRows = toolItems.map((item) => this.renderItem(webview, item, mode)).join('');
        const bottomRows = adminItems.map((item) => this.renderItem(webview, item, mode)).join('');
        const modeClass = `mode-${mode}`;

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

    .tool-title {
        font-weight: 600;
        color: var(--vscode-sideBar-foreground);
    }

    .tool-description {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
    }

    .mode-icons .tool-list-main {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        align-content: start;
    }

    .mode-icons .tool-button.icon-only {
        justify-content: center;
        padding: 8px;
        min-height: 40px;
        border: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        background: var(--vscode-editorWidget-background);
    }

    .mode-icons .tool-icon.icon-only {
        width: 18px;
        height: 18px;
    }

    .mode-simple .tool-button.simple {
        padding: 7px 8px;
        border: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        background: var(--vscode-editorWidget-background);
    }

    .mode-simple .tool-title.simple {
        font-size: 12px;
        line-height: 1.25;
    }

    .mode-compact .tool-button.compact {
        padding: 7px 8px;
        border: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        background: var(--vscode-editorWidget-background);
    }

    .mode-compact .tool-content.compact {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .mode-compact .tool-title.compact {
        font-size: 12px;
        line-height: 1.2;
    }

    .mode-compact .tool-description.compact {
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .mode-comfy .tool-button.comfy {
        padding: 9px;
        border: 1px solid var(--vscode-sideBar-border, var(--vscode-input-border));
        background: var(--vscode-editorWidget-background);
        align-items: flex-start;
        gap: 10px;
    }

    .mode-comfy .tool-icon.comfy {
        width: 34px;
        height: 34px;
        margin-top: 1px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 4px;
        box-sizing: border-box;
    }

    .mode-comfy .tool-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
    }

    .mode-comfy .tool-title.comfy {
        font-size: 12.5px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .mode-comfy .tool-description.comfy {
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .tool-button.active,
    .mode-icons .tool-button.icon-only.active,
    .mode-simple .tool-button.simple.active,
    .mode-compact .tool-button.compact.active,
    .mode-comfy .tool-button.comfy.active {
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
<body class="${this.escapeHtml(modeClass)}">
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
