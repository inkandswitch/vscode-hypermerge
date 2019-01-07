import {
  TreeDataProvider, EventEmitter, Event, Uri, Disposable, window,
  TreeItem, TreeItemCollapsibleState, ProviderResult, ThemeIcon
} from "vscode";
import prettyBytes from "pretty-bytes";

import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper";
import { Actor } from "hypermerge/dist/Actor";


interface ErrorNode {
  type: "Error"
  message: string
}

interface ActorNode {
  type: "Actor"
  actor: Actor
}

interface BlocksNode {
  type: "Blocks"
  actor: Actor
}

interface BlockNode {
  type: "Block"
  actor: Actor
  index: number
}

interface PeersNode {
  type: "Peers"
  actor: Actor
}

interface PeerNode {
  type: "Peer"
  actor: Actor
  index: number
  peer: any
}

interface InfoNode {
  type: "Info"
  info: TreeItem
}

export type Node =
  | ActorNode
  | ErrorNode
  | BlocksNode
  | BlockNode
  | PeersNode
  | PeerNode
  | InfoNode

export default class FeedTreeProvider implements TreeDataProvider<Node>, Disposable {

  private _onDidChangeTreeData = new EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeDocumentUri: Uri | undefined;
  private interval: NodeJS.Timeout

  constructor(private hypermergeWrapper: HypermergeWrapper) {

    window.onDidChangeActiveTextEditor(() =>
      this.onActiveEditorChanged()
    );

    this.onActiveEditorChanged(); // call it the first time on startup

    // Fairly hacky but it seems to work just fine.
    // Feels like too much work to manage listeners for all this stuff.
    this.interval = setInterval(() => this.refresh(), 2000)
  }

  public dispose() {
    clearInterval(this.interval)
  }

  get activeDocId(): string | undefined {
    const uri = this.activeDocumentUri
    if (!uri) return

    const details = interpretHypermergeUri(uri)
    if (!details) return

    return details.docId
  }

  private onActiveEditorChanged(): void {
    const { activeTextEditor } = window

    if (!activeTextEditor) return

    if (activeTextEditor.document.uri.scheme === "hypermerge") {
      this.activeDocumentUri = activeTextEditor.document.uri;
      this.refresh();
    }
  }

  public refresh(key?: Node): any {
    this._onDidChangeTreeData.fire(key);
  }

  public getTreeItem(node: Node): TreeItem | Thenable<TreeItem> {
    const State = TreeItemCollapsibleState

    switch (node.type) {
      case "Error":
        return {
          label: `Error: ${node.message}`
        }

      case "Actor":
        return {
          collapsibleState: State.Expanded,
          label: node.actor.id.slice(0, 8),
          description: node.actor.feed.writable ? "Writable" : "Readonly",
          id: `Feed/${node.actor.id}`
        }

      case "Blocks":
        return {
          label: `${(<any>node.actor.feed).downloaded()} / ${node.actor.feed.length} Blocks`,
          collapsibleState: State.Collapsed,
          description: prettyBytes((<any>node.actor.feed).byteLength),
          id: `Blocks/${node.actor.id}`
        }

      case "Block": {
        const resourceUri = Uri.parse(`hypercore:/${node.actor.id}/${node.index}.json`)
        const isDownloaded = node.actor.feed.has(node.index)

        return blockSize(node.actor.feed, node.index)
          .catch(_ => 0)
          .then(bytes => {
            const size = bytes ? prettyBytes(bytes) : ""

            return {
              label: "Block " + node.index,
              collapsibleState: State.None,
              description: isDownloaded ? `✓ ${size}` : "Missing",
              id: `Block/${node.actor.id}/${node.index}`,
              resourceUri,
              command: {
                command: "vscode.open",
                arguments: [resourceUri],
                title: "View contents"
              }
            }
          })
      }

      case "Peers": {
        const { peers } = node.actor.feed
        const connectedCount = peers.reduce((n, peer: any) => peer.stream.closed ? n : n + 1, 0)

        return {
          label: `${connectedCount} / ${peers.length} Peers`,
          collapsibleState: State.Collapsed,
          id: `Peers/${node.actor.id}`
        }
      }

      case "Peer": {
        const { peer } = node
        const id = peer.remoteId ? peer.remoteId.toString('hex') : "Local"
        const tag = id.slice(0, 8)
        const isOpen = !peer.stream.closed

        const conn = connectionInfo(peer)
        const description = join(
          conn ? conn.type : "",
          isOpen ? "✓" : "Closed"
        )

        return {
          label: `Peer ${tag}`,
          collapsibleState: isOpen ? State.Expanded : State.Collapsed,
          description,
          id: `Peer/${node.actor.id}/${peer._index}`
        }
      }

      case "Info": {
        return node.info
      }
    }
  }

  attemptToInterpretUrl(str: string): { docId?: string; keyPath?: string[] } {
    if (str.length > 2000 || str.includes("\n")) return {};

    try {
      return interpretHypermergeUri(Uri.parse(str)) || {};
    } catch (e) {
      return {};
    }
  }

  public getChildren(
    node?: Node
  ): ProviderResult<Node[]> {
    const docId = this.activeDocId
    if (!docId) return []

    if (!node) {
      const { repo } = this.hypermergeWrapper
      const back = repo.back.docs.get(docId)

      if (!back) return [errorNode("Could not find Doc")]

      const actors = repo.back.docActors(back)

      return actors.map(actorNode)
    }

    switch (node.type) {
      case "Actor":
        return [
          { type: "Blocks", actor: node.actor },
          { type: "Peers", actor: node.actor },
        ]

      case "Blocks":
        return Array(node.actor.feed.length)
          .fill(0)
          .map((_, i) => blockNode(node.actor, i))

      case "Peers":
        return node.actor.feed.peers
          .map((peer, i) => peerNode(node.actor, peer, i))

      case "Peer": {
        const conn = connectionInfo(node.peer)
        if (!conn) return [infoNode({ label: "Connection info error" })]

        return [
          infoNode({ label: join("State:", conn.readyState) }),
          infoNode({
            label: join("Local:", conn.local.ip),
            description: conn.local.port.toString()
          }),
          infoNode({
            label: join("Remote:", conn.remote.ip),
            description: conn.remote.port.toString()
          }),
          infoNode({
            label: prettyBytes(conn.bytes.read),
            description: "Received"
          }),
          infoNode({
            label: prettyBytes(conn.bytes.written),
            description: "Sent"
          }),
        ]
      }

      default:
        return []
    }
  }

  public getParent(element: Node): Node | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}

function blockSize(feed: any, index: number): Promise<number> {
  return new Promise((res, rej) => {
    feed._storage.dataOffset(index, [], (err: any, offset: number, size: number) => {
      if (err) return rej(err)
      res(size)
    })
  })
}

function errorNode(message: string): ErrorNode {
  return { type: "Error", message }
}

function actorNode(actor: Actor): ActorNode {
  return { type: "Actor", actor }
}

function blockNode(actor: Actor, index: number): BlockNode {
  return { type: "Block", actor, index }
}

function peerNode(actor: Actor, peer: any, index: number): PeerNode {
  return { type: "Peer", actor, peer, index }
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
        }
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
      }
    }
  } catch (e) {
    console.log("non-breaking connectionInfo error –", e)
    return
  }
}

function join(...items: any[]): string {
  return items.filter(x => x != null && x != "").join(" ")
}
