"use strict";
var __webpack_require__ = {};
(()=>{
    __webpack_require__.d = (exports1, definition)=>{
        for(var key in definition)if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports1, key)) Object.defineProperty(exports1, key, {
            enumerable: true,
            get: definition[key]
        });
    };
})();
(()=>{
    __webpack_require__.o = (obj, prop)=>Object.prototype.hasOwnProperty.call(obj, prop);
})();
(()=>{
    __webpack_require__.r = (exports1)=>{
        if ("u" > typeof Symbol && Symbol.toStringTag) Object.defineProperty(exports1, Symbol.toStringTag, {
            value: 'Module'
        });
        Object.defineProperty(exports1, '__esModule', {
            value: true
        });
    };
})();
var __webpack_exports__ = {};
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
    createBaseRequest: ()=>createBaseRequest
});
const external_qs_namespaceObject = require("qs");
const createBaseRequest = ({ casURI, errorLogger, successLogger })=>{
    const doRequest = async (method, path, body, config)=>{
        let url = `${casURI}${path}`;
        if (config?.params) url += `?${(0, external_qs_namespaceObject.stringify)(config.params, {
            arrayFormat: 'repeat',
            indices: false
        })}`;
        const headers = {
            ...config?.headers
        };
        let fetchBody;
        if (body instanceof FormData) fetchBody = body;
        else if (void 0 !== body) {
            headers['Content-Type'] = 'application/json';
            fetchBody = JSON.stringify(body);
        }
        let response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: fetchBody
            });
        } catch (error) {
            if (errorLogger) errorLogger(error);
            return {
                success: false,
                error,
                errorCode: 500
            };
        }
        const data = await response.json();
        if (successLogger) {
            const headersObj = Object.fromEntries(response.headers.entries());
            successLogger(response.status, data, headersObj, url);
        }
        return data;
    };
    return {
        get: (url, config)=>doRequest('GET', url, void 0, config),
        post: (url, data, config)=>doRequest('POST', url, data, config),
        patch: (url, data, config)=>doRequest('PATCH', url, data, config)
    };
};
exports.createBaseRequest = __webpack_exports__.createBaseRequest;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createBaseRequest"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
