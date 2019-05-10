import React from 'react';
import CardComponent from '../components/CardComponent';

class RowComponent extends React.Component {
    render() {
        const {row} = this.props;
        return (
            <div className="row-cards">
                {row && row.map((card, index) => {
                    return <CardComponent
                        card={card}
                        key={index}
                        position={index}
                        onClick={this.props.putCardOnBoard}/>;

                })}
            </div>
        )
    }
}

export default RowComponent;