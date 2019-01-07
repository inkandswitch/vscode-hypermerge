import * as vscode from "vscode";
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper";
import DocumentTreeProvider, { SortOrder, HypermergeNodeKey } from "./DocumentTreeProvider";
const clipboardy = require("clipboardy");

export default class HypermergeExplorer {
  // TODO:
  // better error reporting on invalid json
  private hypermergeViewer: vscode.TreeView<HypermergeNodeKey>;
  private treeDataProvider: DocumentTreeProvider

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {

    this.treeDataProvider = new DocumentTreeProvider(hypermergeWrapper);

    // XXX disposable
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermergefs.sortOrder")) {
        this.updateSortConfig()
      }
    })

    this.updateSortConfig()

    this.hypermergeViewer = vscode.window.createTreeView("hypermergeExplorer", {
      treeDataProvider: this.treeDataProvider
    });

    vscode.commands.registerCommand("hypermergeExplorer.refresh", () =>
      this.treeDataProvider.refresh()
    );

    vscode.commands.registerCommand(
      "hypermergeExplorer.open",
      (uriString: string) => {
        if (!this.validateURL(uriString)) {
          this.treeDataProvider.refresh();
          this.show(vscode.Uri.parse(uriString))
        }
      }
    );

    vscode.commands.registerCommand("hypermergeExplorer.create", async () => {
      const uri = await hypermergeWrapper.createDocumentUri();
      if (uri) {
        this.treeDataProvider.refresh();
        this.show(uri)
      }
    });

    vscode.commands.registerCommand("hypermergeExplorer.register", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: this.validateURL
      });
      if (uriString) {
        // TODO: doesn't open to the subdoc e.g. `/Source.elm`
        const parsedUri = vscode.Uri.parse(uriString)
        this.treeDataProvider.refresh();

        const loadUri = (uri: vscode.Uri) => hypermergeWrapper.openDocumentUri(uri)
            .then(() => this.show(uri))

        if (parsedUri.scheme === "realm") {
          const bits = uriString.match("realm://(.+?)/(.+?)$")
          if (!(bits && bits.length == 3)) {
            throw new Error("invalid Realm URL")
          }
          const [_, codeDoc, dataDoc] = bits

          // TODO: show these side-by-side
          loadUri(vscode.Uri.parse("hypermerge:/" + codeDoc))
          loadUri(vscode.Uri.parse("hypermerge:/" + dataDoc))
        }
        else {
          loadUri(parsedUri)
        }
      }
    });

    vscode.commands.registerCommand(
      "hypermergeExplorer.remove",
      async resourceUri => {
        // XXX TODO
        // treeDataProvider.removeRoot(resourceUri);
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
          this.treeDataProvider.refresh();
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
          this.treeDataProvider.refresh();
        }
      }
    );

    vscode.commands.registerCommand("hypermergeExplorer.revealResource", () =>
      this.reveal()
    );
  }

  updateSortConfig() {
    const newSort = vscode.workspace
      .getConfiguration("hypermergefs")
      .get<string>("sortOrder", "")
    const sortEnum = SortOrder[newSort]
    if (!sortEnum) {
      console.log("Bad sort order passed to config")
      return
    }
    if (!this.treeDataProvider) {
      return // this means there's probably a race condition on first startup
    }
    this.treeDataProvider.updateSortOrder(sortEnum)
    this.treeDataProvider.refresh()
  }

  validateURL(input: string) {
    let url, parts;
    try {
      url = vscode.Uri.parse(input);
      parts = interpretHypermergeUri(url);
    } catch {
      return "invalid URL";
    }
    if (!(url.scheme == "hypermerge" || url.scheme == "realm")) {
      return "invalid scheme -- must be a hypermerge URL";
    }
    if (url.path === "") {
      return "invalid format";
    }
    return ""; // we can return a hint string if it's invalid
  }

  private show(uri: vscode.Uri): Thenable<void> {
    return vscode.workspace.openTextDocument(uri)
      .then(doc => vscode.window.showTextDocument(doc))
      .then(() => { this.reveal() }); // TODO: weave this into the thenable chain

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
