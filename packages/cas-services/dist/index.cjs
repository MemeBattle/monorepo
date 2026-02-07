"use strict";
var __webpack_modules__ = {
    "./constants" (module) {
        module.exports = require("./constants.cjs");
    },
    "./createCasServices" (module) {
        module.exports = require("./createCasServices.cjs");
    },
    "./createFrontServices" (module) {
        module.exports = require("./createFrontServices.cjs");
    }
};
var __webpack_module_cache__ = {};
function __webpack_require__(moduleId) {
    var cachedModule = __webpack_module_cache__[moduleId];
    if (void 0 !== cachedModule) return cachedModule.exports;
    var module = __webpack_module_cache__[moduleId] = {
        exports: {}
    };
    __webpack_modules__[moduleId](module, module.exports, __webpack_require__);
    return module.exports;
}
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
(()=>{
    __webpack_require__.r(__webpack_exports__);
    __webpack_require__.d(__webpack_exports__, {
        createCasServices: ()=>_createCasServices__rspack_import_0.createCasServices,
        createFrontServices: ()=>_createFrontServices__rspack_import_1.createFrontServices
    });
    var _createCasServices__rspack_import_0 = __webpack_require__("./createCasServices");
    var _createFrontServices__rspack_import_1 = __webpack_require__("./createFrontServices");
    var _constants__rspack_import_2 = __webpack_require__("./constants");
    var __rspack_reexport = {};
    for(const __rspack_import_key in _constants__rspack_import_2)if ([
        "createFrontServices",
        "createCasServices",
        "default"
    ].indexOf(__rspack_import_key) < 0) __rspack_reexport[__rspack_import_key] = ()=>_constants__rspack_import_2[__rspack_import_key];
    __webpack_require__.d(__webpack_exports__, __rspack_reexport);
})();
exports.createCasServices = __webpack_exports__.createCasServices;
exports.createFrontServices = __webpack_exports__.createFrontServices;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createCasServices",
    "createFrontServices"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
