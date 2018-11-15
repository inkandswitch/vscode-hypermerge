"use strict";
import * as vscode from "vscode";
import { HypermergeFS } from "./fileSystemProvider";
import { HypermergeExplorer } from "./treeview";
import { HypermergeWrapper } from "./fauxmerge";

export function activate(context: vscode.ExtensionContext) {
  console.log("HypermergeFS activated");
  const hypermergeWrapper = new HypermergeWrapper();

  const hypermergeFs = new HypermergeFS(hypermergeWrapper);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("hypermerge", hypermergeFs, {
      isCaseSensitive: true
    })
  );

  vscode.workspace.onDidOpenTextDocument(document => {
    if (document.uri.scheme === "hypermerge") {
      if (JSON.parse(document.getText())) {
        (vscode.languages as any).setTextDocumentLanguage(document, "json");
      }
    }
  });

  // self-registers
  new HypermergeExplorer(context, hypermergeWrapper);
}
