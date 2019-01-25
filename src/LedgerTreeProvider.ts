import BaseDocumentTreeProvider, {
  HypermergeNodeKey,
  SortOrder,
} from "./BaseDocumentTreeProvider"
import { Uri } from "vscode"
import { HypermergeWrapper } from "./HypermergeWrapper"

export { HypermergeNodeKey, SortOrder }

export default class LedgerTreeProvider extends BaseDocumentTreeProvider {
  constructor(hypermerge: HypermergeWrapper) {
    super(hypermerge)

    const { ledger }: any = this.hypermergeWrapper.repo.back.meta

    ledger.on("append", () => {
      this.refresh()
    })
  }

  public async roots(): Promise<HypermergeNodeKey[]> {
    const meta = this.hypermergeWrapper.repo.back.meta

    return new Promise<HypermergeNodeKey[]>(resolve => {
      meta.readyQ.push(() => {
        const nodeKeys = meta
          .docs()
          .map(id => "hypermerge:/" + id)
          .sort()

        resolve(nodeKeys)
      })
    })
  }

  public addRoot(resourceUri: string) {
    this.hypermergeWrapper.openDocumentUri(Uri.parse(resourceUri))
    this.refresh()
  }

  public removeRoot(resourceUri: string) {
    const uri = Uri.parse(resourceUri)
    this.hypermergeWrapper.removeDocumentUri(uri)
    this.refresh()
  }
}
