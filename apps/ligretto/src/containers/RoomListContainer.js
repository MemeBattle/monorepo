import React from "react";
import RoomListComponent from '../components/RoomListComponent';
import {selectGetRooms} from '../ducks/main/selectors';
import actions from '../ducks/main/actions';
import {connect} from 'react-redux';


class RoomListContainer extends React.Component {

    fetchRooms = () => [{
        id: 1, name: 'Ligretto Tournament 2017'
    }, {
        id: 2, name: 'Public room'
    }, {
        id: 3, name: 'все сюда!!!!!!!!!!!!!!!!!'
    }];

    componentWillMount = () => {
        this.props.fetchRooms();
    };

    render() {
        return (
            <RoomListComponent rooms={this.props.rooms}/>
        )
    }
}

function mapStateToProps(state) {
    return selectGetRooms(state)
}

function mapDispatchToProps(dispatch) {
    return {
        fetchRooms: () => {
            dispatch(actions.fetchRooms())
        }
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(RoomListContainer);
