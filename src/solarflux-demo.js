/* eslint-env es6, browser, commonjs */
"use strict";

import { Configuration, Environment, urlQuery } from "solarnetwork-api-core";
import { Client, Message } from "paho-mqtt";
import { event as d3event, select, selectAll } from "d3-selection";
import { json as jsonRequest } from "d3-request";
import connectionOptions from "./conn-options";

// for development, can un-comment out the fluxEnv and snEnv objects
// and configure values for your local dev environment.

const fluxEnv = new Environment({
  debug: true,
  protocol: "ws",
  host: "vernemq-flux",
  port: 9001
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

  function onMessageArrived(message) {
    console.log(message.destinationName + " message: " + message.payloadString);
  }

  function start() {
    // TODO
  }

  function stop() {
    // TODO
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

    if (client) {
      client.disconnect();
    }
    client = new Client(fluxEnvironment.host, fluxEnvironment.port, "/mqtt");
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    client.connect(options);

    function connectSuccess(json) {
      console.log(`Connected to MQTT on ${client.host}:${client.port}${client.path}`);
      client.subscribe("node/+/datum/0/#");
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
