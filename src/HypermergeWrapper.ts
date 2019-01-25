import * as vscode from "vscode"

import { Handle, Repo, ChangeFn } from "hypermerge"
const raf = require("random-access-file")

//const DiscoverySwarm = require("discovery-swarm");
import DiscoverySwarm from "discovery-cloud-client"

//const defaults = require('dat-swarm-defaults')

import { EventEmitter } from "events"
import * as Diff from "./Diff"

interface HypermergeNodeDetails {
  docId: string
  docUrl: string
  keyPath: string[]
  label?: string
  history?: number
}

export function interpretHypermergeUri(
  uri: vscode.Uri,
): HypermergeNodeDetails | null {
  if (uri.scheme === "hypermerge") {
    const [_, docId, ...keyPath] = uri.path.split("/")

    const input = new Map<string, string>(
      uri.query.split("&").map(
        (pair): [string, string] => {
          const [key, value = ""] = pair.split("=")
          return [key, value]
        },
      ),
    )

    const historyString = input.get("history")
    const history = historyString ? parseInt(historyString, 10) : undefined

    const label = input.get("label")
    return { docId, keyPath, label, history, docUrl: "hypermerge:/" + docId }
  } else if (uri.scheme === "capstone") {
    const pathElements = uri.path.split("/")
    const docId = pathElements[1]
    return { docId, keyPath: [], docUrl: "hypermerge:/" + docId }
  }

  return null
}

const homedir =
  process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"]
const path = `${homedir}/.hypermergefs`
const storage = raf

export class HypermergeWrapper extends EventEmitter {
  repo = new Repo({ path, storage })
  handles: { [docUrl: string]: Handle<any> } = {}

  constructor() {
    super()

    try {
      ;(global as any).repo = this.repo

      const stream = this.repo.stream
      const id = this.repo.id

      const url = "wss://discovery-cloud.herokuapp.com"
      const hyperswarmwrapper = new DiscoverySwarm({ url, id, stream })
      // const hyperswarmwrapper = new DiscoverySwarm(defaults({ stream, id, port: 0 }));
      this.repo.replicate(hyperswarmwrapper)
    } catch (err) {
      console.log("Error in constructor", err)
    }
  }

  resolveSubDocument(doc: any, keyPath): any {
    let content = doc
    let key
    while ((key = keyPath.shift()) != null) {
      content = content[key]
    }
    return content
  }

  removeDocumentUri(uri: vscode.Uri) {
    const { docUrl = "" } = interpretHypermergeUri(uri) || {}
    delete this.handles[docUrl]
    this.repo.destroy(docUrl)
  }

  exists(uri: vscode.Uri): boolean {
    const { docUrl = "" } = interpretHypermergeUri(uri) || {}
    return !!this.handles[docUrl]
  }

  changeDocumentUri(
    uri: vscode.Uri,
    fn: ChangeFn<any>,
  ): vscode.Uri | undefined {
    const { docId = "", docUrl = "", keyPath = [] } =
      interpretHypermergeUri(uri) || {}

    if (!docUrl) return
    if (!this.handles[docUrl]) return

    this.handles[docUrl].change((doc: any) => {
      let state = this.resolveSubDocument(doc, keyPath)

      while (typeof state !== "object") {
        keyPath.pop()
        state = this.resolveSubDocument(doc, keyPath)
      }
      fn(state)
    })

    return uri.with({ path: ["", docId, ...keyPath].join("/") })
  }

  openDocumentUri(uri: vscode.Uri): Promise<any> {
    const { docUrl = "", keyPath = [], history = undefined } =
      interpretHypermergeUri(uri) || {}

    const h = this.handles

    return new Promise((resolve, reject) => {
      const subDoc = doc => resolve(this.resolveSubDocument(doc, keyPath))
      const progressCb = event => {
        console.log("Progress")
        console.log(event)
      }

      const update = doc => this.emit("update", uri, doc)

      if (history) {
        this.repo.materialize(docUrl, history, subDoc)
      } else {
        h[docUrl] =
          h[docUrl] ||
          this.repo
            .open(docUrl)
            .subscribe(update)
            .subscribeProgress(progressCb)
        this.repo.doc(docUrl, subDoc)
      }
    })
  }

  watchDocumentUri(uri: vscode.Uri, cb: (doc: any) => void): void {
    const { docUrl = "", keyPath = [], history = undefined } =
      interpretHypermergeUri(uri) || {}

    const resolve = doc => cb(this.resolveSubDocument(doc, keyPath))

    if (history) {
      this.repo.materialize(docUrl, history, resolve)
    } else {
      this.repo.open(docUrl).subscribe(resolve)
    }
  }

  createDocumentUri(): vscode.Uri {
    const docUrl = this.repo.create()
    // FIXME: orion, we can't open newly created docs before their first change
    this.repo.change(docUrl, doc => {
      doc.title = "New Document"
    })

    return vscode.Uri.parse(docUrl)
  }

  forkDocumentUri(forkedDoc: vscode.Uri): vscode.Uri | null {
    const { docUrl = "", keyPath = [] } =
      interpretHypermergeUri(forkedDoc) || {}
    if (!docUrl) {
      return null
    }

    const forkUrl = this.repo.fork(docUrl)
    return vscode.Uri.parse(forkUrl)
  }

  followDocumentUri(followedDoc: vscode.Uri): vscode.Uri | null {
    const { docUrl = "", keyPath = [] } =
      interpretHypermergeUri(followedDoc) || {}

    if (!docUrl) {
      return null
    }

    const followId = this.repo.create()
    this.repo.follow(followId, docUrl)
    return vscode.Uri.parse(docUrl)
  }

  setDocumentUri(uri: vscode.Uri, newDoc: any) {
    const { docUrl = "", keyPath = [] } = interpretHypermergeUri(uri) || {}

    this.repo.change(docUrl, doc => {
      let content = doc
      let key: string | undefined
      while ((key = keyPath.shift()) != null) {
        // special case to assign leaf values :(
        // this needs more consideration
        if (
          (typeof content[key] !== "object" || typeof newDoc !== "object") &&
          keyPath.length === 0
        ) {
          content[key] = newDoc
          return
        }
        content = content[key]
      }

      Diff.apply(content, newDoc)
    })
  }
}
