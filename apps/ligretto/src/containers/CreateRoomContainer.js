import CreateRoomComponent from '../components/CreateRoomComponent';
import React from 'react';
import actions from '../ducks/main/actions';
import {connect} from 'react-redux';
import {selectCreateRoomError} from '../ducks/main/selectors';


class CreateRoomContainer extends React.Component {

    render() {
        return (<CreateRoomComponent createRoom={this.props.createRoom} error={this.props.error}/>)
    }

}

function mapStateToProps(state) {
    return selectCreateRoomError(state)
}

function mapDispatchToProps(dispatch) {
    return {
        createRoom: (name) => {
            dispatch(actions.createRoom(name))
        }
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(CreateRoomContainer);