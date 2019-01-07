import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper";

export type HypermergeMetadataKey = string;

export default class MetadataTreeProvider
  implements vscode.TreeDataProvider<HypermergeMetadataKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeMetadataKey | undefined
  > = new vscode.EventEmitter<HypermergeMetadataKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeMetadataKey | undefined
  > = this._onDidChangeTreeData.event;

  private activeDocumentUri: vscode.Uri | undefined;

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper;

    vscode.window.onDidChangeActiveTextEditor(() =>
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

  private onActiveEditorChanged(): void {
    if (
      vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.uri.scheme === "hypermerge"
    ) {
      this.activeDocumentUri = vscode.window.activeTextEditor.document.uri;
      this.refresh();
    }
  }

  public refresh(key?: HypermergeMetadataKey): any {
    this._onDidChangeTreeData.fire(key);
  }

  public getTreeItem(element: HypermergeMetadataKey): vscode.TreeItem {
    const collapsibleState = vscode.TreeItemCollapsibleState.None;

    // Make sure we're in a valid hypermerge document.
    if (!this.activeDocumentUri) {
      return { label: "no active hypermerge doc" };
    }
    const details = interpretHypermergeUri(this.activeDocumentUri);
    if (!details) {
      return { label: "bad URI" };
    }

    // Create an array of results.
    const { docId = "" } = details;
    if (element === "actor") {
      const meta = this.hypermergeWrapper.repo.meta(docId)!;
      return {
        label: "Local Actor: " + meta.actor,
        collapsibleState
      };
    }
    if (element === "clocks") {
      return {
        label: "Current Vector Clock",
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded
      };
    }

    // elsewise we have a clock entry
    return {
      label: element,
      collapsibleState
    };
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
    // Make sure we're in a valid hypermerge document.
    if (!this.activeDocumentUri) {
      return ["no active hypermerge doc"];
    }
    const details = interpretHypermergeUri(this.activeDocumentUri);
    if (!details) {
      return ["bad URI"];
    }

    // Create an array of results.
    const { docId = "" } = details;

    const meta = this.hypermergeWrapper.repo.meta(docId)!;

    if (element === "clocks") {
      const clock = meta.clock;
      return Object.entries(clock).map(
        ([key, value]) => `[${key.slice(0, 5)}]: ${value}`
      );
    }

    return ["actor", "clocks"];
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
