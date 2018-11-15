import * as vscode from "vscode";

import { Repo } from "hypermerge";
const raf = require("random-access-file");
import DiscoveryCloud from "discovery-cloud-client";
import { EventEmitter } from "events";
import { DeepDiff } from "deep-diff";

interface HypermergeNodeDetails {
  docId: string;
  keyPath: string[];
  label?: string;
}

export function interpretHypermergeUri(
  uri: vscode.Uri
): HypermergeNodeDetails | null {
  if (uri.scheme === "hypermerge") {
    const docId = uri.authority;
    const keyPath = uri.path
      .split("/")
      .slice(1)
      .filter(Boolean);

    const input = uri.query.split("&").map(pair => {
      const halves = pair.split("=");
      return [halves[0], halves[1]] as [string, string];
    });
    const label = new Map<string, string>(input).get("label");
    return { docId, keyPath, label };
  }
  if (uri.scheme === "capstone") {
    const pathElements = uri.path.split("/");
    const docId = pathElements[1];
    return { docId, keyPath: [] };
  }

  return null;
}

export class HypermergeWrapper extends EventEmitter {
  repo = new Repo({ storage: raf });
  openIds = new Set<string>();

  constructor() {
    super();

    const stream = this.repo.stream;
    const id = this.repo.id;
    const url = "wss://discovery-cloud.herokuapp.com";
    const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });
    this.repo.replicate(hyperswarmwrapper);
  }

  resolveSubDocument(doc: any, keyPath): any {
    let content = doc;
    let key;
    while ((key = keyPath.shift())) {
      content = content[key];
    }
    return content;
  }

  openDocumentUri(uri: vscode.Uri): Promise<any> {
    return new Promise((resolve, reject) => {
      const { docId = "", keyPath = [] } = interpretHypermergeUri(uri) || {};

      if (!this.openIds.has(docId)) {
        this.openIds.add(docId);
        this.repo.open(docId).subscribe((doc: any) => {
          this.emit("update", uri);
        });
      }

      this.repo.open(docId).once((doc: any) => {
        let subDoc = this.resolveSubDocument(doc, keyPath);
        resolve(subDoc);
      });
    });
  }

  createDocumentUri(): vscode.Uri {
    const docId = this.repo.create();
    // FIXME: orion, we can't open newly created docs before their first change
    this.repo.open(docId).change(doc => {
      doc.title = "New Document";
    });

    return vscode.Uri.parse("hypermerge://" + docId);
  }

  setDocumentUri(uri: vscode.Uri, newDoc: any) {
    const { docId = "", keyPath = [] } = interpretHypermergeUri(uri) || {};

    const handle = this.repo.open(docId);
    handle.change(doc => {
      let content = doc;
      let key;
      while ((key = keyPath.shift())) {
        // special case to assign leaf values :(
        // this needs more consideration
        if (!(content[key] instanceof Object) && keyPath.length === 0) {
          if (typeof content[key] === "string") {
            content[key] = newDoc;
          } else {
            content[key] = newDoc;
          }
          return;
        }
        content = content[key];
      }

      DeepDiff.applyDiff(content, newDoc);
    });
    handle.close();
  }
}
