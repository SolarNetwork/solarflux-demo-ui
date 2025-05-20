import "../scss/style.scss";

import { replaceData } from "./utils.js";

import { Dropdown } from "bootstrap";
import SolarFluxApp from "./solarflux.js";

function startApp() {
	// populate app version and then display it
	replaceData(document.querySelector<HTMLElement>("#app-version")!, {
		"app-version": APP_VERSION,
	}).classList.add("d-md-block");

	// init Dropdowns
	for (let el of document.querySelectorAll(".dropdown-toggle")) {
		new Dropdown(el);
	}

	const app = new SolarFluxApp(window.location.search);
	app.start();
	window.onbeforeunload = function () {
		app.stop();
	};
}

if (
	document.readyState === "complete" ||
	document.readyState === "interactive"
) {
	startApp();
} else {
	window.addEventListener("load", startApp);
}
