import { Hypermerge } from "hypermerge";

const { keyPair } = require("hypercore/lib/crypto");

const raf = require("random-access-file");

const hm = new Hypermerge({ storage: raf });

import DiscoveryCloud from "./discovery-cloud/client";
const stream = hm.stream;
const id = Buffer.from("netwrite");
const url = "wss://discovery-cloud.herokuapp.com";

const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });

hm.joinSwarm(hyperswarmwrapper);

const buffers = keyPair();
const keys = {
  publicKey: buffers.publicKey,
  secretKey: buffers.secretKey
};

const doc = hm.createDocumentFrontend(keys);

doc.on("doc", (doc: any) => console.log(doc));
doc.change((doc: any) => {
  doc.extension = "value" + Math.random();
});

console.log(doc.actorId);
