import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";
import { URL } from "url";
const clipboardy = require("clipboardy");

export type HypermergeNodeKey = string;

function vscodeURItoCaseSensitiveString(uri: vscode.Uri): string {
  return `hypermerge://${uri.authority}/`;
}

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
      this._onDidChangeTreeData.fire(vscodeURItoCaseSensitiveString(uri));
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeNodeKey): Thenable<vscode.TreeItem> {
    // XXX: we should be building a cache of results & maintaining it over time here
    const resourceUri = vscode.Uri.parse(element);

    const details = interpretHypermergeUri(resourceUri);
    if (!details) {
      return Promise.resolve({ label: "<BAD URL>" });
    }

    return this.hypermergeWrapper
      .openDocumentUri(resourceUri)
      .then((content: any) => {
        let { docId, keyPath, label } = details;
        if (!label) {
          if (keyPath.length) {
            label = keyPath.pop();
          } else if (content.title) {
            label = `${content.title} (${docId.slice(0, 3)}...${docId.slice(
              -3
            )})`;
          } else if (content.name) {
            label = `${content.name} (${docId.slice(0, 3)}...${docId.slice(
              -3
            )})`;
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

  public removeRoot(uriString: string) {
    const roots =
      vscode.workspace
        .getConfiguration("hypermergefs")
        .get<string[]>("roots") || [];
    vscode.workspace
      .getConfiguration("hypermergefs")
      .update(
        "roots",
        roots.filter(uri => uri !== uriString),
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
          const { docId = null, keyPath = [] } = this.attemptToInterpretUrl(
            content[child]
          );
          if (docId) {
            return "hypermerge://" + docId + "/?label=" + child + "-" + docId;
          }
        }
        // this builds a new child URL and ditches the label if it exists.
        return new URL(child + "/", node).toString();
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

    vscode.commands.registerCommand("hypermergeExplorer.create", async () => {
      const uri = await hypermergeWrapper.createDocumentUri();
      if (uri) {
        treeDataProvider.addRoot(vscodeURItoCaseSensitiveString(uri));
        treeDataProvider.refresh();
      }
    });

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

    vscode.commands.registerCommand(
      "hypermergeExplorer.remove",
      async resourceUri => {
        treeDataProvider.removeRoot(resourceUri);
      }
    );

    vscode.commands.registerCommand(
      "hypermergeExplorer.copyUrl",
      async resourceUrl => {
        const url = vscode.Uri.parse(resourceUrl);
        clipboardy.writeSync(vscodeURItoCaseSensitiveString(url));
      }
    );

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
    if (url.scheme !== "hypermerge") {
      return "invalid scheme -- must be a hypermerge:// URL";
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
      if (editor.document.uri.scheme === "hypermerge") {
        return vscodeURItoCaseSensitiveString(editor.document.uri);
      }
    }
    return null;
  }
}
