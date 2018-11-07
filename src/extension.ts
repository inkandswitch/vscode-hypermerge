'use strict';
import * as vscode from 'vscode';
import { HypermergeFS } from './fileSystemProvider';
import { HypermergeExplorer } from './treeview';

export function activate(context: vscode.ExtensionContext) {

    console.log('HypermergeFS says "Hello"')

    const hypermergeFs = new HypermergeFS();
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hypermergefs', hypermergeFs, { isCaseSensitive: true }));

    // self-registers
    new HypermergeExplorer(context)
}
