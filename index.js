var Api = require("./api");

var hockeyApp = new Api(require("./hockeyapp"));

module.exports = hockeyApp;

hockeyApp.$post_apps_upload({
    token: process.env.HOCKEYAPP_TOKEN,
    ipa: "./test.apk",
    notes: "next version...",
    status: "installable",
    release_type: "alpha"
});
