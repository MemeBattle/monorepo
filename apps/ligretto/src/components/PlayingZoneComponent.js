import React from 'react';
import CardComponent from '../components/CardComponent';


class PlayingZoneComponent extends React.Component {
    render() {
        const {cardsOnBoard} = this.props;

        return (
            <div className="play-zone">
                {cardsOnBoard && cardsOnBoard.map((card, index, type) =>
                    <CardComponent
                        card={card}
                        key={index}/>
                )}
            </div>
        )
    }
}

export default PlayingZoneComponent;
