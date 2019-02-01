import * as vscode from "vscode"
import { Uri } from "vscode"
import { HypermergeWrapper, interpretHypermergeUri } from "./HypermergeWrapper"
import DocumentTreeProvider, {
  SortOrder,
  HypermergeNodeKey,
} from "./DocumentTreeProvider"
import LedgerTreeProvider from "./LedgerTreeProvider"
import DisposableCollection from "./DisposableCollection"
import DetailsViewContainer from "./DetailsViewContainer"
const clipboardy = require("clipboardy")

export default class HypermergeExplorer implements vscode.Disposable {
  // TODO:
  // better error reporting on invalid json
  subscriptions = new DisposableCollection()
  private detailsView: DetailsViewContainer
  private ledgerView: vscode.TreeView<HypermergeNodeKey>
  private documentView: vscode.TreeView<HypermergeNodeKey>
  private ledgerDataProvider: LedgerTreeProvider
  private documentDataProvider: DocumentTreeProvider

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper,
  ) {
    this.detailsView = new DetailsViewContainer(hypermergeWrapper)
    this.ledgerDataProvider = new LedgerTreeProvider(hypermergeWrapper)
    this.documentDataProvider = new DocumentTreeProvider(hypermergeWrapper)

    this.subscriptions.push(this.detailsView)

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

    vscode.commands.registerCommand("hypermerge.refresh", () => {
      this.ledgerDataProvider.refresh()
      this.documentDataProvider.refresh()
    })

    vscode.commands.registerCommand(
      "hypermerge.preview",
      (uriString: string) => {
        if (!this.validateURL(uriString)) {
          this.show(Uri.parse(uriString), { preview: true, aside: true })
        }
      },
    )

    vscode.commands.registerCommand(
      "hypermerge.view",
      (uriString: string, opts?: any) => {
        if (!this.validateURL(uriString)) {
          this.show(Uri.parse(uriString), opts)
        }
      },
    )

    vscode.commands.registerCommand("hypermerge.create", async () => {
      const uri = hypermergeWrapper.createDocumentUri()
      this.ledgerDataProvider.refresh()
      this.show(uri)
    })

    vscode.commands.registerCommand("hypermerge.createRoot", () => {
      const uri = hypermergeWrapper.createDocumentUri()

      this.documentDataProvider.addRoot(uri.toString())
      this.ledgerDataProvider.refresh() // HACK

      this.show(uri)
    })

    vscode.commands.registerCommand("hypermerge.addRoot", url => {
      const uri = this.findUri(url)
      if (!uri) return

      this.ledgerDataProvider.addRoot(uri.toString())
      this.documentDataProvider.addRoot(uri.toString())
      this.show(uri)
    })

    vscode.commands.registerCommand("hypermerge.removeRoot", url => {
      const uri = this.findUri(url)
      if (!uri) return

      this.documentDataProvider.removeRoot(uri.toString())
    })

    vscode.commands.registerCommand("hypermerge.openRoot", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: this.validateURL,
      })

      if (!uriString) return

      const parsedUri = Uri.parse(uriString)

      if (parsedUri.scheme === "farm" || parsedUri.scheme === "realm") {
        const [_, codeId, dataId]: string[] =
          uriString.match("(?:farm|realm)://(.+?)/(.+?)$") || []

        if (!codeId || !dataId) {
          throw new Error("invalid Farm URL")
        }

        this.documentDataProvider.addRoot("hypermerge:/" + codeId)
        this.documentDataProvider.addRoot("hypermerge:/" + dataId)

        this.show(Uri.parse("hypermerge:/" + codeId + "/Source.elm"))
        this.show(Uri.parse("hypermerge:/" + dataId), { aside: true })
      } else {
        this.documentDataProvider.addRoot(parsedUri.toString())
        this.show(parsedUri)
      }
    })

    vscode.commands.registerCommand(
      "hypermerge.open",
      async (uriString?: string) => {
        if (!uriString) {
          uriString = await vscode.window.showInputBox({
            placeHolder: "Browse which hypermerge URL?",
            validateInput: this.validateURL,
          })
        }

        if (!uriString) return

        const parsedUri = Uri.parse(uriString)

        if (parsedUri.scheme === "farm" || parsedUri.scheme === "realm") {
          const [_, codeId, dataId]: string[] =
            uriString.match("(?:farm|realm)://(.+?)/([^/]+?)$") || []

          if (!codeId || !dataId) {
            throw new Error("invalid Farm URL")
          }

          this.show(Uri.parse("hypermerge:/" + codeId + "/Source.elm"))
          this.show(Uri.parse("hypermerge:/" + dataId), { aside: true })
        } else {
          this.show(parsedUri)
        }
      },
    )

    vscode.commands.registerCommand("hypermerge.destroy", resourceUri => {
      this.ledgerDataProvider.removeRoot(resourceUri)
      this.documentDataProvider.removeRoot(resourceUri)
    })

    vscode.commands.registerCommand("hypermerge.copyUrl", async resourceUrl => {
      const url = Uri.parse(resourceUrl)
      clipboardy.writeSync(url.toString())
    })

    vscode.commands.registerCommand("hypermerge.forkUrl", async resourceUrl => {
      const forkedUrl = Uri.parse(resourceUrl)
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
        const followedUrl = Uri.parse(resourceUrl)
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

    vscode.commands.registerCommand(
      "hypermerge.createKey",
      async (url?: string) => {
        const uri = this.findUri(url)

        if (!uri) return

        const keyName = await vscode.window.showInputBox({
          prompt: "What should the key be called?",
          placeHolder: "config",
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
    if (!this.ledgerDataProvider) {
      return // this means there's probably a race condition on first startup
    }
    this.ledgerDataProvider.updateSortOrder(sortEnum)
    this.ledgerDataProvider.refresh()
  }

  validateURL(input: string) {
    let url, parts
    try {
      url = Uri.parse(input)
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
    uri: Uri,
    opts: { preview?: boolean; aside?: boolean } = {},
  ): Thenable<void> {
    this.detailsView.show(uri)

    return vscode.window.showTextDocument(uri, {
      preserveFocus: opts.preview,
      preview: !!opts.preview,
      viewColumn: opts.aside ? 2 : 1,
    }).then(
      () => {
        if (!opts.preview) this.reveal()
      },
      err => {
        console.log(err)
      },
    )
    // TODO: weave this into the thenable chain
  }

  private async reveal(): Promise<void> {
    const node = this.getNode()

    if (!node) return
    const roots = await this.documentDataProvider.roots()

    if (roots.indexOf(node) > -1) {
      return this.documentView.reveal(node)
    } else {
      return this.ledgerView.reveal(node)
    }
  }

  private findUri(uri?: string | Uri): Uri | undefined {
    if (typeof uri === "string") return Uri.parse(uri)
    if (uri) return uri

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

  dispose() {
    this.subscriptions.dispose()
  }
}
