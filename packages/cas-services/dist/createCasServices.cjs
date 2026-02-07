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
    createCasServices: ()=>createCasServices
});
const external_request_cjs_namespaceObject = require("./request.cjs");
const index_cjs_namespaceObject = require("./services/index.cjs");
const external_jwt_index_cjs_namespaceObject = require("./jwt/index.cjs");
const createCasServices = ({ casURI, partnerId, publicKey, successLogger, errorLogger })=>{
    const baseRequest = (0, external_request_cjs_namespaceObject.createBaseRequest)({
        casURI,
        errorLogger,
        successLogger
    });
    const loginService = (0, index_cjs_namespaceObject.createLoginService)(baseRequest);
    const healthService = (0, index_cjs_namespaceObject.createHealthService)(baseRequest);
    const signUpService = (0, index_cjs_namespaceObject.createSignUpService)(baseRequest, partnerId);
    const getMeService = (0, index_cjs_namespaceObject.createGetMeService)(baseRequest);
    const getUsersService = (0, index_cjs_namespaceObject.createGetUsersService)(baseRequest);
    const { verifyToken } = (0, external_jwt_index_cjs_namespaceObject.createJWTServices)({
        publicKey
    });
    const createTemporaryTokenService = (0, index_cjs_namespaceObject.createCreateTemporaryTokenService)(baseRequest);
    return {
        loginService,
        signUpService,
        verifyToken,
        healthService,
        getMeService,
        getUsersService,
        createTemporaryTokenService
    };
};
exports.createCasServices = __webpack_exports__.createCasServices;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createCasServices"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
