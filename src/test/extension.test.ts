import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    test('Extension should be present', () => {
        const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON?.name === 'certificate-util');
        assert.ok(extension);
    });
});
