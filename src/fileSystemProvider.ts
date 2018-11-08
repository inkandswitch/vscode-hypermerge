"use strict";

import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

export class HypermergeFS implements vscode.FileSystemProvider {
  hypermerge: HypermergeWrapper;
  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.hypermerge = hypermergeWrapper;

    this.hypermerge.on("update", uri => {
      this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
    });
  }

  // --- manage file metadata

  stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
    return this.hypermerge.openDocumentUri(uri).then(document => {
      if (!document) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      return {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
        type: vscode.FileType.SymbolicLink
      };
    });
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions;
  }

  // --- manage file contents

  readFile(uri: vscode.Uri): Thenable<Uint8Array> {
    return this.hypermerge.openDocumentUri(uri).then(document => {
      // XXX: Generalize this to support leaf nodes
      if (typeof document === "string") {
        return Buffer.from(document);
      }
      return Buffer.from(JSON.stringify(document, undefined, 2));
    });
    /* fixme: timeout, bad uri?
    if (!document) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    */
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): void {
    // not great
    try {
      const result = JSON.parse(content.toString());
      this.hypermerge.setDocumentUri(uri, result);
    } catch {
      this.hypermerge.setDocumentUri(uri, content.toString());
    }
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
    // need to have a dummy createDirectory for saving leaf nodes
    // for ... some reason
    return;
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
