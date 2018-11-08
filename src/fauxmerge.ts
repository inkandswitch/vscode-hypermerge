import * as vscode from "vscode";

import { Hypermerge } from "hypermerge";
const { keyPair } = require("hypercore/lib/crypto");
const raf = require("random-access-file");
import DiscoveryCloud from "./discovery-cloud/client";
import { EventEmitter } from "events";

export class HypermergeWrapper extends EventEmitter {
  database = {
    "root.json": {
      children: [
        ["doc1", "hypermergefs:/doc1.json"],
        ["doc2", "hypermergefs:/doc2.json"],
        ["changing", "hypermergefs:/changing.json"]
      ],
      "some stuff": ["a", "b", "c"]
    },
    "doc1.json": {
      children: [["doc2", "hypermergefs:/doc2.json"]],
      content: "bar"
    },
    "doc2.json": { bing: "bong" },
    "changing.json": { time: Date.now() }
  };

  hypermerge = new Hypermerge({ storage: raf });

  constructor() {
    super();

    const stream = this.hypermerge.stream;
    const id = Buffer.from("vscode-extension");
    const url = "wss://discovery-cloud.herokuapp.com";

    const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });
    this.hypermerge.joinSwarm(hyperswarmwrapper);

    setInterval(
      () =>
        this.setDocumentUri(vscode.Uri.parse("hypermergefs:/changing.json"), {
          time: Date.now()
        }),
      3000
    );

    setInterval(
      () =>
        this.setDocumentUri(vscode.Uri.parse("hypermergefs:/doc1.json"), {
          children: [
            [
              "doc2" + Math.round(Math.random() * 100),
              "hypermergefs:/doc2.json"
            ],
            [
              "random-link",
              "hypermergefs:/doc" + +Math.round(Math.random() * 100) + ".json"
            ]
          ],
          content: "bar"
        }),
      3000
    );
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
    this.setDocument(this.parseUri(uri), value);
    this.emit("update", uri);
  }

  parseUri(uri: vscode.Uri) {
    // the replace is a hack for better demoability
    // -- ctrl-clicking a json link includes the trailing quote
    return uri.path.slice(1).replace('"', "");
  }
}
