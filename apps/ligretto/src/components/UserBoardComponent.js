import React from 'react';
import ActiveZoneContainer from '../containers/ActiveZoneContainer';
import PlayingZoneContainer from '../containers/PlayingZoneContainer';
import RivalZoneContainer from '../containers/RivalZoneContainer';

class TableComponent extends React.Component {
    render() {
        return (
            <div className="main">
                <RivalZoneContainer />
                <PlayingZoneContainer />
                <ActiveZoneContainer />
            </div>
        )
    }
}

export default TableComponent;