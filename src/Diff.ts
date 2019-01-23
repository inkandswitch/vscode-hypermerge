import odiff from "odiff"
import fdiff from "fast-diff"

// HACK display Automerge.Text as a string
import Automerge from "automerge/frontend"
Automerge.Text.prototype.toJSON = function toJSON() {
  return this.join("")
}

// not exported by odiff:
export interface Change {
  type: "set" | "unset" | "add" | "rm"
  path: Array<string | number>
  val: any
  index: number
  vals: any[]
  num: number
}

export function apply(lhs: any, rhs: any) {
  return applyChanges(lhs, getChanges(lhs, rhs))
}

export function getChanges(lhs: any, rhs: any): Change[] {
  return odiff(lhs, rhs)
}

export function applyChanges(v: any, changes: Change[]) {
  for (let i = 0, l = changes.length; i < l; i++) {
    applyChange(v, changes[i])
  }
}

export function applyChange(root: any, ch: Change) {
  const key: any = ch.path.pop()
  let obj: any = root

  // handles empty keypath:
  if (key == null && ch.type === "set") {
    if (root instanceof Automerge.Text && typeof ch.val === "string") {
      applyTextDiff(root, ch.val)
    } else {
      Object.assign(root, ch.val)
    }
    return
  }

  // get the obj at the keypath (minus the key popped above)
  for (let i = 0; i < ch.path.length; i++) {
    const k = ch.path[i]
    obj = obj[k]
  }

  switch (ch.type) {
    case "set":
      if (key != null) {
        if (obj[key] instanceof Automerge.Text && typeof ch.val === "string") {
          applyTextDiff(obj[key], ch.val)
        } else {
          obj[key] = ch.val
        }
      }
      break

    case "unset":
      if (key != null) delete obj[key]
      break

    case "add":
      obj[key].splice(ch.index, 0, ...ch.vals)
      break

    case "rm":
      obj[key].splice(ch.index, ch.num)

      break
  }
}

function applyTextDiff(text: any, newer: string) {
  const older = text.join("")
  const changes = fdiff(older, newer)
  let idx = 0

  for (const [op, str] of changes) {
    if (op === fdiff.EQUAL) {
      idx += str.length
    } else if (op === fdiff.INSERT) {
      text.insertAt(idx, ...str.split(""))
      idx += str.length
    } else if (op === fdiff.DELETE) {
      for (let i = 0; i < str.length; i++) {
        text.deleteAt(idx++)
      }
    }
  }
}
