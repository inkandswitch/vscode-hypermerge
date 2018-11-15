import { Repo } from "hypermerge"

const raf = require("random-access-file");
const repo = new Repo({ storage: raf });

import Client from "discovery-cloud-client"

const stream = repo.stream;
const id = repo.id
const url = "wss://discovery-cloud.herokuapp.com";
const cloudClient = new Client({ stream, id, url });

repo.replicate(cloudClient);

const docId = process.argv[2];
console.log(docId);

const doc = repo.open(process.argv[2]);

doc.subscribe((doc: any) => console.log(doc));
doc.change((doc: any) => {
  doc.console = "value" + Math.random();
});

