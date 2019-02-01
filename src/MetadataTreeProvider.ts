import * as vscode from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"

export type HypermergeMetadataKey = string

export default class MetadataTreeProvider
  implements vscode.TreeDataProvider<HypermergeMetadataKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeMetadataKey | undefined
  > = new vscode.EventEmitter<HypermergeMetadataKey | undefined>()
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeMetadataKey | undefined
  > = this._onDidChangeTreeData.event

  private activeDocumentUri: vscode.Uri | undefined

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper

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

  public show(uri: vscode.Uri): void {
    if (uri.scheme !== "hypermerge") return
    this.activeDocumentUri = uri
    this.refresh()
  }

  public refresh(key?: HypermergeMetadataKey): any {
    this._onDidChangeTreeData.fire(key)
  }

  public getTreeItem(element: HypermergeMetadataKey): vscode.TreeItem {
    const collapsibleState = vscode.TreeItemCollapsibleState.None

    // Make sure we're in a valid hypermerge document.
    if (!this.activeDocumentUri) {
      return { label: "no active hypermerge doc" }
    }
    const details = interpretHypermergeUri(this.activeDocumentUri)
    if (!details) {
      return { label: "bad URI" }
    }

    // Create an array of results.
    const { docId = "" } = details
    if (element === "actor") {
      // const meta = this.hypermergeWrapper.repo.meta(docId)!;
      // this funciton is Async :/  - using a hack instead
      const actor = this.hypermergeWrapper.repo.front.docs.get(docId)!.actorId
      return {
        label: "Local Actor: " + actor,
        collapsibleState,
      }
    }
    if (element === "clocks") {
      return {
        label: "Current Vector Clock",
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      }
    }

    // elsewise we have a clock entry
    return {
      label: element,
      collapsibleState,
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
    element?: HypermergeMetadataKey,
  ): HypermergeMetadataKey[] | Thenable<HypermergeMetadataKey[]> {
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

    if (element === "clocks") {
      return new Promise(resolve => {
        this.hypermergeWrapper.repo.meta(docUrl, meta => {
          const clock = meta && meta.type === "Document" ? meta.clock : {}
          resolve(
            Object.entries(clock).map(
              ([key, value]) => `[${key.slice(0, 5)}]: ${value}`,
            ),
          )
        })
      })
    }

    return ["actor", "clocks"]
  }

  public getParent(
    element: HypermergeMetadataKey,
  ): HypermergeMetadataKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null
  }
}
