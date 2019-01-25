import { UriHandler, Uri, commands, OutputChannel } from "vscode"

export default class HypermergeUriHandler implements UriHandler {
  output: OutputChannel
  constructor(output: OutputChannel) {
    this.output = output
    output.appendLine("HypermergeUriHandler registered")
  }

  handleUri(uri: Uri) {
    const uriString = uri.path.replace(/^\//, "")
    this.output.appendLine(uriString)
    commands.executeCommand("hypermerge.open", uriString)
  }
}
