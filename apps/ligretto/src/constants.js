export const REST_API_URL = process.env.API_URL_DEV_LOCAL;
export const API_URL = process.env.API_URL_DEV_LOCAL;

export const socketPrefix = 'server/';

export const REST_ENDPOINTS = {
    rooms: '/rooms',
};

export const gameStatuses = {
    inProcess: 'IN_PROCESS',
    finished: 'FINISHED',
    waitPlayers: 'WAIT_PLAYERS'
};

export const sides = ['top', 'left', 'right'];
