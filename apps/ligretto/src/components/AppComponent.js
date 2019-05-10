import React from 'react';
import {Route, Switch} from 'react-router-dom';
import NavBarComponent from './NavBarComponent';
import Notification from './Notification';

import RoomListContainer from '../containers/RoomListContainer';
import RoomContainer from '../containers/RoomContainer';
import AvatarComponent from '../components/AvatarComponent';


class AppComponent extends React.Component {
    render() {
        return (
            <div>
                <Switch>
                    <Route exact path="/" render={(props) => (<NavBarComponent mySize={"big"} user={this.props.user}/>)}/>
                    <Route path="/" render={(props) => (<NavBarComponent mySize={"small"} user={this.props.user}/>)}/>
                </Switch>
                <Route exact path="/room/:id"
                       render={(props) => (<RoomContainer {...props} user ={this.props.user}/>)} />
                <div className="user-block">
                    <Route exact path="/"
                           component={() =>
                               (<AvatarComponent
                                   user={this.props.user}
                                   onSubmit ={this.props.selectUser}/>)}
                    />
                </div>

                <Route exact path="/" component={RoomListContainer} />

                <Route exact path="/" render={(props) =>
                    (<div className="center-block" style={{width: "84%", marginBottom:"20px"}}>
                            <iframe width="100%" className="video-ligretto-rules" src="https://www.youtube.com/embed/FOzMX8IWcik" frameborder="0" allowfullscreen></iframe>
                    </div>)
                }/>

                <div className="clearfix"/>
                <Route exact path="/" render={(props) => (<footer><span>&#169; Team 1 & Exceptions</span></footer>)}/>

                <Notification/>

            </div>
        )
    }
}

export default AppComponent;









