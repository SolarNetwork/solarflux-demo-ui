import { AuthorizationV2Builder, Environment } from "solarnetwork-api-core";

/**
 * Constructor.
 *
 * @param {string} tokenId the SN token ID
 * @param {string} tokenSecret a relative aggregation level value
 * @param {Environment} environment the environment to use
 */
export default function connectionOptions(tokenId, tokenSecret, environment) {
  const self = {};
  const env = environment || new Environment();
  const authBuilder = new AuthorizationV2Builder(tokenId, env);
  authBuilder.path("/solarflux/auth");

  /**
   * Get the connection password.
   */
  function password() {
    var now = new Date();
    now.setMilliseconds(0);
    var sig = authBuilder
      .snDate(true)
      .date(now)
      .saveSigningKey(tokenSecret)
      .buildWithSavedKey();
    return `Date=${now.getTime() / 1000},${sig}`;
  }

  return Object.defineProperties(self, {
    userName: { value: tokenId, enumerable: true },
    password: { get: password, enumerable: true },
    mqttVersion: { value: 4, enumerable: true }
  });
}
