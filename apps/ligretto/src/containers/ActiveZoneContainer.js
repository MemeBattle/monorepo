import React from 'react';

import {selectActiveZone} from '../ducks/game/selectors';
import {connect} from 'react-redux';

import gameActions from '../ducks/game/actions';
import ActiveZoneComponent from '../components/ActiveZoneComponent';


class ActiveZoneContainer extends React.Component {

    render() {
        return (
            <ActiveZoneComponent
                row={this.props.row}
                remainingStack={this.props.remainingStack}
                stackCount={this.props.stackCount}
                remainingCardsCount={this.props.remainingCardsCount}
                user={this.props.user}
                status={this.props.status}
                //------Methods------
                readyToPlay={this.props.readyToPlay}
                putCardOnBoard={this.props.putCardOnBoard}
                putCardFromPack={this.props.putCardFromPack}
                getOneCard={this.props.getOneCard}
                getThreeCards={this.props.getThreeCards}
                shuffle={this.props.shuffle}/>
        )

    }
}


function mapStateToProps(state) {
    return selectActiveZone(state)
}

function mapDispatchToProps(dispatch) {
    return {
        putCardOnBoard: (position) => {
            dispatch(gameActions.putCardRequest(position))
        },

        putCardFromPack: () => {
            dispatch(gameActions.putCardFromPackRequest())
        },

        readyToPlay: () => {
            dispatch(gameActions.readyToPlay())
        },

        getOneCard: () => {
            dispatch(gameActions.getOneCardRequest())
        },
        getThreeCards: () => {
            dispatch(gameActions.getThreeCardRequest())
        },
        shuffle: () => {
            dispatch(gameActions.shuffleCardsRequest())
        }
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(ActiveZoneContainer);
