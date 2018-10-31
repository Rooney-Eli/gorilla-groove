import React from 'react';
import {getDateStringFromUnixTime} from "../../util";

export function LibraryList(props) {
	return (
		<table className="track-table">
			<thead>
			<tr>
				<th>Title</th>
				<th>Artist</th>
				<th>Album</th>
				<th>Length</th>
				<th>Plays</th>
				<th>Year</th>
				<th>Bit Rate</th>
				<th>Sample Rate</th>
				<th>Added</th>
				<th>Last Played</th>
			</tr>
			</thead>
			<tbody>
			{props.userTracks.map((userTrack) => {
				return (
					<tr key={userTrack.id}>
						<td>{userTrack.track.name}</td>
						<td>{userTrack.track.artist}</td>
						<td>{userTrack.track.album}</td>
						<td>{userTrack.track.length}</td>
						<td>{userTrack.playCount}</td>
						<td>{userTrack.track.releaseYear}</td>
						<td>{userTrack.track.bitRate}</td>
						<td>{userTrack.track.sampleRate}</td>
						<td>{getDateStringFromUnixTime(userTrack.createdAt)}</td>
						<td>{getDateStringFromUnixTime(userTrack.lastPlayed)}</td>
					</tr>
				);
			})}
			</tbody>
		</table>

	);
}
