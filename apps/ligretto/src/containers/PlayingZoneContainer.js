import React from 'react';
import {selectPlayingZone} from '../ducks/game/selectors';
import {connect} from 'react-redux';
import PlayingZoneComponent from '../components/PlayingZoneComponent';

class PlayingZoneContainer extends React.Component {
    render() {
        const {cardsOnBoard} = this.props;

        return (
            <PlayingZoneComponent
                cardsOnBoard={cardsOnBoard}/>
        )
    }
}


function mapStateToProps(state) {
    return selectPlayingZone(state)
}

export default connect(mapStateToProps)(PlayingZoneContainer);