import * as vscode from 'vscode'

export class FauxMerge {
  database = {
    "root": {
      "children": [
        ["doc1", "hypermergefs:/doc1"],
        ["doc2", "hypermergefs:/doc2"]
      ],
      "some stuff": ['a', 'b', 'c']
    },
    "doc1": {
      "children": [
        ["doc2", "hypermergefs:/doc2"]
      ],
      "content": "bar"
    },
    "doc2": { "bing": "bong" }
  }

  openDocument(docId: string) {
    return this.database[docId]
  }
  openDocumentUri(uri: vscode.Uri) {
    return this.openDocument(this.parseUri(uri))
  }

  setDocument(docId: string, value: any) {
    this.database[docId] = value
  }
  setDocumentUri(uri: vscode.Uri, value: any) {
    return this.setDocument(this.parseUri(uri), value)
  }

  parseUri(uri: vscode.Uri) {
    // the replace is a hack for better demoability 
    // -- ctrl-clicking a json link includes the trailing quote
    return uri.path.slice(1).replace('"', '')
  }
}

