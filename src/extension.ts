"use strict";
import * as vscode from "vscode";
import { HypermergeFS } from "./fileSystemProvider";
import { HypermergeExplorer } from "./treeview";
import { HypermergeViewContainer } from "./details";
import { HypermergeWrapper } from "./fauxmerge";
import HypermergeUriHandler from "./HypermergeUriHandler";

export function activate(context: vscode.ExtensionContext) {
  console.log("HypermergeFS activated");
  const hypermergeWrapper = new HypermergeWrapper();

  const output = vscode.window.createOutputChannel("Hypermerge");

  const hypermergeFs = new HypermergeFS(hypermergeWrapper);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("hypermerge", hypermergeFs, {
      isCaseSensitive: true
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === "hypermerge") {
        if (JSON.parse(document.getText())) {
          (vscode.languages as any).setTextDocumentLanguage(document, "json");
        }
      }
    })
  );

  context.subscriptions.push(
    (vscode.window as any).registerUriHandler(new HypermergeUriHandler(output))
  );

  // self-registers
  new HypermergeExplorer(context, hypermergeWrapper);
  new HypermergeViewContainer(context, hypermergeWrapper);
}
