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
    createJWTServices: ()=>createJWTServices
});
const external_jsonwebtoken_namespaceObject = require("jsonwebtoken");
var external_jsonwebtoken_default = /*#__PURE__*/ __webpack_require__.n(external_jsonwebtoken_namespaceObject);
const createJWTServices = ({ publicKey })=>({
        verifyToken (token) {
            return new Promise((resolve)=>{
                external_jsonwebtoken_default().verify(token, publicKey, {
                    algorithms: [
                        'RS256'
                    ]
                }, (err, decoded)=>err || !decoded ? resolve({
                        success: false,
                        error: err
                    }) : resolve({
                        success: true,
                        data: decoded
                    }));
            });
        }
    });
exports.createJWTServices = __webpack_exports__.createJWTServices;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createJWTServices"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
