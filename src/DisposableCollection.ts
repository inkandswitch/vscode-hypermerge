import { Disposable } from "vscode"

export default class DisposableCollection implements Disposable {
  all: Disposable[] = []

  push(...disps: Disposable[]): this {
    this.all.push(...disps)
    return this
  }

  dispose() {
    let item: Disposable | undefined

    while ((item = this.all.pop())) {
      item.dispose()
    }
  }
}
