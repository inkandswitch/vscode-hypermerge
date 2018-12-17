import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

import HistoryTreeProvider from "./HistoryTreeProvider";
import MetadataTreeProvider from "./MetadataTreeProvider";

export default class DetailsViewContainer {
  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const metadataDataProvider = new MetadataTreeProvider(
      hypermergeWrapper
    );

    vscode.window.createTreeView("hypermergeMetadata", {
      treeDataProvider: metadataDataProvider
    });

    const historyDataProvider = new HistoryTreeProvider(
      hypermergeWrapper
    );

    vscode.window.createTreeView("hypermergeHistory", {
      treeDataProvider: historyDataProvider
    });
  }
}
