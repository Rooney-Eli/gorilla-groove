import React from "react";
import {Api} from "../api";
import {TrackView} from "../enums/track-view";
import * as LocalStorage from "../local-storage";
import * as Util from "../util";
import {toast} from "react-toastify";
import {findSpotInSortedArray} from "../util";
import {getAllPossibleDisplayColumns} from "../util";

export const MusicContext = React.createContext();

export class MusicProvider extends React.Component {
	constructor(props) {
		super(props);

		this.pageSize = 75;

		this.state = {
			viewedTracks: [],
			loadingTracks: false,
			trackView: TrackView.LIBRARY,
			viewedEntityId: null, // An ID for the user or library being viewed, or null if viewing the user's own library
			totalTracksToFetch: 0,
			currentSort: [
				{ column: 'artist', isAscending: true },
				{ column: 'album', isAscending: true, hidden: true },
				{ column: 'trackNumber', isAscending: true, hidden: true }
			],
			nowPlayingTracks: [],
			playedTrack: null,
			playedTrackIndex: null,
			playlists: [],
			songIndexesToShuffle: [],
			shuffledSongIndexes: [],
			shuffleSongs: LocalStorage.getBoolean('shuffleSongs', false),
			shuffleChaos: LocalStorage.getNumber('shuffleChaos', 1),
			repeatSongs: LocalStorage.getBoolean('repeatSongs', false),
			columnPreferences: this.loadColumnPreferences(),
			sessionPlayCounter: 0, // This determines when to "refresh" our now playing song, because you can play an identical song back to back and it's difficult to detect a song change otherwise
			renderCounter: 0, // Used to determine if we should rerender this component (and therefore most of the site because this component is too large)

			ownPermissions: new Set(), // FIXME Makes NO sense to be in this context. Need to figure out how to make more than one

			loadSongsForUser: (...args) => this.loadSongsForUser(...args),
			loadMoreTracks: (...args) => this.loadMoreTracks(...args),
			reloadTracks: (...args) => this.reloadTracks(...args),
			setSort: (...args) => this.setSort(...args),
			addUploadToExistingLibraryView: (...args) => this.addUploadToExistingLibraryView(...args),
			forceTrackUpdate: (...args) => this.forceTrackUpdate(...args),
			playFromTrackIndex: (...args) => this.playFromTrackIndex(...args),
			playTracks: (...args) => this.playTracks(...args),
			playTracksNext: (...args) => this.playTracksNext(...args),
			playTracksLast: (...args) => this.playTracksLast(...args),
			playNext: (...args) => this.playNext(...args),
			playPrevious: (...args) => this.playPrevious(...args),
			deleteTracks: (...args) => this.deleteTracks(...args),
			setPrivate: (...args) => this.setPrivate(...args),
			importTracks: (...args) => this.importTracks(...args),
			loadPlaylists: (...args) => this.loadPlaylists(...args),
			deletePlaylist: (...args) => this.deletePlaylist(...args),
			loadSongsForPlaylist: (...args) => this.loadSongsForPlaylist(...args),
			addToPlaylist: (...args) => this.addToPlaylist(...args),
			createPlaylist: (...args) => this.createPlaylist(...args),
			removeFromPlaylist: (...args) => this.removeFromPlaylist(...args),
			removeFromNowPlaying: (...args) => this.removeFromNowPlaying(...args),
			trimTrack: (...args) => this.trimTrack(...args),
			updateTracks: (...args) => this.updateTracks(...args),
			renamePlaylist: (...args) => this.renamePlaylist(...args),
			setRepeatSongs: (...args) => this.setRepeatSongs(...args),
			setShuffleSongs: (...args) => this.setShuffleSongs(...args),
			setShuffleChaos: (...args) => this.setShuffleChaos(...args),
			setColumnPreferences: (...args) => this.setColumnPreferences(...args),
			setProviderState: (...args) => this.setProviderState(...args),
			resetColumnPreferences: (...args) => this.resetColumnPreferences(...args),
			resetSessionState: (...args) => this.resetSessionState(...args)
		};
	}

	// A user's column preferences are stored in local storage in an object like
	// [{ name: 'Name', enabled: true }, { name: 'Artist', enabled: false }]
	loadColumnPreferences() {
		// Grab the (potentially) already existing preferences
		const columnOptions = getAllPossibleDisplayColumns();

		let columnPreferences = LocalStorage.getObject('columnPreferences');

		// If the preferences already existed, we need to check if any new columns were added
		// since the user last logged in.
		if (columnPreferences) {
			let savedColumns = columnPreferences.map(columnPref => columnPref.name );
			let newColumns = Util.arrayDifference(columnOptions, savedColumns);

			if (newColumns.length > 0) {
				// We have new columns to add. Initialize them and add them to the column preferences
				columnPreferences = columnPreferences.concat(newColumns.map(trackColumnName => {
					return { name: trackColumnName, enabled: true };
				}));
				LocalStorage.setObject('columnPreferences', columnPreferences);
			}

		} else {
			// No pre-existing column preferences were found. Enable them all
			columnPreferences = columnOptions.map(trackColumnName => {
				return { name: trackColumnName, enabled: true };
			})
		}

		return columnPreferences;
	}

	buildTrackLoadParams(params) {
		if (!params.size) {
			params.size = this.pageSize;
		}
		if (!params.page) {
			params.page = 0;
		}

		const searchTerm = this.props.filterContext.searchTerm.trim();
		if (searchTerm) {
			params.searchTerm = searchTerm;
		}
		params.showHidden = params.showHidden !== undefined ? params.showHidden : this.props.filterContext.showHidden;
	}

	loadSongsForUser(userId, params, append) {
		params = params ? params : {};
		const newState = {
			loadingTracks: true,
			renderCounter: this.state.renderCounter + 1
		};

		// If userId is null, the backend uses the current user
		if (userId) {
			params.userId = userId;
			newState.trackView = TrackView.USER;
			newState.viewedEntityId = userId;
			if (this.state.trackView !== TrackView.USER) {
				newState.showHidden = true;
				params.showHidden = true;
			}
		} else {
			newState.trackView = TrackView.LIBRARY;
			newState.viewedEntityId = null;
			if (this.state.trackView !== TrackView.LIBRARY) {
				newState.showHidden = false;
				params.showHidden = false;
			}
		}

		if (!params.sort) {
			params.sort = this.buildTrackSortParameter(false);
		}

		this.buildTrackLoadParams(params);

		if (!append) {
			newState.viewedTracks = [];
		}

		this.setState(newState);

		return Api.get('track', params).then(result => {
			this.addTracksToView(result, append);
		}).catch((error) => {
			console.error(error)
		}).finally(() => this.setState({
			loadingTracks: false,
			renderCounter: this.state.renderCounter + 1
		}));
	}

	loadMoreTracks() {
		const page = parseInt(this.state.viewedTracks.length / this.pageSize);

		if (this.state.trackView === TrackView.USER || this.state.trackView === TrackView.LIBRARY) {
			return this.loadSongsForUser(this.state.viewedEntityId, { page: page }, true);
		} else if (this.state.trackView === TrackView.PLAYLIST) {
			return this.loadSongsForPlaylist(this.state.viewedEntityId, { page: page }, true);
		}
	}

	reloadTracks() {
		if (this.state.trackView === TrackView.USER || this.state.trackView === TrackView.LIBRARY) {
			this.loadSongsForUser(this.state.viewedEntityId, {}, false);
		} else if (this.state.trackView === TrackView.PLAYLIST) {
			this.loadSongsForPlaylist(this.state.viewedEntityId, {}, false);
		}
	}

	buildTrackSortParameter(usePlaylistKeys) {
		// Build the parameters like the backend expects them in the query string
		return this.state.currentSort.map(sortObject => {
			// Messing around with the JPA sorting setup is more hassle than it is worth
			// For sorting playlists, just append 'track.' in front so the key is correct for playlist tracks
			const key = usePlaylistKeys ? 'track.' + sortObject.column : sortObject.column;
			return key + ',' + (sortObject.isAscending ? 'ASC' : 'DESC')
		});
	}

	setSort(sort) {
		const augmentedSort = sort.slice(0);

		const sortedColumns = new Set(sort.map(it => it.column));
		// artist / year
		if ((sortedColumns.has('artist') || sortedColumns.has('releaseYear')) && !sortedColumns.has('album')) {
			augmentedSort.push({ column: 'album', isAscending: true, hidden: true });
			sortedColumns.add('album');
		}

		if (sortedColumns.has('album') && !sortedColumns.has('trackNumber')) {
			augmentedSort.push({ column: 'trackNumber', isAscending: true , hidden: true});
		}

		// There are implicit secondary sorts that need to be added if the user didn't pick stuff
		this.setState({ currentSort: augmentedSort }, this.reloadTracks);
	}

	addUploadToExistingLibraryView(track) {
		if (this.state.trackView !== TrackView.LIBRARY) {
			return;
		}

		const newTrackIndex = findSpotInSortedArray(track, this.state.viewedTracks, this.state.currentSort);
		this.state.viewedTracks.splice(newTrackIndex, 0, track);

		this.setState({
			viewedTracks: this.state.viewedTracks,
			renderCounter: this.state.renderCounter + 1
		});
	}

	playFromTrackIndex(trackIndex, updateNowPlaying) {
		const newState = {
			playedTrackIndex: trackIndex,
			sessionPlayCounter: this.state.sessionPlayCounter + 1
		};

		if (updateNowPlaying) {
			newState.nowPlayingTracks = this.state.viewedTracks.slice(0);
			newState.playedTrack = this.state.viewedTracks[trackIndex];
		} else {
			newState.playedTrack = this.state.nowPlayingTracks[trackIndex];
		}

		this.setState(newState, () => this.resetShuffleIndexes(trackIndex));
	}

	playTracks(tracks) {
		let startIndex = this.state.shuffleSongs ? Math.floor(Math.random() * tracks.length) : 0;
		this.setState({
			nowPlayingTracks: tracks,
			playedTrack: tracks[startIndex],
			playedTrackIndex: startIndex,
			sessionPlayCounter: this.state.sessionPlayCounter + 1
		}, () => this.resetShuffleIndexes(startIndex));
	}

	playTracksNext(tracks) {
		let newTracks = this.state.nowPlayingTracks.slice(0);
		newTracks.splice(this.state.playedTrackIndex + 1, 0, ...tracks);

		this.setState({
			nowPlayingTracks: newTracks,
			renderCounter: this.state.renderCounter + 1
		});

		this.addTrackIndexesToShuffle(this.state.playedTrackIndex, tracks.length);
	}

	playTracksLast(tracks) {
		let newTracks = this.state.nowPlayingTracks.slice(0);
		newTracks.splice(this.state.nowPlayingTracks.length, 0, ...tracks);

		this.setState({
			nowPlayingTracks: newTracks,
			renderCounter: this.state.renderCounter + 1
		});

		this.addTrackIndexesToShuffle(this.state.nowPlayingTracks.length - 1, tracks.length);
	}

	forceTrackUpdate() {
		this.setState({
			nowPlayingTracks: this.state.nowPlayingTracks,
			viewedTracks: this.state.viewedTracks,
			renderCounter: this.state.renderCounter + 1
		});
	}

	// newTrackIndex is the song index in the now playing list
	playIndex(newTrackIndex) {
		// If we're shuffling, we need to remove this song from the shuffle pool after we play it
		if (this.state.shuffleSongs) {
			// Couldn't resist this horrible variable name
			let indexIndex = this.state.songIndexesToShuffle.findIndex(index => index === newTrackIndex);

			// Now that we know where the song index is, in our array of indexes we can still pick, remove the indexIndex
			let newShuffleIndexes = this.state.songIndexesToShuffle.slice(0);
			newShuffleIndexes.splice(indexIndex, 1);

			let newShuffleHistory = this.state.shuffledSongIndexes.slice(0);
			newShuffleHistory.push(newTrackIndex);

			this.setState({
				songIndexesToShuffle: newShuffleIndexes,
				shuffledSongIndexes: newShuffleHistory
			});
		}

		this.setState({
			playedTrackIndex: newTrackIndex,
			playedTrack: this.state.nowPlayingTracks[newTrackIndex],
			sessionPlayCounter: this.state.sessionPlayCounter + 1
		})
	}

	// Returns true if another song could be played. False otherwise
	playNext() {
		if (this.state.shuffleSongs) {
			// If we're shuffling and have more songs to shuffle through, play a random song
			if (this.state.songIndexesToShuffle.length > 0) {
				this.playIndex(this.getRandomShuffleIndex());

				return true;
				// If we are out of songs to shuffle through, but ARE repeating, reset the shuffle list and pick a random one
			} else if (this.state.repeatSongs) {
				this.resetShuffleIndexes();
				this.playIndex(this.getRandomShuffleIndex());

				return true;
			}
		} else {
			// If we aren't shuffling, and we have more songs, just pick the next one
			if (this.state.playedTrackIndex + 1 < this.state.nowPlayingTracks.length) {
				this.playIndex(this.state.playedTrackIndex + 1);

				return true;
				// Otherwise, if we have run out of songs, but are repeating, start back over from 0
			} else if (this.state.repeatSongs) {
				this.playIndex(0);

				return true;
			}
		}

		return false;
	}

	getRandomShuffleIndex() {
		let shuffleIndexes = this.state.songIndexesToShuffle;

		if (this.state.shuffleChaos > 1) {
			if (Math.random() + 1 < this.state.shuffleChaos) {
				const highestPlay = this.state.songIndexesToShuffle.reduce((max, index) => {
					const track = this.state.nowPlayingTracks[index];
					return track.playCount > max ? track.playCount : max;
				}, 0);

				shuffleIndexes = this.state.songIndexesToShuffle.filter(index =>
					this.state.nowPlayingTracks[index].playCount === highestPlay
				);
			}
		} else if (this.state.shuffleChaos < 1) {
			if (Math.random() > this.state.shuffleChaos) {
				const lowestPlay = this.state.songIndexesToShuffle.reduce((min, index) => {
					const track = this.state.nowPlayingTracks[index];
					return track.playCount < min ? track.playCount : min;
				}, Number.MAX_VALUE);

				shuffleIndexes = this.state.songIndexesToShuffle.filter(index =>
					this.state.nowPlayingTracks[index].playCount === lowestPlay
				);
			}
		}

		return shuffleIndexes[Math.floor(Math.random() * shuffleIndexes.length)];
	}

	playPrevious() {
		if (this.state.shuffleSongs) {
			let shuffledSongIndexes = this.state.shuffledSongIndexes.slice(0);
			if (shuffledSongIndexes.length === 1) {
				// Someone hit play previous on the first song they played. Just start it over
				this.setState({ sessionPlayCounter: this.state.sessionPlayCounter + 1 });
			} else if (shuffledSongIndexes.length > 1) {
				const currentIndex = shuffledSongIndexes.pop();
				const previousIndex = shuffledSongIndexes.pop();

				const indexesToShuffle = this.state.songIndexesToShuffle.slice(0);
				indexesToShuffle.push(currentIndex);
				indexesToShuffle.push(previousIndex);

				this.setState({
					shuffledSongIndexes: shuffledSongIndexes,
					songIndexesToShuffle: indexesToShuffle
				}, () => this.playIndex(previousIndex));
			}
		} else {
			if (this.state.playedTrackIndex > 0) {
				this.playIndex(this.state.playedTrackIndex - 1);
			} else if (this.state.repeatSongs) {
				this.playIndex(this.state.nowPlayingTracks.length - 1);
			} else {
				// Someone hit play previous on the first song they played. Just start it over
				this.setState({ sessionPlayCounter: this.state.sessionPlayCounter + 1 });
			}
		}
	}

	setPrivate(tracks, isPrivate) {
		return Api.post('track/set-private', {
			trackIds: tracks.map(track => track.id),
			isPrivate
		}).then(() => {
			tracks.forEach(track => track.private = isPrivate);
			this.forceTrackUpdate();
		});
	}

	// noinspection JSMethodCanBeStatic
	importTracks(tracks) {
		return Api.post('track/import', {
			trackIds: tracks.map(track => track.id)
		});
	}

	deleteTracks(tracks) {
		return Api.delete('track', {
			trackIds: tracks.map(track => track.id)
		}).then(() => {
			// Call reloadTracks() with no arguments, which will reload the songs for our view (and flush out the deleted ones)
			this.reloadTracks();
		})
	}

	loadPlaylists() {
		return Api.get('playlist').then(playlists => {
			this.setState({
				playlists: playlists,
				renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
			});
		})
	}

	deletePlaylist(playlist) {
		const deleteId = playlist.id;
		return Api.delete(`playlist/${deleteId}`).then(() => {
			const newPlaylists = this.state.playlists.filter(playlist => playlist.id !== deleteId);
			this.setState({
				playlists: newPlaylists,
				renderCounter: this.state.renderCounter + 1
			});

			if (this.state.trackView === TrackView.PLAYLIST && this.state.viewedEntityId === deleteId) {
				this.loadSongsForUser();
			}
		})
	}

	loadSongsForPlaylist(playlistId, params, append) {
		params = params ? params : {};
		params.playlistId = playlistId;

		params.sort = this.buildTrackSortParameter(true);

		this.buildTrackLoadParams(params);

		this.setState({
			trackView: TrackView.PLAYLIST,
			viewedEntityId: playlistId,
			loadingTracks: true,
			renderCounter: this.state.renderCounter + 1
		});

		if (!append) {
			this.setState({ viewedTracks: [] });
		}

		return Api.get('playlist/track', params).then(result => {
			// We need to store the playlistTrackId for later, in case we want to remove an entry from the playlist
			// Add this as extra data to the track data, to make sharing the track-list view easy between playlist
			// views, and library / user views
			result.content = result.content.map(playlistTrack => {
				let trackData = playlistTrack.track;
				trackData.playlistTrackId = playlistTrack.id;
				return trackData
			});
			this.addTracksToView(result, append);
		}).finally(() => this.setState({
			loadingTracks: false,
			renderCounter: this.state.renderCounter + 1
		}));
	}

	addTracksToView(result, append) {
		this.setState({ totalTracksToFetch: result.totalElements });

		if (append) {
			// IF WE ARE APPENDING
			// Assuming we have 75 as our page size, we could have loaded in 1 page, giving us 75 tracks
			// We could have then uploaded a track, that was automatically added to our library if it was
			// sorted into those first 75 tracks. This would give us 76 tracks. We now fetch the 2nd page
			// of tracks, giving us 75 more. However, the 1st track in this request, will actually be the
			// 75th track from before, as it got bumped up with the newly added track. Thus, we mod our
			// total tracks by the page size here, and drop the appropriate number from the beginning of
			// the result. This will give us 2 pages, 150 tracks, with no duplication

			let tracksToDrop = this.state.viewedTracks.length % this.pageSize;
			result.content.splice(0, tracksToDrop);

			this.setState({ viewedTracks: this.state.viewedTracks.concat(result.content) })
		} else {
			this.setState({ viewedTracks: result.content });
		}
	}

	addToPlaylist(playlistId, trackIds) {
		return Api.post('playlist/track', {
			playlistId: playlistId,
			trackIds: trackIds
		}).then(() => {
			console.log("Wow, Ayrton. Great moves. Keep it up. I'm proud of you.");
		})
	}

	removeFromPlaylist(playlistTrackIds) {
		// It's kind of dumb to assume that the playlist we're deleting from is the one we're looking at
		// It's always true right now. But maybe it won't be one day and this will be problematic
		let playlistId = this.state.viewedEntityId;

		return Api.delete('playlist/track', {
			playlistTrackIds: playlistTrackIds
		}).then(() => {
			// Make sure we're still looking at the same playlist before we force the reload
			if (this.state.trackView === TrackView.PLAYLIST && this.state.viewedEntityId === playlistId) {
				let newViewedTracks = this.state.viewedTracks.slice(0);

				// This is a pretty inefficient way to remove stuff. But it's probably fine... right?
				playlistTrackIds.forEach(playlistTrackId => {
					let trackIndex = newViewedTracks.findIndex(track => track.playlistTrackId === playlistTrackId);
					newViewedTracks.splice(trackIndex, 1);
				});

				this.setState({
					viewedTracks: newViewedTracks,
					renderCounter: this.state.renderCounter + 1
				})
			}
		});
	}

	removeFromNowPlaying(trackIndexes) {
		let trackIdSet = new Set(trackIndexes);
		let newNowPlaying = this.state.nowPlayingTracks.filter((track, index) => !trackIdSet.has(index));

		// Handle changing the currently playing song, if we need to
		if (trackIdSet.has(this.state.playedTrackIndex)) {
			// If a song we removed was playing, just stop playing altogether. Might try to do more stuff later
			this.setState({
				playedTrackIndex: null,
				playedTrack: null,
			});
		} else if (this.state.playedTrackIndex !== null) {
			// If we removed tracks BEFORE our now playing track index (i.e. we are playing the 10th song and
			// we removed the 5th song) then we need to shift the now playing track index up by the number of
			// tracks we removed less than the currently played track index
			let indexesToRemove = 0;
			trackIdSet.forEach( indexRemoved => {
				if (indexRemoved < this.state.playedTrackIndex) {
					indexesToRemove++;
				}
			});
			this.setState({ playedTrackIndex: this.state.playedTrackIndex - indexesToRemove });
		}

		this.setState({
			nowPlayingTracks: newNowPlaying,
			renderCounter: this.state.renderCounter + 1
		});
	}

	createPlaylist() {
		Api.post('playlist', {name: 'New Playlist'})
			.then(playlist => {
				let playlists = this.state.playlists.slice(0);
				playlists.push(playlist);

				this.setState({
					playlists: playlists,
					renderCounter: this.state.renderCounter + 1
				});

				toast.success('New playlist created')
			})
			.catch(error => {
				console.error(error);
				toast.error('The creation of a new playlist failed');
			});
	}

	updateTracks(tracks, albumArt, trackData) {
		trackData.trackIds = tracks.map(track => track.id);

		// Update the local track data to be in sync
		tracks.forEach(track => {
			Object.keys(trackData).forEach(property => {
				track[property] = trackData[property];
			});
		});

		const params = { updateTrackJson: JSON.stringify(trackData) };
		if (albumArt) {
			params.albumArt = albumArt;
		}

		// Use Api.upload here because we might have image data
		return Api.upload('PUT', 'track', params).catch(error => {
			console.error(error);
			toast.error("Failed to updated song data")
		})
	}

	// noinspection JSMethodCanBeStatic
	trimTrack(track, startTime, duration) {
		let params = { trackId: track.id };
		if (startTime.length > 0) {
			params.startTime = startTime;
		}

		if (duration.length > 0) {
			params.duration = duration;
		}

		return Api.post('track/trim', params).then(res => {
			track.length = res.newLength;
		})
	}

	renamePlaylist(playlist, newName) {
		playlist.name = newName;

		this.setState({
			playlists: this.state.playlists,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		});

		return Api.put(`playlist/${playlist.id}`, { name: newName }).catch((error) => {
			console.error(error);
			toast.error("Failed to updated playlist name")
		})
	}

	setShuffleSongs(shuffleSongs) {
		this.setState({
			shuffleSongs: shuffleSongs,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		}, () => {
			if (shuffleSongs) {
				this.resetShuffleIndexes(this.state.playedTrackIndex);
			}
		});
		LocalStorage.setBoolean('shuffleSongs', shuffleSongs);
	}

	setShuffleChaos(shuffleChaos) {
		this.setState({
			shuffleChaos,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		});
		LocalStorage.setNumber('shuffleChaos', shuffleChaos);
	}

	setRepeatSongs(repeatSongs) {
		this.setState({
			repeatSongs: repeatSongs,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		});
		LocalStorage.setBoolean('repeatSongs', repeatSongs);
	}

	setColumnPreferences(columnPreferences) {
		this.setState({
			columnPreferences: columnPreferences,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		});
		LocalStorage.setObject('columnPreferences', columnPreferences);
	}

	setProviderState(state, reloadSongs) {
		const reloadCallback = () => {
			if (reloadSongs) {
				this.reloadTracks();
			}
		};
		this.setState(state, reloadCallback);
	}

	resetColumnPreferences() {
		LocalStorage.deleteKey('columnPreferences');
		const preferences = this.loadColumnPreferences();
		this.setState({
			columnPreferences: preferences,
			renderCounter: this.state.renderCounter + 1 // TODO move this out of this context and into the filter one
		});
	}

	resetSessionState() {
		this.props.filterContext.resetState();

		this.setState({
			playedTrack: null,
			playedTrackIndex: null
		})
	}

	resetShuffleIndexes(withoutIndex) {
		if (!this.state.shuffleSongs) {
			return;
		}

		const indexes = Util.range(0, this.state.nowPlayingTracks.length);
		if (withoutIndex !== undefined) {
			indexes.splice(withoutIndex, 1);
		}

		this.setState({
			songIndexesToShuffle: indexes,
			shuffledSongIndexes: [withoutIndex]
		})
	}

	// Need to add the new tracks to the shuffle selection or they won't get played until the next run through the playlist
	addTrackIndexesToShuffle(startingIndex, numTracksToAdd) {
		if (!this.state.shuffleSongs) {
			return;
		}

		let adjustedIndexes = [];

		// Adjust the indexes of any songs that are 'after' our new songs on the playlist
		this.state.songIndexesToShuffle.forEach(songIndex => {
			if (songIndex > startingIndex) {
				adjustedIndexes.push(songIndex + numTracksToAdd);
			} else {
				adjustedIndexes.push(songIndex);
			}
		});

		for (let i = 0; i < numTracksToAdd; i++) {
			adjustedIndexes.push(startingIndex + i + 1);
		}

		this.setState({ songIndexesToShuffle: adjustedIndexes })
	}

	shouldComponentUpdate(nextProps, nextState) {
		return this.state.renderCounter !== nextState.renderCounter
			|| this.state.sessionPlayCounter !== nextState.sessionPlayCounter;
	}

	render() {
		return (
			<MusicContext.Provider value={this.state}>
				{this.props.children}
			</MusicContext.Provider>
		)
	}
}
