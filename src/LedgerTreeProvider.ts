import BaseDocumentTreeProvider, {
  HypermergeNodeKey,
  SortOrder,
} from "./BaseDocumentTreeProvider"

export { HypermergeNodeKey, SortOrder }

export default class LedgerTreeProvider extends BaseDocumentTreeProvider {
  protected async roots(): Promise<HypermergeNodeKey[]> {
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
}
