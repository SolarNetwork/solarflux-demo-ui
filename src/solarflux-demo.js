/* eslint-env es6, browser, commonjs */
"use strict";

import { Configuration, Environment, urlQuery } from "solarnetwork-api-core";
import { Client } from "paho-mqtt";
import { event as d3event, select, selectAll } from "d3-selection";
import CBOR from "cbor-sync";
import connectionOptions from "./conn-options";

const fluxEnv = new Environment({
  protocol: "ws",
  host: "flux.solarnetworkdev.net",
  port: 9001
  /*
  protocol: "wss",
  host: "flux.solarnetwork.net",
  port: 443
  */
});

const snEnv = new Environment({
  /*
	protocol: 'http',
	host: 'solarnetworkdev.net',
  port: 8680,
  */
});

var app;

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
    select("#connect").attr("disabled", null);
    if (resp.errorCode !== 0) {
      console.log("onConnectionLost:" + resp.errorMessage);
    }
  }

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

  function onMessageArrived(message) {
    var body = "";
    var bytes = message.payloadBytes;
    if (bytes) {
      try {
        if (bytes.buffer) {
          let hex = bytesToHex(bytes);
          body = JSON.stringify(CBOR.decode(hex, "hex"));
        } else {
          body = JSON.stringify(CBOR.decode(bytes));
        }
      } catch (e) {
        body = message.payloadString;
        console.log("Message does not appear to be CBOR: " + e);
      }
    }
    console.log(message.destinationName + " message: " + body);
    select("#message-template").select(function() {
      var msgEl = this.cloneNode(true);
      select(msgEl)
        .classed("template", false)
        .attr("id", null)
        .select("[data-tprop=topic]")
        .text(message.destinationName);
      select(msgEl)
        .select("[data-tprop=body]")
        .text(body);
      select("#messages").append(function() {
        return msgEl;
      });
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

  function connect() {
    const connBtn = select("#connect");
    connBtn.attr("disabled", "disabled");
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

    client.connect(options);

    function connectSuccess(json) {
      console.log(`Connected to MQTT on ${client.host}:${client.port}${client.path}`);
      client.subscribe("node/+/datum/0/#");
      selectAll(".hide-after-auth").classed("hidden", true);
      select("section.output").classed("disabled", false);
    }

    function connectError(error) {
      connBtn.attr("disabled", null);
      console.log("conn error " + error.code + ": " + error.message);
    }
  }

  function init() {
    select("#connect").on("click", connect);
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
