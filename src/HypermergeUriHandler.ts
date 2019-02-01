import { UriHandler, Uri, commands, OutputChannel } from "vscode"

export default class HypermergeUriHandler implements UriHandler {
  output: OutputChannel
  constructor(output: OutputChannel) {
    this.output = output
    output.appendLine("HypermergeUriHandler registered")
  }

  handleUri(uri: Uri) {
    const uriString = decodeURIComponent(uri.path.replace(/^\//, ""))
    this.output.appendLine(`handling external uri: ${uriString}`)
    commands.executeCommand("hypermerge.open", uriString)
  }
}
