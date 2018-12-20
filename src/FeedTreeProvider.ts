import {
  TreeDataProvider, EventEmitter, Event, Uri, Disposable, window,
  TreeItem, TreeItemCollapsibleState, ProviderResult, ThemeIcon
} from "vscode";
import prettyBytes from "pretty-bytes";

import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";
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


export type Node = ActorNode | ErrorNode | BlocksNode | BlockNode

export default class FeedTreeProvider implements TreeDataProvider<Node> {

  private _onDidChangeTreeData = new EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeDocumentUri: Uri | undefined;

  constructor(private hypermergeWrapper: HypermergeWrapper) {

    window.onDidChangeActiveTextEditor(() =>
      this.onActiveEditorChanged()
    );

    this.onActiveEditorChanged(); // call it the first time on startup

    // XXX looks like this might be broken
    this.hypermergeWrapper.addListener("update", updatedDocumentUri => {
      if (
        this.activeDocumentUri &&
        this.activeDocumentUri.toString() === updatedDocumentUri.toString()
      ) {
        this._onDidChangeTreeData.fire();
      }
    });
  }

  get activeDocId(): string | undefined {
    const uri = this.activeDocumentUri
    if (!uri) return

    const details = interpretHypermergeUri(uri)
    if (!details) return

    return details.docId
  }

  private onActiveEditorChanged(): void {
    if (
      window.activeTextEditor &&
      window.activeTextEditor.document.uri.scheme === "hypermerge"
    ) {
      this.activeDocumentUri = window.activeTextEditor.document.uri;
      this.refresh();
    }
  }

  public refresh(key?: Node): any {
    this._onDidChangeTreeData.fire(key);
  }

  public getTreeItem(node: Node): TreeItem {
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

      case "Block":
        const resourceUri = Uri.parse(`hypercore:/${node.actor.id}/${node.index}`)
        return {
          label: "Block " + node.index,
          description: node.actor.feed.has(node.index) ? "✓" : "Missing",
          collapsibleState: State.None,
          id: `Block/${node.actor.feed.id.toString('hex')}/${node.index}`,
          resourceUri,
          command: {
            command: "vscode.open",
            arguments: [resourceUri],
            title: "View contents"
          }
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

      if (!back) return [error("Could not find Doc")]

      const actors = repo.back.docActors(back)

      return actors.map(actor)
    }

    switch (node.type) {
      case "Error":
        return []

      case "Actor":
        return [
          { type: "Blocks", actor: node.actor },
        ]

      case "Blocks":
        return Array(node.actor.feed.length)
          .fill(0)
          .map((_, i) => block(node.actor, i))

      case "Block":
        return []
    }
  }

  public getParent(
    element: Node
  ): Node | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}

function error(message: string): ErrorNode {
  return { type: "Error", message }
}

function actor(actor: Actor): ActorNode {
  return { type: "Actor", actor }
}

function block(actor: Actor, index: number): BlockNode {
  return { type: "Block", actor, index }
}
