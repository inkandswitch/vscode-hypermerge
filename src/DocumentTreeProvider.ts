import BaseDocumentTreeProvider, {
  HypermergeNodeKey,
  SortOrder,
} from "./BaseDocumentTreeProvider"
import { workspace, Uri, ConfigurationTarget } from "vscode"
import { HypermergeWrapper } from "./HypermergeWrapper"

export { HypermergeNodeKey, SortOrder }

export default class DocumentTreeProvider extends BaseDocumentTreeProvider {
  constructor(hypermergeWrapper: HypermergeWrapper) {
    super(hypermergeWrapper)

    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermerge.roots")) {
        this.refresh()
      }
    })
  }

  async roots(): Promise<HypermergeNodeKey[]> {
    return this.config().get("roots", [])
  }

  async addRoot(resourceUri: string) {
    this.hypermergeWrapper.openDocumentUri(Uri.parse(resourceUri))
    const roots = await this.roots()
    const newRoots = [
      resourceUri,
      ...roots.filter(root => root !== resourceUri),
    ]

    this.config().update("roots", newRoots, ConfigurationTarget.Global)
  }

  async removeRoot(resourceUri: string) {
    const roots = await this.roots()
    const newRoots = roots.filter(root => root !== resourceUri)

    this.config().update("roots", newRoots, ConfigurationTarget.Global)
  }

  config() {
    return workspace.getConfiguration("hypermerge")
  }
}
