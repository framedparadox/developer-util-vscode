import * as vscode from 'vscode';
import { MulesoftAesEncryptDecryptPanel } from './panels';
import { DevXToolsProvider, SettingsPanel } from './providers';

export function activate(context: vscode.ExtensionContext) {
    // Register the tree view provider for the activity bar
    const devxToolsProvider = new DevXToolsProvider(context);
    const sidebarViewProvider = vscode.window.registerWebviewViewProvider('devxToolsView', devxToolsProvider);

    // Register Mulesoft AES Encrypt / Decrypt command
    const aesCommand = vscode.commands.registerCommand('devx.aesEncryptDecrypt', () => {
        MulesoftAesEncryptDecryptPanel.render(context);
    });

    // Register Settings command (AES KeyIdentifiers + display mode)
    const settingsCommand = vscode.commands.registerCommand('devx.openSettings', () => {
        SettingsPanel.render(context, () => {
            devxToolsProvider.refresh();
            MulesoftAesEncryptDecryptPanel.currentPanel?.refreshKeyIdentifiers();
        });
    });

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand('devx.refreshTools', () => {
        devxToolsProvider.refresh();
    });

    context.subscriptions.push(sidebarViewProvider, aesCommand, settingsCommand, refreshCommand);
}

export function deactivate() {}
