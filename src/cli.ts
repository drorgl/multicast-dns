#!/usr/bin/env node

import mdns_module = require("./index");
import path = require("path");

if (process.argv.length < 3) {
	console.error("Usage: %s <hostname>", path.basename(process.argv[1]));
	process.exit(1);
}
let hostname = process.argv[2];

let mdns = new mdns_module.mdns();

mdns.on("response", (response) => {
	response.answers.forEach((answer) => {
		if (answer.name === hostname) {
			console.log(answer.data);
			process.exit();
		}
	});
});

mdns.query(hostname, "A");

// Give responses 3 seconds to respond
setTimeout(() => {
	console.error("Hostname not found");
	process.exit(1);
}, 3000);
