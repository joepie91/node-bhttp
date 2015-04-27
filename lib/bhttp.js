var Promise, S, addErrorData, bhttpAPI, bhttpErrors, concatStream, createCookieJar, debug, debugRequest, debugResponse, devNull, doPayloadRequest, doRedirect, errors, extend, formData, formFixArray, http, https, isStream, makeRequest, ofTypes, packageConfig, prepareCleanup, prepareDefaults, prepareOptions, preparePayload, prepareProtocol, prepareRequest, prepareSession, prepareUrl, processResponse, querystring, redirectGet, redirectUnchanged, sink, spy, stream, streamLength, toughCookie, urlUtil, util, _;

urlUtil = require("url");

querystring = require("querystring");

stream = require("stream");

http = require("http");

https = require("https");

util = require("util");

Promise = require("bluebird");

_ = require("lodash");

S = require("string");

formFixArray = require("form-fix-array");

errors = require("errors");

debug = require("debug");

debugRequest = debug("bhttp:request");

debugResponse = debug("bhttp:response");

extend = require("extend");

devNull = require("dev-null");

formData = require("form-data2");

concatStream = require("concat-stream");

toughCookie = require("tough-cookie");

streamLength = require("stream-length");

sink = require("through2-sink");

spy = require("through2-spy");

packageConfig = require("../package.json");

bhttpErrors = {};

errors.create({
  name: "bhttpError",
  scope: bhttpErrors
});

errors.create({
  name: "ConflictingOptionsError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

errors.create({
  name: "UnsupportedProtocolError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

errors.create({
  name: "RedirectError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

errors.create({
  name: "MultipartError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

errors.create({
  name: "ConnectionTimeoutError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

errors.create({
  name: "ResponseTimeoutError",
  parents: bhttpErrors.bhttpError,
  scope: bhttpErrors
});

ofTypes = function(obj, types) {
  var match, type, _i, _len;
  match = false;
  for (_i = 0, _len = types.length; _i < _len; _i++) {
    type = types[_i];
    match = match || obj instanceof type;
  }
  return match;
};

addErrorData = function(err, request, response, requestState) {
  err.request = request;
  err.response = response;
  err.requestState = requestState;
  return err;
};

isStream = function(obj) {
  return (obj != null) && (ofTypes(obj, [stream.Readable, stream.Duplex, stream.Transform]) || obj.hasOwnProperty("_bhttpStreamWrapper"));
};

prepareSession = function(request, response, requestState) {
  debugRequest("preparing session");
  return Promise["try"](function() {
    if (requestState.sessionOptions != null) {
      request.options = _.merge(_.clone(requestState.sessionOptions), request.options);
    }
    if (request.options.headers != null) {
      request.options.headers = _.clone(request.options.headers, true);
    } else {
      request.options.headers = {};
    }
    if (request.options.cookieJar != null) {
      return Promise["try"](function() {
        request.cookieJar = request.options.cookieJar;
        delete request.options.cookieJar;
        return request.cookieJar.get(request.url);
      }).then(function(cookieString) {
        debugRequest("sending cookie string: %s", cookieString);
        request.options.headers["cookie"] = cookieString;
        return Promise.resolve([request, response, requestState]);
      });
    } else {
      return Promise.resolve([request, response, requestState]);
    }
  });
};

prepareDefaults = function(request, response, requestState) {
  debugRequest("preparing defaults");
  return Promise["try"](function() {
    var _base, _base1, _base2, _ref, _ref1, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7;
    request.responseOptions = {
      discardResponse: (_ref = request.options.discardResponse) != null ? _ref : false,
      keepRedirectResponses: (_ref1 = request.options.keepRedirectResponses) != null ? _ref1 : false,
      followRedirects: (_ref2 = request.options.followRedirects) != null ? _ref2 : true,
      noDecode: (_ref3 = request.options.noDecode) != null ? _ref3 : false,
      decodeJSON: (_ref4 = request.options.decodeJSON) != null ? _ref4 : false,
      stream: (_ref5 = request.options.stream) != null ? _ref5 : false,
      justPrepare: (_ref6 = request.options.justPrepare) != null ? _ref6 : false,
      redirectLimit: (_ref7 = request.options.redirectLimit) != null ? _ref7 : 10,
      onDownloadProgress: request.options.onDownloadProgress,
      responseTimeout: request.options.responseTimeout
    };
    if ((_base = request.options).allowChunkedMultipart == null) {
      _base.allowChunkedMultipart = false;
    }
    if ((_base1 = request.options).forceMultipart == null) {
      _base1.forceMultipart = false;
    }
    if ((_base2 = request.options.headers)["user-agent"] == null) {
      _base2["user-agent"] = "bhttp/" + packageConfig.version;
    }
    request.options.method = request.options.method.toLowerCase();
    return Promise.resolve([request, response, requestState]);
  });
};

prepareUrl = function(request, response, requestState) {
  debugRequest("preparing URL");
  return Promise["try"](function() {
    var urlOptions, _ref;
    urlOptions = urlUtil.parse(request.url, true);
    _.extend(request.options, {
      hostname: urlOptions.hostname,
      port: urlOptions.port
    });
    request.options.path = urlUtil.format({
      pathname: urlOptions.pathname,
      query: (_ref = request.options.query) != null ? _ref : urlOptions.query
    });
    request.protocol = S(urlOptions.protocol).chompRight(":").toString();
    return Promise.resolve([request, response, requestState]);
  });
};

prepareProtocol = function(request, response, requestState) {
  debugRequest("preparing protocol");
  return Promise["try"](function() {
    var _base;
    request.protocolModule = (function() {
      switch (request.protocol) {
        case "http":
          return http;
        case "https":
          return https;
        default:
          return null;
      }
    })();
    if (request.protocolModule == null) {
      return Promise.reject()(new bhttpErrors.UnsupportedProtocolError("The protocol specified (" + protocol + ") is not currently supported by this module."));
    }
    if ((_base = request.options).port == null) {
      _base.port = (function() {
        switch (request.protocol) {
          case "http":
            return 80;
          case "https":
            return 443;
        }
      })();
    }
    return Promise.resolve([request, response, requestState]);
  });
};

prepareOptions = function(request, response, requestState) {
  debugRequest("preparing options");
  return Promise["try"](function() {
    var _base;
    if (((request.options.formFields != null) || (request.options.files != null)) && ((request.options.inputStream != null) || (request.options.inputBuffer != null))) {
      return Promise.reject(addErrorData(new bhttpErrors.ConflictingOptionsError("You cannot define both formFields/files and a raw inputStream or inputBuffer."), request, response, requestState));
    }
    if (request.options.encodeJSON && ((request.options.inputStream != null) || (request.options.inputBuffer != null))) {
      return Promise.reject(addErrorData(new bhttpErrors.ConflictingOptionsError("You cannot use both encodeJSON and a raw inputStream or inputBuffer.", void 0, "If you meant to JSON-encode the stream, you will currently have to do so manually."), request, response, requestState));
    }
    if (request.responseOptions.stream) {
      if ((_base = request.options).agent == null) {
        _base.agent = false;
      }
    }
    return Promise.resolve([request, response, requestState]);
  });
};

preparePayload = function(request, response, requestState) {
  debugRequest("preparing payload");
  return Promise["try"](function() {
    var containsStreams, fieldName, fieldValue, formDataObject, multipart, streamOptions, valueElement, _i, _len, _ref, _ref1, _ref2;
    request.onUploadProgress = request.options.onUploadProgress;
    multipart = request.options.forceMultipart || (request.options.files != null);
    multipart = multipart || _.any(request.options.formFields, function(item) {
      return item instanceof Buffer || isStream(item);
    });
    _.extend(request.options.formFields, request.options.files);
    containsStreams = _.any(request.options.formFields, function(item) {
      return isStream(item);
    });
    if (request.options.encodeJSON && containsStreams) {
      return Promise.reject()(new bhttpErrors.ConflictingOptionsError("Sending a JSON-encoded payload containing data from a stream is not currently supported.", void 0, "Either don't use encodeJSON, or read your stream into a string or Buffer."));
    }
    if ((_ref = request.options.method) !== "get" && _ref !== "head" && _ref !== "delete") {
      if ((request.options.encodeJSON || (request.options.formFields != null)) && !multipart) {
        debugRequest("got url-encodable form-data");
        if (request.options.encodeJSON) {
          debugRequest("... but encodeJSON was set, so we will send JSON instead");
          request.options.headers["content-type"] = "application/json";
          request.payload = JSON.stringify((_ref1 = request.options.formFields) != null ? _ref1 : null);
        } else if (!_.isEmpty(request.options.formFields)) {
          request.options.headers["content-type"] = "application/x-www-form-urlencoded";
          request.payload = querystring.stringify(formFixArray(request.options.formFields));
        } else {
          request.payload = "";
        }
        request.options.headers["content-length"] = request.payload.length;
        return Promise.resolve();
      } else if ((request.options.formFields != null) && multipart) {
        debugRequest("got multipart form-data");
        formDataObject = new formData();
        _ref2 = formFixArray(request.options.formFields);
        for (fieldName in _ref2) {
          fieldValue = _ref2[fieldName];
          if (!_.isArray(fieldValue)) {
            fieldValue = [fieldValue];
          }
          for (_i = 0, _len = fieldValue.length; _i < _len; _i++) {
            valueElement = fieldValue[_i];
            if (valueElement._bhttpStreamWrapper != null) {
              streamOptions = valueElement.options;
              valueElement = valueElement.stream;
            } else {
              streamOptions = {};
            }
            formDataObject.append(fieldName, valueElement, streamOptions);
          }
        }
        request.payloadStream = formDataObject;
        return Promise["try"](function() {
          return formDataObject.getHeaders();
        }).then(function(headers) {
          if (headers["content-transfer-encoding"] === "chunked" && !request.options.allowChunkedMultipart) {
            return Promise.reject(addErrorData(new MultipartError("Most servers do not support chunked transfer encoding for multipart/form-data payloads, and we could not determine the length of all the input streams. See the documentation for more information."), request, response, requestState));
          } else {
            _.extend(request.options.headers, headers);
            return Promise.resolve();
          }
        });
      } else if (request.options.inputStream != null) {
        debugRequest("got inputStream");
        return Promise["try"](function() {
          var _ref3;
          request.payloadStream = request.options.inputStream;
          if ((request.payloadStream._bhttpStreamWrapper != null) && ((request.payloadStream.options.contentLength != null) || (request.payloadStream.options.knownLength != null))) {
            return Promise.resolve((_ref3 = request.payloadStream.options.contentLength) != null ? _ref3 : request.payloadStream.options.knownLength);
          } else {
            return streamLength(request.options.inputStream);
          }
        }).then(function(length) {
          debugRequest("length for inputStream is %s", length);
          return request.options.headers["content-length"] = length;
        })["catch"](function(err) {
          debugRequest("unable to determine inputStream length, switching to chunked transfer encoding");
          return request.options.headers["content-transfer-encoding"] = "chunked";
        });
      } else if (request.options.inputBuffer != null) {
        debugRequest("got inputBuffer");
        if (typeof request.options.inputBuffer === "string") {
          request.payload = new Buffer(request.options.inputBuffer);
        } else {
          request.payload = request.options.inputBuffer;
        }
        debugRequest("length for inputBuffer is %s", request.payload.length);
        request.options.headers["content-length"] = request.payload.length;
        return Promise.resolve();
      } else {
        return Promise.resolve();
      }
    } else {
      return Promise.resolve();
    }
  }).then(function() {
    return Promise.resolve([request, response, requestState]);
  });
};

prepareCleanup = function(request, response, requestState) {
  debugRequest("preparing cleanup");
  return Promise["try"](function() {
    var fixedHeaders, key, value, _i, _len, _ref, _ref1;
    _ref = ["query", "formFields", "files", "encodeJSON", "inputStream", "inputBuffer", "discardResponse", "keepRedirectResponses", "followRedirects", "noDecode", "decodeJSON", "allowChunkedMultipart", "forceMultipart", "onUploadProgress", "onDownloadProgress"];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      delete request.options[key];
    }
    fixedHeaders = {};
    _ref1 = request.options.headers;
    for (key in _ref1) {
      value = _ref1[key];
      fixedHeaders[key.toLowerCase()] = value;
    }
    request.options.headers = fixedHeaders;
    return Promise.resolve([request, response, requestState]);
  });
};

prepareRequest = function(request, response, requestState) {
  debugRequest("preparing request");
  return Promise["try"](function() {
    var middlewareFunctions, promiseChain;
    middlewareFunctions = [prepareSession, prepareDefaults, prepareUrl, prepareProtocol, prepareOptions, preparePayload, prepareCleanup];
    promiseChain = Promise.resolve([request, response, requestState]);
    middlewareFunctions.forEach(function(middleware) {
      return promiseChain = promiseChain.spread(function(_request, _response, _requestState) {
        return middleware(_request, _response, _requestState);
      });
    });
    return promiseChain;
  });
};

makeRequest = function(request, response, requestState) {
  debugRequest("making %s request to %s", request.options.method.toUpperCase(), request.url);
  return Promise["try"](function() {
    var req, timeoutTimer;
    req = request.protocolModule.request(request.options);
    timeoutTimer = null;
    return new Promise(function(resolve, reject) {
      var completedBytes, progressStream, totalBytes;
      if (request.responseOptions.responseTimeout != null) {
        debugRequest("setting response timeout timer to " + request.responseOptions.responseTimeout + "ms...");
        req.on("socket", function(socket) {
          var timeoutHandler;
          timeoutHandler = function() {
            debugRequest("a response timeout occurred!");
            req.abort();
            return reject(addErrorData(new bhttpErrors.ResponseTimeoutError("The response timed out.")));
          };
          return timeoutTimer = setTimeout(timeoutHandler, request.responseOptions.responseTimeout);
        });
      }
      totalBytes = request.options.headers["content-length"];
      completedBytes = 0;
      progressStream = spy(function(chunk) {
        completedBytes += chunk.length;
        return req.emit("progress", completedBytes, totalBytes);
      });
      if (request.onUploadProgress != null) {
        req.on("progress", function(completedBytes, totalBytes) {
          return request.onUploadProgress(completedBytes, totalBytes, req);
        });
      }
      if (request.payload != null) {
        debugRequest("sending payload");
        req.emit("progress", request.payload.length, request.payload.length);
        req.write(request.payload);
        req.end();
      } else if (request.payloadStream != null) {
        debugRequest("piping payloadStream");
        if (request.payloadStream._bhttpStreamWrapper != null) {
          request.payloadStream.stream.pipe(progressStream).pipe(req);
        } else {
          request.payloadStream.pipe(progressStream).pipe(req);
        }
      } else {
        debugRequest("closing request without payload");
        req.end();
      }
      req.on("error", function(err) {
        if (err.code === "ETIMEDOUT") {
          debugRequest("a connection timeout occurred!");
          return reject(addErrorData(new bhttpErrors.ConnectionTimeoutError("The connection timed out.")));
        } else {
          return reject(err);
        }
      });
      return req.on("response", function(res) {
        if (timeoutTimer != null) {
          debugResponse("got response in time, clearing response timeout timer");
          clearTimeout(timeoutTimer);
        }
        return resolve(res);
      });
    });
  }).then(function(response) {
    return Promise.resolve([request, response, requestState]);
  });
};

processResponse = function(request, response, requestState) {
  debugResponse("processing response, got status code %s", response.statusCode);
  return Promise["try"](function() {
    var cookieHeader, promises;
    if ((request.cookieJar != null) && (response.headers["set-cookie"] != null)) {
      promises = (function() {
        var _i, _len, _ref, _results;
        _ref = response.headers["set-cookie"];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          cookieHeader = _ref[_i];
          debugResponse("storing cookie: %s", cookieHeader);
          _results.push(request.cookieJar.set(cookieHeader, request.url));
        }
        return _results;
      })();
      return Promise.all(promises);
    } else {
      return Promise.resolve();
    }
  }).then(function() {
    var completedBytes, progressStream, totalBytes, _ref, _ref1;
    response.request = request;
    response.requestState = requestState;
    response.redirectHistory = requestState.redirectHistory;
    if (((_ref = response.statusCode) === 301 || _ref === 302 || _ref === 303 || _ref === 307) && request.responseOptions.followRedirects) {
      if (requestState.redirectHistory.length >= (request.responseOptions.redirectLimit - 1)) {
        return Promise.reject(addErrorData(new bhttpErrors.RedirectError("The maximum amount of redirects ({request.responseOptions.redirectLimit}) was reached.")));
      }
      switch (response.statusCode) {
        case 301:
          switch (request.options.method) {
            case "get":
            case "head":
              return redirectUnchanged(request, response, requestState);
            case "post":
            case "put":
            case "patch":
            case "delete":
              return Promise.reject(addErrorData(new bhttpErrors.RedirectError("Encountered a 301 redirect for POST, PUT, PATCH or DELETE. RFC says we can't automatically continue."), request, response, requestState));
            default:
              return Promise.reject(addErrorData(new bhttpErrors.RedirectError("Encountered a 301 redirect, but not sure how to proceed for the " + (request.options.method.toUpperCase()) + " method.")));
          }
          break;
        case 302:
        case 303:
          return redirectGet(request, response, requestState);
        case 307:
          if (request.containsStreams && ((_ref1 = request.options.method) !== "get" && _ref1 !== "head")) {
            return Promise.reject(addErrorData(new bhttpErrors.RedirectError("Encountered a 307 redirect for POST, PUT or DELETE, but your payload contained (single-use) streams. We therefore can't automatically follow the redirect."), request, response, requestState));
          } else {
            return redirectUnchanged(request, response, requestState);
          }
      }
    } else if (request.responseOptions.discardResponse) {
      response.pipe(devNull());
      return Promise.resolve(response);
    } else {
      totalBytes = response.headers["content-length"];
      if (totalBytes != null) {
        totalBytes = parseInt(totalBytes);
      }
      completedBytes = 0;
      progressStream = sink(function(chunk) {
        completedBytes += chunk.length;
        return response.emit("progress", completedBytes, totalBytes);
      });
      if (request.responseOptions.onDownloadProgress != null) {
        response.on("progress", function(completedBytes, totalBytes) {
          return request.responseOptions.onDownloadProgress(completedBytes, totalBytes, response);
        });
      }
      return new Promise(function(resolve, reject) {
        var attachProgressStream, _on, _progressStreamAttached, _resume;
        _resume = response.resume.bind(response);
        _on = response.on.bind(response);
        _progressStreamAttached = false;
        attachProgressStream = function() {
          if (!_progressStreamAttached) {
            debugResponse("attaching progress stream");
            _progressStreamAttached = true;
            return response.pipe(progressStream);
          }
        };
        response.on = function(eventName, handler) {
          debugResponse("'on' called, " + eventName);
          if (eventName === "data" || eventName === "readable") {
            attachProgressStream();
          }
          return _on(eventName, handler);
        };
        response.resume = function() {
          attachProgressStream();
          return _resume();
        };
        if (request.responseOptions.stream) {
          return resolve(response);
        } else {
          response.on("error", function(err) {
            return reject(err);
          });
          return response.pipe(concatStream(function(body) {
            var err, _ref2;
            if (request.responseOptions.decodeJSON || (((_ref2 = response.headers["content-type"]) != null ? _ref2 : "").split(";")[0] === "application/json" && !request.responseOptions.noDecode)) {
              try {
                response.body = JSON.parse(body);
              } catch (_error) {
                err = _error;
                reject(err);
              }
            } else {
              response.body = body;
            }
            return resolve(response);
          }));
        }
      });
    }
  }).then(function(response) {
    return Promise.resolve([request, response, requestState]);
  });
};

doPayloadRequest = function(url, data, options, callback) {
  if (isStream(data)) {
    options.inputStream = data;
  } else if (ofTypes(data, [Buffer]) || typeof data === "string") {
    options.inputBuffer = data;
  } else {
    options.formFields = data;
  }
  return this.request(url, options, callback);
};

redirectGet = function(request, response, requestState) {
  debugResponse("following forced-GET redirect to %s", response.headers["location"]);
  return Promise["try"](function() {
    var key, options, _i, _len, _ref;
    options = _.clone(requestState.originalOptions);
    options.method = "get";
    _ref = ["inputBuffer", "inputStream", "files", "formFields"];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      delete options[key];
    }
    return doRedirect(request, response, requestState, options);
  });
};

redirectUnchanged = function(request, response, requestState) {
  debugResponse("following same-method redirect to %s", response.headers["location"]);
  return Promise["try"](function() {
    var options;
    options = _.clone(requestState.originalOptions);
    return doRedirect(request, response, requestState, options);
  });
};

doRedirect = function(request, response, requestState, newOptions) {
  return Promise["try"](function() {
    if (!request.responseOptions.keepRedirectResponses) {
      response.pipe(devNull());
    }
    requestState.redirectHistory.push(response);
    return bhttpAPI._doRequest(urlUtil.resolve(request.url, response.headers["location"]), newOptions, requestState);
  });
};

createCookieJar = function(jar) {
  return {
    set: function(cookie, url) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          return _this.jar.setCookie(cookie, url, function(err, cookie) {
            if (err) {
              return reject(err);
            } else {
              return resolve(cookie);
            }
          });
        };
      })(this));
    },
    get: function(url) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          return _this.jar.getCookieString(url, function(err, cookies) {
            if (err) {
              return reject(err);
            } else {
              return resolve(cookies);
            }
          });
        };
      })(this));
    },
    jar: jar
  };
};

bhttpAPI = {
  head: function(url, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "head";
    return this.request(url, options, callback);
  },
  get: function(url, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "get";
    return this.request(url, options, callback);
  },
  post: function(url, data, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "post";
    return doPayloadRequest.bind(this)(url, data, options, callback);
  },
  put: function(url, data, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "put";
    return doPayloadRequest.bind(this)(url, data, options, callback);
  },
  patch: function(url, data, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "patch";
    return doPayloadRequest.bind(this)(url, data, options, callback);
  },
  "delete": function(url, data, options, callback) {
    if (options == null) {
      options = {};
    }
    options.method = "delete";
    return this.request(url, options, callback);
  },
  request: function(url, options, callback) {
    if (options == null) {
      options = {};
    }
    return this._doRequest(url, options).nodeify(callback);
  },
  _doRequest: function(url, options, requestState) {
    return Promise["try"]((function(_this) {
      return function() {
        var request, response, _ref;
        request = {
          url: url,
          options: _.clone(options)
        };
        response = null;
        if (requestState == null) {
          requestState = {
            originalOptions: _.clone(options),
            redirectHistory: []
          };
        }
        if (requestState.sessionOptions == null) {
          requestState.sessionOptions = (_ref = _this._sessionOptions) != null ? _ref : {};
        }
        return prepareRequest(request, response, requestState);
      };
    })(this)).spread((function(_this) {
      return function(request, response, requestState) {
        if (request.responseOptions.justPrepare) {
          return Promise.resolve([request, response, requestState]);
        } else {
          return Promise["try"](function() {
            return bhttpAPI.executeRequest(request, response, requestState);
          }).spread(function(request, response, requestState) {
            return Promise.resolve(response);
          });
        }
      };
    })(this));
  },
  executeRequest: function(request, response, requestState) {
    return Promise["try"](function() {
      return makeRequest(request, response, requestState);
    }).spread(function(request, response, requestState) {
      return processResponse(request, response, requestState);
    });
  },
  session: function(options) {
    var key, session, value;
    if (options == null) {
      options = {};
    }
    options = _.clone(options);
    session = {};
    for (key in this) {
      value = this[key];
      if (value instanceof Function) {
        value = value.bind(session);
      }
      session[key] = value;
    }
    if (options.cookieJar == null) {
      options.cookieJar = createCookieJar(new toughCookie.CookieJar());
    } else if (options.cookieJar === false) {
      delete options.cookieJar;
    } else {
      options.cookieJar = createCookieJar(options.cookieJar);
    }
    session._sessionOptions = options;
    return session;
  },
  wrapStream: function(stream, options) {
    return {
      _bhttpStreamWrapper: true,
      stream: stream,
      options: options
    };
  }
};

extend(bhttpAPI, bhttpErrors);

module.exports = bhttpAPI;
