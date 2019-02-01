import * as vscode from "vscode"
import { HypermergeWrapper } from "./HypermergeWrapper"

import HistoryTreeProvider from "./HistoryTreeProvider"
import MetadataTreeProvider from "./MetadataTreeProvider"
import FeedTreeProvider from "./FeedTreeProvider"
import DisposableCollection from "./DisposableCollection"

export default class DetailsViewContainer implements vscode.Disposable {
  subscriptions = new DisposableCollection()
  feedDataProvider = new FeedTreeProvider(this.hypermergeWrapper)
  metadataDataProvider = new MetadataTreeProvider(this.hypermergeWrapper)
  historyDataProvider = new HistoryTreeProvider(this.hypermergeWrapper)

  constructor(private hypermergeWrapper: HypermergeWrapper) {
    vscode.window.createTreeView("hypermergeMetadata", {
      treeDataProvider: this.metadataDataProvider,
    })

    const feedView = vscode.window.createTreeView("hypermergeFeeds", {
      treeDataProvider: this.feedDataProvider,
    })

    vscode.window.createTreeView("hypermergeHistory", {
      treeDataProvider: this.historyDataProvider,
    })

    this.subscriptions.push(
      feedView,
      this.feedDataProvider,
      vscode.window.onDidChangeActiveTextEditor(() =>
        this.onActiveEditorChanged(),
      ),
    )

    this.onActiveEditorChanged() // call it the first time on startup
  }

  show(uri: vscode.Uri) {
    this.feedDataProvider.show(uri)
    this.metadataDataProvider.show(uri)
    this.historyDataProvider.show(uri)
  }

  dispose() {
    this.subscriptions.dispose()
  }

  private onActiveEditorChanged() {
    const { activeTextEditor } = vscode.window

    if (!activeTextEditor) return

    this.show(activeTextEditor.document.uri)
  }
}
