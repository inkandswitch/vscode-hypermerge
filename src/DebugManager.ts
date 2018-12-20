import { Disposable, OutputChannel, workspace } from "vscode";
import Debug from "debug";
import { format } from "util";
import DisposableCollection from "./DisposableCollection";

export default class DebugManager implements Disposable {
  subscriptions = new DisposableCollection()

  constructor(output: OutputChannel) {
    Debug.log = (str, ...args) => {
      output.appendLine(format(str, ...args));
    }

    this.subscriptions.push(workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hypermergefs.debug")) {
        this.updateDebug()
      }
    }))

    this.updateDebug()
  }

  dispose() {
    this.subscriptions.dispose()
  }

  updateDebug() {
    const setting = workspace
      .getConfiguration("hypermergefs")
      .get<string>("debug", "")

    Debug.enable(setting)
  }
}
