var Promise = require("promise");
var _ = require("lodash");

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
        endpoint.call(params);
    }.bind(this);
};



Api.Endpoint = function (api, name, def) {
    this.api = api;
    this.name = name;
    this.def = def;
}

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
            return Api.Endpoint.Parameter.PLACE.BODY;
        default:
            return Api.Endpoint.Parameter.PLACE.QUERY;
    }
};

Api.Endpoint.prototype.getParameter = function (name) {
    if (this.def.params.hasOwnProperty(name)) {
        return new Api.Endpoint.Parameter(this, name, this.def.params[name]);
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
    var requestDef = {};
    Object.keys(params).forEach(function (name) {
        var parameter = this.getParameter(name);
        parameter.process(requestDef, params[name]);
    }.bind(this));
    // execute request
    var requestOpts = {
        url: this.url(requestDef.path),
        method: this.def.method || "GET"
    };
    if (requestDef.query) {
        requestOpts.query = requestDef.query;
    }
    if (requestDef.headers) {
        requestOpts.headers = requestDef.headers;
    }
    switch (this.def.contentType) {
        case "multipart/form-data":
            requestOpts.formData = requestDef.body;
            break;
        case "application/json":
            requestOpts.json = requestDef.body;
            break;
    }
    console.log(requestOpts);
};



Api.Endpoint.Parameter = function (endpoint, name, def) {
    this.endpoint = endpoint;
    this.name = name;
    this.def = def;
};

Api.Endpoint.Parameter.PLACE = {
    BODY: "body",
    QUERY: "query",
    HEADER: "header",
    PATH: "path"
};

Api.Endpoint.Parameter.prototype.required = function () {
    return !!this.def.required;
};

Api.Endpoint.Parameter.prototype.getDataType = function () {
    return this.endpoint.api.getDataType(this.def);
};

Api.Endpoint.Parameter.prototype.process = function (requestDef, value) {
    var dataType = this.getDataType();
    var serialized = dataType.serialize(value);
    var internalName = this.def.internalName || this.name;
    var place = this.def.place || this.endpoint.getDefaultParameterPlace();
    switch (place) {
        case Api.Endpoint.Parameter.PLACE.BODY:
            requestDef.body = requestDef.body || {};
            requestDef.body[internalName] = serialized;
            break;
        case Api.Endpoint.Parameter.PLACE.QUERY:
            requestDef.query = requestDef.query || {};
            requestDef.query[internalName] = serialized;
            break;
        case Api.Endpoint.Parameter.PLACE.HEADER:
            requestDef.headers = requestDef.headers || {};
            requestDef.headers[internalName] = serialized;
            break;
        case Api.Endpoint.Parameter.PLACE.PATH:
            requestDef.path = requestDef.path || {};
            requestDef.path[internalName] = serialized;
            break;
    }
};



Api.DataType = {};



Api.DataType.Scalar = function (api, def) {
    this.api = api;
    this.def = def;
};

Api.DataType.Scalar.NAME = "scalar";

Api.DataType.Scalar.prototype.serialize = function (value) {
    return value;
};



Api.DataType.Enum = function (api, def) {
    this.api = api;
    this.def = def;
};

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

Api.DataType.Derived.prototype.serialize = function (value) {
    return this.baseType.serialize(value);
};
