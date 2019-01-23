import * as vscode from "vscode"
import { HypermergeWrapper } from "./HypermergeWrapper"

import HistoryTreeProvider from "./HistoryTreeProvider"
import MetadataTreeProvider from "./MetadataTreeProvider"
import FeedTreeProvider from "./FeedTreeProvider"
import DisposableCollection from "./DisposableCollection"

export default class DetailsViewContainer implements vscode.Disposable {
  subscriptions = new DisposableCollection()

  constructor(hypermergeWrapper: HypermergeWrapper) {
    const metadataDataProvider = new MetadataTreeProvider(hypermergeWrapper)

    vscode.window.createTreeView("hypermergeMetadata", {
      treeDataProvider: metadataDataProvider,
    })

    const historyDataProvider = new HistoryTreeProvider(hypermergeWrapper)

    vscode.window.createTreeView("hypermergeHistory", {
      treeDataProvider: historyDataProvider,
    })

    const feedDataProvider = new FeedTreeProvider(hypermergeWrapper)
    const feedView = vscode.window.createTreeView("hypermergeFeeds", {
      treeDataProvider: feedDataProvider,
    })

    this.subscriptions.push(feedView, feedDataProvider)
  }

  dispose() {
    this.subscriptions.dispose()
  }
}
