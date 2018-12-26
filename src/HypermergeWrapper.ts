import * as vscode from "vscode";

import { Handle, Repo } from "hypermerge";
const raf = require("random-access-file");

const DiscoverySwarm = require("discovery-swarm");
const defaults = require('dat-swarm-defaults')

import { EventEmitter } from "events";
import * as Diff from "./Diff";

interface HypermergeNodeDetails {
  docId: string;
  keyPath: string[];
  label?: string;
  history?: number;
}

export function interpretHypermergeUri(
  uri: vscode.Uri
): HypermergeNodeDetails | null {
  if (uri.scheme === "hypermerge") {
    const [_, docId, ...keyPath] = uri.path.split("/");

    const input = new Map<string, string>(
      uri.query.split("&").map(pair => {
        const halves = pair.split("=");
        return [halves[0], halves[1]] as [string, string];
      })
    );

    const historyString = input.get("history");
    const history = historyString ? parseInt(historyString) : undefined;

    const label = input.get("label");
    return { docId, keyPath, label, history };
  }
  if (uri.scheme === "capstone") {
    const pathElements = uri.path.split("/");
    const docId = pathElements[1];
    return { docId, keyPath: [] };
  }

  return null;
}

const homedir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
const path = `${homedir}/.hypermergefs`;
const storage = raf;

export class HypermergeWrapper extends EventEmitter {
  repo = new Repo({ path, storage });
  handles: { [docId: string]: Handle<any> } = {};

  constructor() {
    super();

    (global as any).repo = this.repo;

    const stream = this.repo.stream;
    const id = this.repo.id;
    const hyperswarmwrapper = new DiscoverySwarm(defaults({ stream, id, port: 0 }));
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
    const { docId = "", keyPath = [], history = undefined } =
      interpretHypermergeUri(uri) || {};
    const id = docId;
    const h = this.handles;
    return new Promise((resolve, reject) => {
      const subDoc = doc =>
        resolve(this.resolveSubDocument(doc, keyPath));
      const progressCb = (event) => {
        console.log("Progress")
        console.log(event)
      }
      const update = doc => this.emit("update", uri, doc);
      if (history) {
        this.repo.materialize(id, history, subDoc);
      } else {
        h[id] = h[id] || this.repo.open(id)
          .subscribe(update)
          .subscribeProgress(progressCb);
        this.repo.doc(id, subDoc);
      }
    });
  }

  createDocumentUri(): vscode.Uri {
    const docId = this.repo.create();
    // FIXME: orion, we can't open newly created docs before their first change
    this.repo.change(docId, doc => {
      doc.title = "New Document";
    });

    return vscode.Uri.parse("hypermerge:/" + docId);
  }

  forkDocumentUri(forkedDoc: vscode.Uri): vscode.Uri | null {
    const { docId = "", keyPath = [] } =
      interpretHypermergeUri(forkedDoc) || {};
    if (!docId) {
      return null;
    }

    const forkId = this.repo.fork(docId);
    return vscode.Uri.parse("hypermerge:/" + forkId);
  }

  followDocumentUri(followedDoc: vscode.Uri): vscode.Uri | null {
    const { docId = "", keyPath = [] } =
      interpretHypermergeUri(followedDoc) || {};

    if (!docId) {
      return null;
    }

    const followId = this.repo.create();
    this.repo.follow(followId, docId);
    return vscode.Uri.parse("hypermerge:/" + followId);
  }

  setDocumentUri(uri: vscode.Uri, newDoc: any) {
    const { docId = "", keyPath = [] } = interpretHypermergeUri(uri) || {};

    this.repo.change(docId, doc => {
      let content = doc;
      let key: string | undefined;
      while ((key = keyPath.shift())) {
        // special case to assign leaf values :(
        // this needs more consideration
        if (!(content[key] instanceof Object) && keyPath.length === 0) {
          content[key] = newDoc;
          return;
        }
        content = content[key];
      }

      Diff.apply(content, newDoc)
    });
  }
}
