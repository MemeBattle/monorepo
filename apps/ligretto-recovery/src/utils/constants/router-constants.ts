export const routes = {
  HOME: '/',
  GAME: '/game/:roomUuid',
  ROOMS: '/rooms',
  CREATE_ROOM: '/create',
  MANAGE_ROOMS: '/manageRooms',
  TECH: '/tech/:gameId',
  AUTH: '/auth',
} as const
