import React from 'react';
import CardComponent from '../components/CardComponent';
import EmptyComponent from '../components/EmptyComponent';
import UserComponent from './UserComponent';


class RivalZoneComponent extends React.Component {
    render() {
        const {data} = this.props;

        if (typeof data !== 'undefined' && Object.keys(data).length !== 0) {
            const {row, stackCount, remainingCardsCount, remainingStack, user} = data;
            console.log('rivalzone:', data);
            return (
                <div className={'rival-zone-' + this.props.position}>
                    {/*------Компонент юзера------*/}
                    <div style={{width: this.props.position === 'top' ? '100%' : 'auto'}}>
                        {user &&
                        <div>
                            <UserComponent user={user}/>
                        </div>

                        }

                        {stackCount > 0 ?
                            <CardComponent />
                            :
                            <EmptyComponent/>
                        }
                        {row && row.map((card, index) =>
                            <CardComponent card={card} key={index}/>
                        )}
                        {remainingStack && remainingStack.length > 0 &&
                        <CardComponent card={remainingStack[0]}/>
                        }
                        {remainingStack && remainingStack.length === 0 &&
                        <CardComponent />
                        }
                        {remainingCardsCount > 0 &&
                        <CardComponent />
                        }
                    </div>
                </div>
            )
        } else {
            return (
                <div className={'rival-zone-' + this.props.position}>
                </div>
            )
        }
    }
}

export default RivalZoneComponent;
