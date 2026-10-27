import * as vscode from 'vscode';
import {
    AesEncryptDecryptPanel,
    Base64Panel,
    CertificateExpiryPanel,
    CertificatePanel,
    DataConverterPanel,
    EscapePanel,
    FormatterPanel,
    JWTPanel,
    UUIDPanel,
    VisualizerPanel,
} from './panels';
import { DevXToolsProvider, ConfigSidebarPanel, getGeneralPreferences } from './providers';

export function activate(context: vscode.ExtensionContext) {
    // Register the tree view provider for the activity bar
    const devxToolsProvider = new DevXToolsProvider(context);
    const sidebarViewProvider = vscode.window.registerWebviewViewProvider('devxToolsView', devxToolsProvider);

    // Register Generic AES Encrypt / Decrypt command
    const aesGenericCommand = vscode.commands.registerCommand('devx.aesEncryptDecryptGeneric', () => {
        AesEncryptDecryptPanel.render(context.extensionUri);
    });

    // Register Base64 Encode/Decode command
    const base64Command = vscode.commands.registerCommand('devx.base64Tool', () => {
        Base64Panel.render(context.extensionUri);
    });

    // Register JWT Debugger command
    const jwtCommand = vscode.commands.registerCommand('devx.jwtDebugger', () => {
        JWTPanel.render(context.extensionUri);
    });

    // Register UUID Generator command
    const uuidCommand = vscode.commands.registerCommand('devx.uuidGenerator', () => {
        UUIDPanel.render(context.extensionUri);
    });

    // Register Escape/Unescape command
    const escapeCommand = vscode.commands.registerCommand('devx.escapeTool', () => {
        EscapePanel.render(context.extensionUri);
    });

    // Register Data Formatter command
    const formatterCommand = vscode.commands.registerCommand('devx.formatterTool', () => {
        FormatterPanel.render(context.extensionUri);
    });

    // Register Certificate Tools command
    const certificateCommand = vscode.commands.registerCommand('devx.certificateTool', () => {
        CertificatePanel.render(context.extensionUri);
    });

    // Register Certificate Expiry Checker command
    const certificateExpiryCommand = vscode.commands.registerCommand('devx.certificateExpiryChecker', () => {
        CertificateExpiryPanel.render(context.extensionUri);
    });

    // Register Data Visualizer command (from sidebar)
    const visualizerCommand = vscode.commands.registerCommand('devx.visualizerTool', () => {
        VisualizerPanel.render(context.extensionUri);
    });

    // Register Data Visualizer from file button (⚡ icon)
    const visualizerFromFileCommand = vscode.commands.registerCommand('devx.visualizerFromFile', () => {
        VisualizerPanel.renderFromFile(context.extensionUri);
    });

    // Register Data Converter command
    const dataConverterCommand = vscode.commands.registerCommand('devx.dataConverter', () => {
        DataConverterPanel.render(context.extensionUri);
    });

    // Register Configure Sidebar command
    const configureSidebarCommand = vscode.commands.registerCommand('devx.configureSidebar', () => {
        ConfigSidebarPanel.render(context, () => devxToolsProvider.refresh());
    });

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand('devx.refreshTools', () => {
        devxToolsProvider.refresh();
        if (getGeneralPreferences(context).showRefreshMessage) {
            vscode.window.showInformationMessage('Developer utilities refreshed');
        }
    });

    context.subscriptions.push(
        sidebarViewProvider,
        aesGenericCommand,
        base64Command,
        jwtCommand,
        uuidCommand,
        escapeCommand,
        formatterCommand,
        certificateCommand,
        certificateExpiryCommand,
        visualizerCommand,
        visualizerFromFileCommand,
        dataConverterCommand,
        configureSidebarCommand,
        refreshCommand,
    );
}

export function deactivate() {}
