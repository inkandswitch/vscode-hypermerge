"use strict";

import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

export class HypermergeFS implements vscode.FileSystemProvider {
  hypermerge: HypermergeWrapper;
  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.hypermerge = hypermergeWrapper;
  }

  // --- manage file metadata

  stat(uri: vscode.Uri): vscode.FileStat {
    const document = this.hypermerge.openDocumentUri(uri);
    if (!document) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0,
      type: vscode.FileType.Unknown
    };
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions;
  }

  // --- manage file contents

  readFile(uri: vscode.Uri): Uint8Array {
    const document = this.hypermerge.openDocumentUri(uri);
    if (!document) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return Buffer.from(JSON.stringify(document, undefined, 2));
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): void {
    const result = JSON.parse(content.toString());
    this.hypermerge.setDocumentUri(uri, result);

    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  // --- manage files/folders

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): void {
    // HMMM
    throw vscode.FileSystemError.NoPermissions;
  }

  delete(uri: vscode.Uri): void {
    // HMMM
    throw vscode.FileSystemError.NoPermissions;
  }

  createDirectory(uri: vscode.Uri): void {
    // HMMM
    throw vscode.FileSystemError.NoPermissions;
  }

  // --- manage file events

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle: NodeJS.Timer;

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this
    ._emitter.event;

  watch(resource: vscode.Uri, opts): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {});
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
