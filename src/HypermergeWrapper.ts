import * as vscode from "vscode"

import { Handle, Repo, ChangeFn, DocUrl } from "hypermerge"
import { DocId } from "hypermerge/dist/Misc"
import Hyperswarm from "hyperswarm"
const raf = require("random-access-file")

import { EventEmitter } from "events"
import * as Diff from "./Diff"

interface HypermergeNodeDetails {
  docId: DocId
  docUrl: DocUrl
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
    return { docId: docId as DocId, keyPath, label, history, docUrl: ("hypermerge:/" + docId) as DocUrl }
  } else if (uri.scheme === "capstone") {
    const pathElements = uri.path.split("/")
    const docId = pathElements[1]
    return { docId: docId as DocId, keyPath: [], docUrl: ("hypermerge:/" + docId) as DocUrl }
  }

  return null
}

const homedir =
  process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"]
const path = `${homedir}/.hypermergefs`
const storage = raf

export class HypermergeWrapper extends EventEmitter {
  repo = new Repo({ path })
  handles: { [docUrl: string]: Handle<any> } = {}

  constructor() {
    super()

    this.repo.setSwarm(Hyperswarm())

    try {
      ;(global as any).repo = this.repo
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
    const details = interpretHypermergeUri(uri)
    if (!details) { return }
    const { docUrl } = details

    delete this.handles[docUrl]
    this.repo.destroy(docUrl)
  }

  exists(uri: vscode.Uri): boolean {
    const { docUrl = null } = interpretHypermergeUri(uri) || {}
    if (!docUrl) { return false }
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
    const details = interpretHypermergeUri(uri)

    if (!details) { throw new Error("invalid doc URL") }
    const { docUrl, keyPath = [], history = undefined } = details

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
    const details = interpretHypermergeUri(uri)
    if (!details) { throw new Error("no valid docURL") }
    const { docUrl, keyPath = [], history = undefined } = details

    const resolve = doc => cb(this.resolveSubDocument(doc, keyPath))

    if (history) {
      this.repo.materialize(docUrl, history, resolve)
    } else {
      this.repo.open(docUrl).subscribe(resolve)
    }
  }

  createDocumentUri(props: object = {}): vscode.Uri {
    const docUrl = this.repo.create({ title: "New Document", ...props })
    return vscode.Uri.parse(docUrl)
  }

  forkDocumentUri(forkedDoc: vscode.Uri): vscode.Uri | null {
    throw new Error("Not implemented, yet.")

    // const { docUrl = "", keyPath = [] } =
    //   interpretHypermergeUri(forkedDoc) || {}
    // if (!docUrl) {
    //   return null
    // }

    // const forkUrl = this.repo.fork(docUrl)
    // return vscode.Uri.parse(forkUrl)
  }

  followDocumentUri(followedDoc: vscode.Uri): vscode.Uri | null {
    throw new Error("Not implemented, yet.")

    // const { docUrl = "", keyPath = [] } =
    //   interpretHypermergeUri(followedDoc) || {}

    // if (!docUrl) {
    //   return null
    // }

    // const followId = this.repo.create()
    // this.repo.follow(followId, docUrl)
    // return vscode.Uri.parse(docUrl)
  }

  setDocumentUri(uri: vscode.Uri, newDoc: any) {
    const details = interpretHypermergeUri(uri)
    if (!details) { throw new Error("no valid docURL") }
    const { docUrl, keyPath = [], history = undefined } = details


    // we use any types because the VSCode plugin can't possibly know the document
    this.repo.change<any>(docUrl, (doc: any) => {
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
