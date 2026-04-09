"use strict";
var __webpack_exports__ = {};
const external_vitest_namespaceObject = require("vitest");
const external_request_cjs_namespaceObject = require("./request.cjs");
function makeFetchResponse(body, status = 200, headers = {}) {
    return {
        status,
        json: ()=>Promise.resolve(body),
        headers: {
            entries: ()=>Object.entries(headers)[Symbol.iterator]()
        }
    };
}
(0, external_vitest_namespaceObject.describe)('createBaseRequest', ()=>{
    (0, external_vitest_namespaceObject.beforeEach)(()=>{
        external_vitest_namespaceObject.vi.restoreAllMocks();
    });
    (0, external_vitest_namespaceObject.it)('returns parsed JSON body directly on success', async ()=>{
        const responseBody = {
            success: true,
            data: {
                token: 'abc'
            }
        };
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse(responseBody, 200)));
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com'
        });
        const result = await client.post('/auth/login', {
            login: 'user',
            password: 'pass'
        });
        (0, external_vitest_namespaceObject.expect)(result).toEqual(responseBody);
    });
    (0, external_vitest_namespaceObject.it)('calls successLogger with status, data, headers, and url', async ()=>{
        const responseBody = {
            success: true
        };
        const responseHeaders = {
            'content-type': 'application/json'
        };
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse(responseBody, 200, responseHeaders)));
        const successLogger = external_vitest_namespaceObject.vi.fn();
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com',
            successLogger
        });
        await client.get('/health');
        (0, external_vitest_namespaceObject.expect)(successLogger).toHaveBeenCalledOnce();
        (0, external_vitest_namespaceObject.expect)(successLogger).toHaveBeenCalledWith(200, responseBody, responseHeaders, 'https://cas.example.com/health');
    });
    (0, external_vitest_namespaceObject.it)('returns { success: false, errorCode: 500 } and calls errorLogger on network failure', async ()=>{
        const networkError = new Error('Network failure');
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockRejectedValue(networkError));
        const errorLogger = external_vitest_namespaceObject.vi.fn();
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com',
            errorLogger
        });
        const result = await client.get('/health');
        (0, external_vitest_namespaceObject.expect)(result).toMatchObject({
            success: false,
            errorCode: 500
        });
        (0, external_vitest_namespaceObject.expect)(errorLogger).toHaveBeenCalledOnce();
        (0, external_vitest_namespaceObject.expect)(errorLogger).toHaveBeenCalledWith(networkError);
    });
    (0, external_vitest_namespaceObject.it)('serializes array params with repeat format', async ()=>{
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse({})));
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com'
        });
        await client.get('/users', {
            params: {
                ids: [
                    'a',
                    'b',
                    'c'
                ]
            }
        });
        const calledUrl = fetch.mock.calls[0][0];
        (0, external_vitest_namespaceObject.expect)(calledUrl).toBe('https://cas.example.com/users?ids=a&ids=b&ids=c');
    });
    (0, external_vitest_namespaceObject.it)('sets Content-Type: application/json for JSON body', async ()=>{
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse({})));
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com'
        });
        await client.post('/auth/login', {
            login: 'user',
            password: 'pass'
        });
        const calledInit = fetch.mock.calls[0][1];
        (0, external_vitest_namespaceObject.expect)(calledInit.headers['Content-Type']).toBe('application/json');
    });
    (0, external_vitest_namespaceObject.it)('does not set Content-Type for FormData body', async ()=>{
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse({})));
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com'
        });
        await client.patch('/users/123', new FormData(), {
            headers: {
                Authorization: 'token'
            }
        });
        const calledInit = fetch.mock.calls[0][1];
        (0, external_vitest_namespaceObject.expect)(calledInit.headers['Content-Type']).toBeUndefined();
    });
    (0, external_vitest_namespaceObject.it)('returns HTTP error body directly (no throw on 4xx)', async ()=>{
        const errorBody = {
            success: false,
            error: {
                errorCode: 404,
                errorMessage: 'user not found'
            }
        };
        external_vitest_namespaceObject.vi.stubGlobal('fetch', external_vitest_namespaceObject.vi.fn().mockResolvedValue(makeFetchResponse(errorBody, 404)));
        const client = (0, external_request_cjs_namespaceObject.createBaseRequest)({
            casURI: 'https://cas.example.com'
        });
        const result = await client.get('/auth/me');
        (0, external_vitest_namespaceObject.expect)(result).toEqual(errorBody);
    });
});
for(var __rspack_i in __webpack_exports__)exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
