# Hypermerge for VSCode

Browse & edit Hypermerge documents. This VSCode extension was built to work with [Farm][farm] but should be mostly compatible with Capstone, PushPin, and other Hypermerge projects (though support is subject to the vagaries of research software version drift.)

This extension is not currently available in the VSCode extension marketplace because it requires platform-specific native dependencies. The best way to experience it is to:

- Check out this repository.
- Run `yarn` to install dependencies.
- Open the repository in vscode (e.g. `$ code .` or just via `Open Folder...`)
- Go to Debug -> Start Debugging (F5) in the menu.
- A second, new VSCode window will open running the extension version you just built. You'll be able to put breakpoints in the code and see debug output in your original window. The new window's title will include \[Extension Development\] so you can recognize it.

You're off to the races!

## Using Hypermerge for VSCode

This extension allows you to open Hypermerge documents, edit them, and browse their history. It does so by introducing a new activity panel linked on the left-hand of your VSCode window with an icon that looks like a "merge" road sign.

Clicking on that icon will show you several subpanels. The first and most important is HypermergeFS.

### HypermergeFS

From this view you can load and traverse documents. Documents appear primarily at the root of this tree structure and are prefixed by the first five characters of their name. (For example: `Editable Title Code [2Kgzz]`.) You can click any document listed to open it as a text buffer in the main window.

Sub-documents can be displayed as buffers as well, and leaf nodes -- plain strings, for example -- will appear as simple text buffers for editing.

### Text buffers

When you open a hypermerge document (or subdocument), you'll see the document as though it were a JSON file. Under the hood, Hypermerge documents aren't really JSON files, they're really just data structures, but we map them to a sort of pseudo-JSON for editing in the IDE. As changes arrive you should see the buffer updating, and if you make changes, when you save that buffer, we parse the result back to a Javascript object and then compare it to the old document to produce a set of changes that are written.

### Metadata & Feeds

These two panels give additional visibility into the state of the currently visible document. They show the key for the local actor which the VSCode plugin creates to save changes made in that client, the current vector clock representing all the applied changes for the data you're viewing, and a list of feeds where you can see not only the actual blocks which make up the

Hypermerge can open arbitrary hypermerge files and treat them as both JSON and nested directory structures. You'll see a "Hypermerge" panel appear in the filesystem / document browser tab. From there you can either import URLs or create new documents. While looking at a Hypermerge document you should see a Hypermerge details pane appear in the list of views on the left navigation bar. Clicking it will display a special panel with details about the hypermerge document you're currently viewing, including providing a mechanism for navigating the document's history.

# Project Admin

## Publishing a Release

You'll want to [follow the instructions](https://code.visualstudio.com/docs/extensions/publish-extension) in the VSCE user manual, but to publish after setting up your Personal Access Token, run `vsce publish --yarn`.

*Note: Releases with binary dependencies like iltorb and utp-native don't work very well in the VSCode extension marketplace at the moment, since you can only include a single platform's binaries there.*

## UTP-native / iltorb binary dependencies

One of the trickier requirements of this project are a pair of C libraries called `utp-native` and `iltorb`. UTP is a high performance protocol similar to TCP but carried over UDP originally designed to improve Bittorrent bandwidth sharing. The `iltorb` library is an implementation of Brotli, a fast compression algorithm. Both libraries should be automatically compiled during yarn invocation, but if you run into issues with it you might try the following commands:

```
$ npx electron-rebuild --version 4.2.10 -f
```

or if that's not working,

```
yarn add utp-native --runtime=electron --target=4.2.10 --disturl=https://atom.io/download/atom-shell --build-from-source
yarn add iltorb --runtime=electron --target=4.2.10 --disturl=https://atom.io/download/atom-shell --build-from-source
```

This trickiness is required (for now) because these libraries have to be compiled against the exact binary version of Node used by VSCode's Electron, otherwise the extension will throw an exception on startup.

[farm]: https://github.com/inkandswitch/farm
