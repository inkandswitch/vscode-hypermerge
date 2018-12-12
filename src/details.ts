import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

import { HypermergeHistoryTreeDataProvider } from "./history";
import { HypermergeMetadataTreeDataProvider } from "./metadata";

export class HypermergeViewContainer {
  private treeDataProvider: HypermergeHistoryTreeDataProvider;

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const metadataDataProvider = new HypermergeMetadataTreeDataProvider(
      hypermergeWrapper
    );

    vscode.window.createTreeView("hypermergeMetadata", {
      treeDataProvider: metadataDataProvider
    });

    const historyDataProvider = new HypermergeHistoryTreeDataProvider(
      hypermergeWrapper
    );

    vscode.window.createTreeView("hypermergeHistory", {
      treeDataProvider: historyDataProvider
    });
  }
}
