'use strict';
import * as vscode from 'vscode';
import { HypermergeFS } from './fileSystemProvider';

export function activate(context: vscode.ExtensionContext) {

    console.log('HypermergeFS says "Hello"')

    const hypermergeFs = new HypermergeFS();
    context.subscriptions.push(vscode.commands.registerCommand('hypermergefs.workspaceInit', _ => {
        vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hypermergefs:/'), name: "MemFS - Sample" });
    }));

    const subscribe = context.subscriptions.push.bind(context.subscriptions) as typeof context.subscriptions.push;
    const registerCommand = (command: string, callback: (...args: any[]) => any, thisArg?: any) =>
        subscribe(vscode.commands.registerCommand(command, callback, thisArg));

    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hypermergefs', hypermergeFs, { isCaseSensitive: true }));

    registerCommand('hypermergefs.open', async () => {
        const uriString = await vscode.window.showInputBox({
            placeHolder: 'Browse which hypermerge URL?',
            validateInput: hypermergeFs.validateURL
        });
        if (uriString) {
            const uri = vscode.Uri.parse(uriString)
            vscode.workspace.updateWorkspaceFolders(0, 0, {
                uri,
                name: `HypermergeFS: ${uri.authority}`
            })
        }
    });
}
