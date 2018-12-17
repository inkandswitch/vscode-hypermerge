import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";
import { URL } from "url";

export type HypermergeNodeKey = string;


export enum SortOrder {
  Title,
  Key
}

export default class HypermergeTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeNodeKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeNodeKey | undefined
  > = new vscode.EventEmitter<HypermergeNodeKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeNodeKey | undefined
  > = this._onDidChangeTreeData.event;

  private sortOrder: SortOrder;

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper;
    this.sortOrder = SortOrder.Title

    this.hypermergeWrapper.addListener("update", (uri, doc) => {
      const details = interpretHypermergeUri(uri);

      // Handle bad URLs.
      if (!details) {
        return { label: "<invalid hypermerge URL>" };
      }

      let { docId, keyPath } = details;
      this.treeItemCache.set(docId, doc);
      this._onDidChangeTreeData.fire(uri.toString());
    });

  }

  public updateSortOrder(sortOrder: SortOrder) {
    this.sortOrder = sortOrder
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  private treeItemCache = new Map<HypermergeNodeKey, any>();

  public getTreeItem(element: HypermergeNodeKey): vscode.TreeItem {
    const resourceUri = vscode.Uri.parse(element);
    const details = interpretHypermergeUri(resourceUri);

    // Handle bad URLs.
    if (!details) {
      return { label: "<invalid hypermerge URL>" };
    }

    let { docId, keyPath } = details;

    const content = this.treeItemCache.get(docId);

    // Handle the case where we haven't loaded any content yet.
    // TODO: Add support to show loading progress.
    if (!content) {
      // schedule initial loading.
      this.hypermergeWrapper.openDocumentUri(resourceUri);

      const collapsibleState = vscode.TreeItemCollapsibleState.None;
      return {
        label: `[${docId.slice(0, 5)}] (Loading...)`,
        resourceUri,
        collapsibleState,
        command: {
          command: "vscode.open",
          arguments: [resourceUri],
          title: "Open Hypermerge Document"
        }
      };
    }

    let label;
    if (keyPath.length) {
      label = keyPath.pop();
    } else if (content.title) {
      label = `[${docId.slice(0, 5)}] ${content.title}`;
    } else {
      label = `[${docId.slice(0, 5)}] (No /title)`;
    }

    const collapsibleState =
      content instanceof Array || content instanceof Object
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return {
      label,
      resourceUri,
      collapsibleState,
      command: {
        command: "vscode.open",
        arguments: [resourceUri],
        title: "Open Hypermerge Document"
      }
    };
  }

  private roots(): Thenable<HypermergeNodeKey[]> {
    return new Promise(resolve => {
      setTimeout(
        () =>
          resolve(
            this.hypermergeWrapper.repo.back.meta
              .docs()
              .map(id => "hypermerge:/" + id)
              .sort()
          ),
        1000 // XXX OH GOD FIX THIS SOON
      );
    });
  }

  private getDocumentChildren(
    node: HypermergeNodeKey
  ): Thenable<HypermergeNodeKey[]> {
    const uri = vscode.Uri.parse(node);
    return this.hypermergeWrapper.openDocumentUri(uri).then((content: any) => {
      if (!(content instanceof Object)) {
        return [];
      }

      const children = Object.keys(content);
      const childNodes = children.map(child => {
        if (typeof content[child] === "string") {
          const { docId = null, keyPath = [] } = this.attemptToInterpretUrl(
            content[child]
          );
          if (docId) {
            return "hypermerge:/" + docId + "";
          }
        }
        // this builds a new child URL and ditches the label if it exists.
        return new URL(node + "/" + child).toString();
      });
      return childNodes;
    });
  }

  attemptToInterpretUrl(str: string): { docId?: string; keyPath?: string[] } {
    if (str.length > 2000 || str.includes("\n")) return {};

    try {
      return interpretHypermergeUri(vscode.Uri.parse(str)) || {};
    } catch (e) {
      return {};
    }
  }

  public getChildren(
    element?: HypermergeNodeKey
  ): Thenable<HypermergeNodeKey[]> {
    return element ? this.getDocumentChildren(element) : this.roots();
  }

  public getParent(element: HypermergeNodeKey): HypermergeNodeKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}
