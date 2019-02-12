import React from 'react';
import {Api} from "../../api";
import {MusicContext} from "../../services/music-provider";
import {formatTimeFromSeconds} from "../../formatters";

export class PlaybackControls extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			currentSessionPlayCounter: 0, // Used to detect when we should play a new song
			lastTime: 0,
			currentTimePercent: 0,
			totalTimeListened: 0,
			timeTarget: null,
			duration: 0,
			listenedTo: false,
			songUrl: null,
			volume: 1,
			muted: false,
			playing: false
		}
	}

	componentDidMount() {
		let audio = document.getElementById('audio');
		audio.addEventListener('timeupdate', (e) => { this.handleTimeTick(e.target.currentTime) });
		audio.addEventListener('durationchange', (e) => { this.handleDurationChange(e.target.duration) });
		audio.addEventListener('ended', () => { this.handleSongEnd() });
	}

	handleSongEnd() {
		let playingNewSong = this.context.playNext();
		if (!playingNewSong) {
			this.setState({
				playing: false
			})
		}
	}

	componentDidUpdate() {
		// No track to play. Nothing to do
		if (!this.context.playedTrack) {
			return;
		}

		// If our track and time haven't changed, there is nothing to do
		// This breaks some problems with infinite re-rendering we can get into otherwise
		if (this.context.sessionPlayCounter === this.state.currentSessionPlayCounter) {
			return;
		}

		this.handleSongChange();
	}

	// You might think that this could be calculated in handleSongChange() and not need its own function. However,
	// the duration is NOT YET KNOWN when the song changes, because it hasn't fully loaded the metadata. This event
	// triggers some time after the song change, once the metadata itself is loaded
	handleDurationChange(duration) {
		// If someone listens to 60% of a song, we want to mark it as listened to. Keep track of what that target is
		this.setState({
			timeTarget: duration * 0.60,
			duration: duration
		})
	}

	handleSongChange() {
		if (this.context.playedTrackIndex == null) {
			this.setState({ playing: false });
			return;
		}

		// TODO It's probably actually better to have this fetching happen in the music context
		// so that the album art and the song controls aren't both having to fetch them separate
		Api.get('file/link/' + this.context.playedTrack.id).then((links) => {

			// Start playing the new song
			this.setState({
				currentSessionPlayCounter: this.context.sessionPlayCounter,
				lastTime: 0,
				currentTime: 0,
				totalTimeListened: 0,
				duration: 0,
				listenedTo: false,
				songUrl: this.getSongLink(links),
				playing: true
			}, () => {
				let audio = document.getElementById('audio');
				audio.currentTime = 0;
				audio.src = this.getSongLink(links);
				audio.play();
			})
		});
	}

	// noinspection JSMethodCanBeStatic
	getSongLink(links) {
		if (links.usingS3) {
			return links.songLink;
		} else {
			return links.songLink + '?t=' + sessionStorage.getItem('token');
		}
	}

	handleTimeTick(currentTime) {
		let newProperties = { lastTime: currentTime };

		if (this.state.duration > 0) {
			newProperties.currentTimePercent = currentTime / this.state.duration;
		}

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
			Api.post('track/mark-listened', { trackId: playedTrack.id })
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

	changeVolume(event) {
		console.log("Change volume");
		let audio = document.getElementById('audio');
		let volume = event.target.value;

		audio.volume = volume;
		this.setState({ volume: volume });
	}

	// noinspection JSMethodCanBeStatic
	changePlayTime(event) {
		let audio = document.getElementById('audio');
		let playPercent = event.target.value;

		// Don't need to update state, as an event will fire and we will handle it afterwards
		audio.currentTime = playPercent * audio.duration;
	}

	getDisplayedSongName() {
		const playedTrack = this.context.playedTrack;
		if (!playedTrack) {
			return '';
		} else if (playedTrack.name && playedTrack.artist) {
			return `${playedTrack.name} - ${playedTrack.artist}`
		} else if (playedTrack.name) {
			return playedTrack.name
		} else if (playedTrack.artist) {
			return playedTrack.artist
		} else {
			return '-----'
		}
	}

	getVolumeIcon() {
		if (this.state.muted) {
			return 'fa-volume-mute'
		} else if (this.state.volume > 0.5) {
			return 'fa-volume-up';
		} else if (this.state.volume > 0) {
			return 'fa-volume-down'
		} else {
			return 'fa-volume-off'
		}
	}

	togglePause() {
		let playing = this.state.playing;
		let audio = document.getElementById('audio');
		if (playing) {
			audio.pause();
		} else {
			audio.play();
		}

		this.setState({ playing: !playing });
	}

	toggleMute() {
		let audio = document.getElementById('audio');
		audio.muted = !this.state.muted;

		this.setState({ muted: !this.state.muted });
	}

	render() {
		let playedTrack = this.context.playedTrack;
		let src = playedTrack ? this.state.songUrl : '';
		return (
			<div className="playback-controls">
				<audio id="audio" src={src}>
					Your browser is ancient. Be less ancient.
				</audio>

				<div className="played-song-name">
					{this.getDisplayedSongName()}
				</div>

				<div>
					<div>
						<i
							onClick={() => this.context.playPrevious()}
							className="fas fa-fast-backward control"
						/>
						<i
							onClick={() => this.togglePause()}
							className={`fas fa-${this.state.playing ? 'pause' : 'play'} control`}
						/>
						<i
							onClick={() => this.context.playNext()}
							className="fas fa-fast-forward control"
						/>
						<i
							onClick={() => this.context.setShuffleSongs(!this.context.shuffleSongs)}
							className={`fas fa-random control ${this.context.shuffleSongs ? 'enabled' : ''}`}
						/>
						<i
							onClick={() => this.context.setRepeatSongs(!this.context.repeatSongs)}
							className={`fas fa-sync-alt control ${this.context.repeatSongs ? 'enabled' : ''}`}
						/>
					</div>
					<div className="play-time-wrapper">
						<div>
							{formatTimeFromSeconds(this.state.currentTimePercent * this.state.duration)} / {formatTimeFromSeconds(this.state.duration)}
						</div>
						<input
							type="range"
							className="time-slider"
							onChange={(e) => this.changePlayTime(e)}
							min="0"
							max="1"
							step="0.01"
							value={this.state.currentTimePercent}
						/>
					</div>
					<div className="volume-wrapper">
						<i
							className={`fas ${this.getVolumeIcon()}`}
							onClick={() => this.toggleMute()}
						/>
						<input
							type="range"
							className="volume-slider"
							onChange={(e) => this.changeVolume(e)}
							min="0"
							max="1"
							step="0.01"
						/>
					</div>
				</div>
			</div>
		)
	}
}
PlaybackControls.contextType = MusicContext;
