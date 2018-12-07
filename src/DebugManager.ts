import { Disposable, OutputChannel, workspace } from "vscode";
import Debug from "debug";
import { format } from "util";

export default class DebugManager implements Disposable {
  subscriptions: Disposable[] = []

  constructor(output: OutputChannel) {
    Debug.log = (str, ...args) => {
      output.appendLine(format(str, ...args));
    }

    this.push(workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermergefs.debug")) {
        this.updateDebug()
      }
    }))

    this.updateDebug()
  }

  updateDebug() {
    const setting = workspace
      .getConfiguration("hypermergefs")
      .get<string>("debug", "")

    Debug.enable(setting)
  }

  push(d: Disposable) {
    this.subscriptions.push(d)
  }

  dispose() {
    let item: Disposable | undefined

    while (item = this.subscriptions.pop()) {
      item.dispose()
    }
  }
}
