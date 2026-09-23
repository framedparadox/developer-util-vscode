import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { assertInputSize } from '../limits';
import { hashFile } from '../utilities/cryptoTools';
import { executeUtility, getUtilityTool } from '../utilities/execute';
import type { UtilityField, UtilityTool } from '../utilities/types';

export class UtilityPanel {
    private static readonly current = new Map<string, UtilityPanel>();
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly tool: UtilityTool;

    private constructor(panel: vscode.WebviewPanel, tool: UtilityTool) {
        this.panel = panel;
        this.tool = tool;
        this.panel.webview.html = this.html(panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.onMessage(message), null, this.disposables);
    }

    public static render(extensionUri: vscode.Uri, toolId: string): void {
        const tool = getUtilityTool(toolId);
        const existing = UtilityPanel.current.get(tool.id);
        if (existing) {
            existing.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(`devx.utility.${tool.id}`, tool.label, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri],
        });
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', tool.icon);
        UtilityPanel.current.set(tool.id, new UtilityPanel(panel, tool));
    }

    private async onMessage(message: { command?: string; action?: string; values?: unknown; text?: string }): Promise<void> {
        try {
            if (message.command === 'copy') {
                await vscode.env.clipboard.writeText(assertInputSize(message.text, 'Output'));
                await this.panel.webview.postMessage({ command: 'notice', message: 'Copied to clipboard.' });
                return;
            }
            if (message.command === 'hashFile') {
                const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, title: 'Checksum file' });
                if (!picked?.[0]) {
                    return;
                }
                const algorithm = this.fieldValue(message.values, 'algorithm') || 'sha256';
                const output = await hashFile(picked[0].fsPath, algorithm);
                await this.panel.webview.postMessage({ command: 'result', output, notice: 'Checksum calculated locally.' });
                return;
            }
            if (message.command !== 'run' || typeof message.action !== 'string') {
                return;
            }
            const extra: Record<string, string> = {};
            if (this.tool.inject?.includes('vscodeVersion')) {
                extra.vscodeVersion = vscode.version;
            }
            const result = await executeUtility(this.tool.id, message.action, message.values, extra);
            await this.panel.webview.postMessage({ command: 'result', ...result });
        } catch (error) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private fieldValue(values: unknown, id: string): string {
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return '';
        }
        const value = (values as Record<string, unknown>)[id];
        return typeof value === 'string' ? value : '';
    }

    public dispose(): void {
        UtilityPanel.current.delete(this.tool.id);
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    private html(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('base64url');
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const fields = this.tool.fields.map((field) => this.renderField(field)).join('');
        const actions = this.tool.actions
            .map((action) => `<button type="button" data-action="${escapeAttr(action.id)}">${escapeHtml(action.label)}</button>`)
            .join('');
        const fileAction = this.tool.fileAction
            ? `<button type="button" id="fileAction" class="secondary">${escapeHtml(this.tool.fileAction.label)}</button>`
            : '';
        const keycode =
            this.tool.presentation === 'keycode'
                ? `<div id="keyCapture" tabindex="0">Click here and press a key</div><pre id="keyDetails"></pre>`
                : '';
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${escapeHtml(this.tool.label)}</title>
<style>
    body { margin: 0; padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    .wrap { max-width: 980px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .category { color: var(--vscode-textLink-foreground); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
    .summary { margin: 12px 0 18px; padding: 10px 12px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    label.wide { grid-column: 1 / -1; }
    input, select, textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: 13px var(--vscode-editor-font-family, monospace); }
    textarea { min-height: 90px; resize: vertical; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    button { padding: 8px 14px; border: 0; border-radius: 6px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    #message { min-height: 1.2em; margin: 0 0 8px; }
    #message.error { color: var(--vscode-errorForeground); }
    #message.notice { color: var(--vscode-testing-iconPassed, #4caf50); }
    #preview { margin-top: 12px; }
    #preview svg { width: 220px; height: auto; background: white; padding: 8px; }
    #preview :is(h1,h2,h3,h4,h5,h6) { margin: .6em 0 .3em; }
    #preview pre { padding: 10px; overflow: auto; background: var(--vscode-textCodeBlock-background); }
    #keyCapture { margin-top: 8px; padding: 28px; text-align: center; border: 1px dashed var(--vscode-input-border); }
    #keyCapture:focus { outline: 1px solid var(--vscode-focusBorder); }
    #keyDetails { white-space: pre-wrap; }
</style>
</head>
<body>
<div class="wrap">
    <div class="category">${escapeHtml(this.tool.category)}</div>
    <h1>${escapeHtml(this.tool.label)}</h1>
    <div class="summary">${escapeHtml(this.tool.summary)}</div>
    <form id="toolForm">
        <div class="grid">${fields}</div>
        <div class="actions">${actions}${fileAction}<button type="button" id="copyBtn" class="secondary">Copy</button><button type="button" id="clearBtn" class="secondary">Clear</button></div>
    </form>
    ${keycode}
    <div id="message" role="status"></div>
    <label class="wide">Output<textarea id="output" rows="12" readonly></textarea></label>
    <div id="preview"></div>
</div>
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('toolForm');
    const output = document.getElementById('output');
    const message = document.getElementById('message');
    const preview = document.getElementById('preview');
    function sanitizePreview(html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        template.content.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach((node) => node.remove());
        template.content.querySelectorAll('*').forEach((node) => {
            [...node.attributes].forEach((attr) => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith('on') || name === 'srcdoc') {
                    node.removeAttribute(attr.name);
                }
                if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
                    node.removeAttribute(attr.name);
                }
            });
        });
        return template.innerHTML;
    }
    function values() {
        const data = {};
        new FormData(form).forEach((value, key) => { data[key] = String(value); });
        return data;
    }
    function show(text, kind) {
        message.textContent = text || '';
        message.className = kind || '';
    }
    form.addEventListener('click', (event) => {
        const action = event.target && event.target.getAttribute && event.target.getAttribute('data-action');
        if (!action) return;
        show('', '');
        vscode.postMessage({ command: 'run', action, values: values() });
    });
    const fileAction = document.getElementById('fileAction');
    if (fileAction) {
        fileAction.addEventListener('click', () => vscode.postMessage({ command: 'hashFile', values: values() }));
    }
    document.getElementById('copyBtn').addEventListener('click', () => {
        if (!output.value) { show('Nothing to copy.', 'error'); return; }
        navigator.clipboard.writeText(output.value).then(() => show('Copied to clipboard.', 'notice'), () => {
            vscode.postMessage({ command: 'copy', text: output.value });
        });
    });
    document.getElementById('clearBtn').addEventListener('click', () => {
        output.value = '';
        preview.innerHTML = '';
        show('', '');
    });
    const keyCapture = document.getElementById('keyCapture');
    if (keyCapture) {
        keyCapture.addEventListener('keydown', (event) => {
            event.preventDefault();
            const details = [
                'key: ' + event.key,
                'code: ' + event.code,
                'keyCode: ' + event.keyCode,
                'location: ' + event.location,
                'alt: ' + event.altKey,
                'ctrl: ' + event.ctrlKey,
                'meta: ' + event.metaKey,
                'shift: ' + event.shiftKey,
                'repeat: ' + event.repeat
            ].join('\\n');
            document.getElementById('keyDetails').textContent = details;
            output.value = details;
        });
    }
    window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.command === 'result') {
            output.value = data.output || '';
            preview.innerHTML = sanitizePreview(typeof data.previewHtml === 'string' ? data.previewHtml : '');
            show(data.notice || '', data.notice ? 'notice' : '');
        } else if (data.command === 'error') {
            show(data.message || 'The tool failed.', 'error');
        } else if (data.command === 'notice') {
            show(data.message || '', 'notice');
        }
    });
</script>
</body>
</html>`;
    }

    private renderField(field: UtilityField): string {
        const wide = field.kind === 'textarea' ? ' wide' : '';
        const id = escapeAttr(field.id);
        let control = '';
        if (field.kind === 'textarea') {
            control = `<textarea name="${id}" rows="${field.rows ?? 6}" placeholder="${escapeAttr(field.placeholder ?? '')}"></textarea>`;
        } else if (field.kind === 'select') {
            const options = (field.options ?? [])
                .map((option) => {
                    const selected = option.value === field.defaultValue ? ' selected' : '';
                    return `<option value="${escapeAttr(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
                })
                .join('');
            control = `<select name="${id}">${options}</select>`;
        } else {
            control = `<input name="${id}" type="${field.kind === 'number' ? 'number' : 'text'}" value="${escapeAttr(field.defaultValue ?? '')}" placeholder="${escapeAttr(field.placeholder ?? '')}">`;
        }
        return `<label class="${wide.trim()}">${escapeHtml(field.label)}${control}</label>`;
    }
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/'/g, '&#39;');
}
