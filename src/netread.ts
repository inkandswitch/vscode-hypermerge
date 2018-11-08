import { Hypermerge } from "hypermerge";
const raf = require("random-access-file");
const hm = new Hypermerge({ storage: raf });

import DiscoveryCloud from "./discovery-cloud/client";
const stream = hm.stream;
const id = Buffer.from("netread");
const url = "wss://discovery-cloud.herokuapp.com";
const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });

hm.joinSwarm(hyperswarmwrapper);

const docId = process.argv[2];
console.log(docId);

const doc = hm.openDocumentFrontend(process.argv[2]);

doc.on("doc", (doc: any) => console.log(doc));
doc.change((doc: any) => {
  doc.console = "value" + Math.random();
});

console.log(doc.actorId);
