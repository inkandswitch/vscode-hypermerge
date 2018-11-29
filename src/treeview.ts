import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./fauxmerge";
import { URL } from "url";
const clipboardy = require("clipboardy");

export type HypermergeNodeKey = string;

interface RootDetails {
  user: Set<string>;
  workspace: Set<string>;
  default: Set<string>;
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
      this._onDidChangeTreeData.fire(uri);
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
        let { docId, keyPath } = details;

        let label;
        if (keyPath.length) {
          label = keyPath.pop();
        } else if (content.title) {
          label = `[${docId.slice(0, 5)}] ${content.title}`;
        } else {
          label = docId;
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
      });
  }

  public addRoot(uriString: string) {
    const inspectRoots = vscode.workspace
      .getConfiguration("hypermergefs")
      .inspect<string[]>("roots");

    const roots = (inspectRoots && inspectRoots.globalValue) || [];

    vscode.workspace
      .getConfiguration("hypermergefs")
      .update(
        "roots",
        [uriString, ...roots],
        vscode.ConfigurationTarget.Global
      );
  }

  public removeRoot(uriString: string) {
    const roots = this.inspectRoots().user;

    roots.delete(uriString);

    vscode.workspace
      .getConfiguration("hypermergefs")
      .update("roots", [...roots], vscode.ConfigurationTarget.Global);
  }

  private roots(): Set<HypermergeNodeKey> {
    const details = this.inspectRoots();

    return new Set([...details.user, ...details.workspace, ...details.default]);
  }

  private inspectRoots(): RootDetails {
    const insp =
      vscode.workspace
        .getConfiguration("hypermergefs")
        .inspect<string[]>("roots") || <any>{};

    return {
      user: new Set(insp.globalValue),
      workspace: new Set(insp.workspaceValue),
      default: new Set(insp.defaultValue)
    };
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
  ): HypermergeNodeKey[] | Thenable<HypermergeNodeKey[]> {
    return element ? this.getDocumentChildren(element) : [...this.roots()];
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
        treeDataProvider.addRoot(uri.toString());
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
        clipboardy.writeSync(url.toString());
      }
    );

    vscode.commands.registerCommand(
      "hypermergeExplorer.forkUrl",
      async resourceUrl => {
        const forkedUrl = vscode.Uri.parse(resourceUrl);
        const newUrl = await hypermergeWrapper.forkDocumentUri(forkedUrl);
        if (!newUrl) {
          // probably oughta print an error
          return;
        }

        const uriString = newUrl.toString();
        if (uriString) {
          treeDataProvider.addRoot(uriString);
          treeDataProvider.refresh();
        }
      }
    );

    vscode.commands.registerCommand(
      "hypermergeExplorer.followUrl",
      async resourceUrl => {
        const followedUrl = vscode.Uri.parse(resourceUrl);
        const newUrl = await hypermergeWrapper.followDocumentUri(followedUrl);
        if (!newUrl) {
          // probably oughta print an error
          return;
        }

        const uriString = newUrl.toString();
        if (uriString) {
          treeDataProvider.addRoot(uriString);
          treeDataProvider.refresh();
        }
      }
    );

    vscode.commands.registerCommand("hypermergeExplorer.revealResource", () =>
      this.reveal()
    );
  }

  validateURL(input: string) {
    let url, parts;
    try {
      url = vscode.Uri.parse(input);
      parts = interpretHypermergeUri(url);
    } catch {
      return "invalid URL";
    }
    if (url.scheme !== "hypermerge") {
      return "invalid scheme -- must be a hypermerge URL";
    }
    if (url.path === "") {
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
        return editor.document.uri.toString();
      }
    }
    return null;
  }
}
