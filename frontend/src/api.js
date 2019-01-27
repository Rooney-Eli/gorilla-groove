const location = window.location;
const baseUrl = location + 'api/';

export class Api {

	// This will likely need to be modified when we start using URL parameters to filter things
	static get(url, params) {
		let urlParameters = Api.encodeUriParamsFromObject(params);

		return fetch(baseUrl + url + urlParameters, {
			method: 'get',
			headers: new Headers({
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${sessionStorage.getItem('token')}`
			}),
		}).then(res => res.json())
	}

	static put(url, params) {
		return Api.sendRequest('put', url, params);
	}

	static post(url, params) {
		return Api.sendRequest('post', url, params);
	}

	static delete(url, params) {
		return Api.sendRequest('delete', url, params);
	}

	static sendRequest(requestType, url, params) {
		return fetch(baseUrl + url, {
			method: requestType,
			headers: new Headers({
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${sessionStorage.getItem('token')}`
			}),
			body: JSON.stringify(params)
		}).then(res => {
			// The fetch API treats bad response codes like 4xx or 5xx as falling into the then() block
			// I don't like this behavior, since there was an issue. Throw an error so they fall into catch()
			if (!res.ok) {
				throw Error(res.statusText)
			}

			// There isn't always a response body for POSTs, and calling res.json() will create a parse error
			// in the console, even within a try / catch. Really this is probably an issue with the server
			// and it probably shouldn't return empty responses. But that sounds more difficult to tackle
			res.text().then(function(text) {
				return text ? JSON.parse(text) : {}
			})
		})
	};


	static upload(url, file) {
		let body = new FormData();
		body.append('file', file);

		return fetch(baseUrl + url, {
			method: 'post',
			headers: new Headers({
				'Authorization': `Bearer ${sessionStorage.getItem('token')}`
			}),
			body: body
		})
	}

	static getSongResourceLink(fileName) {
		return `${location}music/${fileName}?t=${sessionStorage.getItem('token')}`;
	}

	static getAlbumArtResourceLink(userTrack) {
		let artId = userTrack.id;
		let parentDirectory = parseInt(artId / 1000);
		return `${location}album-art/${parentDirectory}/${artId}.png?t=${sessionStorage.getItem('token')}`;
	}

	static encodeUriParamsFromObject(params) {
		if (!params || Object.keys(params).length === 0) {
			return '';
		}

		let queryString = Object.keys(params).map(key => {
			// Spring wants multiple sort terms passed in like
			// sort=title,asc&sort=album,asc&sort=artist,asc
			// so repeat the sort term for each item, if we are dealing with the sort term
			if (key === 'sort') {
				return params[key].map(sortItem => {
					return `sort=${sortItem}`
				}).join('&')
			} else {
				let encodedKey = encodeURIComponent(key);
				let encodedValue = encodeURIComponent(params[key]);
				return `${encodedKey}=${encodedValue}`
			}
		}).join('&');

		return '?' + queryString;
	}
}
