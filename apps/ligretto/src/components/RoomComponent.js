import React from "react";

import TableContainer from "../containers/TableContainer";
class RoomComponent extends React.Component {
    render() {
        return (
            <div>
                <div className="card-field">
                    <TableContainer/>
                </div>
            </div>
        )
    }
}

export default RoomComponent;