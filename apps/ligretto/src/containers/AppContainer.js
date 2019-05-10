import React from 'react';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';
import mainActions from '../ducks/main/actions';

import AppComponent from '../components/AppComponent';
import {selectAppContainer} from '../ducks/main/selectors';


class AppContainer extends React.Component {
    render() {
        return (
            <AppComponent
                user={this.props.user}
                selectUser={this.props.selectUser}/>
        )
    }
}

function mapStateToProps(state) {
    return selectAppContainer(state)
}

function mapDispatchToProps(dispatch) {

    return {
        selectUser: (user) => {
            dispatch(mainActions.selectUser(user));
        }
    }
}

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(AppContainer));