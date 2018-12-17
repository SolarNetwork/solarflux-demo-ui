/* eslint-env es6, browser, commonjs */
"use strict";

import { Configuration, Environment, urlQuery } from "solarnetwork-api-core";
import { Client } from "paho-mqtt";
import { merge } from "d3-array";
import { event as d3event, select, selectAll } from "d3-selection";
import CBOR from "cbor-sync";
import connectionOptions from "./conn-options";

const fluxEnv = new Environment({
  /*
  protocol: "ws",
  host: "flux.solarnetworkdev.net",
  port: 9001
  */
  protocol: "wss",
  host: "flux.solarnetwork.net",
  port: 443
});

const snEnv = new Environment({
  /*
	protocol: 'http',
	host: 'solarnetworkdev.net',
  port: 8680,
  */
});

var app;

function bytesToHex(bytes) {
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
 *
 * @class
 * @param {Environment} fluxEnvironment the environment to access SolarFlux
 * @param {Environment} [snEnvironment] the environment to use for SolarNetwork authentication
 * @param {Object} [options] optional configuration options
 */
var fluxApp = function(fluxEnvironment, snEnvironment, options) {
  const self = { version: "1.0.0" };
  const config =
    options ||
    {
      // TODO
    };

  var client;

  function onConnectionLost(resp) {
    uiStateConnected(false);
    if (resp.errorCode !== 0) {
      console.log("onConnectionLost:" + resp.errorMessage);
    }
  }

  function onMessageArrived(message) {
    var body = "";
    var bytes = message.payloadBytes;
    if (bytes) {
      try {
        if (bytes.buffer) {
          let hex = bytesToHex(bytes);
          body = CBOR.decode(hex, "hex");
        } else {
          body = CBOR.decode(bytes);
        }
      } catch (e) {
        body = message.payloadString;
        console.log("Message does not appear to be CBOR: " + e);
      }
    }
    console.log(`${message.destinationName} message: %o`, body);
    select("#message-template").select(function() {
      var msgEl = this.cloneNode(true);
      select(msgEl)
        .classed("template", false)
        .attr("id", null)
        .select("[data-tprop=topic]")
        .text(message.destinationName);
      if (typeof body === "string") {
        select(msgEl)
          .select("[data-tprop=body]")
          .text(body);
      } else {
        let data = merge(
          Object.keys(body).map(function(k) {
            return [k, body[k]];
          })
        );
        select(msgEl)
          .select("[data-tprop=body]")
          .append("dl")
          .selectAll()
          .data(data)
          .enter()
          .append(function(d, i) {
            return document.createElement(i % 2 == 0 ? "dt" : "dd");
          })
          .each(function(d, i) {
            if (i % 2 == 0) {
              select(this).text(d);
              return;
            }
            if (Array.isArray(d)) {
              let ol = document.createElement("ol");
              select(ol)
                .selectAll("li")
                .data(d)
                .enter()
                .append("li")
                .text(function(v) {
                  return v;
                });
              this.appendChild(ol);
            } else {
              let prevKey = data[i - 1];
              select(this).text(function(t) {
                if (prevKey === "created") {
                  return new Date(d).toISOString().replace("T", " ");
                } else {
                  return t;
                }
              });
            }
          });
      }
      let container = document.getElementById("messages");
      container.insertBefore(msgEl, container.firstChild);
    });
  }

  function start() {
    // TODO
    return self;
  }

  function stop() {
    // TODO
    return self;
  }

  function handleAuthorizationInputKeyup() {
    const event = d3event;
    if (event.defaultPrevented) {
      return;
    }
    switch (event.key) {
      case "Enter":
        connect();
        break;

      default:
        return;
    }
  }

  function uiStateConnected(connected, fully) {
    select("#connect").attr("disabled", connected ? "disabled" : null);
    select("#end").attr("disabled", !connected ? "disabled" : null);
    select("#topics").attr("disabled", connected ? "disabled" : null);

    selectAll(".output").classed("disabled", !(connected && fully));

    selectAll(".hide-after-auth").classed("hidden", connected && fully);
  }

  function connect() {
    uiStateConnected(true);
    const tokenId = select("input[name=token]").property("value");

    var options = connectionOptions(tokenId, select("input[name=secret]").property("value"));
    options.onFailure = connectError;
    options.onSuccess = connectSuccess;
    options.useSSL = fluxEnvironment.protocol === "wss" ? true : false;

    if (client) {
      try {
        client.disconnect();
      } catch (e) {
        console.log("Error disconnecting client; ignoring: " + e);
      }
    }
    client = new Client(fluxEnvironment.host, fluxEnvironment.port, "/mqtt");
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    let topics = document.getElementById("topics").value;
    if (!topics) {
      topics = "node/+/datum/0/#";
    }
    let subOptions = {
      onSuccess: subscribeSuccess,
      onFailure: subscribeError
    };

    client.connect(options);

    function connectSuccess(json) {
      console.log(`Connected to MQTT on ${client.host}:${client.port}${client.path}`);
      console.log(`Subscribing to topics: ${topics}`);
      client.subscribe(topics, subOptions);
    }

    function connectError(error) {
      uiStateConnected(false);
      let msg = `Error connecting to ${fluxEnvironment.host}:${fluxEnvironment.port} (${
        error.errorCode
      }): ${error.errorMessage}`;
      console.error(msg);
      alert(msg);
    }

    function subscribeSuccess() {
      console.log("Subscribed to MQTT topics " + topics);
      uiStateConnected(true, true);
    }

    function subscribeError(error) {
      uiStateConnected(false);
      let msg = `Subscribe error for topics [${topics}] (${error.errorCode}): ${
        error.errorMessage
      }`;
      console.log(msg);
      if (error.errorCode && error.errorCode.length > 0 && error.errorCode[0] === 128) {
        // permission denied
        msg = `Permission denied for topics [${topics}]. Check that the security policy for token [${tokenId}] allows access to the node and source IDs included in the topic pattern. Note that topic wildcards only work if the token's security policy does not restrict node or source IDs.`;
      }
      alert(msg);
    }
  }

  function init() {
    document.getElementById("connect").addEventListener("click", connect);
    document.getElementById("topic-form").addEventListener("submit", function(event) {
      event.preventDefault();
      return false;
    });
    select("#topic-form").on("submit");
    selectAll("input.auth").on("keyup", handleAuthorizationInputKeyup);
    return Object.defineProperties(self, {
      start: { value: start },
      stop: { value: stop }
    });
  }

  return init();
};

export default function startApp() {
  var config = new Configuration(
    Object.assign(
      {
        // TODO
      },
      urlQuery.urlQueryParse(window.location.search)
    )
  );

  app = fluxApp(fluxEnv, snEnv, config).start();

  window.onbeforeunload = function() {
    app.stop();
  };

  return app;
}
