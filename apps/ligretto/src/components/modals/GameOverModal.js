import React from "react";
import {selectGameOver} from '../../ducks/game/selectors';
import {connect} from 'react-redux';
import {Modal} from 'react-bootstrap';
import Button from 'react-bootstrap/es/Button';

import actions from '../../ducks/game/actions';
import UserComponent from '../UserComponent';
import {Link} from 'react-router-dom';

class GameOverModal extends React.Component {

    render() {
        const {gameOver} = this.props;

        if (!gameOver) return false;

        return (
            <Modal backdrop={false} {...this.props} bsSize="large" aria-labelledby="contained-modal-title-lg">
                <Modal.Header closeButton>
                    <Modal.Title id="contained-modal-title-lg">Результаты</Modal.Title>
                </Modal.Header>
                <Modal.Body bsClass="modal-body gameOver_Modal">
                    <div className="modal__player modal__winner row h-100">
                        <div className="col-xs-3">
                            <UserComponent user={gameOver.winner}/>
                        </div>
                        <div className="col-xs-6 ">
                            <span className="modal__player_status">Winner <span className="mobile">({gameOver.winner.username})</span></span>
                        </div>
                        <div className="col-xs-3">
                            <span className="modal__player_score">{gameOver.winner.score}</span>
                        </div>
                    </div>
                    {gameOver.players.map((player, index) => (
                        <div className="modal__player row" key={index}>
                            <div className="col-xs-3">
                                <UserComponent user={player}/>
                            </div>
                            <div className="col-xs-6">
                                <span className="modal__player_status">Loser <span className="mobile">({player.username})</span></span>
                            </div>
                            <div className="col-xs-3">
                                <span className="modal__player_score">{player.score}</span>
                            </div>
                        </div>
                    ))}
                </Modal.Body>
                <Modal.Footer>
                    <Link to='/'><Button onClick={this.props.onHide}>Close</Button></Link>
                </Modal.Footer>
            </Modal>
        )
    }
}

function mapStateToProps(state) {
    return selectGameOver(state)
}


function mapDispatchToProps(dispatch) {
    return {
        onHide: () => {
            dispatch(actions.hideGameOverModal());
        }
    }
}


export default connect(mapStateToProps, mapDispatchToProps)(GameOverModal);