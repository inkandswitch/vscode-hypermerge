import * as vscode from "vscode";

import { Hypermerge, FrontendManager } from "hypermerge";
const { keyPair } = require("hypercore/lib/crypto");
const raf = require("random-access-file");
import DiscoveryCloud from "./discovery-cloud/client";
import { EventEmitter } from "events";
import { resolve } from "url";

export class HypermergeWrapper extends EventEmitter {
  hypermerge = new Hypermerge({ storage: raf });

  constructor() {
    super();

    const stream = this.hypermerge.stream;
    const id = Buffer.from("vscode-extension");
    const url = "wss://discovery-cloud.herokuapp.com";

    const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });
    this.hypermerge.joinSwarm(hyperswarmwrapper);
  }

  docHandles = new Map<string, FrontendManager<any>>();

  openDocumentUri(uri: vscode.Uri): Promise<any> {
    return new Promise(resolve => {
      console.log("open");
      const docId = this.parseUri(uri);

      let docFrontend = this.docHandles.get(docId);
      if (!docFrontend) {
        docFrontend = this.hypermerge.openDocumentFrontend(docId);
        this.docHandles.set(docId, docFrontend);
        docFrontend.on("doc", (doc: any) => {
          this.emit("update", uri);
        });
      }

      docFrontend.handle().once((doc: any) => {
        resolve(doc);
      });
    });
  }

  setDocument(docId: string, newDoc: any) {
    let docFrontend = this.docHandles.get(docId);
    if (!docFrontend) {
      docFrontend = this.hypermerge.openDocumentFrontend(docId);
      this.docHandles.set(docId, docFrontend);
    }

    docFrontend.change(doc => {
      Object.keys(newDoc).forEach(key => {
        doc[key] = newDoc[key];
      });
    });
  }

  setDocumentUri(uri: vscode.Uri, value: any) {
    this.setDocument(this.parseUri(uri), value);
  }

  parseUri(uri: vscode.Uri) {
    // the replace is a hack for better demoability
    // -- ctrl-clicking a json link includes the trailing quote
    return uri.path.slice(1).replace('"', "");
  }
}
