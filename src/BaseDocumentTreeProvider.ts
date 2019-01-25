import * as vscode from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import { URL } from "url"

export type HypermergeNodeKey = string

export enum SortOrder {
  Title,
  Key,
}

export default abstract class BaseDocumentTreeProvider
  implements vscode.TreeDataProvider<HypermergeNodeKey> {
  protected _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeNodeKey | undefined
  > = new vscode.EventEmitter<HypermergeNodeKey | undefined>()

  readonly onDidChangeTreeData: vscode.Event<
    HypermergeNodeKey | undefined
  > = this._onDidChangeTreeData.event

  protected sortOrder: SortOrder
  protected treeItemCache = new Map<HypermergeNodeKey, any>()

  constructor(protected readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper
    this.sortOrder = SortOrder.Title

    this.hypermergeWrapper.addListener("update", (uri, doc) => {
      const details = interpretHypermergeUri(uri)

      // Handle bad URLs.
      if (!details) {
        return { label: "<invalid hypermerge URL>" }
      }

      let { docId, keyPath } = details
      this.treeItemCache.set(docId, doc)
      this._onDidChangeTreeData.fire(uri.toString())
    })
  }

  public updateSortOrder(sortOrder: SortOrder) {
    this.sortOrder = sortOrder
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire()
  }

  public removeRoot(resourceUri: string) {
    const uri = vscode.Uri.parse(resourceUri)
    this.hypermergeWrapper.removeDocumentUri(uri)
    this._onDidChangeTreeData.fire()
  }

  public getTreeItem(element: HypermergeNodeKey): vscode.TreeItem {
    const resourceUri = vscode.Uri.parse(element)
    const details = interpretHypermergeUri(resourceUri)

    // Handle bad URLs.
    if (!details) {
      return { label: "<invalid hypermerge URL>" }
    }

    let { docId, keyPath } = details

    let content = this.treeItemCache.get(docId)

    if (content != null) {
      keyPath.forEach(key => {
        if (!content.hasOwnProperty(key)) {
          throw new Error("Invalid path in hypermerge URL.")
        }
        content = content[key]
      })
    }

    // Handle the case where we haven't loaded any content yet.
    // TODO: Add support to show loading progress.
    if (typeof content === "undefined") {
      // schedule initial loading.
      this.hypermergeWrapper.openDocumentUri(resourceUri)

      const collapsibleState = vscode.TreeItemCollapsibleState.None
      return {
        label: `[${docId.slice(0, 5)}] (Loading...)`,
        resourceUri,
        collapsibleState,
        command: {
          command: "vscode.open",
          arguments: [resourceUri],
          title: "Open Hypermerge Document",
        },
      }
    }

    let label
    if (keyPath.length) {
      label = keyPath.pop()
    } else if (content.title) {
      label = `[${docId.slice(0, 5)}] ${content.title}`
    } else {
      label = `[${docId.slice(0, 5)}] (No /title)`
    }

    const collapsibleState =
      content instanceof Array || content instanceof Object
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None

    // NOTE: maybe to clever, but worth trying out.
    // Makes it so that clicking on the root of a code doc opens the code
    const newUri =
      typeof content === "object" && "Source.elm" in content
        ? resourceUri.with({ path: resourceUri.path + "/Source.elm" })
        : resourceUri

    return {
      label,
      resourceUri,
      collapsibleState,
      command: {
        command: "vscode.open",
        arguments: [newUri],
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

  public async getChildren(
    element?: HypermergeNodeKey,
  ): Promise<HypermergeNodeKey[]> {
    return element ? this.getDocumentChildren(element) : this.roots()
  }

  public getParent(element: HypermergeNodeKey): HypermergeNodeKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null
  }

  protected abstract async roots(): Promise<HypermergeNodeKey[]>

  protected getDocumentChildren(
    node: HypermergeNodeKey,
  ): Thenable<HypermergeNodeKey[]> {
    const uri = vscode.Uri.parse(node)
    return this.hypermergeWrapper.openDocumentUri(uri).then(content => {
      if (!(content instanceof Object)) {
        return []
      }

      const children = Object.keys(content)
      const childNodes = children.map(child => {
        if (typeof content[child] === "string") {
          const { docId = null, keyPath = [] } = this.attemptToInterpretUrl(
            content[child],
          )
          if (docId) {
            return "hypermerge:/" + docId + ""
          }
        }
        // this builds a new child URL and ditches the label if it exists.
        return new URL(node + "/" + child).toString()
      })
      return childNodes
    })
  }
}
