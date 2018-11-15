import { Repo } from "hypermerge";

const raf = require("random-access-file");

const repo = new Repo({ storage: raf });

import DiscoveryCloud from "discovery-cloud-client";

const stream = repo.stream;
const id = repo.id
const url = "wss://discovery-cloud.herokuapp.com";

const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });

repo.replicate(hyperswarmwrapper);

const docid = repo.create();
console.log(docid)
const doc = repo.open(docid);

doc.subscribe((doc: any) => console.log(doc));
doc.change((doc: any) => {
  doc.extension = "value" + Math.random();
});

