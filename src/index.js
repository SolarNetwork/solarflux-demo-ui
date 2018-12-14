import "./solarflux-demo.css";

import { library, dom } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faDownload,
  faHdd,
  faMinusSquare,
  faPlusCircle,
  faPlusSquare,
  faSync,
  faTimesCircle
} from "@fortawesome/free-solid-svg-icons";

import startApp from "./solarflux-demo.js";

library.add(
  faCheckCircle,
  faDownload,
  faHdd,
  faMinusSquare,
  faPlusCircle,
  faPlusSquare,
  faSync,
  faTimesCircle
);
dom.watch();

if (!window.isLoaded) {
  window.addEventListener(
    "load",
    function() {
      startApp();
    },
    false
  );
} else {
  startApp();
}
