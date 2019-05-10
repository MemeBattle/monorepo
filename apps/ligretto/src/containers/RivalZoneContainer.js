import React from 'react';
import {selectRivalZone} from '../ducks/game/selectors';
import {connect} from 'react-redux';
import RivalZoneComponent from '../components/RivalZoneComponent';


class RivalZoneContainer extends React.Component {
    render() {

        return (
            <div>
                <RivalZoneComponent data={this.props.left} position='left'/>
                <RivalZoneComponent data={this.props.top} position='top'/>
                <RivalZoneComponent data={this.props.right} position='right'/>
            </div>
        )
    }
}

function mapStateToProps(state) {
    return selectRivalZone(state)
}

export default connect(mapStateToProps)(RivalZoneContainer);


{/*type={this.props.top*/
}
{/*type={this.props.right*/
}
{/*type={this.props.left*/
}