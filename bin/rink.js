#!/usr/bin/env node

var util = require("util");
var commander = require("commander");
var defs = require("../defs");
var hockeyapp = require("../");
var pkg = require("../package");
var _ = require("lodash");
var yaml = require("js-yaml");

commander.version(pkg.version);

Object.keys(defs.endpoints).forEach(function (endpointName) {
    var endpointDef = defs.endpoints[endpointName];
    var command = commander.command(endpointName);
    if (endpointDef.description) {
        command.description(endpointDef.description);
    }
    var paramDefs = _.assign(
        {},
        defs.defaults && defs.defaults.params,
        endpointDef.params
    );
    Object.keys(paramDefs).forEach(function (paramName) {
        var paramDef = paramDefs[paramName];
        var cliParamDef = paramDef.required ?
            util.format("--%s <value>", paramName) :
            util.format("--%s [value]", paramName);
        command.option(cliParamDef, paramDef.description);
    });
    command.action(function (options) {
        var apiCallback = hockeyapp["$"+endpointName];
        if (apiCallback && apiCallback.call) {
            var _options = {};
            _.pluck(options.options, "long").forEach(function (long) {
                long = long.replace(/^--/, "");
                if (options[long]) {
                    _options[long] = options[long];
                }
            });
            apiCallback(_options)
                .then(function (result) {
                    console.log(yaml.dump(result));
                })
                .catch(function (error) {
                    console.error(yaml.dump(error));
                });
        }
    });
});

commander.parse(process.argv);