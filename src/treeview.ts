import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";
import { URL } from "url";

export type HypermergeNodeKey = string;

export class HypermergeTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeNodeKey> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeNodeKey | undefined
  > = new vscode.EventEmitter<HypermergeNodeKey | undefined>();
  readonly onDidChangeTreeData: vscode.Event<
    HypermergeNodeKey | undefined
  > = this._onDidChangeTreeData.event;

  constructor(private readonly hypermergeWrapper: HypermergeWrapper) {
    this.hypermergeWrapper = hypermergeWrapper;
    this.hypermergeWrapper.addListener("update", uri => {
      // XXX FIXME this broke
      this._onDidChangeTreeData.fire(uri.toString());
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeNodeKey): vscode.TreeItem {
    // XXX: we should be building a cache of results & maintaining it over time here
    const resourceUri = vscode.Uri.parse(element);
    const details = interpretHypermergeUri(resourceUri);
    if (!details) {
      return { label: "BAD URL" };
    }
    let { docId, keyPath, label } = details;
    if (!label) {
      if (keyPath.length) {
        label = keyPath.pop();
      } else {
        label = docId;
      }
    }

    // ideally we should determine if the node has / can have children
    const collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
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

  private roots(): Thenable<HypermergeNodeKey[]> {
    return new Promise(resolve => {
      const roots =
        vscode.workspace
          .getConfiguration("hypermergefs")
          .get<string[]>("roots") || [];
      resolve(roots);
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
          const { docId = null, keyPath = [] } =
            this.attemptToInterpretUrl(content[child]);
          if (docId) {
            return "hypermergefs://" + docId + "/?label=" + child + "-" + docId;
          }
        }
        // this builds a new child URL and ditches the label if it exists.
        return new URL(child + "/", node).toString();
      });
      return childNodes;
    });
  }

  attemptToInterpretUrl(str: string): {docId?: string; keyPath?: string[]} {
    if (str.length > 2000 || str.includes("\n")) return {}

    try {
      return interpretHypermergeUri(vscode.Uri.parse(str)) || {}
    } catch (e) {
      return {}
    }
  }

  public getChildren(
    element?: HypermergeNodeKey
  ): HypermergeNodeKey[] | Thenable<HypermergeNodeKey[]> {
    return element ? this.getDocumentChildren(element) : this.roots();
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
    const treeDataProvider = new HypermergeTreeDataProvider(hypermergeWrapper);

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
        treeDataProvider.addRoot(uriString);
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
    if (url.authority === "") {
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
