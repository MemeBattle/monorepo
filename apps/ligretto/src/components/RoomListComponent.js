import React from "react";
import {Link} from "react-router-dom";
import CreateRoomContainer from '../containers/CreateRoomContainer';

class RoomListComponent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            newRoomForm: false
        };
    }

    handleClick = (event) => {
        event.preventDefault();
        this.setState({newRoomForm: true})
    };

    sortRooms = (rooms) => rooms.sort((a, b) => a.status === 'WAIT_PLAYERS' ? -1 : 1);

    render() {
        const rooms = this.props.rooms;

        return (
            <div className="list-room">

                <div className="container-line" style={{fontSize: '2em'}}>
                    2
                    <span className="title-step">
                        Select <span style={{fontWeight: "bold"}}>room</span> or create <span
                        style={{fontWeight: "bold"}}>new</span>
                    </span>
                </div>

                <div className="items">
                    {rooms && this.sortRooms(rooms).map((room, index) =>
                        <div className={room.status}>
                            {(room.status === 'WAIT_PLAYERS') ?
                                <Link to={`/room/${room.id}`} key={index}>
                                    <span className="name">
                                        <span className="status-new">new</span>
                                        {room.name}
                                    </span>
                                </Link>
                                :
                                <span className="name">
                                    <span className="status-game">Closed</span>
                                    {room.name}
                                </span>

                            }
                            <span className="count">{room.players.length}/4</span>
                        </div>
                    )}
                    {
                        this.state.newRoomForm ?
                            (<CreateRoomContainer/>)
                            :
                            (<div className="" style={{margin: '0 auto'}}>
                                <a onClick={this.handleClick} className="button-green" style={{width: '95%'}}>
                                    Create New Room
                                </a>
                            </div>)
                    }
                </div>
            </div>
        )
    }
}

export default RoomListComponent;