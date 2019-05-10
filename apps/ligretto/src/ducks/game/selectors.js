
export function selectActiveZone(state) {
    return {
        user: state.main.user,
        row: state.game.my.row,
        remainingStack: state.game.my.remainingStack,
        stackCount: state.game.my.stackCount,
        remainingCardsCount: state.game.my.remainingCardsCount,
        status: state.game.status
    }
}

export function selectPlayingZone(state) {
    return {
        cardsOnBoard: state.game.cardsOnBoard,
    }
}

export function selectRoomContainer(state) {
    return {
        socketId: state.game.socketId,
        error: state.game.error
    }
}

export function selectGameOver(state) {
    return {
        gameOver: state.game.gameOver,
        show: state.game.showGameOver
    }
}

export function selectRivalZone(state) {
    return {
        left: state.game.left,
        right: state.game.right,
        top: state.game.top
    }
}