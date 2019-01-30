import {
  DocumentLinkProvider,
  ProviderResult,
  DocumentLink,
  TextDocument,
  CancellationToken,
  Range,
  Uri,
} from "vscode"
import { visit, getLocation } from "jsonc-parser"

export default class HypermergeDocumentLinkProvider
  implements DocumentLinkProvider {
  provideDocumentLinks(
    document: TextDocument,
    token: CancellationToken,
  ): ProviderResult<DocumentLink[]> {
    const regex = /hypermerge:(\/[\w\.]+)+/g
    const text = document.getText()
    const links: DocumentLink[] = []
    let match: RegExpExecArray | null

    while ((match = regex.exec(text))) {
      const range = getRange(document, match.index, match[0].length)
      links.push(new DocumentLink(range, Uri.parse(match[0])))
    }

    if (document.uri.scheme === "hypermerge" && isJson(document)) {
      try {
        visit(text, {
          onObjectProperty(property, offset, length) {
            const location = getLocation(text, offset)
            const path = document.uri.path + "/" + location.path.join("/")
            const range = getRange(document, offset + 1, length - 2)
            links.push(new DocumentLink(range, document.uri.with({ path })))
          },
        })
      } catch {
        // Do nothing
      }
    }

    return links
  }
}

function getRange(
  document: TextDocument,
  offset: number,
  length: number,
): Range {
  const start = document.positionAt(offset)
  const end = document.positionAt(offset + length)
  return new Range(start, end)
}

function isJson(document: TextDocument): boolean {
  return document.languageId === "json" || document.languageId === "jsonc"
}
