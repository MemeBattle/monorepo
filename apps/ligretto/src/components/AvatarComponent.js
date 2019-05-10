import React from 'react';
import {FormGroup} from 'react-bootstrap';
import user1Component from './user.avatar.components/user1Component';
import user2Component from './user.avatar.components/user2Component';
import user3Component from './user.avatar.components/user3Component';


class AvatarComponent extends React.Component {

    components = [user1Component, user2Component, user3Component];

    constructor(props) {
        super(props);
        let rand, username, component;
        if (props.user) {
            rand = props.user.avatarId;
            username = props.user.username;
            component = this.components[rand];

        } else {
            rand = 0;
            username = 'Unknown';
            component = this.components[rand];
        }
        this.state = {
            rand,
            username,
            component: component || this.components[0]
        }
    }

    handleClick = () => {
        const rand = Math.random() * 3 | 0;
        this.setState({
            rand: rand,
            component: this.components[rand]
        });
    };

    handleChange = (event) => {
        if (event.target.type === 'text') {
            const newValue = event.target.value;
            this.setState({
                username: newValue
            });
        }
    };

    handleSubmit = (event) => {
        event.preventDefault();
        const user = {
            username: this.state.username,
            avatarId: this.state.rand
        };
        window.localStorage.setItem('user', JSON.stringify(user));
        this.props.onSubmit(user);
    };

    render() {
        return (

            <div className="container-avatar">
                <div className="container-line">
                    1
                    <span className="title-step">
                        Enter <span style={{fontWeight: "bold"}}>your name</span> and choose avatar
                    </span>
                </div>
                <div className="main-avatar">
                    <div className="avatar">
                        <this.state.component/>
                    </div>
                    <form >
                        <input className="input"
                               type="text"
                               placeholder="username"
                               onChange={this.handleChange}
                               value={this.state.username}
                               style={{
                                   border: '1px solid rgba(0,0,0,0)',
                                   borderBottom: '1px solid #12844d',
                                   maxWidth: '200px',
                                   width: '40%',
                                   background: 'rgba(0,0,0,0)',
                                   outline: 'none',
                                   textAlign: 'center'
                               }}/>
                        <FormGroup controlId="formBasicText">
                            <div className="avatar-button">
                                <br />
                                <a onClick={this.handleClick} className="button-green">Random avatar</a>
                                <br />
                                <a onClick={this.handleSubmit} className="button-green">Submit</a>
                            </div>
                        </FormGroup>
                    </form>
                </div>
            </div>
        )
    }
}

export default AvatarComponent;