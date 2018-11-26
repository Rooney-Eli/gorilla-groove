import React from 'react';
import {Api} from "../../api";
import {MusicContext} from "../../services/music-provider";

export class PlaybackControls extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			playedTrackId: null,
			lastTime: 0,
			totalTimeListened: 0,
			timeTarget: null,
			listenedTo: false
		}
	}

	componentDidMount() {
		let audio = document.getElementById('audio');
		audio.addEventListener('timeupdate', (e) => { this.handleTimeTick(e.target.currentTime) });
		audio.addEventListener('durationchange', (e) => { this.handleDurationChange(e.target.duration) });
	}

	componentDidUpdate() {
		if (!this.state.playedTrackId || this.context.playedTrack.id !== this.state.playedTrackId) {
			this.handleSongChange();
		}
	}

	// You might think that this could be calculated in handleSongChange() and not need its own function. However,
	// the duration is NOT YET KNOWN when the song changes, because it hasn't fully loaded the metadata. This event
	// triggers some time after the song change, once the metadata itself is loaded
	handleDurationChange(duration) {
		// If someone listens to 60% of a song, we want to mark it as listened to. Keep track of what that target is
		this.setState({ timeTarget: duration * 0.05 })
	}

	handleSongChange() {
		// Start playing the new song
		if (this.context.playedTrackIndex != null) {
			let audio = document.getElementById('audio');
			audio.play();

			this.setState({
				playedTrackId: this.context.playedTrack.id,
				lastTime: 0,
				totalTimeListened: 0,
				listenedTo: false
			})
		}
	}

	handleTimeTick(currentTime) {
		let newProperties = { lastTime: currentTime };

		let timeElapsed = currentTime - this.state.lastTime;
		// If the time elapsed went negative, or had a large leap forward (more than 1 second), then it means that someone
		// manually altered the song's progress. Do no other checks or updates
		if (timeElapsed < 0 || timeElapsed > 1) {
			this.setState(newProperties);
			return;
		}

		newProperties.totalTimeListened = this.state.totalTimeListened + timeElapsed;

		if (this.state.timeTarget && newProperties.totalTimeListened > this.state.timeTarget && !this.state.listenedTo) {
			newProperties.listenedTo = true;

			let playedTrack = this.context.playedTrack;
			Api.post('library/mark-listened', { userLibraryId: playedTrack.id })
				.then(() => {
					// Could grab the track data from the backend, but this update is simple to just replicate on the frontend
					playedTrack.playCount++;
					playedTrack.lastPlayed = new Date();

					// We updated the reference rather than dealing with the hassle of updating via setState for multiple collections
					// that we'd have to search and find indexes for. So issue an update to the parent component afterwards
					this.context.forceTrackUpdate();
				})
				.catch((e) => {
					console.error('Failed to update play count');
					console.error(e);
				});
		}

		this.setState(newProperties);
	}

	render() {
		let playedTrack = this.context.playedTrack;
		let src = playedTrack ? Api.getSongResourceLink(playedTrack.track.fileName) : '';
		return (
			<div>
				Now Playing: {playedTrack ? playedTrack.track.name : 'Nothing'}
				<div>
					<button>Start</button>
					<button>Stop</button>
					<audio id="audio" src={src} controls>
						Your browser is ancient. Be less ancient.
					</audio>
				</div>
			</div>
		)
	}
}
PlaybackControls.contextType = MusicContext;
