/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';

class FauxMerge {
    openDocument(docId: string) {
        return {
            "root": {
                "doc1": "hypermergefs:/doc1",
                "doc2": "hypermergefs:/doc2",
                "some stuff": ['a', 'b', 'c']
            },
            "doc1": { "content": "bar" },
            "doc2": { "bing": "bong" }
        }[docId]
    }
}

export class File implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;

    name: string;
    data: Uint8Array;

    constructor(document: any) {
        this.type = vscode.FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = "a name goes here";
        this.data = Buffer.from(JSON.stringify(document))
    }
}

export class Directory implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;
    data: Uint8Array;

    name: string;
    entries: Map<string, File | Directory>;

    constructor(document: any) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = "directory name";
        this.entries = new Map();

        const content = new File(document)
        this.entries.set("content", content)
    }
}

export type Entry = File | Directory;

export class HypermergeFS implements vscode.FileSystemProvider {
    hypermerge = new FauxMerge()

    validateURL(input: string) {
        const url = vscode.Uri.parse(input)
        if (url.scheme !== 'hypermergefs') {
            return "invalid scheme -- must be a hypermergefs URL"
        }
        return "" // we can return a hint string if it's invalid
    }

    constructor() {
        console.log("CONSTRUCTOR")
    }
    // --- manage file metadata

    stat(uri: vscode.Uri): vscode.FileStat {
        const type = (uri.path === "/content") ? vscode.FileType.File : vscode.FileType.Directory
        return this._lookup(uri, type, false);
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        const entry = this._lookupAsDirectory(uri, false);
        let result: [string, vscode.FileType][] = [];
        for (const [name, child] of entry.entries) {
            result.push([name, child.type]);
        }
        return result;
    }

    // --- manage file contents

    readFile(uri: vscode.Uri): Uint8Array {
        return this._lookupAsFile(uri, false).data;
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
        let basename = path.posix.basename(uri.path);
        let parent = this._lookupParentDirectory(uri);
        let entry = parent.entries.get(basename);
        if (entry instanceof Directory) {
            throw vscode.FileSystemError.FileIsADirectory(uri);
        }
        if (!entry && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        if (entry && options.create && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }
        if (!entry) {
            entry = new File(basename);
            parent.entries.set(basename, entry);
            this._fireSoon({ type: vscode.FileChangeType.Created, uri });
        }
        entry.mtime = Date.now();
        entry.size = content.byteLength;
        entry.data = content;

        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
    }

    // --- manage files/folders

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        // HMMM
        throw vscode.FileSystemError.NoPermissions
    }

    delete(uri: vscode.Uri): void {
        // HMMM
        throw vscode.FileSystemError.NoPermissions
    }

    createDirectory(uri: vscode.Uri): void {
        // HMMM
        throw vscode.FileSystemError.NoPermissions
    }

    // --- lookup

    private _lookup(uri: vscode.Uri, as: vscode.FileType, silent: false): Entry;
    private _lookup(uri: vscode.Uri, as: vscode.FileType, silent: boolean): Entry | undefined;
    private _lookup(uri: vscode.Uri, as: vscode.FileType, silent: boolean): Entry | undefined {
        const docId = uri.authority
        const document = this.hypermerge.openDocument(docId)

        if (document) {
            if (as == vscode.FileType.Directory) {
                return new Directory(document)
            }
            else {
                return new File(document)
            }
        } else {
            if (!silent) {
                throw vscode.FileSystemError.FileNotFound(uri);
            } else {
                return undefined;
            }
        }
    }

    private _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Directory {
        let entry = this._lookup(uri, vscode.FileType.Directory, silent);
        if (entry instanceof Directory) {
            return entry;
        }
        throw vscode.FileSystemError.FileNotADirectory(uri);
    }

    private _lookupAsFile(uri: vscode.Uri, silent: boolean): File {
        let entry = this._lookup(uri, vscode.FileType.File, silent);
        if (entry instanceof File) {
            return entry;
        }
        throw vscode.FileSystemError.FileIsADirectory(uri);
    }

    private _lookupParentDirectory(uri: vscode.Uri): Directory {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        return this._lookupAsDirectory(dirname, false);
    }

    // --- manage file events

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private _bufferedEvents: vscode.FileChangeEvent[] = [];
    private _fireSoonHandle: NodeJS.Timer;

    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(resource: vscode.Uri, opts): vscode.Disposable {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => { });
    }

    private _fireSoon(...events: vscode.FileChangeEvent[]): void {
        this._bufferedEvents.push(...events);
        clearTimeout(this._fireSoonHandle);
        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}
