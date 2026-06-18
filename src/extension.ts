import * as vscode from 'vscode';
import { CertificateExpiryPanel, CertificatePanel } from './panels';
import { CertificateToolsProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
    const certificateToolsProvider = new CertificateToolsProvider(context.extensionUri);
    const sidebarViewProvider = vscode.window.registerWebviewViewProvider(
        'certificateUtilToolsView',
        certificateToolsProvider
    );

    const certificateCommand = vscode.commands.registerCommand('certificateUtil.openCertificateTools', () => {
        CertificatePanel.render(context.extensionUri);
    });

    const certificateExpiryCommand = vscode.commands.registerCommand('certificateUtil.openExpiryChecker', () => {
        CertificateExpiryPanel.render(context.extensionUri);
    });

    context.subscriptions.push(sidebarViewProvider, certificateCommand, certificateExpiryCommand);
}

export function deactivate() {}
