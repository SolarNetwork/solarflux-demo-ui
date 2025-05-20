import { AuthorizationV2Builder, HostConfig } from "solarnetwork-api-core/net";
import { ConnectionOptions as PahoConnectionOptions } from "paho-mqtt";

interface ConnectionOptions extends PahoConnectionOptions {}
class ConnectionOptions {
	/**
	 * Constructor.
	 *
	 * @param tokenId the SN token ID
	 * @param tokenSecret a relative aggregation level value
	 * @param environment the environment to use
	 */
	constructor(
		tokenId: string,
		tokenSecret: string,
		environment?: HostConfig
	) {
		const auth = new AuthorizationV2Builder(tokenId, environment)
			.path("/solarflux/auth")
			.snDate(true);

		const now = new Date();
		now.setMilliseconds(0);
		const sig = auth.date(now).build(tokenSecret).split(" ", 2)[1];
		this.password = `Date=${now.getTime() / 1000},${sig}`;

		this.userName = tokenId;
		this.mqttVersion = 4;
		this.useSSL = true;
	}
}

export default ConnectionOptions;
