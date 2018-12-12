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

  private uri: vscode.Uri | undefined;

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper;
    console.log("SETTING UP: DID CHANGE");
    this.hypermergeWrapper.addListener("update", uri => {
      console.log("DID CHANGE");
      //this._onDidChangeTreeData.fire(uri);
      if (this.uri && this.uri.toString() === uri.toString()) {
        this._onDidChangeTreeData.fire();
      }
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeHistoryKey): Thenable<vscode.TreeItem> {
    const collapsibleState = vscode.TreeItemCollapsibleState.None;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (editor.document.uri.scheme === "hypermerge") {
        this.uri = editor.document.uri;
        const resourceUri = vscode.Uri.parse(
          this.uri.toString() + "?history=" + element
        );
        return Promise.resolve({
          label: "history=" + element,
          resourceUri,
          collapsibleState,
          command: {
            command: "vscode.open",
            arguments: [resourceUri],
            title: "Open Hypermerge Document"
          }
        });
      }
    }
    throw vscode.FileSystemError.NoPermissions;
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
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (editor.document.uri.scheme === "hypermerge") {
        const { docId = "", keyPath = [] } = interpretHypermergeUri(
          editor.document.uri
        )!;
        const meta = this.hypermergeWrapper.repo.meta(docId)!;
        const actor = meta.actor!;
        const n = meta.history;
        const history = [...Array(n).keys()]
          .reverse()
          .map(i => (i + 1).toString());
        return history;
      }
      return ["not a hypermerge doc"];
    }
    return ["no activeTextEditor"];
  }

  public getParent(element: HypermergeHistoryKey): HypermergeHistoryKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}
