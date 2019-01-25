import * as vscode from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import DocumentTreeProvider, {
  SortOrder,
  HypermergeNodeKey,
} from "./DocumentTreeProvider"
const clipboardy = require("clipboardy")

export default class HypermergeExplorer {
  // TODO:
  // better error reporting on invalid json
  private hypermergeViewer: vscode.TreeView<HypermergeNodeKey>
  private treeDataProvider: DocumentTreeProvider

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper,
  ) {
    this.treeDataProvider = new DocumentTreeProvider(hypermergeWrapper)

    // XXX disposable
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermerge.sortOrder")) {
        this.updateSortConfig()
      }
    })

    this.updateSortConfig()

    this.hypermergeViewer = vscode.window.createTreeView("hypermergeExplorer", {
      treeDataProvider: this.treeDataProvider,
    })

    vscode.commands.registerCommand("hypermergeExplorer.refresh", () =>
      this.treeDataProvider.refresh(),
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.open",
      (uriString: string) => {
        if (!this.validateURL(uriString)) {
          this.treeDataProvider.refresh()
          this.show(vscode.Uri.parse(uriString))
        }
      },
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.preview",
      (uriString: string) => {
        if (!this.validateURL(uriString)) {
          this.show(vscode.Uri.parse(uriString), { preview: true, aside: true })
        }
      },
    )

    vscode.commands.registerCommand("hypermergeExplorer.create", async () => {
      const uri = await hypermergeWrapper.createDocumentUri()
      if (uri) {
        this.treeDataProvider.refresh()
        this.show(uri)
      }
    })

    vscode.commands.registerCommand("hypermergeExplorer.register", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: this.validateURL,
      })
      if (uriString) {
        // TODO: doesn't open to the subdoc e.g. `/Source.elm`
        const parsedUri = vscode.Uri.parse(uriString)
        this.treeDataProvider.refresh()

        const loadUri = (uri: vscode.Uri) =>
          hypermergeWrapper
            .openDocumentUri(uri)
            .then(() => this.show(uri))
            .catch(console.log)

        if (parsedUri.scheme === "realm") {
          const bits = uriString.match("realm://(.+?)/(.+?)$")
          if (!(bits && bits.length == 3)) {
            throw new Error("invalid Realm URL")
          }
          const [_, codeDoc, dataDoc] = bits

          // TODO: show these side-by-side
          loadUri(vscode.Uri.parse("hypermerge:/" + codeDoc))
          loadUri(vscode.Uri.parse("hypermerge:/" + dataDoc))
        } else {
          loadUri(parsedUri)
        }
      }
    })

    vscode.commands.registerCommand(
      "hypermergeExplorer.remove",
      async resourceUri => {
        // XXX TODO
        this.treeDataProvider.removeRoot(resourceUri)
      },
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.copyUrl",
      async resourceUrl => {
        const url = vscode.Uri.parse(resourceUrl)
        clipboardy.writeSync(url.toString())
      },
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.forkUrl",
      async resourceUrl => {
        const forkedUrl = vscode.Uri.parse(resourceUrl)
        const newUrl = await hypermergeWrapper.forkDocumentUri(forkedUrl)
        if (!newUrl) {
          // probably oughta print an error
          return
        }

        const uriString = newUrl.toString()
        if (uriString) {
          this.treeDataProvider.refresh()
        }
      },
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.followUrl",
      async resourceUrl => {
        const followedUrl = vscode.Uri.parse(resourceUrl)
        const newUrl = await hypermergeWrapper.followDocumentUri(followedUrl)
        if (!newUrl) {
          // probably oughta print an error
          return
        }

        const uriString = newUrl.toString()
        if (uriString) {
          this.treeDataProvider.refresh()
        }
      },
    )

    vscode.commands.registerCommand("hypermergeExplorer.revealResource", () =>
      this.reveal(),
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.createStringValue",
      async () => {
        const uri = this.currentHypermergeUri()

        if (!uri) return

        const keyName = await vscode.window.showInputBox({
          prompt: "What should the key be called?",
          placeHolder: "title",
        })

        if (!keyName) return

        const newUri = hypermergeWrapper.changeDocumentUri(
          uri,
          (state: any) => {
            if (keyName in state) return

            state[keyName] = ""
          },
        )

        if (newUri)
          this.show(newUri.with({ path: newUri.path + "/" + keyName }), {
            aside: true,
          })
      },
    )

    vscode.commands.registerCommand(
      "hypermergeExplorer.createObjectValue",
      async () => {
        const uri = this.currentHypermergeUri()

        if (!uri) return

        const keyName = await vscode.window.showInputBox({
          prompt: "What should the key be called?",
          placeHolder: "title",
        })

        if (!keyName) return

        const newUri = hypermergeWrapper.changeDocumentUri(
          uri,
          (state: any) => {
            if (keyName in state) return
            state[keyName] = {}
          },
        )

        if (newUri)
          this.show(newUri.with({ path: newUri.path + "/" + keyName }), {
            aside: true,
          })
      },
    )
  }

  updateSortConfig() {
    const newSort = vscode.workspace
      .getConfiguration("hypermerge")
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
    let url, parts
    try {
      url = vscode.Uri.parse(input)
      parts = interpretHypermergeUri(url)
    } catch {
      return "invalid URL"
    }
    if (!(url.scheme == "hypermerge" || url.scheme == "realm")) {
      return "invalid scheme -- must be a hypermerge URL"
    }
    if (url.path === "") {
      return "invalid format"
    }
    return "" // we can return a hint string if it's invalid
  }

  private show(
    uri: vscode.Uri,
    opts: { preview?: boolean; aside?: boolean } = {},
  ): Thenable<void> {
    return vscode.workspace
      .openTextDocument(uri)
      .then(doc => {
        vscode.window.showTextDocument(doc, {
          preserveFocus: opts.preview,
          viewColumn: opts.aside ? 2 : undefined,
        })
      })
      .then(
        () => {
          if (!opts.preview) this.reveal()
        },
        err => {
          console.log(err)
        },
      )
    // TODO: weave this into the thenable chain
  }

  private reveal(): Thenable<void> | null {
    const node = this.getNode()
    if (node) {
      return this.hypermergeViewer.reveal(node)
    }
    return null
  }

  private currentHypermergeUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.uri.scheme === "hypermerge") {
      return editor.document.uri
    } else {
      // return current selected tree node
    }
  }

  private getNode(): HypermergeNodeKey | null {
    const editor = vscode.window.activeTextEditor
    if (editor) {
      if (editor.document.uri.scheme === "hypermerge") {
        return editor.document.uri.toString()
      }
    }
    return null
  }
}
