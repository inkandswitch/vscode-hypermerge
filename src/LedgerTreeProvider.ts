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
        const nodeKeys = [...meta.docs].map(id => "hypermerge:/" + id)

        const documents = nodeKeys.map(textUrl =>
          this.hypermergeWrapper.openDocumentUri(Uri.parse(textUrl))
        )

        Promise.all(documents).then(loadedDocs => {
          const pairedDocs = loadedDocs.map((elt, idx) => [elt, nodeKeys[idx]]) // zip
          const sortedDocs = pairedDocs.sort((a: any, b: any) => {
            const aTitle = a[0].title
            const bTitle = b[0].title
            if (aTitle > bTitle) { 
              return 1
            }
            if (aTitle < bTitle) { 
              return -1
            }
            return 0
          })
          const results = sortedDocs.map(pair => pair[1] as string) // unzip
          resolve(results)
        })
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
