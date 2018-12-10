import { DeepDiff } from "deep-diff";
import DiscoveryCloud from "discovery-cloud-client";
import { EventEmitter } from "events";
import { Repo } from "hypermerge";
import * as vscode from "vscode";
import { Text } from "automerge/frontend";

const raf = require("random-access-file");

interface HypermergeNodeDetails {
  docId: string;
  keyPath: string[];
  label?: string;
}

export function interpretHypermergeUri(
  uri: vscode.Uri
): HypermergeNodeDetails | null {
  if (uri.scheme === "hypermerge") {
    const [_, docId, ...keyPath] = uri.path.split("/");

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

const path = process.env.HOME ? `${process.env.HOME}/.hypermergefs` : undefined;
const storage = raf;

export class HypermergeWrapper extends EventEmitter {
  repo = new Repo({ path, storage });
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
    if (keyPath[0] === "text") {
      return doc.text.join("");
    }
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
          this.emit("update", uri, doc);
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
      doc.text = new Text();
    });

    return vscode.Uri.parse("hypermerge:/" + docId);
  }

  forkDocumentUri(forkedDoc: vscode.Uri): vscode.Uri | null {
    const { docId = "", keyPath = [] } =
      interpretHypermergeUri(forkedDoc) || {};
    if (!docId) {
      return null;
    }

    const forkId = this.repo.open(docId).fork();
    return vscode.Uri.parse("hypermerge:/" + forkId);
  }

  followDocumentUri(followedDoc: vscode.Uri): vscode.Uri | null {
    const { docId = "", keyPath = [] } =
      interpretHypermergeUri(followedDoc) || {};
    if (!docId) {
      return null;
    }

    const followId = this.repo.open(docId).follow();
    return vscode.Uri.parse("hypermerge:/" + followId);
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

  spliceTextUri(uri, offset, length, text) {
    const { docId = "", keyPath = [] } = interpretHypermergeUri(uri) || {};
    if (keyPath[0] != "text") {
      return;
    }
    const handle = this.repo.open(docId);
    handle.change(doc => {
      if (text === "") {
        while (length > 0) {
          doc.text.deleteAt(offset);
        }
      } else {
        const chars = text.split("");
        doc.text.insertAt(offset, ...chars);
      }
    });
  }
}
