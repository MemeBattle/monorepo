const buildSearchParams = (params)=>{
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params))if (null != value) if (Array.isArray(value)) for (const item of value)searchParams.append(key, String(item));
    else searchParams.append(key, String(value));
    return searchParams;
};
const createBaseRequest = ({ casURI, errorLogger, successLogger })=>{
    const doRequest = async (method, path, body, config)=>{
        let url = `${casURI}${path}`;
        if (config?.params) url += `?${buildSearchParams(config.params)}`;
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
export { createBaseRequest };
