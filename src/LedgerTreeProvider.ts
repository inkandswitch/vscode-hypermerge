import * as vscode from "vscode"
import { Uri } from "vscode"

import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import { URL } from "url"

// This should be a string or other primitive value (despite the appeal of using a richer data type)
// because the VSCode internal APIs put it into a Set and lose the ability to recognize equality otherwise.  
export type HypermergeNodeKey = string

export enum SortOrder {
  Title,
  Key,
}

export default class LedgerTreeProvider
  implements vscode.TreeDataProvider<HypermergeNodeKey> {
  protected _onDidChangeTreeData = new vscode.EventEmitter<
    HypermergeNodeKey | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  protected sortOrder: SortOrder
  protected loaded = new Set<HypermergeNodeKey>()
  // could use a titleCache to decide when to re-sort.

  constructor(protected readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper
    this.sortOrder = SortOrder.Title
  
    const { ledger }: any = this.hypermergeWrapper.repo.back.meta

    ledger.on("append", () => {
      this.refresh()
    })
  }

  public updateSortOrder(sortOrder: SortOrder) {
    this.sortOrder = sortOrder
  }

  public refresh(resourceUri?: string): any {
    // let's put a debounce on this
    console.log("refresh: " + resourceUri)
    this._onDidChangeTreeData.fire(resourceUri)
  }

  public async getTreeItem(
    element: HypermergeNodeKey,
  ): Promise<vscode.TreeItem> {
    const resourceUri = Uri.parse(element)
    const details = interpretHypermergeUri(resourceUri)

    // Handle bad URLs.
    if (!details) {
      return { label: "<invalid hypermerge URL>" }
    }

    let { docId, keyPath, docUrl } = details

    let tooltip = element
    let description = docId.slice(0, 5)

    if (!this.loaded.has(docId)) {
      this.hypermergeWrapper.watchDocumentUri(vscode.Uri.parse(docUrl), doc => {
        this.loaded.add(docId)
        this.refresh()
      })

      const collapsibleState = vscode.TreeItemCollapsibleState.None
      return {
        label: `(Loading...)`,
        description,
        tooltip,
        // id: element,
        resourceUri,
        collapsibleState,
        command: {
          command: "hypermerge.view",
          arguments: [resourceUri.toString(), { preview: true }],
          title: "View Document",
        },
      }
    }

    const doc = await this.hypermergeWrapper.openDocumentUri(resourceUri)

    let content = doc

    let label
    if (keyPath.length) {
      label = keyPath.pop()
    } else if (content.title) {
      // label = `[${docId.slice(0, 5)}] ${content.title}`
      label = `${content.title}`
    } else {
      label = `(No title)`
    }

    const collapsibleState =
      content != null && typeof content === "object"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None

    const newUri = resourceUri

    return {
      label,
      // id: element,
      description,
      tooltip,
      resourceUri,
      collapsibleState,
      command: {
        command: "hypermerge.view",
        arguments: [newUri.toString(), { preview: true }],
        title: "View Document",
      },
    }
  }

  attemptToInterpretUrl(str: string): { docId?: string; keyPath?: string[] } {
    if (str.length > 2000 || str.includes("\n")) return {}

    try {
      return interpretHypermergeUri(Uri.parse(str)) || {}
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
    const uri = Uri.parse(node)

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

  public async roots(): Promise<HypermergeNodeKey[]> {
    const repo = this.hypermergeWrapper.repo
    const meta = repo.back.meta
    const clocks = repo.back.clocks

    return new Promise<HypermergeNodeKey[]>(resolve => {
      meta.readyQ.push(() => {
        const docs = clocks.getAllDocumentIds(repo.id)
        const contentfulDocs = docs.map( async (docId) => {
          const nodeKey = "hypermerge:/" + docId
          if (!this.loaded.has(docId)) {
            return [nodeKey, null]
          }
          return [nodeKey, await this.hypermergeWrapper.openDocumentUri(Uri.parse(nodeKey))]
        })

        const sortedDocs = Promise.all(contentfulDocs).then(loadedDocs => loadedDocs.sort((a: any, b: any) => {
          if (!a[1]) {
            return 1
          }
          if (!b[1]) {
            return -1
          }

          const aTitle = a[1].title
          const bTitle = b[1].title
          const aKey = a[0]
          const bKey = b[0]
          if (aTitle || bTitle) {
            if (!aTitle) return -1
            if (!bTitle) return 1
            if (aTitle > bTitle) { return 1 }
            if (aTitle < bTitle) { return -1 }
          }
          if (aKey > bKey) { 
            return 1
          }
          if (aKey < bKey) { 
            return -1
          }

          return 0
        })).then(sortedDocs => {
          resolve(sortedDocs.map(pair => pair[0] as string))  // unzip
        })
      })
    })
  }

  public addRoot(resourceUri: string) {
    this.hypermergeWrapper.openDocumentUri(Uri.parse(resourceUri))
    this.refresh()
  }

  public removeRoot(resourceUri: string) {
    const uri = Uri.parse(resourceUri)
    this.hypermergeWrapper.removeDocumentUri(uri)
    this.refresh()
  }
}
