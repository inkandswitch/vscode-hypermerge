"use strict";
import * as vscode from "vscode";
import DebugManager from "./DebugManager";
import { HypermergeFS } from "./fileSystemProvider";
import { HypermergeExplorer } from "./treeview";
import { HypermergeViewContainer } from "./details";
import { HypermergeWrapper } from "./fauxmerge";
import HypermergeUriHandler from "./HypermergeUriHandler";
import HypermergeDocumentLinkProvider from "./DocumentLinkProvider";
import HypermergeDiagnosticCollector from "./diagnosticCollector";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Hypermerge");
  const debugManager = new DebugManager(output)


  output.appendLine("HypermergeFS activated");

  const hypermergeWrapper = new HypermergeWrapper();


  const hypermergeFs = new HypermergeFS(hypermergeWrapper);

  context.subscriptions.push(
    output,
    debugManager,

    vscode.workspace.registerFileSystemProvider("hypermerge", hypermergeFs, {
      isCaseSensitive: true
    }),

    vscode.window.onDidChangeActiveTextEditor(editor => {
      const isHypermerge = editor && editor.document.uri.scheme === "hypermerge"

      vscode.commands.executeCommand('setContext', 'isHypermerge', isHypermerge)
    }),

    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === "hypermerge") {
        if (JSON.parse(document.getText())) {
          (vscode.languages as any).setTextDocumentLanguage(document, "json");
        }
      }
    }),

    vscode.languages.registerDocumentLinkProvider({ scheme: "*" },
      new HypermergeDocumentLinkProvider()
    ),

    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === "hypermerge") {
        if (JSON.parse(document.getText())) {
          (vscode.languages as any).setTextDocumentLanguage(document, "json");
        }
      }
    }),

    (vscode.window as any).registerUriHandler(new HypermergeUriHandler(output))
  );

  // self-registers
  new HypermergeDiagnosticCollector(context, hypermergeWrapper);
  new HypermergeExplorer(context, hypermergeWrapper);
  new HypermergeViewContainer(context, hypermergeWrapper);

  return {
    repo: hypermergeWrapper.repo,
  }
}
