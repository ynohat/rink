var Api = require("./api");

var hockeyApp = new Api(require("./hockeyapp"));

module.exports = hockeyApp;

hockeyApp.$get_auth_tokens();
hockeyApp.$post_auth_tokens({
    token: "4567abcd8901ef234567abcd8901ef23",
    rights: "full_access"
});
hockeyApp.$post_apps_upload({
    token: "4567abcd8901ef234567abcd8901ef23",
    ipa: "/a/b/c/d"
});
