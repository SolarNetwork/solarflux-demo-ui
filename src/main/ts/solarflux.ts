import { Environment } from "solarnetwork-api-core/net";
import { urlQueryParse } from "solarnetwork-api-core/lib/net/urls";
import { Configuration } from "solarnetwork-api-core/lib/util";
import {
	Client,
	Message,
	MQTTError,
	SubscribeOptions,
	TypedArray,
} from "paho-mqtt";
import { merge } from "d3-array";
import { select, selectAll } from "d3-selection";
import { v4 as uuidv4 } from "uuid";
import CBOR from "cbor-sync";
import ConnectionOptions from "./conn-options.js";

import { SettingsFormElements } from "./forms.js";

const fluxEnvironment = new Environment({
	/*
	protocol: "ws",
	host: "flux.solarnetworkdev.net",
	port: 9001
	*/
	protocol: "wss",
	host: "flux.solarnetwork.net",
	port: 443,
});

var legacyDecodeMode = false;

function bigIntDecoder(data: any) {
	if (!data) {
		return null;
	}
	// assuming that `data` is a `Uint8Array`
	const a = data as Uint8Array;
	let result = 0n;
	for (let i = 0; i < a.length; i += 1) {
		result = (result << 8n) + BigInt(a[i]);
	}
	return result;
}

CBOR.addSemanticDecode(2, function (data) {
	// handle bignum, which arrive as ByteBuffer; https://tools.ietf.org/html/rfc7049#section-2.4.2
	return bigIntDecoder(data);
});

CBOR.addSemanticDecode(3, function (data) {
	// handle negative bignum, which arrive as ByteBuffer; https://tools.ietf.org/html/rfc7049#section-2.4.2
	let result = bigIntDecoder(data);
	if (result !== null) {
		result = -1n - result;
	}
	return result;
});

CBOR.addSemanticDecode(4, function (data) {
	// handle decimal floats, which arrive as array of 2 elements; https://tools.ietf.org/html/rfc7049#section-2.4.3
	var e;
	if (Array.isArray(data) && data.length > 1) {
		e = data[0];
		if (legacyDecodeMode) {
			// work around generated CBOR bug https://github.com/FasterXML/jackson-dataformats-binary/issues/139
			e = -e;
		}
		return data[1] * Math.pow(10, e);
	}
	return data;
});

function bytesToHex(bytes: TypedArray) {
	var s = "",
		b;
	for (var i = 0; i < bytes.length; i += 1) {
		b = bytes[i];
		if (b < 0x10) {
			s += "0";
		}
		s += b.toString(16);
	}
	return s;
}

/**
 * SolarFlux demo app.
 */
export default class SolarFluxApp {
	readonly config: Configuration;

	readonly #settingsElements: SettingsFormElements;
	readonly #messageCountEl: HTMLElement;
	readonly #messageClearBtn: HTMLButtonElement;

	client?: Client;
	clientId?: string;

	#connected: boolean = false;
	#messageCount: number = 0;
	#numberFormat: Intl.NumberFormat = new Intl.NumberFormat(undefined, {
		style: "decimal",
		maximumFractionDigits: 0,
		useGrouping: true,
	});

	/**
	 * Constructor.
	 * @param queryParams query parameters from `window.location.search` for example
	 */
	constructor(queryParams: string) {
		this.config = new Configuration(urlQueryParse(queryParams));

		const settingsForm =
			document.querySelector<HTMLFormElement>("#settings")!;
		this.#settingsElements =
			settingsForm.elements as unknown as SettingsFormElements;

		this.#messageCountEl =
			document.querySelector<HTMLFormElement>("#msg-count")!;
		this.#messageClearBtn =
			document.querySelector<HTMLButtonElement>("#clear")!;

		this.#init();
	}

	#init() {
		this.#messageClearBtn.addEventListener("click", () => this.clear());
		this.#settingsElements.connect.addEventListener("click", () =>
			this.connect()
		);
		this.#settingsElements.disconnect.addEventListener("click", () =>
			this.disconnect()
		);
		selectAll("input").on("keyup", (evt) =>
			this.#handleSettingsInputKeyup(evt)
		);
		this.#uiUpdateButtonStates();
		selectAll("#topic-shortcuts button").on("click", (evt: Event) => {
			const val = (evt.target as HTMLButtonElement).innerText.trim();
			this.#settingsElements.topicFilter.value = val;
		});
	}

	start(): ThisType<SolarFluxApp> {
		// TODO
		return this;
	}

	stop(): ThisType<SolarFluxApp> {
		return this;
	}

	onConnectionLost(error: MQTTError) {
		if (error.errorCode !== 0) {
			console.log("onConnectionLost:" + error.errorMessage);
		}
		this.client = undefined;
		this.#uiStateConnected(false);
	}

	decodeCbor(bytes: TypedArray | ArrayBuffer): any {
		if ((bytes as any).buffer) {
			let hex = bytesToHex(bytes as TypedArray);
			return CBOR.decode(hex, "hex");
		} else {
			return CBOR.decode(bytes as any);
		}
	}

	onMessageArrived(message: Message) {
		var body: any = "";
		var bytes = message.payloadBytes;
		var agg = "0";
		var m = /\/datum\/([0-9a-zA-Z]+)\//.exec(message.destinationName);
		if (m && m.length > 0) {
			agg = m[1];
		}
		this.#messageCount += 1;
		this.#uiUpdateMessageCount();
		if (bytes) {
			try {
				legacyDecodeMode = false;
				body = this.decodeCbor(bytes);
				if (body && agg === "0" && !(body._v && body._v > 1)) {
					// legacy datum with CBOR bug; work around
					legacyDecodeMode = true;
					body = this.decodeCbor(bytes);
				}
				// remove _v flag
				if (body && body._v) {
					delete body._v;
				}
			} catch (e) {
				console.log("Error decoding message CBOR: %o", e);
			}
		}
		select("#message-template").select(function () {
			var msgEl = (this as Element)?.cloneNode(true) as Element;
			if (!msgEl) {
				return null;
			}
			select(msgEl)
				.classed("template", false)
				.attr("id", null)
				.select("[data-tprop=topic]")
				.text(message.destinationName);
			if (message.retained) {
				select(msgEl).select(".retained").classed("invisible", false);
			}
			if (typeof body === "string") {
				select(msgEl).select("[data-tprop=body]").text(body);
			} else {
				let data = merge(
					Object.keys(body).map(function (k) {
						return [k, body[k]];
					})
				);
				select(msgEl)
					.select("[data-tprop=body]")
					.append("dl")
					.selectAll()
					.data(data)
					.enter()
					.append(function (_d, i) {
						return document.createElement(i % 2 == 0 ? "dt" : "dd");
					})
					.each(function (d, i) {
						if (i % 2 == 0) {
							select(this).text(d as string);
							return;
						}
						if (Array.isArray(d)) {
							let ol = document.createElement("ol");
							select(ol)
								.selectAll("li")
								.data(d)
								.enter()
								.append("li")
								.text(function (v) {
									return v;
								});
							this.appendChild(ol);
						} else {
							let prevKey = data[i - 1];
							select(this).text(function (t) {
								if (prevKey === "created") {
									return new Date(d as string)
										.toISOString()
										.replace("T", " ");
								} else if (typeof t === "object") {
									return JSON.stringify(t, null, "\t");
								} else {
									return t as string;
								}
							});
						}
					});
			}
			const container = document.getElementById("messages")!;
			container.insertBefore(msgEl, container.firstChild);
			return null;
		});
	}

	#handleSettingsInputKeyup(event: any) {
		if (event.defaultPrevented) {
			return;
		}
		switch (event.key) {
			case "Enter":
				this.connect();
				break;

			default:
				this.#uiUpdateButtonStates();
				return;
		}
	}

	#uiStateConnected(connected: boolean) {
		this.#connected = connected;
		this.#uiUpdateButtonStates();
	}

	#uiUpdateButtonStates() {
		const canConnect: boolean =
			!this.#connected &&
			!!(
				this.#settingsElements.token.value &&
				this.#settingsElements.secret.value &&
				this.#settingsElements.topicFilter.value
			);
		this.#settingsElements.connect.disabled = !canConnect;
		this.#settingsElements.disconnect.disabled = !this.#connected;
	}

	disconnect() {
		if (this.client) {
			try {
				this.client.disconnect();
			} catch (e) {
				console.log("Error disconnecting client; ignoring: " + e);
			}
		}
	}

	getTokenId(): string {
		return this.#settingsElements.token.value;
	}

	getClientId(): string {
		const tokenId = this.getTokenId();
		if (this.clientId && this.clientId.startsWith(tokenId)) {
			// re-use existing client ID
			return this.clientId;
		}
		// generate new client ID from token ID + random 20 character string
		const suffix = uuidv4().replaceAll("-", "").substring(0, 20);
		this.clientId = tokenId + suffix;
		return this.clientId;
	}

	connect() {
		this.#uiStateConnected(true);
		this.disconnect();

		const clientId = this.getClientId();

		this.client = new Client(
			fluxEnvironment.host,
			fluxEnvironment.port!,
			"/mqtt",
			clientId
		);
		this.client.onConnectionLost = (err) => this.onConnectionLost(err);
		this.client.onMessageArrived = (msg) => this.onMessageArrived(msg);

		const subOptions: SubscribeOptions = {
			onSuccess: () => {
				console.log("Subscribed to MQTT topics " + topics);
				this.#uiStateConnected(true);
			},
			onFailure: (error) => {
				this.#uiStateConnected(false);
				let msg = `Subscribe error for topics [${topics}] (${error.errorCode}): ${error.errorMessage}`;
				console.log(msg);
				// note error.errorCode could be UInt8Array, so use loose comparison here
				if (error.errorCode && error.errorCode == 128) {
					// permission denied
					msg = `Permission denied for topics [${topics}]. Check that the security policy for token [${tokenId}] allows access to the node and source IDs included in the topic pattern. Note that topic wildcards only work if the token's security policy does not restrict node or source IDs.`;
				}
				alert(msg);
			},
		};

		const tokenId = this.getTokenId();
		const options = new ConnectionOptions(
			tokenId,
			this.#settingsElements.secret.value
		);

		options.onFailure = (error) => {
			this.#uiStateConnected(false);
			let msg = `Error connecting to ${fluxEnvironment.host}:${fluxEnvironment.port} (${error.errorCode}): ${error.errorMessage}`;
			console.error(msg);
			alert(msg);
		};

		const topics =
			this.#settingsElements.topicFilter.value || "node/+/datum/0/#";

		options.onSuccess = () => {
			const client = this.client;
			if (!client) {
				return;
			}
			console.log(
				`Connected to MQTT on ${client.host}:${client.port}${client.path} as ${this.clientId}`
			);
			console.log(`Subscribing to topics: ${topics}`);
			client.subscribe(topics, subOptions);
		};
		options.useSSL = fluxEnvironment.protocol === "wss" ? true : false;

		let opts = Object.assign({}, options);
		this.client.connect(opts);
	}

	clear() {
		selectAll("#messages > *").remove();
		this.#messageCount = 0;
		this.#uiUpdateMessageCount();
	}

	#uiUpdateMessageCount() {
		const count = this.#messageCount;
		if (count < 1) {
			this.#messageCountEl.classList.add("invisible");
			this.#messageClearBtn.disabled = true;
		} else {
			this.#messageClearBtn.disabled = false;
			this.#messageCountEl.innerText = String(
				this.#numberFormat.format(this.#messageCount)
			);
			this.#messageCountEl.classList.remove("invisible");
		}
	}
}
