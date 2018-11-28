import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";

export type HypermergeHistoryKey = string;

export class HypermergeHistoryTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeHistoryKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeHistoryKey | undefined
  > = new vscode.EventEmitter<HypermergeHistoryKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeHistoryKey | undefined
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

  public getTreeItem(element: HypermergeHistoryKey): Thenable<vscode.TreeItem> {
    const resourceUri = vscode.Uri.parse(element);

    const collapsibleState = vscode.TreeItemCollapsibleState.None;

    return Promise.resolve({
      label: element,
      resourceUri,
      collapsibleState,
      command: {
        command: "vscode.open",
        arguments: [resourceUri],
        title: "Open Hypermerge Document"
      }
    });
  }

  private roots(): HypermergeHistoryKey[] {
    return ["one", "two", "three"];
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
    element?: HypermergeHistoryKey
  ): HypermergeHistoryKey[] | Thenable<HypermergeHistoryKey[]> {
    return element ? [] : [...this.roots()];
  }

  public getParent(element: HypermergeHistoryKey): HypermergeHistoryKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}
