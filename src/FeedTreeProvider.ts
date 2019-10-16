import {
  TreeDataProvider,
  EventEmitter,
  Uri,
  Disposable,
  TreeItem,
  TreeItemCollapsibleState,
  ProviderResult,
} from "vscode"
import prettyBytes from "pretty-bytes"

import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import { Actor } from "hypermerge/dist/Actor"
import { Feed } from "hypermerge/dist/FeedStore"
import { DocId } from "hypermerge/dist/Misc"

interface ErrorNode {
  type: "Error"
  message: string
}

interface FeedNode {
  type: "Feed"
  feed: Feed
}

interface BlocksNode {
  type: "Blocks"
  feed: Feed
}

interface BlockNode {
  type: "Block"
  feed: Feed
  index: number
}

interface InfoNode {
  type: "Info"
  info: TreeItem
}

export type Node =
  | FeedNode
  | ErrorNode
  | BlocksNode
  | BlockNode
  | InfoNode

export default class FeedTreeProvider
  implements TreeDataProvider<Node>, Disposable {
  private _onDidChangeTreeData = new EventEmitter<Node | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private activeDocumentUri: Uri | undefined
  private interval: NodeJS.Timeout

  constructor(private hypermergeWrapper: HypermergeWrapper) {
    // Fairly hacky but it seems to work just fine.
    // Feels like too much work to manage listeners for all this stuff.
    this.interval = setInterval(() => this.refresh(), 2000)
  }

  public dispose() {
    clearInterval(this.interval)
  }

  get activeDocId(): DocId | undefined {
    const uri = this.activeDocumentUri
    if (!uri) return

    const details = interpretHypermergeUri(uri)
    if (!details) return

    return details.docId
  }

  public show(uri: Uri): void {
    if (uri.scheme !== "hypermerge") return

    this.activeDocumentUri = uri
    this.refresh()
  }

  public refresh(key?: Node): any {
    this._onDidChangeTreeData.fire(key)
  }

  public getTreeItem(node: Node): TreeItem | Thenable<TreeItem> {
    const State = TreeItemCollapsibleState

    switch (node.type) {
      case "Error":
        return {
          label: `Error: ${node.message}`,
        }

      case "Feed":
        return {
          collapsibleState: State.Expanded,
          label: node.feed.id.slice(0, 8),
          description: node.feed.writable ? "Writable" : "Readonly",
          id: `Feed/${node.feed.id}`,
        }

      case "Blocks": {
        const { feed } = node.feed as any
        return {
          label: `${feed.downloaded(0, feed.length)} / ${feed.length} Blocks`,
          collapsibleState: State.Collapsed,
          description: prettyBytes(feed.byteLength),
          id: `Blocks/${node.feed.id}`,
        }
      }

      case "Block": {
        const resourceUri = Uri.parse(
          `hypercore:/${node.feed.id}/${node.index}.json`,
        )
        const isDownloaded = node.feed.has(node.index)

        return blockSize(node.feed, node.index)
          .catch(_ => 0)
          .then(bytes => {
            const size = bytes ? prettyBytes(bytes) : ""

            return {
              label: "Block " + node.index,
              collapsibleState: State.None,
              description: isDownloaded ? `✓ ${size}` : "Missing",
              id: `Block/${node.feed.id}/${node.index}`,
              resourceUri,
              command: {
                command: "vscode.open",
                arguments: [resourceUri],
                title: "View contents",
              },
            }
          })
      }

      case "Info": {
        return node.info
      }
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

  public getChildren(node?: Node): ProviderResult<Node[]> {
    const docId = this.activeDocId
    if (!docId) return []

    if (!node) {
      const { repo } = this.hypermergeWrapper
      const back = repo.back.docs.get(docId)

      if (!back) return [errorNode("Could not find Doc")]

      const actors = repo.back.docActors(back)

      return actors.map(feedNode)
    }

    switch (node.type) {
      case "Feed":
        return [
          { type: "Blocks", feed: node.feed },
        ]

      case "Blocks":
        return Array(node.feed.length)
          .fill(0)
          .map((_, i) => blockNode(node.feed, i))

      default:
        return []
    }
  }

  public getParent(element: Node): Node | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null
  }
}

function blockSize(feed: any, index: number): Promise<number> {
  return new Promise((res, rej) => {
    feed._storage.dataOffset(
      index,
      [],
      (err: any, offset: number, size: number) => {
        if (err) return rej(err)
        res(size)
      },
    )
  })
}

function errorNode(message: string): ErrorNode {
  return { type: "Error", message }
}

function feedNode(feed: Feed): FeedNode {
  return { type: "Feed", feed }
}

function blockNode(feed: Feed, index: number): BlockNode {
  return { type: "Block", feed, index }
}

function infoNode(info: TreeItem): InfoNode {
  return { type: "Info", info }
}

function connectionInfo(peer: any) {
  try {
    const conn = peer.stream.stream._readableState.pipes

    if (!conn) return

    if (conn._utp) {
      const localAddress = conn._utp.address()
      return {
        type: "UTP",
        readyState: true,
        local: {
          ip: localAddress.address,
          port: localAddress.port,
        },
        remote: {
          ip: conn.remoteAddress,
          port: conn.remotePort,
        },
        bytes: {
          read: -1,
          written: -1,
        },
      }
    }

    return {
      type: conn._handle.constructor.name,
      readyState: conn.readyState,
      local: {
        ip: conn.localAddress,
        port: conn.localPort,
      },
      remote: {
        ip: conn.remoteAddress,
        port: conn.remotePort,
      },
      bytes: {
        read: conn.bytesRead,
        written: conn.bytesWritten,
      },
    }
  } catch (e) {
    console.log("non-breaking connectionInfo error –", e)
    return
  }
}

function join(...items: any[]): string {
  return items.filter(x => x != null && x != "").join(" ")
}
