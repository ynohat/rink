var util = require("util");
var Promise = require("promise");
var _ = require("lodash");
var request = require("request");

function Api(def) {
    this.def = def;
    Object.keys(def.endpoints)
        .forEach(this.registerEndpoint.bind(this));
}

module.exports = Api;

Api.prototype.name = function () {
    return this.def.name;
};

Api.prototype.base = function () {
    return this.def.base;
};

Api.prototype.version = function () {
    return this.def.version;
};

Api.prototype.url = function (path) {
    return this.base() + "/" + path;
};

Api.prototype.getDataType = function (def) {
    var dataType = null;
    if (this.def.dataTypes.hasOwnProperty(def.type)) {
        var baseType = this.getDataType(this.def.dataTypes[def.type]);
        dataType = new Api.DataType.Derived(this, def, baseType);
    } else {
        switch (def.type) {
            case Api.DataType.File.NAME:
                dataType = new Api.DataType.File(this, def);
                break;
            case Api.DataType.Enum.NAME:
                dataType = new Api.DataType.Enum(this, def);
                break;
            case Api.DataType.Scalar.NAME:
            default:
                dataType = new Api.DataType.Scalar(this, def);
                break;
        }
    }
    return dataType;
};

Api.prototype.registerEndpoint = function (name) {
    this["$"+name] = function (params) {
        var def = _.defaults({}, this.def.endpoints[name], this.def.defaults);
        def.params = _.defaults({}, def.params, this.def.defaults.params);
        var endpoint = new Api.Endpoint(this, name, def);
        return endpoint.call(params);
    }.bind(this);
};



Api.Endpoint = function (api, name, def) {
    this.api = api;
    this.name = name;
    this.def = def;
}

Api.Endpoint.prototype.method = function () {
    return this.def.method || "GET";
};

Api.Endpoint.prototype.contentType = function () {
    return this.def.contentType || "multipart/form-data";
};

Api.Endpoint.prototype.responseType = function () {
    return this.def.responseType || "application/json";
};

Api.Endpoint.prototype.url = function (pathParams) {
    var tpl = _.template(this.def.path, {
        interpolate: /:(\w+)/g
    });
    var path = tpl(pathParams);
    return this.api.url(path);
};

Api.Endpoint.prototype.getDefaultParameterPlace = function () {
    switch (this.def.contentType) {
        case "multipart/form-data":
        case "application/x-www-form-urlencoded":
            return Api.Parameter.PLACE.BODY;
        default:
            return Api.Parameter.PLACE.QUERY;
    }
};

Api.Endpoint.prototype.getParameter = function (name) {
    if (this.def.params.hasOwnProperty(name)) {
        return new Api.Parameter(this, name, this.def.params[name]);
    }
    throw new Error("unkown parameter: "+name);
};

Api.Endpoint.prototype.call = function (params) {
    params = params || {};
    // check if any required params were omitted
    Object.keys(this.def.params || {}).forEach(function (name) {
        var parameter = this.getParameter(name);
        if (parameter.required() && !params.hasOwnProperty(name)) {
            throw new Error("missing required parameter: "+name);
        }
    }.bind(this));
    // process provided args
    var request = new Api.Request(this);
    Object.keys(params).forEach(function (name) {
        var parameter = this.getParameter(name);
        parameter.process(request, params[name]);
    }.bind(this));
    return request.exec();
};



Api.Parameter = function (endpoint, name, def) {
    this.endpoint = endpoint;
    this.name = name;
    this.def = def;
};

Api.Parameter.PLACE = {
    BODY: "body",
    QUERY: "query",
    HEADER: "header",
    PATH: "path",
    AUTH: "auth"
};

Api.Parameter.prototype.required = function () {
    return !!this.def.required;
};

Api.Parameter.prototype.getDataType = function () {
    return this.endpoint.api.getDataType(this.def);
};

Api.Parameter.prototype.process = function (request, value) {
    var dataType = this.getDataType();
    var serialized = dataType.serialize(value);
    var internalName = this.def.internalName || this.name;
    var place = this.def.place || this.endpoint.getDefaultParameterPlace();
    switch (place) {
        case Api.Parameter.PLACE.BODY:
            request.addBodyParam(internalName, serialized);
            break;
        case Api.Parameter.PLACE.QUERY:
            request.addQueryParam(internalName, serialized);
            break;
        case Api.Parameter.PLACE.HEADER:
            request.addHeaderParam(internalName, serialized);
            break;
        case Api.Parameter.PLACE.PATH:
            request.addPathParam(internalName, serialized);
            break;
        case Api.Parameter.PLACE.AUTH:
            request.addAuthParam(internalName, serialized);
            break;
    }
};



Api.Request = function (endpoint) {
    this.endpoint = endpoint;
    this.headers = {};
    this.path = {};
    this.query = {};
    this.body = {};
    this.auth = {};
};

Api.Request.prototype.addHeaderParam = function (name, value) {
    this.headers[name] = value;
    return this;
};

Api.Request.prototype.addPathParam = function (name, value) {
    this.path[name] = value;
    return this;
};

Api.Request.prototype.addQueryParam = function (name, value) {
    this.query[name] = value;
    return this;
};

Api.Request.prototype.addBodyParam = function (name, value) {
    this.body[name] = value;
    return this;
};

Api.Request.prototype.addAuthParam = function (name, value) {
    this.auth[name] = value;
    return this;
};

Api.Request.prototype.exec = function () {
    // execute request
    var requestOpts = {
        url: this.endpoint.url(this.path),
        method: this.endpoint.method()
    };
    requestOpts.qs = this.query;
    requestOpts.headers = this.headers;
    switch (this.endpoint.contentType()) {
        case "multipart/form-data":
            requestOpts.formData = this.body;
            break;
        case "application/json":
            if (!this.endpoint.responseType()
                || this.endpoint.responseType() === this.endpoint.contentType()) {
                requestOpts.json = this.body;
            } else if (this.body) {
                requestOpts.body = JSON.stringify(this.body);
            }
            break;
    }
    requestOpts.auth = this.auth;
    return new Promise(function (resolve, reject) {
        console.log(requestOpts);
        request(requestOpts, function (err, message, body) {
            if (err) {
                console.error(err);
                reject(err);
            } else if (message.statusCode >= 400) {
                console.error(message.statusCode);
                console.log(body);
                reject(new Error(message.statusCode));
            } else {
                console.log(body);
                resolve(body);
            }
        });
    }.bind(this));
};



Api.DataType = function (api, def) {
    this.api = api;
    this.def = def;
};


Api.DataType.Scalar = function (api, def) {
    this.api = api;
    this.def = def;
};

util.inherits(Api.DataType.Scalar, Api.DataType);

Api.DataType.Scalar.NAME = "scalar";

Api.DataType.Scalar.prototype.serialize = function (value) {
    return value;
};



Api.DataType.Enum = function (api, def) {
    this.api = api;
    this.def = def;
};

util.inherits(Api.DataType.Enum, Api.DataType);

Api.DataType.Enum.NAME = "enum";

Api.DataType.Enum.prototype.serialize = function (value) {
    if (this.def.values.hasOwnProperty(value)) {
        return this.def.values[value];
    }
    throw new Error("invalid enum value "+value);
};



Api.DataType.File = function (api, def) {
    this.api = api;
    this.def = def;
};

util.inherits(Api.DataType.File, Api.DataType);

Api.DataType.File.NAME = "file";

Api.DataType.File.prototype.serialize = function (value) {
    var fs = require("fs");
    return fs.createReadStream(value);
};



Api.DataType.Derived = function (api, def, baseType) {
    this.api = api;
    this.def = def;
    this.baseType = baseType;
};

util.inherits(Api.DataType.Derived, Api.DataType);

Api.DataType.Derived.prototype.serialize = function (value) {
    return this.baseType.serialize(value);
};
