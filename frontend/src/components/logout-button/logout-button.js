import React from 'react';
import {withRouter} from "react-router-dom";
import {Api} from "../../api";

class LogoutButtonInternal extends React.Component {
	constructor(props) {
		super(props);
	}

	logout(event) {
		event.preventDefault();
		Api.post('authentication/logout', {
			token: sessionStorage.getItem('token')
		}).catch((error) => {
			console.error(error)
		}).finally(() => {
			sessionStorage.removeItem('token');
			this.props.history.push('/login'); // Redirect to the login page now that we logged out
		});
	}

	render() {
		return (
			// href isn't used, but providing one makes the 'Logout' look like a clickable link for now
			<a href="" onClick={this.logout.bind(this)}>Logout</a>
		)
	}
}

// This page uses the router history. In order to gain access to the history, the class needs
// to be exported wrapped by the router. Now inside of LogoutButtonInternal, this.props will have a history object
export const LogoutButton = withRouter(LogoutButtonInternal);
