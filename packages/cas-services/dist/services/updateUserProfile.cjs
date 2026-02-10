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
    createUpdateUserProfileService: ()=>createUpdateUserProfileService
});
const external_constants_cjs_namespaceObject = require("../constants.cjs");
const createUpdateUserProfileService = (request)=>({ userId, token, avatar, username })=>{
        const formData = new FormData();
        if (avatar) formData.append('avatar', avatar);
        if (username) formData.append('username', username);
        return request.patch(`${external_constants_cjs_namespaceObject.CAS_ROUTES.users}/${userId}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: token
            }
        });
    };
exports.createUpdateUserProfileService = __webpack_exports__.createUpdateUserProfileService;
for(var __rspack_i in __webpack_exports__)if (-1 === [
    "createUpdateUserProfileService"
].indexOf(__rspack_i)) exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
