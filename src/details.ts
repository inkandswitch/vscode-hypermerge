import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

import { HypermergeHistoryTreeDataProvider } from "./history";

export class HypermergeViewContainer {
  private treeDataProvider: HypermergeHistoryTreeDataProvider;

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const treeDataProvider = new HypermergeHistoryTreeDataProvider(
      hypermergeWrapper
    );

    vscode.window.createTreeView("hypermergeHistory", {
      treeDataProvider
    });
  }
}
