#!/usr/bin/env node

// In order to use this, you need to install Cairo on your machine. See
// instructions here: https://github.com/Automattic/node-canvas#compiling

// In order to run:
//   npm install canvas # please do not check it in
//   npm run build-node
//   node build/static/js/build-node.js
//   open test.png

var rewire = require("rewire");
var defaults = rewire("react-scripts/scripts/build.js");
var config = defaults.__get__("config");

// Disable multiple chunks
config.optimization.runtimeChunk = false;
config.optimization.splitChunks = {
  cacheGroups: {
    default: false,
  },
};
// Set the filename to be deterministic
config.output.filename = "static/js/build-node.js";
// Don't choke on node-specific requires
config.target = "node";
// Set the node entrypoint
config.entry = "./src/index-node";
// By default, webpack is going to replace the require of the canvas.node file
// to just a string with the path of the canvas.node file. We need to tell
// webpack to avoid rewriting that dependency.
config.externals = function (context, request, callback) {
  if (/\.node$/.test(request)) {
    return callback(
      null,
      "commonjs ../../../node_modules/canvas/build/Release/canvas.node",
    );
  }
  callback();
};
