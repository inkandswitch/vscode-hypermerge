import * as vscode from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import DocumentTreeProvider, {
  SortOrder,
  HypermergeNodeKey,
} from "./DocumentTreeProvider"
import LedgerTreeProvider from "./LedgerTreeProvider"
const clipboardy = require("clipboardy")

export default class HypermergeExplorer {
  // TODO:
  // better error reporting on invalid json
  private ledgerView: vscode.TreeView<HypermergeNodeKey>
  private documentView: vscode.TreeView<HypermergeNodeKey>
  private ledgerDataProvider: LedgerTreeProvider
  private documentDataProvider: DocumentTreeProvider

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper,
  ) {
    this.ledgerDataProvider = new LedgerTreeProvider(hypermergeWrapper)
    this.documentDataProvider = new DocumentTreeProvider(hypermergeWrapper)

    // XXX disposable
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermerge.sortOrder")) {
        this.updateSortConfig()
      }
    })

    this.updateSortConfig()

    this.ledgerView = vscode.window.createTreeView("hypermergeLedger", {
      treeDataProvider: this.ledgerDataProvider,
    })

    this.documentView = vscode.window.createTreeView("hypermergeExplorer", {
      treeDataProvider: this.documentDataProvider,
    })

    vscode.commands.registerCommand(
      "hypermerge.refresh",
      () => this.ledgerDataProvider.refresh(),
      this.documentDataProvider.refresh(),
    )

    vscode.commands.registerCommand("hypermerge.open", (uriString: string) => {
      if (!this.validateURL(uriString)) {
        this.ledgerDataProvider.refresh()
        this.documentDataProvider.refresh()
        this.show(vscode.Uri.parse(uriString))
      }
    })

    vscode.commands.registerCommand(
      "hypermerge.preview",
      (uriString: string) => {
        if (!this.validateURL(uriString)) {
          this.show(vscode.Uri.parse(uriString), { preview: true, aside: true })
        }
      },
    )

    vscode.commands.registerCommand("hypermerge.create", async () => {
      const uri = await hypermergeWrapper.createDocumentUri()
      if (uri) {
        this.ledgerDataProvider.refresh()
        this.documentDataProvider.refresh()
        this.show(uri)
      }
    })

    vscode.commands.registerCommand("hypermerge.register", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: this.validateURL,
      })
      if (uriString) {
        // TODO: doesn't open to the subdoc e.g. `/Source.elm`
        const parsedUri = vscode.Uri.parse(uriString)
        this.ledgerDataProvider.refresh()
        this.documentDataProvider.refresh()

        const loadUri = (uri: vscode.Uri) =>
          hypermergeWrapper
            .openDocumentUri(uri)
            .then(() => this.show(uri))
            .catch(console.log)

        if (parsedUri.scheme === "farm" || parsedUri.scheme === "realm") {
          const bits = uriString.match("(?:farm|realm)://(.+?)/(.+?)$")
          if (!(bits && bits.length == 3)) {
            throw new Error("invalid Farm URL")
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

    vscode.commands.registerCommand("hypermerge.remove", async resourceUri => {
      // XXX TODO
      this.ledgerDataProvider.removeRoot(resourceUri)
      this.documentDataProvider.removeRoot(resourceUri)
    })

    vscode.commands.registerCommand("hypermerge.copyUrl", async resourceUrl => {
      const url = vscode.Uri.parse(resourceUrl)
      clipboardy.writeSync(url.toString())
    })

    vscode.commands.registerCommand("hypermerge.forkUrl", async resourceUrl => {
      const forkedUrl = vscode.Uri.parse(resourceUrl)
      const newUrl = await hypermergeWrapper.forkDocumentUri(forkedUrl)
      if (!newUrl) {
        // probably oughta print an error
        return
      }

      const uriString = newUrl.toString()
      if (uriString) {
        this.ledgerDataProvider.refresh()
        this.documentDataProvider.refresh()
      }
    })

    vscode.commands.registerCommand(
      "hypermerge.followUrl",
      async resourceUrl => {
        const followedUrl = vscode.Uri.parse(resourceUrl)
        const newUrl = await hypermergeWrapper.followDocumentUri(followedUrl)
        if (!newUrl) {
          // probably oughta print an error
          return
        }

        const uriString = newUrl.toString()
        if (uriString) {
          this.ledgerDataProvider.refresh()
          this.documentDataProvider.refresh()
        }
      },
    )

    vscode.commands.registerCommand("hypermerge.revealResource", () =>
      this.reveal(),
    )

    vscode.commands.registerCommand("hypermerge.createKey", async () => {
      const uri = this.currentHypermergeUri()

      if (!uri) return

      const keyName = await vscode.window.showInputBox({
        prompt: "What should the key be called?",
        placeHolder: "config",
      })

      if (!keyName) return

      const newUri = hypermergeWrapper.changeDocumentUri(uri, (state: any) => {
        if (keyName in state) return
        state[keyName] = {}
      })

      if (newUri)
        this.show(newUri.with({ path: newUri.path + "/" + keyName }), {
          aside: true,
        })
    })
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
    if (!this.ledgerDataProvider) {
      return // this means there's probably a race condition on first startup
    }
    this.ledgerDataProvider.updateSortOrder(sortEnum)
    this.ledgerDataProvider.refresh()
  }

  validateURL(input: string) {
    let url, parts
    try {
      url = vscode.Uri.parse(input)
      parts = interpretHypermergeUri(url)
    } catch {
      return "invalid URL"
    }
    if (
      !(
        url.scheme == "hypermerge" ||
        url.scheme == "farm" ||
        url.scheme == "realm"
      )
    ) {
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
      return this.documentView.reveal(node)
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
