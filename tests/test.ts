import mdns = require("../src/index");
import tape = require("tape");
import dgram = require("dgram");

let port = (cb: (port_no: number) => void) => {
	let s = dgram.createSocket("udp4");
	s.bind(0, null, () => {
		let port_number = s.address().port;
		s.on("close", () => {
			cb(port_number);
		});
		s.close();
	});
};

let test = (name: string, fn: (dns: mdns.mdns, t: tape.Test) => void) => {
	tape(name, (t) => {
		port((p) => {
			let dns = new mdns.mdns({ ip: "127.0.0.1", port: p, multicast: false });
			dns.on("warning", (e: Error) => {
				t.error(e);
			});
			fn(dns, t);
		});
	});
};

test("works", (dns, t) => {
	t.plan(3);

	dns.once("query", (packet) => {
		t.same(packet.type, "query");
		dns.destroy(() => {
			t.ok(true, "destroys");
		});
	});

	dns.query("hello-world", () => {
		t.ok(true, "flushed");
	});
});

test("ANY query", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions.length, 1, "one question");
		t.same(packet.questions[0], { name: "hello-world", type: "ANY", class: 1 });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("hello-world", "ANY");
});

test("A record", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions.length, 1, "one question");
		t.same(packet.questions[0], { name: "hello-world", type: "A", class: 1 });
		dns.respond([{ type: "A", name: "hello-world", ttl: 120, data: "127.0.0.1" }]);
	});

	dns.once("response", (packet) => {
		t.same(packet.answers.length, 1, "one answer");
		t.same(packet.answers[0], { type: "A", name: "hello-world", ttl: 120, data: "127.0.0.1", class: 1, flush: false });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("hello-world", "A");
});

test("A record (two questions)", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions.length, 2, "two questions");
		t.same(packet.questions[0], { name: "hello-world", type: "A", class: 1 });
		t.same(packet.questions[1], { name: "hej.verden", type: "A", class: 1 });
		dns.respond([{ type: "A", name: "hello-world", ttl: 120, data: "127.0.0.1" }, { type: "A", name: "hej.verden", ttl: 120, data: "127.0.0.2" }]);
	});

	dns.once("response", (packet) => {
		t.same(packet.answers.length, 2, "one answers");
		t.same(packet.answers[0], { type: "A", name: "hello-world", ttl: 120, data: "127.0.0.1", class: 1, flush: false });
		t.same(packet.answers[1], { type: "A", name: "hej.verden", ttl: 120, data: "127.0.0.2", class: 1, flush: false });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query([{ name: "hello-world", type: "A" }, { name: "hej.verden", type: "A" }]);
});

test("AAAA record", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions.length, 1, "one question");
		t.same(packet.questions[0], { name: "hello-world", type: "AAAA", class: 1 });
		dns.respond([{ type: "AAAA", name: "hello-world", ttl: 120, data: "fe80::5ef9:38ff:fe8c:ceaa" }]);
	});

	dns.once("response", (packet) => {
		t.same(packet.answers.length, 1, "one answer");
		t.same(packet.answers[0], { type: "AAAA", name: "hello-world", ttl: 120, data: "fe80::5ef9:38ff:fe8c:ceaa", class: 1, flush: false });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("hello-world", "AAAA");
});

test("SRV record", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions.length, 1, "one question");
		t.same(packet.questions[0], { name: "hello-world", type: "SRV", class: 1 });
		dns.respond([{ type: "SRV", name: "hello-world", ttl: 120, data: { port: 11111, target: "hello.world.com", priority: 10, weight: 12 } }]);
	});

	dns.once("response", (packet) => {
		t.same(packet.answers.length, 1, "one answer");
		t.same(packet.answers[0], { type: "SRV", name: "hello-world", ttl: 120, data: { port: 11111, target: "hello.world.com", priority: 10, weight: 12 }, class: 1, flush: false });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("hello-world", "SRV");
});

test("TXT record", (dns, t) => {
	let data = new Buffer("black box");

	dns.once("query", (packet) => {
		t.same(packet.questions.length, 1, "one question");
		t.same(packet.questions[0], { name: "hello-world", type: "TXT", class: 1 });
		dns.respond([{ type: "TXT", name: "hello-world", ttl: 120, data: data }]);
	});

	dns.once("response", (packet) => {
		t.same(packet.answers.length, 1, "one answer");
		t.same(packet.answers[0], { type: "TXT", name: "hello-world", ttl: 120, data: data, class: 1, flush: false });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("hello-world", "TXT");
});

test("QU question bit", (dns, t) => {
	dns.once("query", (packet) => {
		t.same(packet.questions, [
			{ type: "A", name: "foo", class: 1 },
			{ type: "A", name: "bar", class: 1 }
		]);
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query([
		{ type: "A", name: "foo", class: 32769 },
		{ type: "A", name: "bar", class: 1 }
	]);
});

test("cache flush bit", (dns, t) => {
	dns.once("query", (packet) => {
		dns.respond({
			answers: [
				{ type: "A", name: "foo", ttl: 120, data: "127.0.0.1", class: 1, flush: true },
				{ type: "A", name: "foo", ttl: 120, data: "127.0.0.2", class: 1, flush: false }
			],
			additionals: [
				{ type: "A", name: "foo", ttl: 120, data: "127.0.0.3", class: 1, flush: true }
			]
		});
	});

	dns.once("response", (packet) => {
		t.same(packet.answers, [
			{ type: "A", name: "foo", ttl: 120, data: "127.0.0.1", class: 1, flush: true },
			{ type: "A", name: "foo", ttl: 120, data: "127.0.0.2", class: 1, flush: false }
		]);
		t.same(packet.additionals[0], { type: "A", name: "foo", ttl: 120, data: "127.0.0.3", class: 1, flush: true });
		dns.destroy(() => {
			t.end();
		});
	});

	dns.query("foo", "A");
});
