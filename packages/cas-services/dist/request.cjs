"use strict";
var __webpack_require__ = {};
(()=>{
    __webpack_require__.n = (module)=>{
        var getter = module && module.__esModule ? ()=>module['default'] : ()=>module;
        __webpack_require__.d(getter, {
            a: getter
        });
        return getter;
    };
})();
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
const external_axios_namespaceObject = require("axios");
var external_axios_default = /*#__PURE__*/ __webpack_require__.n(external_axios_namespaceObject);
const external_qs_namespaceObject = require("qs");
const createBaseRequest = ({ casURI, errorLogger, successLogger })=>{
    const baseRequest = external_axios_default().create({
        baseURL: casURI,
        validateStatus: (status)=>status >= 200 && status < 500,
        paramsSerializer: {
            indexes: false,
            serialize: (params)=>(0, external_qs_namespaceObject.stringify)(params, {
                    arrayFormat: 'repeat'
                })
        }
    });
    baseRequest.interceptors.response.use((response)=>{
        if (successLogger) successLogger(response.status, response.data, response.headers, response.config);
        return response.data;
    }, (error)=>{
        if (errorLogger) errorLogger(error);
        return {
            success: false,
            error: error.toJSON(),
            errorCode: error.code || 500
        };
    });
    return baseRequest;
};
exports.createBaseRequest = __webpack_exports__.createBaseRequest;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createBaseRequest"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
