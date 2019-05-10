import React from 'react';
import user1Component from './user.avatar.components/user1Component';
import user2Component from './user.avatar.components/user2Component';
import user3Component from './user.avatar.components/user3Component';


class UserComponent extends React.Component {

    userComponents = [
        user1Component,
        user2Component,
        user3Component
    ];

    render() {
        const {user} = this.props;

        return (
            <div className="user-component" style={{background: 'rgba(0,0,0,0)', fontSize: '15px'}}>
                <div className="user-component-avatar">
                    {React.createElement(this.userComponents[user.avatarId], {})}
                </div>
                <span className="user-name">{user.username}</span>
            </div>
        )
    }
}

export default UserComponent;