#!/usr/bin/env node
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
var __webpack_exports__ = {};
const external_fs_namespaceObject = require("fs");
const external_axios_namespaceObject = require("axios");
var external_axios_default = /*#__PURE__*/ __webpack_require__.n(external_axios_namespaceObject);
const external_readline_namespaceObject = require("readline");
const external_chalk_namespaceObject = require("chalk");
var external_chalk_default = /*#__PURE__*/ __webpack_require__.n(external_chalk_namespaceObject);
const external_chalk_animation_namespaceObject = require("chalk-animation");
const CAS_BASE_URI = 'https://cas.mems.fun';
const DEFAULT_KEY_PATH = './key.pem';
const createCasRoutes = (casURI = CAS_BASE_URI)=>({
        createPartner: `${casURI}/partners`,
        loginRequest: `${casURI}/auth/login`,
        getPartnerKey: (partnerId)=>`${casURI}/partners/${partnerId}/key`
    });
const rl = external_readline_namespaceObject.createInterface({
    input: process.stdin,
    output: process.stdout
});
const styles = {
    defaultString: external_chalk_default().underline.blue,
    endLine: external_chalk_default().underline.bold.yellow,
    helper: external_chalk_default().underline.gray,
    success: external_chalk_default().green.bold
};
function decorateObjectMethods(obj, decorator) {
    return Object.entries(obj).reduce((decoratedObject, [key, prop])=>({
            ...decoratedObject,
            [key]: decorator(prop)
        }), {});
}
const createQuestion = (questionText, defaultValue = '')=>new Promise((resolve)=>rl.question(questionText, (answer)=>{
            resolve(answer || defaultValue);
        }));
const checkNotEmptyString = (inputString, errorMessage = '')=>{
    if (!inputString.length && errorMessage) throw new Error(errorMessage);
    return inputString.length > 0;
};
const showLoader = (asyncFunc)=>async (...args)=>{
        const loader = external_chalk_animation_namespaceObject.rainbow('Wait CAS answer...');
        const answer = await asyncFunc(...args);
        loader.stop();
        return answer;
    };
const createRequests = (CAS_URI)=>{
    const CAS_ROUTES = createCasRoutes(CAS_URI);
    return {
        loginRequest: async (credentials)=>{
            const answer = await external_axios_default().post(CAS_ROUTES.loginRequest, credentials);
            return answer.data.data;
        },
        createPartner: async (userData, token)=>{
            const answer = await external_axios_default().post(CAS_ROUTES.createPartner, userData, {
                headers: {
                    Authorization: token
                }
            });
            return answer.data.data;
        },
        getKey: async (partnerId, token)=>{
            const answer = await external_axios_default().get(CAS_ROUTES.getPartnerKey(partnerId), {
                headers: {
                    Authorization: token
                }
            });
            return answer.data;
        }
    };
};
const partnerSignUp = async (user, createPartner, token)=>{
    const partnerUsername = await createQuestion(`Partner username (${styles.defaultString(user.username)}): `, user.username);
    checkNotEmptyString(partnerUsername, 'Username must be not empty');
    const partnerEmail = await createQuestion(`Partner email (${styles.defaultString(user.email)}): `);
    checkNotEmptyString(partnerUsername, 'Partner email must be not empty');
    const partnerPassword = await createQuestion("Partner password: ");
    checkNotEmptyString(partnerUsername, 'Password must be not empty');
    const answer = await createPartner({
        email: partnerEmail,
        username: partnerUsername,
        password: partnerPassword
    }, token);
    return answer._id;
};
const initPartner = async ()=>{
    try {
        const CAS_URI = await createQuestion(`CAS uri (${styles.defaultString(CAS_BASE_URI)}): `, CAS_BASE_URI);
        const { loginRequest, createPartner, getKey } = decorateObjectMethods(createRequests(CAS_URI), showLoader);
        const username = await createQuestion("username: ");
        checkNotEmptyString(username, 'Username must be not empty');
        const password = await createQuestion('password: ');
        checkNotEmptyString(password, 'Password must be not empty');
        const { token, user } = await loginRequest({
            login: username,
            password
        });
        console.log(styles.success(`Hello, ${user.username}`));
        const partnerId = await createQuestion(`partnerId (${styles.helper('blank field to create new')}): `);
        const newPartnerId = partnerId || await partnerSignUp(user, createPartner, token);
        const key = await getKey(newPartnerId, token);
        console.log('key: ', key);
        const keyPath = await createQuestion(`Path to save a key (${styles.defaultString(DEFAULT_KEY_PATH)}): `, DEFAULT_KEY_PATH);
        external_fs_namespaceObject.writeFileSync(keyPath, key, {
            flag: 'w+'
        });
    } catch (e) {
        console.error(e);
    } finally{
        console.log(styles.endLine('Good luck :)') + '\n');
        rl.close();
    }
};
initPartner();
for(var __rspack_i in __webpack_exports__)exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
