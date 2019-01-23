"use strict"
import * as vscode from "vscode"
import DebugManager from "./DebugManager"
import HypermergeFS from "./HypermergeFS"
import HypercoreFS from "./HypercoreFS"
import HypermergeExplorer from "./HypermergeExplorer"
import DetailsViewContainer from "./DetailsViewContainer"
import { HypermergeWrapper } from "./HypermergeWrapper"
import HypermergeUriHandler from "./HypermergeUriHandler"
import HypermergeDocumentLinkProvider from "./DocumentLinkProvider"
import DiagnosticCollector from "./DiagnosticCollector"

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Hypermerge")
  const debugManager = new DebugManager(output)

  output.appendLine("HypermergeFS activated")

  const hypermergeWrapper = new HypermergeWrapper()

  context.subscriptions.push(
    output,
    debugManager,

    vscode.workspace.registerFileSystemProvider(
      "hypermerge",
      new HypermergeFS(hypermergeWrapper),
      {
        isCaseSensitive: true,
      },
    ),

    vscode.workspace.registerFileSystemProvider(
      "hypercore",
      new HypercoreFS(hypermergeWrapper),
      {
        isCaseSensitive: true,
        isReadonly: true,
      },
    ),

    vscode.window.onDidChangeActiveTextEditor(editor => {
      const isHypermerge = editor && editor.document.uri.scheme === "hypermerge"

      vscode.commands.executeCommand("setContext", "isHypermerge", isHypermerge)
    }),

    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === "hypermerge") {
        try {
          JSON.parse(document.getText())(
            vscode.languages as any,
          ).setTextDocumentLanguage(document, "json")
        } catch (e) {
          // not JSON, which is fine
          // really, we should do something cheaper than parse the whole file here
        }
      }
    }),

    vscode.languages.registerDocumentLinkProvider(
      { scheme: "*" },
      new HypermergeDocumentLinkProvider(),
    ),

    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === "hypermerge") {
        if (JSON.parse(document.getText())) {
          ;(vscode.languages as any).setTextDocumentLanguage(document, "json")
        }
      }
    }),

    (vscode.window as any).registerUriHandler(new HypermergeUriHandler(output)),

    new DetailsViewContainer(hypermergeWrapper),
  )

  // self-registers
  new DiagnosticCollector(context, hypermergeWrapper)
  new HypermergeExplorer(context, hypermergeWrapper)

  return {
    repo: hypermergeWrapper.repo,
  }
}
