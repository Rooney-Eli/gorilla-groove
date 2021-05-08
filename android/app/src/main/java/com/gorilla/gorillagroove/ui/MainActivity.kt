package com.gorilla.gorillagroove.ui

import android.content.SharedPreferences
import android.os.Bundle
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.PlaybackStateCompat.*
import android.view.View
import android.widget.SeekBar
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.fragment.findNavController
import androidx.navigation.ui.setupWithNavController
import com.gorilla.gorillagroove.R
import com.gorilla.gorillagroove.repository.MainRepository
import com.gorilla.gorillagroove.util.Constants
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.android.synthetic.main.activity_main.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var sharedPref: SharedPreferences

    @Inject
    lateinit var mainRepository: MainRepository

    private val playerControlsViewModel: PlayerControlsViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // We are using the AppTheme.Launcher theme to load the app. Swap back to the normal AppTheme now that we've loaded
        setTheme(R.style.AppTheme)

        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        setSupportActionBar(findViewById(R.id.toolbar))

        supportActionBar?.setDisplayShowTitleEnabled(false)


        val navHostFragment = supportFragmentManager.findFragmentById(R.id.navHostFragment) as NavHostFragment
        val navController = navHostFragment.navController

        // setupActionBarWithNavController(navController)
        bottomNavigationView.setupWithNavController(navController)

        navHostFragment.findNavController()
            .addOnDestinationChangedListener { _, destination, _ ->
                when (destination.id) {
                    R.id.loginFragment -> {
                        bottomNavigationView.visibility = View.GONE
                        playerControlView.visibility = View.GONE
                        title_tv.text = ""
                    }
                    R.id.mainFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "My Library"
                    }
                    R.id.playingFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "Now Playing"
                    }
                    R.id.usersFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "Users"
                    }
                    R.id.playlistsFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "Playlists"
                    }
                    R.id.playlistFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                    }
                    R.id.moreMenuFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "More"
                    }
                    R.id.trackPropertiesFragment -> {
                        bottomNavigationView.visibility = View.GONE
                        playerControlView.visibility = View.GONE
                        title_tv.text = "Properties"
                    }
                    R.id.problemReportFragment -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "Problem Report"
                    }
                    R.id.logViewFragment -> {
                        bottomNavigationView.visibility = View.GONE
                        playerControlView.visibility = View.GONE
                        title_tv.text = "View Logs"
                    }
                    else -> {
                        bottomNavigationView.visibility = View.VISIBLE
                        playerControlView.visibility = View.VISIBLE
                        title_tv.text = "var ar jag?"
                        supportActionBar?.displayOptions
                    }
                }
            }

        subscribeObservers()
        initProgressBar()

        playpause_button.setOnClickListener {
            playerControlsViewModel.playPause()
        }

        repeat_button.setOnClickListener {
            playerControlsViewModel.repeat()
        }

        shuffle_button.setOnClickListener {
            playerControlsViewModel.shuffle()
        }

        next_button.setOnClickListener {
            playerControlsViewModel.skipToNext()
        }

        previous_button.setOnClickListener {
            playerControlsViewModel.skipToPrevious()
        }

        audio_seek_bar.setOnSeekBarChangeListener(
            object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(
                    seekBar: SeekBar?,
                    progress: Int,
                    fromUser: Boolean
                ) {
                }

                override fun onStartTrackingTouch(seekBar: SeekBar?) {
                    //Log.d(TAG, "onStartTrackingTouch: ")
                }

                override fun onStopTrackingTouch(seekBar: SeekBar?) {
                    playerControlsViewModel.seekTo(audio_seek_bar.progress.toLong() * 1000)
                }

            }
        )

        if (sharedPref.contains(Constants.KEY_USER_TOKEN)) {
            CoroutineScope(Dispatchers.IO).launch {
                mainRepository.postDeviceVersion()
            }
        }
    }

    private fun initProgressBar() {
        audio_seek_bar.min = 0
        audio_seek_bar.max = 100
    }

    private fun subscribeObservers() {
        playerControlsViewModel.playbackState.observe(this, {
            if (it.isPlaying) {
                playpause_button.setImageResource(R.drawable.ic_pause_24)
            } else {
                playpause_button.setImageResource(R.drawable.ic_play_arrow_24)
            }
        })

        playerControlsViewModel.repeatState.observe(this, {
            when (it) {
                REPEAT_MODE_NONE -> {
                    repeat_button.setImageResource(R.drawable.ic_repeat_24)
                    repeat_button.setColorFilter(ContextCompat.getColor(this, R.color.exo_white), android.graphics.PorterDuff.Mode.SRC_IN)
                }
                REPEAT_MODE_ONE -> {
                    repeat_button.setImageResource(R.drawable.ic_repeat_one_24)
                    repeat_button.setColorFilter(ContextCompat.getColor(this, R.color.ggSecondary), android.graphics.PorterDuff.Mode.SRC_IN)
                }
                REPEAT_MODE_ALL -> {
                    repeat_button.setImageResource(R.drawable.ic_repeat_24)
                    repeat_button.setColorFilter(ContextCompat.getColor(this, R.color.ggSecondary), android.graphics.PorterDuff.Mode.SRC_IN)
                }
                else -> {
                    //Log.d(TAG, "subscribeObservers: what is this? ${it}")
                }
            }
        })

        playerControlsViewModel.shuffleState.observe(this, {
            when(it) {
                SHUFFLE_MODE_NONE -> {
                    shuffle_button.setImageResource(R.drawable.ic_shuffle_24)
                    shuffle_button.setColorFilter(ContextCompat.getColor(this, R.color.exo_white), android.graphics.PorterDuff.Mode.SRC_IN)
                }
                SHUFFLE_MODE_ALL -> {
                    shuffle_button.setImageResource(R.drawable.ic_shuffle_24)
                    shuffle_button.setColorFilter(ContextCompat.getColor(this, R.color.ggSecondary), android.graphics.PorterDuff.Mode.SRC_IN)
                }
            }
        })

        playerControlsViewModel.isBuffering.observe(this, {
            audio_seek_bar.isIndeterminate = it
        })

        playerControlsViewModel.currentTrackItem.observe(this, { metadata ->
            val artist = metadata.description?.subtitle?.takeIf { it.isNotBlank() }
            val name = metadata.description?.title?.takeIf { it.isNotBlank() }

            now_playing_textview.text = if (artist != null && name != null) {
                "$name - $artist"
            } else {
                name ?: artist
            }

            track_duration_textview.text = metadata.getLong(MediaMetadataCompat.METADATA_KEY_DURATION).getSongTimeFromMilliseconds()
            audio_seek_bar.max = metadata.getLong(MediaMetadataCompat.METADATA_KEY_DURATION).toInt() / 1000
        })

        playerControlsViewModel.mediaPosition.observe(this, {
            track_position_textview.text = it.getSongTimeFromMilliseconds()
            audio_seek_bar.progress = it.toInt() / 1000
        })

        playerControlsViewModel.bufferPosition.observe(this, {
            audio_seek_bar.secondaryProgress = it.toInt() / 1000
        })

    }
}

fun Long.getSongTimeFromMilliseconds(): String {
    return String.format(
        "%d:%02d",
        TimeUnit.MILLISECONDS.toMinutes(this),
        TimeUnit.MILLISECONDS.toSeconds(this) % 60
    )
}