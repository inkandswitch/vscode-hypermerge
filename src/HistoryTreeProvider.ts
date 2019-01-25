import * as vscode from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"

export type HypermergeHistoryKey = string

export default class HistoryTreeProvider
  implements vscode.TreeDataProvider<HypermergeHistoryKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeHistoryKey | undefined
  > = new vscode.EventEmitter<HypermergeHistoryKey | undefined>()
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeHistoryKey | undefined
  > = this._onDidChangeTreeData.event

  private activeDocumentUri: vscode.Uri | undefined

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper

    vscode.window.onDidChangeActiveTextEditor(() =>
      this.onActiveEditorChanged(),
    )
    this.onActiveEditorChanged() // call it the first time on startup

    // XXX looks like this might be broken
    this.hypermergeWrapper.addListener("update", updatedDocumentUri => {
      if (
        this.activeDocumentUri &&
        this.activeDocumentUri.toString() === updatedDocumentUri.toString()
      ) {
        this._onDidChangeTreeData.fire()
      }
    })
  }

  private onActiveEditorChanged(): void {
    if (
      vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.uri.scheme === "hypermerge"
    ) {
      this.activeDocumentUri = vscode.window.activeTextEditor.document.uri
      this.refresh()
    }
  }

  public refresh(key?: HypermergeHistoryKey): any {
    this._onDidChangeTreeData.fire(key)
  }

  public getTreeItem(element: HypermergeHistoryKey): vscode.TreeItem {
    const collapsibleState = vscode.TreeItemCollapsibleState.None

    if (!this.activeDocumentUri) {
      console.log("How can we be here?")
      return { label: "No open hypermerge doc " }
    }

    const resourceUri = this.activeDocumentUri.with({
      query: "history=" + element,
    })
    return {
      label: "history=" + element,
      resourceUri,
      collapsibleState,
      command: {
        command: "hypermergeExplorer.preview",
        arguments: [resourceUri],
        title: "Open Hypermerge Document",
      },
    }
  }

  attemptToInterpretUrl(str: string): { docId?: string; keyPath?: string[] } {
    if (str.length > 2000 || str.includes("\n")) return {}

    try {
      return interpretHypermergeUri(vscode.Uri.parse(str)) || {}
    } catch (e) {
      return {}
    }
  }

  public getChildren(
    element?: HypermergeHistoryKey,
  ): HypermergeHistoryKey[] | Thenable<HypermergeHistoryKey[]> {
    // History is flat -- only return children for the root node
    if (element) {
      return []
    }

    // Make sure we're in a valid hypermerge document.
    if (!this.activeDocumentUri) {
      return ["no active hypermerge doc"]
    }
    const details = interpretHypermergeUri(this.activeDocumentUri)
    if (!details) {
      return ["bad URI"]
    }

    // Create an array of results.
    const { docUrl = "" } = details
    return new Promise(resolve => {
      this.hypermergeWrapper.repo.meta(docUrl, meta => {
        const n = meta && meta.type == "Document" ? meta.history : 0
        const history = [...Array(n).keys()]
          .reverse()
          .map(i => (i + 1).toString())
        resolve(history)
      })
    })
  }

  public getParent(element: HypermergeHistoryKey): HypermergeHistoryKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null
  }
}
