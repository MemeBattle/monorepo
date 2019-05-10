import React from 'react';
import {Link} from "react-router-dom";

class CreateRoomComponent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            value: "",
        };
    }

    changeHandle = (event) => {
        if (event.target.value.match(/^[a-zA-Z0-9а-яА-Я ]*$/) !== null) {
            this.setState({
                value: event.target.value,
            });
        }
    };

    createRoom = (event) => {
        event.preventDefault();
        this.props.createRoom(this.state.value);
    };

    render() {
        return (
            <div className="createNewRoom input-group">

                <input type="text"
                       placeholder="Room name"
                       className="form-control"
                       onChange={this.changeHandle}
                       value={this.state.value}
                />

                <span className="input-group-btn">
                            <button type="button" onClick={this.createRoom} className="button-green"
                            style={{minWidth: '64px',
                                height: '34px',
                                border: '0px solid'
                            }}>
                                Create
                            </button>
                        </span>
            </div>
        )
    }
}

export default CreateRoomComponent;


// btn btn-default btn-success