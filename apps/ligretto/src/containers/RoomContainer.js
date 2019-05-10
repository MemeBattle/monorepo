import React from "react";
import RoomComponent from '../components/RoomComponent';

import gameActions from '../ducks/game/actions';
import mainActions from '../ducks/main/actions';
import {connect} from 'react-redux';
import {selectRoomContainer} from '../ducks/game/selectors';

class RoomContainer extends React.Component {

    componentWillMount() {
        const socketId = window.localStorage.getItem('socketId');
        this.props.joinGroup(
            this.props.match.params.id,
            this.props.user,
            socketId
        );
    }

    componentWillUnmount() {
        this.props.leaveGroup();
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.socketId && nextProps.socketId !== this.props.socketId) {
            window.localStorage.setItem('socketId', nextProps.socketId)
        }
        if (nextProps.error && nextProps.error !== this.props.error) {
            this.props.showNotification('Комната недоступна');
            this.props.history.push('/')
        }
    }

    render() {
        return (
            <RoomComponent />
        )
    }
}

function mapStateToProps(state) {
    return selectRoomContainer(state)
}

function mapDispatchToProps(dispatch) {
    return {
        joinGroup: (groupId, user, socketId) => {
            dispatch(gameActions.joinRoomRequest(groupId, user, socketId))
        },

        showNotification: (error) => {
            dispatch(mainActions.showNotification(error))
        },

        leaveGroup: () => dispatch(gameActions.leaveGroup())
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(RoomContainer);