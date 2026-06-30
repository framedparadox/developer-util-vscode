import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { CSVParser, JSONParser, RAMLParser, XMLParserImpl, YAMLParser } from '../visualizer/parsers';
import { detectDataFormat } from '../visualizer/format';
import { DataTransformer } from '../visualizer/transformer';
import { ConversionFormat, Parser, VisualizerGraphData } from '../visualizer/types';

const RENDER_LIMIT = 1500;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;

interface VisualizerContext {
    mode: 'file' | 'sidebar';
    fileContent?: string;
    fileName?: string;
    fileType?: string;
}

export class VisualizerPanel {
    public static currentPanel: VisualizerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private readonly _extensionUri: vscode.Uri;
    private _context: VisualizerContext;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: VisualizerContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'ready':
                        this._panel.webview.postMessage({
                            command: 'init',
                            context: this._context,
                        });
                        return;
                    case 'parse':
                        this.handleParse(message.content, message.fileName, message.fileType);
                        return;
                    case 'exportImage':
                        void this.handleExportImage(message.svg, message.fileName);
                        return;
                    case 'error':
                        vscode.window.showErrorMessage(message.message);
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (VisualizerPanel.currentPanel) {
            VisualizerPanel.currentPanel._panel.title = 'Data Visualizer';
            VisualizerPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            VisualizerPanel.currentPanel._context = { mode: 'sidebar' };
            VisualizerPanel.currentPanel._panel.webview.postMessage({
                command: 'init',
                context: VisualizerPanel.currentPanel._context,
            });
        } else {
            const panel = vscode.window.createWebviewPanel(
                'visualizerPanel',
                'Data Visualizer',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
                },
            );

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'visualizer.svg');
            VisualizerPanel.currentPanel = new VisualizerPanel(panel, extensionUri, { mode: 'sidebar' });
        }
    }

    public static renderFromFile(extensionUri: vscode.Uri) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = editor.document;
        const fileContent = document.getText();
        const fileName = document.fileName.split('/').pop() || 'untitled';
        const fileType = document.languageId;

        if (VisualizerPanel.currentPanel) {
            VisualizerPanel.currentPanel._panel.title = `Visualize: ${fileName}`;
            VisualizerPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            VisualizerPanel.currentPanel._context = {
                mode: 'file',
                fileContent,
                fileName,
                fileType,
            };
            VisualizerPanel.currentPanel._panel.webview.postMessage({
                command: 'init',
                context: VisualizerPanel.currentPanel._context,
            });
        } else {
            const panel = vscode.window.createWebviewPanel(
                'visualizerPanel',
                `Visualize: ${fileName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
                },
            );

            panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'visualizer.svg');
            VisualizerPanel.currentPanel = new VisualizerPanel(panel, extensionUri, {
                mode: 'file',
                fileContent,
                fileName,
                fileType,
            });
        }
    }

    private handleParse(content: unknown, fileName?: string, fileType?: string) {
        const startedAt = Date.now();
        if (typeof content !== 'string') {
            this.postParseError('Visualization input must be text.');
            return;
        }
        const source = content;
        const trimmedContent = source.trim();

        if (!trimmedContent) {
            this.postParseError('No data to visualize.');
            return;
        }
        if (Buffer.byteLength(source, 'utf8') > MAX_INPUT_BYTES) {
            this.postParseError('Visualization input exceeds the 10 MB limit.');
            return;
        }

        const format = detectDataFormat(source, fileName, fileType);
        if (!format) {
            this.postParseError('Unsupported or unrecognized data format. Use JSON, YAML, RAML, XML, or CSV.');
            return;
        }

        try {
            const parser = this.getParser(format);
            const parsedData = parser.parse(source);
            const graph = DataTransformer.jsonToGraph(parsedData, RENDER_LIMIT);
            const exceededRenderLimit = graph.exceededLimit;
            const graphData: VisualizerGraphData = {
                nodes: exceededRenderLimit ? [] : graph.nodes,
                edges: exceededRenderLimit ? [] : graph.edges,
                metadata: {
                    format,
                    totalNodes: graph.totalNodes,
                    maxDepth: graph.maxDepth,
                    lineCount: this.countLines(source),
                    sourceSize: Buffer.byteLength(source, 'utf8'),
                    parseTimeMs: Date.now() - startedAt,
                    renderLimit: RENDER_LIMIT,
                    exceededRenderLimit,
                    fileName,
                },
            };

            this._panel.webview.postMessage({
                command: 'visualize',
                data: graphData,
            });
        } catch (error) {
            this.postParseError(error instanceof Error ? error.message : String(error), format);
        }
    }

    private postParseError(message: string, format?: ConversionFormat) {
        this._panel.webview.postMessage({
            command: 'parseError',
            message,
            format,
        });
    }

    private async handleExportImage(svg: string | undefined, fileName: string | undefined) {
        if (!svg || !/^\s*<svg(?:\s|>)/i.test(svg)) {
            vscode.window.showErrorMessage('No visualization is available to export.');
            return;
        }
        if (Buffer.byteLength(svg, 'utf8') > MAX_EXPORT_BYTES) {
            vscode.window.showErrorMessage('The exported SVG exceeds the 10 MB limit.');
            return;
        }

        const baseName =
            (fileName || 'data-visualizer')
                .replace(/\.[^/.]+$/, '')
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'data-visualizer';
        const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${baseName}-visualization.svg`),
            filters: {
                SVG: ['svg'],
            },
            saveLabel: 'Export Visualization',
        });

        if (!target) {
            return;
        }

        await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf8'));
        vscode.window.showInformationMessage(`Visualization exported to ${target.fsPath}`);
    }

    private getParser(format: ConversionFormat): Parser {
        switch (format) {
            case 'json':
                return new JSONParser();
            case 'yaml':
                return new YAMLParser();
            case 'xml':
                return new XMLParserImpl();
            case 'csv':
                return new CSVParser();
            case 'raml':
                return new RAMLParser();
        }
    }

    private countLines(content: string): number {
        return content.length > 0 ? content.split(/\r\n|\r|\n/).length : 0;
    }

    public dispose() {
        VisualizerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(): string {
        const nonce = this.getNonce();
        const webview = this._panel.webview;
        const d3Uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'd3.min.js'));
        const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Data Visualizer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            overflow: hidden;
            height: 100vh;
        }

        .container {
            display: flex;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
        }

        .editor-pane {
            display: flex;
            flex-direction: column;
            min-width: 220px;
            width: 40%;
            background: var(--vscode-editor-background);
            border-right: 1px solid var(--vscode-panel-border);
        }

        .editor-pane.hidden,
        .resizer.hidden {
            display: none;
        }

        .editor-container {
            flex: 1;
            min-height: 0;
            padding: 8px;
            background: #1e1e1e;
        }

        #editor {
            width: 100%;
            height: 100%;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
            font-size: 13px;
            line-height: 19px;
            padding: 12px;
            resize: none;
            outline: none;
            tab-size: 2;
            white-space: pre;
            overflow: auto;
        }

        #editor::placeholder {
            color: #6a6a6a;
        }

        .status-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            min-height: 30px;
            padding: 6px 12px;
            background: #1e1e1e;
            color: #cccccc;
            border-top: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 4px;
            min-width: 0;
        }

        .status-icon {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
        }

        .status-icon.valid {
            color: #00c853;
        }

        .status-icon.invalid {
            color: #f44336;
        }

        .status-icon.unknown {
            color: var(--vscode-descriptionForeground);
        }

        .format-badge {
            display: inline-block;
            padding: 2px 8px;
            background: #3c3c3c;
            color: #cccccc;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .refresh-btn,
        .control-btn,
        .hamburger-menu,
        .menu-item {
            font: inherit;
        }

        .refresh-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            background: transparent;
            color: #cccccc;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }

        .refresh-btn:hover {
            background: #3c3c3c;
            color: #ffffff;
        }

        .refresh-btn svg {
            width: 14px;
            height: 14px;
        }

        .sample-link {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: underline;
            font-size: 11px;
            white-space: nowrap;
        }

        .resizer {
            width: 4px;
            cursor: col-resize;
            background: var(--vscode-panel-border);
        }

        .resizer:hover {
            background: var(--vscode-focusBorder);
        }

        .canvas-pane {
            flex: 1;
            position: relative;
            min-width: 0;
            overflow: hidden;
            background:
                linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, 0.025) 25%, rgba(255, 255, 255, 0.025) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.025) 75%, rgba(255, 255, 255, 0.025) 76%, transparent 77%, transparent),
                linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, 0.025) 25%, rgba(255, 255, 255, 0.025) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.025) 75%, rgba(255, 255, 255, 0.025) 76%, transparent 77%, transparent);
            background-color: #151515;
            background-size: 50px 50px;
        }

        body.light-mode .canvas-pane {
            background:
                linear-gradient(0deg, transparent 24%, rgba(0, 0, 0, 0.035) 25%, rgba(0, 0, 0, 0.035) 26%, transparent 27%, transparent 74%, rgba(0, 0, 0, 0.035) 75%, rgba(0, 0, 0, 0.035) 76%, transparent 77%, transparent),
                linear-gradient(90deg, transparent 24%, rgba(0, 0, 0, 0.035) 25%, rgba(0, 0, 0, 0.035) 26%, transparent 27%, transparent 74%, rgba(0, 0, 0, 0.035) 75%, rgba(0, 0, 0, 0.035) 76%, transparent 77%, transparent);
            background-color: #f7f7f8;
            background-size: 50px 50px;
        }

        #graphCanvas {
            width: 100%;
            height: 100%;
            cursor: grab;
            display: block;
        }

        #graphCanvas:active {
            cursor: grabbing;
        }

        .hamburger-menu {
            position: absolute;
            top: 16px;
            left: 16px;
            width: 32px;
            height: 32px;
            background: rgba(30, 30, 30, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            color: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20;
        }

        body.light-mode .hamburger-menu {
            background: rgba(255, 255, 255, 0.86);
            border-color: rgba(0, 0, 0, 0.1);
            color: #242424;
        }

        .dropdown-menu {
            position: absolute;
            top: 52px;
            left: 16px;
            min-width: 190px;
            background: rgba(30, 30, 30, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 6px;
            padding: 4px;
            display: none;
            flex-direction: column;
            z-index: 30;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
        }

        body.light-mode .dropdown-menu {
            background: rgba(255, 255, 255, 0.98);
            border-color: rgba(0, 0, 0, 0.12);
        }

        .dropdown-menu.show {
            display: flex;
        }

        .menu-item {
            padding: 8px 12px;
            color: #ffffff;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            border: none;
            background: transparent;
            text-align: left;
            width: 100%;
        }

        body.light-mode .menu-item {
            color: #242424;
        }

        .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        body.light-mode .menu-item:hover {
            background: rgba(0, 0, 0, 0.06);
        }

        .menu-item svg {
            width: 16px;
            height: 16px;
        }

        .menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 4px 0;
        }

        body.light-mode .menu-divider {
            background: rgba(0, 0, 0, 0.1);
        }

        .control-bar {
            position: absolute;
            bottom: 20px;
            left: 20px;
            display: flex;
            gap: 8px;
            z-index: 20;
            padding: 4px;
            border-radius: 8px;
            background: rgba(30, 30, 30, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        body.light-mode .control-bar {
            background: rgba(255, 255, 255, 0.86);
            border-color: rgba(0, 0, 0, 0.1);
        }

        .control-btn {
            width: 30px;
            height: 30px;
            border: none;
            background: transparent;
            color: #ffffff;
            cursor: pointer;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        body.light-mode .control-btn {
            color: #242424;
        }

        .control-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        body.light-mode .control-btn:hover {
            background: rgba(0, 0, 0, 0.06);
        }

        .control-btn svg {
            width: 16px;
            height: 16px;
        }

        .secure-badge {
            position: absolute;
            bottom: 20px;
            right: 20px;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #00c853;
            background: rgba(30, 30, 30, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 20;
            cursor: help;
        }

        body.light-mode .secure-badge {
            background: rgba(255, 255, 255, 0.86);
            border-color: rgba(0, 0, 0, 0.1);
        }

        .secure-badge svg {
            width: 18px;
            height: 18px;
        }

        .secure-badge::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            right: 0;
            margin-bottom: 8px;
            padding: 6px 10px;
            background: rgba(30, 30, 30, 0.96);
            color: #ffffff;
            font-size: 11px;
            white-space: nowrap;
            border-radius: 4px;
            opacity: 0;
            pointer-events: none;
        }

        .secure-badge:hover::after {
            opacity: 1;
        }

        .graph-meta {
            position: absolute;
            top: 16px;
            right: 16px;
            max-width: min(360px, calc(100% - 88px));
            padding: 8px 10px;
            color: #d7d7d7;
            background: rgba(30, 30, 30, 0.76);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            font-size: 12px;
            z-index: 20;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        body.light-mode .graph-meta {
            color: #242424;
            background: rgba(255, 255, 255, 0.88);
            border-color: rgba(0, 0, 0, 0.1);
        }

        .placeholder {
            position: absolute;
            top: 50%;
            left: 50%;
            width: min(460px, calc(100% - 48px));
            transform: translate(-50%, -50%);
            text-align: center;
            color: rgba(255, 255, 255, 0.58);
            font-size: 15px;
            line-height: 1.5;
            z-index: 10;
            pointer-events: none;
        }

        body.light-mode .placeholder {
            color: rgba(0, 0, 0, 0.58);
        }

        .placeholder svg {
            width: 76px;
            height: 76px;
            margin-bottom: 16px;
            opacity: 0.28;
        }

        .placeholder-title {
            display: block;
            color: rgba(255, 255, 255, 0.82);
            font-weight: 700;
            margin-bottom: 3px;
        }

        body.light-mode .placeholder-title {
            color: rgba(0, 0, 0, 0.82);
        }

        .edge-path {
            fill: none;
            stroke: #4f5358;
            stroke-width: 1.7px;
        }

        body.light-mode .edge-path {
            stroke: #b9bec5;
        }

        .edge-label-bg {
            fill: #1f1f1f;
            stroke: rgba(255, 255, 255, 0.08);
            rx: 9;
            ry: 9;
        }

        body.light-mode .edge-label-bg {
            fill: #ffffff;
            stroke: rgba(0, 0, 0, 0.1);
        }

        .edge-label {
            fill: #cfd3d8;
            font-size: 11px;
            font-family: var(--vscode-font-family);
            pointer-events: none;
        }

        body.light-mode .edge-label {
            fill: #4d545c;
        }

        .graph-node {
            cursor: pointer;
        }

        .graph-card {
            width: 100%;
            height: 100%;
            border: 1px solid #42464d;
            background: #292b2f;
            color: #e9eaec;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
            font-family: var(--vscode-font-family);
        }

        body.light-mode .graph-card {
            border-color: #c8ccd2;
            background: #ffffff;
            color: #24272b;
            box-shadow: 0 10px 22px rgba(35, 39, 47, 0.12);
        }

        .graph-card.object {
            border-top: 3px solid #4f8cff;
        }

        .graph-card.array {
            border-top: 3px solid #a78bfa;
        }

        .graph-card.value {
            border-top: 3px solid #7dd3fc;
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 38px;
            padding: 9px 12px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            font-weight: 700;
            font-size: 13px;
        }

        body.light-mode .node-header {
            border-bottom-color: rgba(0, 0, 0, 0.08);
        }

        .node-title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .node-toggle {
            flex: 0 0 auto;
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            font-size: 13px;
            line-height: 1;
        }

        body.light-mode .node-toggle {
            background: rgba(0, 0, 0, 0.06);
            color: #242424;
        }

        .node-path {
            margin-left: auto;
            flex: 0 0 auto;
            color: #8f98a6;
            font-size: 10px;
            font-weight: 500;
        }

        .node-row {
            display: grid;
            grid-template-columns: minmax(0, 42%) minmax(0, 58%);
            gap: 8px;
            min-height: 28px;
            align-items: center;
            padding: 5px 12px;
            font-size: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        body.light-mode .node-row {
            border-bottom-color: rgba(0, 0, 0, 0.05);
        }

        .node-row:last-child {
            border-bottom: none;
        }

        .row-key,
        .row-value {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .row-key {
            color: #9ecbff;
            font-weight: 600;
        }

        body.light-mode .row-key {
            color: #0969da;
        }

        .row-value {
            color: #d8dee9;
        }

        body.light-mode .row-value {
            color: #38404a;
        }

        .node-row.reference .row-value {
            color: #c4b5fd;
            font-weight: 700;
        }

        body.light-mode .node-row.reference .row-value {
            color: #6d28d9;
        }

        .value-string {
            color: #f0b37e;
        }

        .value-number {
            color: #9bd88f;
        }

        .value-boolean {
            color: #7dd3fc;
        }

        .value-null {
            color: #c084fc;
        }

        .more-row {
            display: block;
            padding: 5px 12px;
            color: #8f98a6;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="editor-pane" id="editorPane">
            <div class="editor-container">
                <textarea id="editor" placeholder="Paste JSON, YAML, RAML, XML, or CSV here..."></textarea>
            </div>
            <div class="status-bar">
                <div class="status-item">
                    <svg class="status-icon unknown" id="statusIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="10" opacity="0.3"></circle>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
                    </svg>
                    <span id="statusText">Ready</span>
                </div>
                <div class="status-item">
                    <span class="format-badge" id="formatBadge">Unknown</span>
                </div>
                <div class="status-item">
                    <span id="stats">0 lines</span>
                </div>
                <div class="status-item">
                    <button class="refresh-btn" id="refreshBtn" title="Revalidate and format input">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </button>
                </div>
                <div class="status-item" style="margin-left: auto;">
                    <a class="sample-link" id="sampleLink">Try a sample</a>
                </div>
            </div>
        </div>

        <div class="resizer" id="resizer"></div>

        <div class="canvas-pane" id="canvasPane">
            <svg id="graphCanvas" xmlns="http://www.w3.org/2000/svg">
                <g id="viewport"></g>
            </svg>

            <button class="hamburger-menu" id="hamburgerBtn" title="Visualizer menu">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>

            <div class="dropdown-menu" id="dropdownMenu">
                <button class="menu-item" id="exportImageBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Export as SVG</span>
                </button>
                <div class="menu-divider"></div>
                <button class="menu-item" id="themeSwitchBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="themeIcon">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                    <span id="themeText">Switch to Light Mode</span>
                </button>
            </div>

            <div class="graph-meta" id="graphMeta" hidden></div>

            <div class="control-bar">
                <button class="control-btn" title="Fit to View (Ctrl+0)" id="fitBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                </button>
                <button class="control-btn" title="Zoom Out (Ctrl+-)" id="zoomOutBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                <button class="control-btn" title="Zoom In (Ctrl++)" id="zoomInBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>

            <div class="secure-badge" data-tooltip="Data processed locally">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"></path>
                </svg>
            </div>

            <div class="placeholder" id="placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2.05v3.03c3.39.49 6 3.39 6 6.92 0 .9-.18 1.75-.48 2.54l2.6 1.53c.56-1.24.88-2.62.88-4.07 0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V2.05c-5.06.5-9 4.76-9 9.95 0 5.52 4.47 10 9.99 10 3.31 0 6.24-1.61 8.06-4.09l-2.6-1.53C16.17 17.98 14.21 19 12 19z"></path>
                </svg>
                <span class="placeholder-title" id="placeholderTitle">Visualization will appear here</span>
                <span id="placeholderText">Start typing or paste data to visualize.</span>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${d3Uri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const d3Api = window.d3;

        let currentMode = 'sidebar';
        let currentFileName = undefined;
        let currentFileType = undefined;
        let isResizing = false;
        let isDarkMode = true;
        let parseTimeout = undefined;
        let currentGraph = undefined;
        let graphBounds = undefined;
        let collapsedNodeIds = new Set();
        let zoomBehavior = undefined;
        let svgSelection = undefined;
        let viewportSelection = undefined;

        const editorPane = document.getElementById('editorPane');
        const resizer = document.getElementById('resizer');
        const editor = document.getElementById('editor');
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        const formatBadge = document.getElementById('formatBadge');
        const stats = document.getElementById('stats');
        const sampleLink = document.getElementById('sampleLink');
        const placeholder = document.getElementById('placeholder');
        const placeholderTitle = document.getElementById('placeholderTitle');
        const placeholderText = document.getElementById('placeholderText');
        const refreshBtn = document.getElementById('refreshBtn');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const dropdownMenu = document.getElementById('dropdownMenu');
        const exportImageBtn = document.getElementById('exportImageBtn');
        const themeSwitchBtn = document.getElementById('themeSwitchBtn');
        const themeIcon = document.getElementById('themeIcon');
        const themeText = document.getElementById('themeText');
        const canvasPane = document.getElementById('canvasPane');
        const graphCanvas = document.getElementById('graphCanvas');
        const graphMeta = document.getElementById('graphMeta');

        initGraphCanvas();

        window.addEventListener('message', function(event) {
            const message = event.data;
            switch (message.command) {
                case 'init':
                    handleInit(message.context);
                    break;
                case 'visualize':
                    handleVisualize(message.data);
                    break;
                case 'parseError':
                    handleParseError(message);
                    break;
            }
        });

        vscode.postMessage({ command: 'ready' });

        function initGraphCanvas() {
            if (!d3Api) {
                showPlaceholder('Unable to load graph engine', 'The D3 graph library was not available in the webview.');
                setStatus('invalid', 'D3 unavailable');
                return;
            }

            svgSelection = d3Api.select(graphCanvas);
            viewportSelection = d3Api.select('#viewport');
            zoomBehavior = d3Api.zoom()
                .scaleExtent([0.15, 3])
                .on('zoom', function(event) {
                    viewportSelection.attr('transform', event.transform);
                });

            svgSelection.call(zoomBehavior);
            svgSelection.on('dblclick.zoom', null);
        }

        function handleInit(context) {
            currentMode = context.mode;
            currentFileName = context.fileName;
            currentFileType = context.fileType;

            if (context.mode === 'file') {
                editorPane.classList.add('hidden');
                resizer.classList.add('hidden');
                if (context.fileContent) {
                    requestParse(context.fileContent);
                }
            } else {
                editorPane.classList.remove('hidden');
                resizer.classList.remove('hidden');
                currentFileName = undefined;
                currentFileType = undefined;
                if (!editor.value.trim()) {
                    clearGraph();
                    resetStatus();
                }
            }
        }

        editor.addEventListener('input', function() {
            const content = editor.value;
            updateStatsFromContent(content);

            clearTimeout(parseTimeout);
            parseTimeout = setTimeout(function() {
                if (content.trim()) {
                    requestParse(content);
                } else {
                    clearGraph();
                    resetStatus();
                }
            }, 350);
        });

        function requestParse(content) {
            setStatus('unknown', 'Parsing');
            showPlaceholder('Parsing data', 'Building graph nodes and relationships...');
            vscode.postMessage({
                command: 'parse',
                content: content,
                fileName: currentFileName,
                fileType: currentFileType
            });
        }

        function handleVisualize(data) {
            currentGraph = data;
            collapsedNodeIds = new Set();
            graphMeta.hidden = false;
            graphMeta.textContent = buildMetadataText(data.metadata);
            updateStatusFromMetadata(data.metadata);

            if (data.metadata.exceededRenderLimit) {
                clearGraph();
                showPlaceholder(
                    'Graph is too large to render',
                    data.metadata.totalNodes + ' nodes exceeds the render limit of ' + data.metadata.renderLimit + '.'
                );
                return;
            }

            if (!data.nodes || data.nodes.length === 0) {
                clearGraph();
                showPlaceholder('No renderable data', 'The parsed document did not contain graphable nodes.');
                return;
            }

            renderGraph(data, true);
        }

        function handleParseError(message) {
            clearGraph();
            graphMeta.hidden = true;
            if (message.format) {
                formatBadge.textContent = message.format.toUpperCase();
            }
            setStatus('invalid', 'Invalid');
            showPlaceholder('Unable to visualize data', message.message || 'The input could not be parsed.');
        }

        function updateStatusFromMetadata(metadata) {
            formatBadge.textContent = metadata.format.toUpperCase();
            stats.textContent = metadata.lineCount + ' lines, ' + metadata.totalNodes + ' nodes, depth ' + metadata.maxDepth;
            setStatus('valid', 'Parsed');
        }

        function buildMetadataText(metadata) {
            const kb = (metadata.sourceSize / 1024).toFixed(1);
            const name = metadata.fileName ? metadata.fileName + ' | ' : '';
            return name + metadata.format.toUpperCase() + ' | ' + metadata.totalNodes + ' nodes | ' + kb + 'KB | ' + metadata.parseTimeMs + 'ms';
        }

        function renderGraph(data, shouldFit) {
            if (!d3Api || !viewportSelection) {
                return;
            }

            hidePlaceholder();
            viewportSelection.selectAll('*').remove();

            const visible = getVisibleGraph(data);
            if (visible.nodes.length === 0) {
                showPlaceholder('No visible nodes', 'Expand parent nodes to inspect the graph.');
                return;
            }

            const layout = layoutVisibleGraph(visible);
            graphBounds = layout.bounds;

            const edgeLayer = viewportSelection.append('g').attr('class', 'edge-layer');
            const nodeLayer = viewportSelection.append('g').attr('class', 'node-layer');

            edgeLayer.selectAll('g.edge')
                .data(layout.edges)
                .enter()
                .append('g')
                .attr('class', 'edge')
                .each(function(edge) {
                    drawEdge(d3Api.select(this), edge, layout.nodeById);
                });

            nodeLayer.selectAll('g.graph-node')
                .data(layout.nodes)
                .enter()
                .append('g')
                .attr('class', function(node) {
                    return 'graph-node ' + node.type;
                })
                .attr('transform', function(node) {
                    return 'translate(' + node.x + ',' + node.y + ')';
                })
                .on('click', function(event, node) {
                    event.stopPropagation();
                    toggleNode(node.id);
                })
                .each(function(node) {
                    drawNode(d3Api.select(this), node, layout.childrenById);
                });

            if (shouldFit) {
                setTimeout(fitGraph, 0);
            }
        }

        function getVisibleGraph(data) {
            const nodeById = new Map(data.nodes.map(function(node) {
                return [node.id, node];
            }));
            const incoming = new Set(data.edges.map(function(edge) {
                return edge.to;
            }));
            const childrenById = new Map();

            data.edges.forEach(function(edge) {
                if (!childrenById.has(edge.from)) {
                    childrenById.set(edge.from, []);
                }
                childrenById.get(edge.from).push(edge.to);
            });

            const roots = data.nodes.filter(function(node) {
                return !incoming.has(node.id);
            });
            const visibleIds = new Set();

            function visit(nodeId) {
                if (visibleIds.has(nodeId) || !nodeById.has(nodeId)) {
                    return;
                }
                visibleIds.add(nodeId);
                if (collapsedNodeIds.has(nodeId)) {
                    return;
                }
                const children = childrenById.get(nodeId) || [];
                children.forEach(visit);
            }

            roots.forEach(function(root) {
                visit(root.id);
            });

            return {
                nodes: data.nodes.filter(function(node) {
                    return visibleIds.has(node.id);
                }),
                edges: data.edges.filter(function(edge) {
                    return visibleIds.has(edge.from) && visibleIds.has(edge.to) && !collapsedNodeIds.has(edge.from);
                })
            };
        }

        function layoutVisibleGraph(visible) {
            const nodeById = new Map(visible.nodes.map(function(node) {
                return [node.id, Object.assign({}, node)];
            }));
            const incoming = new Set(visible.edges.map(function(edge) {
                return edge.to;
            }));
            const childrenById = new Map();
            const verticalGap = 38;
            const horizontalGap = 118;

            visible.edges.forEach(function(edge) {
                if (!childrenById.has(edge.from)) {
                    childrenById.set(edge.from, []);
                }
                childrenById.get(edge.from).push(edge.to);
            });

            const roots = visible.nodes
                .filter(function(node) {
                    return !incoming.has(node.id);
                })
                .map(function(node) {
                    return node.id;
                });

            const maxWidthByDepth = new Map();
            nodeById.forEach(function(node) {
                const current = maxWidthByDepth.get(node.depth) || 0;
                maxWidthByDepth.set(node.depth, Math.max(current, node.width));
            });

            const xByDepth = new Map();
            let nextX = 80;
            Array.from(maxWidthByDepth.keys()).sort(function(a, b) {
                return a - b;
            }).forEach(function(depth) {
                xByDepth.set(depth, nextX);
                nextX += (maxWidthByDepth.get(depth) || 260) + horizontalGap;
            });

            const subtreeHeights = new Map();

            function measure(nodeId) {
                const node = nodeById.get(nodeId);
                const children = childrenById.get(nodeId) || [];
                if (!node || children.length === 0) {
                    const leafHeight = (node ? node.height : 0) + verticalGap;
                    subtreeHeights.set(nodeId, leafHeight);
                    return leafHeight;
                }

                const childHeight = children.reduce(function(total, childId) {
                    return total + measure(childId);
                }, 0);
                const subtreeHeight = Math.max(node.height + verticalGap, childHeight);
                subtreeHeights.set(nodeId, subtreeHeight);
                return subtreeHeight;
            }

            function place(nodeId, top) {
                const node = nodeById.get(nodeId);
                if (!node) {
                    return;
                }

                const subtreeHeight = subtreeHeights.get(nodeId) || node.height + verticalGap;
                node.x = xByDepth.get(node.depth) || 80;
                node.y = top + (subtreeHeight - node.height) / 2;

                const children = childrenById.get(nodeId) || [];
                const childrenHeight = children.reduce(function(total, childId) {
                    return total + (subtreeHeights.get(childId) || 0);
                }, 0);
                let childTop = top + Math.max(0, (subtreeHeight - childrenHeight) / 2);
                children.forEach(function(childId) {
                    place(childId, childTop);
                    childTop += subtreeHeights.get(childId) || 0;
                });
            }

            let yCursor = 60;
            roots.forEach(function(rootId) {
                yCursor += measure(rootId);
            });

            yCursor = 60;
            roots.forEach(function(rootId) {
                place(rootId, yCursor);
                yCursor += subtreeHeights.get(rootId) || 0;
            });

            const nodes = Array.from(nodeById.values());
            const bounds = calculateBounds(nodes);

            return {
                nodes: nodes,
                edges: visible.edges,
                nodeById: nodeById,
                childrenById: childrenById,
                bounds: bounds
            };
        }

        function calculateBounds(nodes) {
            const minX = Math.min.apply(null, nodes.map(function(node) {
                return node.x;
            }));
            const minY = Math.min.apply(null, nodes.map(function(node) {
                return node.y;
            }));
            const maxX = Math.max.apply(null, nodes.map(function(node) {
                return node.x + node.width;
            }));
            const maxY = Math.max.apply(null, nodes.map(function(node) {
                return node.y + node.height;
            }));

            return {
                x: minX,
                y: minY,
                width: Math.max(1, maxX - minX),
                height: Math.max(1, maxY - minY)
            };
        }

        function drawEdge(group, edge, nodeById) {
            const source = nodeById.get(edge.from);
            const target = nodeById.get(edge.to);
            if (!source || !target) {
                return;
            }

            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const controlOffset = Math.max(72, (endX - startX) / 2);
            const path = 'M' + startX + ',' + startY + ' C' + (startX + controlOffset) + ',' + startY + ' ' + (endX - controlOffset) + ',' + endY + ' ' + endX + ',' + endY;
            const label = truncate(edge.label, 28);
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 8;
            const labelWidth = Math.max(24, label.length * 7 + 14);

            group.append('path')
                .attr('class', 'edge-path')
                .attr('d', path);

            group.append('rect')
                .attr('class', 'edge-label-bg')
                .attr('x', labelX - labelWidth / 2)
                .attr('y', labelY - 9)
                .attr('width', labelWidth)
                .attr('height', 18);

            group.append('text')
                .attr('class', 'edge-label')
                .attr('x', labelX)
                .attr('y', labelY + 4)
                .attr('text-anchor', 'middle')
                .text(label);
        }

        function drawNode(group, node, childrenById) {
            const hasChildren = (childrenById.get(node.id) || []).length > 0;
            const isCollapsed = collapsedNodeIds.has(node.id);
            const foreignObject = group.append('foreignObject')
                .attr('width', node.width)
                .attr('height', node.height);

            foreignObject.html(buildNodeHtml(node, hasChildren, isCollapsed));
        }

        function buildNodeHtml(node, hasChildren, isCollapsed) {
            const maxRows = 9;
            const visibleRows = node.rows.slice(0, maxRows);
            const remainingRows = Math.max(0, node.rows.length - maxRows);
            const toggle = hasChildren ? '<span class="node-toggle">' + (isCollapsed ? '+' : '-') + '</span>' : '';
            const rowHtml = visibleRows.map(function(row) {
                const key = row.key === null ? '' : escapeHtml(row.key);
                const valueClass = 'value-' + normalizeValueClass(row.valueType);
                const referenceClass = row.isReference ? ' reference' : '';
                const value = escapeHtml(row.value);
                return '<div class="node-row' + referenceClass + '">' +
                    '<span class="row-key">' + key + '</span>' +
                    '<span class="row-value ' + valueClass + '">' + value + '</span>' +
                    '</div>';
            }).join('');
            const moreRow = remainingRows > 0 ? '<span class="more-row">+' + remainingRows + ' more fields</span>' : '';
            const path = escapeHtml(node.path);

            return '<div xmlns="http://www.w3.org/1999/xhtml" class="graph-card ' + node.type + '" title="' + path + '">' +
                '<div class="node-header">' +
                toggle +
                '<span class="node-title">' + escapeHtml(node.title) + '</span>' +
                '<span class="node-path">' + escapeHtml(truncate(node.path, 28)) + '</span>' +
                '</div>' +
                rowHtml +
                moreRow +
                '</div>';
        }

        function toggleNode(nodeId) {
            if (!currentGraph) {
                return;
            }

            const hasChildren = currentGraph.edges.some(function(edge) {
                return edge.from === nodeId;
            });
            if (!hasChildren) {
                return;
            }

            if (collapsedNodeIds.has(nodeId)) {
                collapsedNodeIds.delete(nodeId);
            } else {
                collapsedNodeIds.add(nodeId);
            }
            renderGraph(currentGraph, false);
        }

        function fitGraph() {
            if (!d3Api || !zoomBehavior || !graphBounds) {
                return;
            }

            const rect = canvasPane.getBoundingClientRect();
            const padding = 96;
            const scale = Math.max(
                0.15,
                Math.min(1.7, Math.min((rect.width - padding) / graphBounds.width, (rect.height - padding) / graphBounds.height))
            );
            const translateX = rect.width / 2 - (graphBounds.x + graphBounds.width / 2) * scale;
            const translateY = rect.height / 2 - (graphBounds.y + graphBounds.height / 2) * scale;
            const transform = d3Api.zoomIdentity.translate(translateX, translateY).scale(scale);

            svgSelection.transition().duration(220).call(zoomBehavior.transform, transform);
        }

        function zoomBy(scaleFactor) {
            if (!d3Api || !zoomBehavior) {
                return;
            }
            svgSelection.transition().duration(140).call(zoomBehavior.scaleBy, scaleFactor);
        }

        function clearGraph() {
            if (viewportSelection) {
                viewportSelection.selectAll('*').remove();
            }
            currentGraph = undefined;
            graphBounds = undefined;
            graphMeta.hidden = true;
            showPlaceholder('Visualization will appear here', 'Start typing or paste data to visualize.');
        }

        function setStatus(kind, text) {
            statusIcon.classList.remove('valid', 'invalid', 'unknown');
            statusIcon.classList.add(kind);
            statusText.textContent = text;
        }

        function resetStatus() {
            setStatus('unknown', 'Ready');
            formatBadge.textContent = 'Unknown';
            stats.textContent = '0 lines';
        }

        function updateStatsFromContent(content) {
            const lines = content.length > 0 ? content.split(/\\r\\n|\\r|\\n/).length : 0;
            const kb = (new Blob([content]).size / 1024).toFixed(1);
            stats.textContent = lines + ' lines, ' + kb + 'KB';
        }

        function showPlaceholder(title, text) {
            placeholderTitle.textContent = title;
            placeholderText.textContent = text;
            placeholder.style.display = 'block';
        }

        function hidePlaceholder() {
            placeholder.style.display = 'none';
        }

        function formatXML(xml) {
            const padding = '  ';
            let formatted = '';
            let pad = 0;
            xml = xml.replace(/(>)(<)([/]?)/g, '$1\\r\\n$2$3');
            xml.split('\\r\\n').forEach(function(node) {
                let indent = 0;
                if (node.match(/.+<[/]\\w[^>]*>$/)) {
                    indent = 0;
                } else if (node.match(/^<[/]\\w/)) {
                    if (pad !== 0) {
                        pad -= 1;
                    }
                } else if (node.match(/^<\\w[^>]*[^/]>.*$/)) {
                    indent = 1;
                }
                formatted += padding.repeat(pad) + node + '\\r\\n';
                pad += indent;
            });
            return formatted.trim();
        }

        function serializeCurrentSvg() {
            if (!currentGraph || !graphBounds) {
                return undefined;
            }

            const clone = graphCanvas.cloneNode(true);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('width', String(graphCanvas.clientWidth || 1200));
            clone.setAttribute('height', String(graphCanvas.clientHeight || 800));

            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.textContent = getExportStyles();
            clone.insertBefore(style, clone.firstChild);

            const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            background.setAttribute('x', '0');
            background.setAttribute('y', '0');
            background.setAttribute('width', '100%');
            background.setAttribute('height', '100%');
            background.setAttribute('fill', isDarkMode ? '#151515' : '#f7f7f8');
            clone.insertBefore(background, style.nextSibling);

            return new XMLSerializer().serializeToString(clone);
        }

        function getExportStyles() {
            return '.edge-path{fill:none;stroke:' + (isDarkMode ? '#4f5358' : '#b9bec5') + ';stroke-width:1.7px}.edge-label-bg{fill:' + (isDarkMode ? '#1f1f1f' : '#fff') + ';stroke:rgba(128,128,128,.24)}.edge-label{fill:' + (isDarkMode ? '#cfd3d8' : '#4d545c') + ';font-size:11px;font-family:Arial,sans-serif}.graph-card{width:100%;height:100%;border:1px solid ' + (isDarkMode ? '#42464d' : '#c8ccd2') + ';background:' + (isDarkMode ? '#292b2f' : '#fff') + ';color:' + (isDarkMode ? '#e9eaec' : '#24272b') + ';border-radius:8px;overflow:hidden;font-family:Arial,sans-serif}.graph-card.object{border-top:3px solid #4f8cff}.graph-card.array{border-top:3px solid #a78bfa}.graph-card.value{border-top:3px solid #7dd3fc}.node-header{display:flex;align-items:center;gap:8px;min-height:38px;padding:9px 12px 8px;border-bottom:1px solid rgba(128,128,128,.2);font-weight:700;font-size:13px}.node-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.node-toggle{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(128,128,128,.18)}.node-path{margin-left:auto;color:#8f98a6;font-size:10px;font-weight:500}.node-row{display:grid;grid-template-columns:minmax(0,42%) minmax(0,58%);gap:8px;min-height:28px;align-items:center;padding:5px 12px;font-size:12px;border-bottom:1px solid rgba(128,128,128,.14)}.row-key,.row-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row-key{color:' + (isDarkMode ? '#9ecbff' : '#0969da') + ';font-weight:600}.row-value{color:' + (isDarkMode ? '#d8dee9' : '#38404a') + '}.node-row.reference .row-value{color:' + (isDarkMode ? '#c4b5fd' : '#6d28d9') + ';font-weight:700}.value-string{color:#f0b37e}.value-number{color:#9bd88f}.value-boolean{color:#7dd3fc}.value-null{color:#c084fc}.more-row{display:block;padding:5px 12px;color:#8f98a6;font-size:11px}';
        }

        function truncate(value, maxLength) {
            if (!value) {
                return '';
            }
            return value.length > maxLength ? value.slice(0, maxLength - 3) + '...' : value;
        }

        function normalizeValueClass(valueType) {
            return valueType === 'null' ? 'null' : valueType;
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        sampleLink.addEventListener('click', function() {
            const sample = {
                name: 'Sample API',
                version: '1.0.0',
                resources: [
                    {
                        path: '/accounts',
                        method: 'GET',
                        secured: true,
                        responses: {
                            ok: 200,
                            failed: 500
                        }
                    },
                    {
                        path: '/accounts/{id}',
                        method: 'PATCH',
                        secured: true,
                        responses: {
                            ok: 204,
                            failed: 409
                        }
                    }
                ],
                owner: {
                    team: 'Platform',
                    contact: 'devx@example.com'
                }
            };
            editor.value = JSON.stringify(sample, null, 2);
            editor.dispatchEvent(new Event('input'));
        });

        refreshBtn.addEventListener('click', function() {
            const content = editor.value.trim();
            if (!content) {
                clearGraph();
                resetStatus();
                return;
            }

            let formatted = content;
            try {
                if (content.startsWith('{') || content.startsWith('[')) {
                    formatted = JSON.stringify(JSON.parse(content), null, 2);
                } else if (content.startsWith('<')) {
                    formatted = formatXML(content);
                }
                editor.value = formatted;
                updateStatsFromContent(formatted);
                requestParse(formatted);
            } catch {
                requestParse(content);
            }
        });

        resizer.addEventListener('mousedown', function() {
            isResizing = true;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
        });

        function handleResize(event) {
            if (!isResizing) {
                return;
            }
            const containerWidth = document.querySelector('.container').offsetWidth;
            const newWidth = (event.clientX / containerWidth) * 100;
            if (newWidth > 20 && newWidth < 80) {
                editorPane.style.width = newWidth + '%';
            }
        }

        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            if (currentGraph) {
                fitGraph();
            }
        }

        document.getElementById('fitBtn').addEventListener('click', fitGraph);
        document.getElementById('zoomOutBtn').addEventListener('click', function() {
            zoomBy(0.82);
        });
        document.getElementById('zoomInBtn').addEventListener('click', function() {
            zoomBy(1.22);
        });

        document.addEventListener('keydown', function(event) {
            if ((event.ctrlKey || event.metaKey) && event.key === '0') {
                event.preventDefault();
                fitGraph();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === '-') {
                event.preventDefault();
                zoomBy(0.82);
            }
            if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
                event.preventDefault();
                zoomBy(1.22);
            }
        });

        hamburgerBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        document.addEventListener('click', function(event) {
            if (!hamburgerBtn.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.remove('show');
            }
        });

        exportImageBtn.addEventListener('click', function() {
            dropdownMenu.classList.remove('show');
            const svg = serializeCurrentSvg();
            if (!svg) {
                showPlaceholder('No visualization to export', 'Parse data before exporting.');
                return;
            }
            vscode.postMessage({
                command: 'exportImage',
                svg: svg,
                fileName: currentFileName
            });
        });

        themeSwitchBtn.addEventListener('click', function() {
            isDarkMode = !isDarkMode;
            document.body.classList.toggle('light-mode', !isDarkMode);
            themeText.textContent = isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
            themeIcon.innerHTML = isDarkMode
                ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>'
                : '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
            dropdownMenu.classList.remove('show');
        });

        window.addEventListener('resize', function() {
            if (currentGraph) {
                fitGraph();
            }
        });
    </script>
</body>
</html>`;
    }

    private getNonce() {
        return crypto.randomBytes(16).toString('base64url');
    }
}
