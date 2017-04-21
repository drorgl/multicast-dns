import packet = require("dns-packet");
import dgram = require("dgram");
import events = require("events");
import crypto = require("crypto");

function random_id(): number {
	return crypto.randomBytes(2).readUInt16BE(0);
}

let noop = () => { };

export interface IOptions {
	port?: number;
	type?: "udp4" | "udp6";
	ip?: string;
	host?: string;
	interface?: string;
	socket?: dgram.Socket;
	reuseAddr?: boolean;
	multicast?: boolean;
	ttl?: number;
	loopback?: boolean;
}

export class mdns extends events.EventEmitter {
	private port: number;
	private socket: dgram.Socket;
	private me: { address: string, port: number };
	private destroyed: boolean;

	private messages: { [query_id: number]: packet.header.IHeaderRecord } = {};


	constructor(private opts: IOptions) {
		super();

		if (!opts) { opts = {}; }

		this.port = (typeof opts.port === "number") ? opts.port : 5353;
		let type = opts.type || "udp4";
		let ip = opts.ip || opts.host || (type === "udp4" ? "224.0.0.251" : null);

		this.me = { address: ip, port: this.port };
		this.destroyed = false;

		if (type === "udp6" && (!ip || !opts.interface)) {
			ip = "FF02::FB";
			// throw new Error("For IPv6 multicast you must specify `ip` and `interface`");
		}

		this.socket = opts.socket || dgram.createSocket({
			type: type,
			reuseAddr: opts.reuseAddr !== false,
			toString: () => {
				return type;
			}
		});

		this.socket.on("error", (err) => {
			if ((err as any).code === "EACCES" || (err as any).code === "EADDRINUSE") {
				this.emit("error", err);
			} else {
				this.emit("warning", err);
			}
		});

		this.socket.on("message", (message_, rinfo) => {
			let message: packet.header.IHeaderRecord;
			try {
				message = packet.decode(message_);
			} catch (err) {
				this.emit("warning", err);
				return;
			}

			// this.emit("packet", message, rinfo);

			if (message.type === "query") {
				this.emit("query", message, rinfo);
			}
			if (message.type === "response") {
				this.messages[message.id] = message;
				this.emit("response", message, rinfo);
			}
		});

		this.socket.on("listening", () => {
			if (!this.port) { this.port = this.me.port = this.socket.address().port; }
			if (opts.multicast !== false) {
				try {
					this.socket.addMembership(ip, opts.interface);
				} catch (err) {
					this.emit("error", err);
				}
				this.socket.setMulticastTTL(opts.ttl || 255);
				this.socket.setMulticastLoopback(opts.loopback !== false);
			}
		});

		this.socket.bind(this.port, this.opts.interface, () => {
			this.emit("ready");
		});

		// this.bind((err) => {
		// 	if (err) { return this.emit("error", err); }
		// 	this.emit("ready");
		// });

	}

	public send(value: packet.header.IHeaderRecord, rinfo, cb) {
		if (typeof rinfo === "function") { return this.send(value, null, rinfo); }
		if (!cb) { cb = noop; }
		if (!rinfo) { rinfo = this.me; }


		// this.bind((err) => {
		// if (this.destroyed) { return cb(); }
		// if (err) { return cb(err); }
		let message = packet.encode(value);
		this.socket.send(message, 0, message.length, rinfo.port, rinfo.address || rinfo.host, cb);
		// });
	};

	// public respond(res, rinfo, cb) {
	// 	if (Array.isArray(res)) { res = { answers: res }; }

	// 	res.type = "response";
	// 	this.send(res, rinfo, cb);
	// };

	public query(q, type, rinfo, cb) {
		if (typeof type === "function") { return this.query(q, null, null, type); }
		if (typeof type === "object" && type && type.port) { return this.query(q, null, type, rinfo); }
		if (typeof rinfo === "function") { return this.query(q, type, null, rinfo); }
		if (!cb) { cb = noop; }

		if (typeof q === "string") { q = [{ name: q, type: type || "ANY" }]; }
		if (Array.isArray(q)) { q = { type: "query", questions: q }; }

		q.type = "query";
		q.id = random_id();
		this.send(q, rinfo, cb);
	};

	public destroy(cb) {
		if (!cb) { cb = noop; }
		if (this.destroyed) { return process.nextTick(cb); }
		this.destroyed = true;
		this.socket.once("close", cb);
		this.socket.close();
	};

	// private bind(cb: Function) {
	// 	thunky((cb) => {
	// 		if (!this.port) { return cb(null); }
	// 		this.socket.once("error", cb);
	// 		this.socket.bind(this.port, this.opts.interface, () => {
	// 			this.socket.removeListener("error", cb);
	// 			cb(null);
	// 		});
	// 	});
	// }
}
