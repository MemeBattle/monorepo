import axios from 'axios';

import {REST_API_URL} from '../constants';


const request = (config) => {
    const url = REST_API_URL + config.url;
    return axios({
        ...config,
        url
    }).then(result => {
        return result.data;
    });
};

export default request;