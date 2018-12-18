"use strict";
import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

export default class DiagnosticCollector {
  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection(
      "hypermergefs"
    );

    hypermergeWrapper.addListener("update", (uri, doc) => {
      try {
        // we always clear, since an update means a new document.
        diagnosticCollection.clear();

        const { hypermergeFsDiagnostics } = doc;

        if (hypermergeFsDiagnostics) {
          for (const [target, items] of Object.entries(
            hypermergeFsDiagnostics
          )) {
            const diagnostics = (items as any[]).map(item => {
              const severity =
                item.severity.toLowerCase() === "warning"
                  ? vscode.DiagnosticSeverity.Warning
                  : vscode.DiagnosticSeverity.Error;

              const message = item.message;

              const range = new vscode.Range(
                item.startLine,
                item.startColumn,
                item.endLine,
                item.endColumn
              );
              return new vscode.Diagnostic(range, message, severity);
            });

            const targetUri = uri.with({ path: uri.path });
            diagnosticCollection.set(targetUri, diagnostics);
          }
        }
      } catch (e) {
        console.log(e);
      }
    });
  }
}
