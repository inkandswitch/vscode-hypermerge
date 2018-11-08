import * as vscode from "vscode";

import { Hypermerge } from "hypermerge";
const { keyPair } = require("hypercore/lib/crypto");
const raf = require("random-access-file");
import DiscoveryCloud from "./discovery-cloud/client";

export class HypermergeWrapper {
  database = {
    "root.json": {
      children: [
        ["doc1", "hypermergefs:/doc1.json"],
        ["doc2", "hypermergefs:/doc2.json"]
      ],
      "some stuff": ["a", "b", "c"]
    },
    "doc1.json": {
      children: [["doc2", "hypermergefs:/doc2"]],
      content: "bar"
    },
    "doc2.json": { bing: "bong" }
  };

  hypermerge = new Hypermerge({ storage: raf });

  constructor() {
    const stream = this.hypermerge.stream;
    const id = Buffer.from("vscode-extension");
    const url = "wss://discovery-cloud.herokuapp.com";

    const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });
    this.hypermerge.joinSwarm(hyperswarmwrapper);
  }

  openDocument(docId: string) {
    return this.database[docId];
  }

  openDocumentUri(uri: vscode.Uri) {
    return this.openDocument(this.parseUri(uri));
  }

  setDocument(docId: string, value: any) {
    this.database[docId] = value;
  }
  setDocumentUri(uri: vscode.Uri, value: any) {
    return this.setDocument(this.parseUri(uri), value);
  }

  parseUri(uri: vscode.Uri) {
    // the replace is a hack for better demoability
    // -- ctrl-clicking a json link includes the trailing quote
    return uri.path.slice(1).replace('"', "");
  }
}
