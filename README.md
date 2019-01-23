# Hypermerge for VSCode

Browse & edit Hypermerge documents. This VSCode extension was built to work with REaLM but should be mostly compatible with Capstone, PushPin, and other Hypermerge projects (though support is subject to the vagaries of research software version drift.)

* Install the Hypermerge VScode extension. (It is listed in the VSCode extension store.)
* In the File / Documents tab, you should now see a HypermergeFS tab.
* Hover over the title of that tab, click the [...] icon, select "Open Document" and paste in a hypermerge document link.
* Alternately, create a new hypermerge document.

If you want to work on, debug, or develop on the VSCode extension follow these steps instead:
 * Check out this repository.
 * Run `yarn` to install dependencies. 
 * Open the repository in vscode (e.g. `$ code . `)
 * Go to Debug -> Start Debugging (F5) in the menu.
 * A second, new VSCode window will open running the extension version you just built. You'll be able to put breakpoints in the code and see debug output in your original window. The new window will be labeled \[Extension Development\] so you can recognize it.
 
You're off to the races!

## Using Hypermerge for VSCode

This extension allows you to open Hypermerge documents, edit them, and browse their history. It does so by introducing a new activity panel linked on the left-hand of your VSCode window with an icon that looks like a "merge" road sign.

Clicking on that icon will show you several subpanels. The first and most important is HypermergeFS.

### HypermergeFS

From this view you can load and traverse documents. Documents appear primarily at the root of this tree structure and are prefixed by the first five characters of their name. (For example: `[2Kgzz] Editable Title Code`.) You can click any document listed to open it as a text buffer in the main window.

Sub-documents can be displayed as buffers as well, and leaf nodes -- plain strings, for example -- will appear as simple text buffers for editing.

### Text buffers

When you open a hypermerge document (or subdocument), you'll see the document as though it were a JSON file. Under the hood, Hypermerge documents aren't really JSON files, they're really just data structures, but we map them to a sort of pseudo-JSON for editing in the IDE. As changes arrive you should see the buffer updating, and if you make changes, when you save that buffer, we parse the result back to a Javascript object and then compare it to the old document to produce a set of changes that are written. 

### Metadata & Feeds

These two panels give additional visibility into the state of the currently visible document. They show the key for the local actor which the VSCode plugin creates to save changes made in that client, the current vector clock representing all the applied changes for the data you're viewing, and a list of feeds where you can see not only the actual blocks which make up the 

Hypermerge can open arbitrary hypermerge files and treat them as both JSON and nested directory structures. You'll see a "Hypermerge" panel appear in the filesystem / document browser tab. From there you can either import URLs or create new documents. While looking at a Hypermerge document you should see a Hypermerge details pane appear in the list of views on the left navigation bar. Clicking it will display a special panel with details about the hypermerge document you're currently viewing, including providing a mechanism for navigating the document's history.

# Project Admin

## Publishing a Release

You'll want to [follow the instructions](https://code.visualstudio.com/docs/extensions/publish-extension) in the VSCE user manual, but to publish after setting up your Personal Access Token, run `vsce publish --yarn`.

## UTP-native binary dependency

One of the trickier requirements of this project is a C library called `utp-native`. UTP is a high performance protocol similar to TCP but carried over UDP originally designed to improve Bittorrent bandwidth sharing. The `utp-native` package for Node should be automatically compiled during yarn invocation, but if you run into issues with it you might try the following commands:

```
yarn add utp-native --runtime=electron --target=3.0.1 --disturl=https://atom.io/download/at
om-shell --build-from-source
```

or if yarn won't cooperate,

```
$ electron-rebuild --version 3.0.1 -f -w utp-native
```

This trickiness is required (for now) because the UTP native version has to match the exact binary version of Node used by Electron or the system will either crash on startup or the network stack refuse to initialize.
