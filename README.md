# HypermergeFS

Browse & edit Hypermerge documents. This VSCode extension was built to work with REaLM but should be mostly compatible with Capstone, PushPin, and other Hypermerge projects (though support is subject to the vagaries of research software version drift.)

* Download the VSIX file from the Releases page.
* In VSCode, type Ctrl-Shift-P, "VSIX" and you should see one command remaining in the filter.
* Choose the file you downloaded. You'll be prompted to reload the window.
* In the File / Documents tab, you should now see a HypermergeFS tab.
* Hover over the title of that tab, click the [...] icon, select "Open Document" and paste in a hypermerge document link.

If you want to work on, debug, or develop on the VSCode extension follow these steps instead:
 * Check out this repository.
 * `npm install` (as of this writing, the repo does not work with yarn because of choices made upstream. patches welcome)
 * Open the repository in vscode (e.g. `$ code . `)
 * Go to Debug -> Start Debugging (F5) in the menu.
 * A second, new VSCode window will open running the extension version you just built. You'll be able to put breakpoints in the code and see debug output in your original window. The new window will be labeled \[Extension Development\] so you can recognize it.
 
You're off to the races!

## Using HypermergeFS

HypermergeFS can open arbitrary hypermerge files and treat them as both JSON and nested directory structures. You'll see a "HypermergeFS" panel appear in the filesystem / document browser tab. From there you can either import URLs or create new documents.
