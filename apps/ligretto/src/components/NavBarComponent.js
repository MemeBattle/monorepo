import React from 'react';
import UserComponent from '../components/UserComponent';
import {Navbar, NavItem, Nav} from "react-bootstrap";

import {Link} from "react-router-dom";

function NavBarComponent(props) {
    return (
        <header className={props.mySize === 'small'? 'small-header' : 'big-header'}>
            <Link to="/"><span className="title">Ligretto Game</span></Link>
            <span className="subtitle">play online with friends</span>
            {(props.mySize === 'small')?
                <div></div>
                :
                <div className="user-comp">
                    <UserComponent user={props.user}/>
                </div>
            }
        </header>
    )
}


export default NavBarComponent;