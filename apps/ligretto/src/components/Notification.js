import React from "react";
import {selectNotification} from '../ducks/main/selectors';
import {connect} from 'react-redux';

import actions from '../ducks/main/actions';

class Notification extends React.Component {

    render() {
        if (this.props.error !== '') {
            return (
                <div className="notification">
                    <h4>Error</h4>
                    <p>{this.props.error}</p>
                    <div className="notification__buttons__block">
                        <button
                            className="button-green "
                            onClick={() => this.props.hideNotification()}
                            style={{minWidth: '80px'}}>
                            OK
                        </button>
                    </div>
                </div>
            )
        } else {
            return false;
        }
    }
}

function mapStateToProps(state) {
    return selectNotification(state)
}


function mapDispatchToProps(dispatch) {
    return {
        hideNotification: () => {
            dispatch(actions.hideNotification())
        }
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(Notification);