package com.gorilla.gorillagroove.ui

import android.os.Bundle
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaControllerCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.hilt.lifecycle.ViewModelInject
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModel
import com.gorilla.gorillagroove.model.Track
import com.gorilla.gorillagroove.repository.MainRepository
import com.gorilla.gorillagroove.service.EMPTY_PLAYBACK_STATE
import com.gorilla.gorillagroove.service.MusicServiceConnection
import com.gorilla.gorillagroove.util.Constants
import com.gorilla.gorillagroove.util.KtLiveData

class PlayerControlsViewModel @ViewModelInject constructor(
    private val repository: MainRepository,
    musicServiceConnection: MusicServiceConnection
) : ViewModel() {
    private val transportControls: MediaControllerCompat.TransportControls by lazy { musicServiceConnection.transportControls }

    private var updatePosition = true

    //Controls and Player Data
    private val _currentTrackItem: MutableLiveData<MediaMetadataCompat> = MutableLiveData()
    val currentTrackItem: LiveData<MediaMetadataCompat>
        get() = _currentTrackItem

    private val _playbackState = KtLiveData(EMPTY_PLAYBACK_STATE)
    val playbackState: LiveData<PlaybackStateCompat>
        get() = _playbackState

    private val _repeatState: MutableLiveData<Int> = MutableLiveData()
    val repeatState: LiveData<Int>
        get() = _repeatState

    private val _shuffleState: MutableLiveData<Int> = MutableLiveData()
    val shuffleState: LiveData<Int>
        get() = _shuffleState


    private val _isBuffering: MutableLiveData<Boolean> = MutableLiveData()
    val isBuffering: LiveData<Boolean>
        get() = _isBuffering


    val mediaPosition = KtLiveData(0L)
    val bufferPosition = KtLiveData(0L)

    private var isPlaying = false
    private var currentMetadata: MediaMetadataCompat? = null
    private fun sendPlayStatusToServer() {
        if (isPlaying && currentMetadata != null) {
            currentMetadata?.description?.let { currTrack ->
//                //Log.d(TAG, "Sending Now Playing to server: ${currTrack.title}: ")
                repository.sendNowPlayingToServer(
                    currTrack
                )
            }
        } else if (!isPlaying && currentMetadata != null) {
            repository.sendStoppedPlayingToServer()
        } else {
            //probably initialization
        }

    }

    private val playbackStateObserver = Observer<PlaybackStateCompat> {
        _playbackState.postValue(it ?: EMPTY_PLAYBACK_STATE)

//        when(it.state) {
//            PlaybackStateCompat.STATE_PLAYING -> ////Log.d(TAG, "STATE: PLAYING")
//            PlaybackStateCompat.STATE_PAUSED -> ////Log.d(TAG, "STATE: PAUSED")
//            PlaybackStateCompat.STATE_STOPPED -> ////Log.d(TAG, "STATE: STOPPED")
//            PlaybackStateCompat.STATE_BUFFERING -> ////Log.d(TAG, "STATE: BUFFERING")
//        }

        when {
            it.isPlaying -> {
                isPlaying = true
                sendPlayStatusToServer()
            }

            it.isPaused -> {
                isPlaying = false
                sendPlayStatusToServer()
            }
        }
    }

    private val repeatStateObserver = Observer<Int> {
        _repeatState.postValue(it)
    }

    private val shuffleStateObserver = Observer<Int> {
        _shuffleState.postValue(it)
    }

    private val currentTimeObserver = Observer<Long> { newTime ->
        if (mediaPosition.value != newTime) {
            mediaPosition.postValue(newTime)
        }
    }

    private val mediaMetadataObserver = Observer<MediaMetadataCompat> { newMetadataItem ->
        _currentTrackItem.postValue(newMetadataItem)

        if (newMetadataItem.description?.mediaId != "") {
            if (currentMetadata?.description?.mediaId != newMetadataItem.description?.mediaId) {
                currentMetadata = newMetadataItem
                sendPlayStatusToServer()
                newMetadataItem.description.mediaId?.toLongOrNull()?.let { newMediaId ->
                    val trackInNP = repository.nowPlayingTracks.find { track -> newMediaId == track.id }
                    val index = repository.nowPlayingTracks.indexOf(trackInNP)
                    repository.currentIndex = index

//                    ////Log.d(TAG, "current index: ${repository.currentIndex}")
                }
            }
        }
    }

    private val musicServiceConnection = musicServiceConnection.also {
        it.playbackState.observeForever(playbackStateObserver)
        it.nowPlaying.observeForever(mediaMetadataObserver)
        it.repeatState.observeForever(repeatStateObserver)
        it.shuffleState.observeForever(shuffleStateObserver)
        it.currentSongTimeMillis.observeForever(currentTimeObserver)
    }

    // TODO Feels like it makes more sense to have the fragments pass a list of tracks and the position that they want to start from.
    // The fragments already have the list of tracks / the playlist. Why not just supply them? Then you don't have to look them up again.
    // You also then wouldn't need to even provide the "calling fragment". Seems like we are providing information to this view model for no real reason.
    fun playMedia(track: Track, callingFragment: String, playlistId: Long? = null) {
        repository.changeMediaSource(callingFragment, playlistId)

        val extras = Bundle().also { it.putString(Constants.KEY_CALLING_FRAGMENT, callingFragment) }
        transportControls.playFromMediaId(track.id.toString(), extras)
    }

    fun playNow(track: Track, callingFragment: String) {
        val extras = Bundle().also { it.putString(Constants.KEY_CALLING_FRAGMENT, callingFragment) }
        transportControls.playFromMediaId(track.id.toString(), extras)
    }

    fun playPause(): Boolean {
        return if (_playbackState.value.isPaused) {
            transportControls.play()
            true
        } else {
            transportControls.pause()
            false
        }
    }

    fun seekTo(position: Long) {
        transportControls.seekTo(position)
    }

    fun skipToNext() {
        transportControls.skipToNext()
    }

    fun skipToPrevious() {
        transportControls.skipToPrevious()
    }


    fun repeat() {
        when (_repeatState.value) {
            PlaybackStateCompat.REPEAT_MODE_NONE -> {
                transportControls.setRepeatMode(PlaybackStateCompat.REPEAT_MODE_ONE)
            }
            PlaybackStateCompat.REPEAT_MODE_ONE -> {
                transportControls.setRepeatMode(PlaybackStateCompat.REPEAT_MODE_ALL)
            }
            else -> {
                transportControls.setRepeatMode(PlaybackStateCompat.REPEAT_MODE_NONE)
            }
        }
    }

    fun shuffle() {
        when(_shuffleState.value) {
            PlaybackStateCompat.SHUFFLE_MODE_NONE -> {
                transportControls.setShuffleMode(PlaybackStateCompat.SHUFFLE_MODE_ALL)
            }
            PlaybackStateCompat.SHUFFLE_MODE_ALL -> {
                transportControls.setShuffleMode(PlaybackStateCompat.SHUFFLE_MODE_NONE)
            }
        }
    }



    override fun onCleared() {
        super.onCleared()
        musicServiceConnection.playbackState.removeObserver(playbackStateObserver)
        musicServiceConnection.nowPlaying.removeObserver(mediaMetadataObserver)
        musicServiceConnection.repeatState.removeObserver(repeatStateObserver)
        musicServiceConnection.shuffleState.removeObserver(shuffleStateObserver)
        musicServiceConnection.currentSongTimeMillis.observeForever(currentTimeObserver)
        updatePosition = false
    }

    fun logout() {
        musicServiceConnection.transportControls.stop()
    }
}

inline val PlaybackStateCompat.isPaused
    get() = (state == PlaybackStateCompat.STATE_PAUSED) ||
            state == PlaybackStateCompat.STATE_STOPPED

inline val PlaybackStateCompat.isPlaying
    get() = (state == PlaybackStateCompat.STATE_BUFFERING) ||
            (state == PlaybackStateCompat.STATE_PLAYING)

inline val PlaybackStateCompat.currentPlayBackPosition: Long
    get() = if (state == PlaybackStateCompat.STATE_PLAYING) {
        val timeDelta = SystemClock.elapsedRealtime() - lastPositionUpdateTime
        (position + (timeDelta * playbackSpeed)).toLong()
    } else {
        position
    }
