import BaseDocumentTreeProvider, {
  HypermergeNodeKey,
  SortOrder,
} from "./BaseDocumentTreeProvider"
import { workspace } from "vscode"
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

  protected async roots(): Promise<HypermergeNodeKey[]> {
    return workspace.getConfiguration("hypermerge").get("roots", [])
  }
}
