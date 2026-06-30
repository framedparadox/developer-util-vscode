import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { quotePosixShellArgument } from '../panels/certificatePanel';

suite('Extension Test Suite', () => {
    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('framedparadox.dev-x');
        assert.ok(extension);
    });

    test('all contributed commands are registered at runtime', async () => {
        const extension = vscode.extensions.getExtension('framedparadox.dev-x');
        assert.ok(extension);
        await extension.activate();

        const registeredCommands = new Set(await vscode.commands.getCommands(true));
        const contributedCommands = extension.packageJSON.contributes.commands as Array<{ command: string }>;
        for (const contribution of contributedCommands) {
            assert.ok(registeredCommands.has(contribution.command), `${contribution.command} is not registered`);
        }
    });

    test('packaged visualizer dependency is emitted by the build', () => {
        const extension = vscode.extensions.getExtension('framedparadox.dev-x');
        assert.ok(extension);
        assert.ok(fs.existsSync(path.join(extension.extensionPath, 'dist', 'd3.min.js')));
    });

    test('certificate command arguments are POSIX shell quoted', () => {
        assert.strictEqual(quotePosixShellArgument(`path with ' quote`), `'path with '"'"' quote'`);
    });
});
