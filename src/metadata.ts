import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";

export type HypermergeMetadataKey = string;

export class HypermergeMetadataTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeMetadataKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeMetadataKey | undefined
  > = new vscode.EventEmitter<HypermergeMetadataKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeMetadataKey | undefined
  > = this._onDidChangeTreeData.event;

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper;
    this.hypermergeWrapper.addListener("update", uri => {
      this._onDidChangeTreeData.fire(uri);
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(
    element: HypermergeMetadataKey
  ): Thenable<vscode.TreeItem> {
    const resourceUri = vscode.Uri.parse(element);

    const collapsibleState = vscode.TreeItemCollapsibleState.None;

    return Promise.resolve({
      label: element,
      resourceUri,
      collapsibleState
    });
  }

  private roots(): HypermergeMetadataKey[] {
    return ["actor", "Clocks"];
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
    element?: HypermergeMetadataKey
  ): HypermergeMetadataKey[] | Thenable<HypermergeMetadataKey[]> {
    return element ? [] : [...this.roots()];
  }

  public getParent(
    element: HypermergeMetadataKey
  ): HypermergeMetadataKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}
