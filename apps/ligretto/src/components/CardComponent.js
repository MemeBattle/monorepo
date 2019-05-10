import React from 'react';
import debounce from '../helpers/debounce';
import EmptyComponent from './EmptyComponent';


class CardComponent extends React.Component {
    constructor(props) {
        super(props);
        this.handleClick = debounce(this.handleClick, 500)
    }

    handleClick = () => {
        if (typeof this.props.onClick !== 'undefined') {
            this.props.onClick(this.props.position);
        }
    };

    render() {
        // console.log(this.props.card);
        const {card} = this.props;

        if (card === null) {
            return (
                <EmptyComponent/>
            )
        }

        const styles = {backgroundColor: "blue"};
        const colorMap = {
            blue: '#244f61',
            red: '#cc2020',
            yellow: '#d2c417',
            green: '#0c8531'
        };
        let className = "card";
        if (!card) {
            className += " card-back";
        }
        if (card && card.suit) {
            styles.background = colorMap[card.suit];
        }

        return (
            <div onClick={this.handleClick} className="card-container">
                <div className={className } style={styles}>
                    {!this.props.card ?
                        <span className="card-title">{this.props.title} <br/> {this.props.count}</span>
                        :
                        (<div>
                            <br/>
                            <span className="card-value">
                                {card.value}
                            </span>
                        </div>)}
                </div>
            </div>
        )
    }
}

export default CardComponent;