import React from 'react';


class EmptyComponent extends React.Component {
    handleClick = (event) => {
        if (this.props.shuffle) {
            this.props.shuffle();
        }
    };

    render() {

        return (
            <div className="empty" onClick={this.handleClick}>
            </div>
        )

    }
}

export default EmptyComponent;