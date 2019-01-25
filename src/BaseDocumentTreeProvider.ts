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
  protected _onDidChangeTreeData = new vscode.EventEmitter<
    HypermergeNodeKey | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  protected sortOrder: SortOrder
  protected loaded = new Set<HypermergeNodeKey>()

  constructor(protected readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper
    this.sortOrder = SortOrder.Title
  }

  public abstract async roots(): Promise<HypermergeNodeKey[]>
  public abstract addRoot(resourceUri: string): void
  public abstract removeRoot(resourceUri: string): void

  public updateSortOrder(sortOrder: SortOrder) {
    this.sortOrder = sortOrder
  }

  public refresh(resourceUri?: string): any {
    this._onDidChangeTreeData.fire(resourceUri)
  }

  public async getTreeItem(
    element: HypermergeNodeKey,
  ): Promise<vscode.TreeItem> {
    const resourceUri = vscode.Uri.parse(element)
    const details = interpretHypermergeUri(resourceUri)

    // Handle bad URLs.
    if (!details) {
      return { label: "<invalid hypermerge URL>" }
    }

    let { docId, keyPath, docUrl } = details

    const tooltip = docId

    if (!this.loaded.has(docId)) {
      this.hypermergeWrapper.watchDocumentUri(vscode.Uri.parse(docUrl), doc => {
        this.loaded.add(docId)
        this.refresh(docUrl)
      })

      const collapsibleState = vscode.TreeItemCollapsibleState.None
      return {
        label: `[${docId.slice(0, 5)}] (Loading...)`,
        tooltip,
        id: element,
        resourceUri,
        collapsibleState,
        command: {
          command: "vscode.open",
          arguments: [resourceUri],
          title: "View Document",
        },
      }
    }

    const doc = await this.hypermergeWrapper.openDocumentUri(resourceUri)

    let content = doc

    let label
    let description
    if (keyPath.length) {
      label = keyPath.pop()
    } else if (content.title) {
      // label = `[${docId.slice(0, 5)}] ${content.title}`
      label = `${content.title}`
      description = docId.slice(0, 5)
    } else {
      label = `(No title)`
      description = docId.slice(0, 5)
    }

    const collapsibleState =
      content != null && typeof content === "object"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None

    // NOTE: maybe too clever, but worth trying out.
    // Makes it so that clicking on the root of a code doc opens the code
    const newUri =
      typeof content === "object" && "Source.elm" in content
        ? resourceUri.with({ path: resourceUri.path + "/Source.elm" })
        : resourceUri

    return {
      label,
      id: element,
      description,
      tooltip,
      resourceUri,
      collapsibleState,
      command: {
        command: "vscode.open",
        arguments: [newUri],
        title: "View Document",
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

  protected async getDocumentChildren(
    node: HypermergeNodeKey,
  ): Promise<HypermergeNodeKey[]> {
    const uri = vscode.Uri.parse(node)

    const content = await this.hypermergeWrapper.openDocumentUri(uri)

    if (typeof content !== "object") {
      return []
    }

    const children = Object.keys(content)
    const childNodes = children.map(child => {
      if (typeof content[child] === "string") {
        const { docId = null } = this.attemptToInterpretUrl(content[child])

        if (docId) return "hypermerge:/" + docId
      }

      // this builds a new child URL and ditches the label if it exists.
      return new URL(node + "/" + child).toString()
    })
    return childNodes
  }
}
