import React from 'react';
import {Button} from 'react-bootstrap';
import CardComponent from '../components/CardComponent';
import RowComponent from '../components/RowComponent';
import UserComponent from "./UserComponent";
import EmptyComponent from "./EmptyComponent";

import {gameStatuses} from '../constants';


class ActiveZoneComponent extends React.Component {
    readyClick = (event) => {
        if (typeof this.props.readyToPlay !== 'undefined') {
            this.props.readyToPlay();
            event.target.style.visibility = "hidden";
        }
    };

    render() {
        const {row, remainingStack, remainingCardsCount, stackCount, user} = this.props;

        return (
            <div className="active-zone">
                {/*------Компонент юзера------*/}
                {user &&
                <UserComponent user={user}/>
                }

                {/*------Стэк перевернутых карт------*/}
                {remainingStack && (
                    <CardComponent
                        onClick={this.props.putCardFromPack}
                        card={remainingStack[remainingStack.length - 1] || null}/>

                )}

                {/*-------Большая колода из которой переворачиваем карты------*/}
                {remainingCardsCount > 0 ? (
                    <CardComponent
                        onClick={this.props.getThreeCards}
                        count={this.props.remainingCardsCount}
                        title={"Remaining Cards"}/>
                ) : (
                    <EmptyComponent shuffle={this.props.shuffle}/>

                )}

                {/*------Контейнер для основных 3 карт------*/}
                <RowComponent
                    row={row}
                    putCardOnBoard={this.props.putCardOnBoard}/>

                {/*------ Лигретто колода --------*/}
                {stackCount > 0 ? (
                    <CardComponent
                        onClick={this.props.getOneCard}
                        count={this.props.stackCount}
                        title={"LIGRETTO"}/>
                ) : (
                    <EmptyComponent/>
                )}

                {this.props.status === gameStatuses.waitPlayers &&
                <Button onClick={this.readyClick} className="btn btn-success btn-ready">Ready to Play</Button>
                }

            </div>
        );
    }
}

export default ActiveZoneComponent;
