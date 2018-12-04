import {
  DocumentLinkProvider, ProviderResult, DocumentLink, TextDocument,
  CancellationToken,
  Range,
  Uri
} from "vscode";

export default class HypermergeDocumentLinkProvider implements DocumentLinkProvider {
  provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
    const regex = /hypermerge:(\/[\w\.]+)+/g
    const text = document.getText()
    const links: DocumentLink[] = []
    let match: RegExpExecArray | null

    while (match = regex.exec(text)) {
      const start = document.positionAt(match.index)
      const end = document.positionAt(match.index + match[0].length)
      const range = new Range(start, end)
      links.push(new DocumentLink(range, Uri.parse(match[0])))
    }

    return links
  }
}
