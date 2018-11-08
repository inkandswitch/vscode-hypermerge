import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

export type HypermergeNodeKey = string;

export class HypermergeModel {
  // emit updates to the TreeDataProvider when a document changes
  private _onDocumentUpdated: vscode.EventEmitter<
    HypermergeNodeKey | undefined
  > = new vscode.EventEmitter<HypermergeNodeKey | undefined>();
  readonly onDocumentUpdated: vscode.Event<any> = this._onDocumentUpdated.event;

  hypermerge: HypermergeWrapper;
  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.hypermerge = hypermergeWrapper;

    this.hypermerge.addListener("update", uri => {
      this._onDocumentUpdated.fire(uri.toString());
    });
  }

  public addRoot(uriString: string) {
    const roots =
      vscode.workspace
        .getConfiguration("hypermergefs")
        .get<string[]>("roots") || [];
    vscode.workspace
      .getConfiguration("hypermergefs")
      .update(
        "roots",
        [uriString, ...roots],
        vscode.ConfigurationTarget.Global
      );
  }

  public get roots(): Thenable<HypermergeNodeKey[]> {
    return new Promise(resolve => {
      const roots =
        vscode.workspace
          .getConfiguration("hypermergefs")
          .get<string[]>("roots") || [];
      resolve(roots);
    });
  }

  private extractChildren(document: any): Map<string, HypermergeNodeKey> {
    const children = new Map();
    if (document.children) {
      // hardcoded "children" field for now, should traverse the doc
      // extracting child links
      document.children.forEach(([name, uri]) => children.set(name, uri));
    }
    return children;
  }

  public getChildren(node: HypermergeNodeKey): Thenable<HypermergeNodeKey[]> {
    return new Promise(resolve => {
      const parentDoc = this.hypermerge.openDocumentUri(vscode.Uri.parse(node));
      const childNodes = this.extractChildren(parentDoc);
      resolve(Array.from(childNodes.values()));
    });
  }
}

export class HypermergeTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeNodeKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeNodeKey | undefined
  > = new vscode.EventEmitter<HypermergeNodeKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeNodeKey | undefined
  > = this._onDidChangeTreeData.event;

  constructor(private readonly model: HypermergeModel) {
    this.model.onDocumentUpdated(uri => {
      // Right now, down in extHostTreeViews.ts we eventually reach a refresh() call which
      // tries to pull the value below out of "this.nodes" and can't, because it's a compound value.
      // ... so, this will refresh the whole tree which is fine for now.
      // this._onDidChangeTreeData.fire(event);
      this._onDidChangeTreeData.fire(uri.toString());
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeNodeKey): vscode.TreeItem {
    // XXX: we should be building a cache of results & maintaining it over time here
    const uri = vscode.Uri.parse(element);
    return {
      label: uri.path.slice(1),
      resourceUri: uri,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      command: {
        command: "vscode.open",
        arguments: [uri],
        title: "Open Hypermerge Document"
      }
    };
  }

  public getChildren(
    element?: HypermergeNodeKey
  ): HypermergeNodeKey[] | Thenable<HypermergeNodeKey[]> {
    return element ? this.model.getChildren(element) : this.model.roots;
  }

  public getParent(element: HypermergeNodeKey): HypermergeNodeKey | null {
    // there isn't necessarily a parent for a particular node in our system..
    // or at least not the way i'm currently modeling it
    // XX: the node key should arguably be a path of some kind?
    return null;
  }
}

export class HypermergeExplorer {
  // TODO:
  // plus icon for "add root"
  // better error reporting on invalid json
  // actually diff the files on save instead of replacing them
  // handle missing files in the tree view

  private hypermergeViewer: vscode.TreeView<HypermergeNodeKey>;

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const hypermergeModel = new HypermergeModel(hypermergeWrapper);
    const treeDataProvider = new HypermergeTreeDataProvider(hypermergeModel);

    this.hypermergeViewer = vscode.window.createTreeView("hypermergeExplorer", {
      treeDataProvider
    });

    vscode.commands.registerCommand("hypermergeExplorer.refresh", () =>
      treeDataProvider.refresh()
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("hypermergefs.roots")) {
          treeDataProvider.refresh();
        }
      })
    );

    vscode.commands.registerCommand("hypermergeExplorer.register", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: this.validateURL
      });
      if (uriString) {
        hypermergeModel.addRoot(uriString);
        treeDataProvider.refresh();
      }
    });

    vscode.commands.registerCommand("hypermergeExplorer.revealResource", () =>
      this.reveal()
    );
  }

  validateURL(input: string) {
    let url;
    try {
      url = vscode.Uri.parse(input);
    } catch {
      return "invalid URL";
    }
    if (url.scheme !== "hypermergefs") {
      return "invalid scheme -- must be a hypermergefs URL";
    }
    if (url.authority != "") {
      return "invalid format";
    }
    return ""; // we can return a hint string if it's invalid
  }

  private reveal(): Thenable<void> | null {
    const node = this.getNode();
    if (node) {
      return this.hypermergeViewer.reveal(node);
    }
    return null;
  }

  private getNode(): HypermergeNodeKey | null {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (editor.document.uri.scheme === "hypermergefs") {
        return editor.document.uri.toString();
      }
    }
    return null;
  }
}
