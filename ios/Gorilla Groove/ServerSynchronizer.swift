import Foundation
import CoreData

class ServerSynchronizer {
    
    typealias PageCompleteCallback = (_ completedPage: Int, _ totalPages: Int, _ type: String) -> Void
    static let baseUrl = "sync/entity-type/%@/minimum/%ld/maximum/%ld?size=200&page="
    
    static func syncWithServer(pageCompleteCallback: PageCompleteCallback? = nil) {
        print("Initiating sync with server...")
        
        let ownUser = UserState.getOwnUser()
        let lastSync = ownUser.lastSync
        let ownId = ownUser.id

        let minimum = lastSync?.toEpochTime() ?? 0
        let newDate = Date()
        let maximum = newDate.toEpochTime()
        
        // TODO can I have 1 semaphore start at -2 and just use it for all?
        let semaphores = [DispatchSemaphore(value: 0), DispatchSemaphore(value: 0), DispatchSemaphore(value: 0)]
        DispatchQueue.global().async {
            self.saveTracks(minimum, maximum, ownId, pageCompleteCallback, semaphores[0])
        }
        DispatchQueue.global().async {
            // No need to update completion for saving the actual playlist. Playlist data is so small it will
            // never realistically not be synced in one request. So just ignore it and only update based off
            // the PlaylistTrack saving, which could be hundreds / thousands of items big
            self.savePlaylists(minimum, maximum, ownId)
            self.savePlaylistTracks(minimum, maximum, ownId, pageCompleteCallback, semaphores[1])
        }
        DispatchQueue.global().async {
            self.saveUsers(minimum, maximum, ownId, pageCompleteCallback, semaphores[2])
        }

        semaphores.forEach { semaphore in
            semaphore.wait()
        }
        
        print("Saving new user sync date")

        UserState.updateUserSync(newDate)
        
        print("All up to date")
    }
    
    // -- TRACKS
    
    static private func saveTracks(
        _ minimum: Int,
        _ maximum: Int,
        _ ownId: Int,
        _ pageCompleteCallback: PageCompleteCallback?,
        _ allDoneSemaphore: DispatchSemaphore
    ) {
        let url = String(format: baseUrl, "TRACK", minimum, maximum)
        
        var currentPage = 0
        var pagesToGet = 0
        repeat {
            pagesToGet = savePageOfTrackChanges(url: url, page: currentPage, userId: ownId)
            pageCompleteCallback?(currentPage, pagesToGet, "track")
            currentPage += 1
        } while (currentPage < pagesToGet)
        
        print("Finished syncing tracks")
        allDoneSemaphore.signal()
    }
    
    static private func savePageOfTrackChanges(url: String, page: Int, userId: Int) -> Int {
        let semaphore = DispatchSemaphore(value: 0)
        var pagesToFetch = -1
        HttpRequester.get(
            url + String(page),
            EntityChangeResponse<TrackResponse>.self
        ) { entityResponse, status, err in
            
            if (status < 200 || status >= 300 || entityResponse == nil) {
                print("Failed to sync new data!")
                semaphore.signal()
                
                return
            }
            
            for newTrackResponse in entityResponse!.content.new {
                TrackDao.save(newTrackResponse.asTrack(userId: userId))

                print("Added new track with ID: \(newTrackResponse.id)")
            }
            
            for modifiedTrackResponse in entityResponse!.content.modified {
                let oldTrack = TrackDao.findById(modifiedTrackResponse.id)!
                
                // Check if our caches are invalidated for this track
                var newSongCachedAt: Date? = nil
                if let songCachedAt = oldTrack.songCachedAt, let songUpdatedAt = modifiedTrackResponse.songUpdatedAt {
                    if songCachedAt > songUpdatedAt {
                        newSongCachedAt = oldTrack.songCachedAt
                    } else {
                        CacheService.deleteCachedSong(oldTrack.id)
                    }
                }
                
                var newArtCachedAt: Date? = nil
                if let artCachedAt = oldTrack.artCachedAt, let artUpdatedAt = modifiedTrackResponse.artUpdatedAt {
                    if artCachedAt > artUpdatedAt {
                        newArtCachedAt = oldTrack.artCachedAt
                    } else {
                        CacheService.deleteCachedArt(oldTrack.id)
                    }
                }
                
                let updatedTrack = modifiedTrackResponse.asTrack(userId: userId, songCachedAt: newSongCachedAt, artCachedAt: newArtCachedAt)
                TrackDao.save(updatedTrack)
                
                print("Updated existing track with ID: \(modifiedTrackResponse.id)")
            }
            
            for deletedId in entityResponse!.content.removed {
                TrackDao.delete(deletedId)
                CacheService.deleteCachedSong(deletedId)
                
                print("Deleted track with ID: \(deletedId)")
            }
            
            pagesToFetch = entityResponse!.pageable.totalPages
            semaphore.signal()
        }
        
        semaphore.wait()
        
        return pagesToFetch
    }

    // -- PLAYLISTS
    
    static private func savePlaylists(
        _ minimum: Int,
        _ maximum: Int,
        _ ownId: Int
    ) {
        let url = String(format: baseUrl, "PLAYLIST", minimum, maximum)
        
        var currentPage = 0
        var pagesToGet = 0
        repeat {
            pagesToGet = savePageOfPlaylistChanges(url: url, page: currentPage, userId: ownId)
            currentPage += 1
        } while (currentPage < pagesToGet)
        
        print("Finished syncing playlists")
    }
    
    static private func savePageOfPlaylistChanges(url: String, page: Int, userId: Int) -> Int {
        let semaphore = DispatchSemaphore(value: 0)
        var pagesToFetch = -1
        HttpRequester.get(
            url + String(page),
            EntityChangeResponse<PlaylistResponse>.self
        ) { entityResponse, status, err in
            if (status < 200 || status >= 300 || entityResponse == nil) {
                print("Failed to sync new playlist data!")
                semaphore.signal()
                
                return
            }
            
            for newPlaylistResponse in entityResponse!.content.new {
                PlaylistDao.save(newPlaylistResponse.asPlaylist(userId: userId))
                print("Adding new Playlist with ID: \(newPlaylistResponse.id)")
            }
            
            for modifiedPlaylistResponse in entityResponse!.content.modified {
                PlaylistDao.save(modifiedPlaylistResponse.asPlaylist(userId: userId))
                print("Updating existing Playlist with ID: \(modifiedPlaylistResponse.id)")
            }
            
            for deletedId in entityResponse!.content.removed {
                PlaylistDao.delete(deletedId)
                print("Deleting Playlist with ID: \(deletedId)")
            }
            
            pagesToFetch = entityResponse!.pageable.totalPages
            semaphore.signal()
        }
        
        semaphore.wait()
        
        return pagesToFetch
    }
    
    // -- PLAYLIST TRACKS
    
    static private func savePlaylistTracks(
        _ minimum: Int,
        _ maximum: Int,
        _ ownId: Int,
        _ pageCompleteCallback: PageCompleteCallback?,
        _ allDoneSemaphore: DispatchSemaphore
    ) {
        let url = String(format: baseUrl, "PLAYLIST_TRACK", minimum, maximum)
        
        var currentPage = 0
        var pagesToGet = 0
        repeat {
            pagesToGet = savePageOfPlaylistTrackChanges(url, currentPage)
            pageCompleteCallback?(currentPage, pagesToGet, "playlist")
            currentPage += 1
        } while (currentPage < pagesToGet)
        
        print("Finished syncing playlist tracks")
        allDoneSemaphore.signal()
    }
    
    static private func savePageOfPlaylistTrackChanges(_ url: String, _ page: Int) -> Int {
        let semaphore = DispatchSemaphore(value: 0)
        var pagesToFetch = -1
        HttpRequester.get(
            url + String(page),
            EntityChangeResponse<PlaylistTrackResponse>.self
        ) { entityResponse, status, err in
            if (status < 200 || status >= 300 || entityResponse == nil) {
                print("Failed to sync new playlist data!")
                semaphore.signal()
                
                return
            }
            
            for newResponse in entityResponse!.content.new {
                PlaylistTrackDao.save(newResponse.asPlaylistTrack())
                print("Adding new PlaylistTrack with ID: \(newResponse.id)")
            }
            
            for modifiedResponse in entityResponse!.content.modified {
                PlaylistTrackDao.save(modifiedResponse.asPlaylistTrack())
                print("Updating existing PlaylistTrack with ID: \(modifiedResponse.id)")
            }
            
            for deletedId in entityResponse!.content.removed {
                PlaylistTrackDao.delete(deletedId)
                print("Deleting PlaylistTrack with ID: \(deletedId)")
            }
            
            pagesToFetch = entityResponse!.pageable.totalPages
            semaphore.signal()
        }
        
        semaphore.wait()
        
        return pagesToFetch
    }
    
    // -- USERS
     
     static private func saveUsers(
         _ minimum: Int,
         _ maximum: Int,
         _ ownId: Int,
         _ pageCompleteCallback: PageCompleteCallback?,
         _ allDoneSemaphore: DispatchSemaphore
     ) {
         let url = String(format: baseUrl, "USER", minimum, maximum)
         
         var currentPage = 0
         var pagesToGet = 0
         repeat {
             pagesToGet = savePageOfUserChanges(url, currentPage)
             pageCompleteCallback?(currentPage, pagesToGet, "user")
             currentPage += 1
         } while (currentPage < pagesToGet)
         
         print("Finished syncing users")
         allDoneSemaphore.signal()
     }
     
     static private func savePageOfUserChanges(_ url: String, _ page: Int) -> Int {
         let semaphore = DispatchSemaphore(value: 0)
         var pagesToFetch = -1
         HttpRequester.get(
             url + String(page),
             EntityChangeResponse<UserResponse>.self
         ) { entityResponse, status, err in
             if (status < 200 || status >= 300 || entityResponse == nil) {
                 print("Failed to sync new playlist data!")
                 semaphore.signal()
                 
                 return
             }
            
            for newResponse in entityResponse!.content.new {
                UserDao.save(newResponse.asUser())
                print("Added new User with ID: \(newResponse.id)")
            }
            
            for modifiedResponse in entityResponse!.content.modified {
                UserDao.save(modifiedResponse.asUser())
                print("Updated existing User with ID: \(modifiedResponse.id)")
            }
            
            for deletedId in entityResponse!.content.removed {
                UserDao.delete(Int(deletedId))
                print("Deleted User with ID: \(deletedId)")
            }
            
            pagesToFetch = entityResponse!.pageable.totalPages
            semaphore.signal()
        }
        
        semaphore.wait()
        
        return pagesToFetch
    }
    
    
    struct TrackResponse: Codable {
        let id: Int
        let name: String
        let artist: String
        let featuring: String
        let album: String
        let trackNumber: Int?
        let length: Int
        let releaseYear: Int?
        let genre: String?
        let playCount: Int
        let `private`: Bool
        let hidden: Bool
        let lastPlayed: Date?
        let createdAt: Date
        let note: String?
        let songUpdatedAt: Date?
        let artUpdatedAt: Date?
        
        func asTrack(userId: Int, songCachedAt: Date? = nil, artCachedAt: Date? = nil) -> Track {
            return Track(
                id: id,
                album: album,
                artist: artist,
                createdAt: createdAt,
                featuring: featuring,
                genre: genre,
                isHidden: hidden,
                isPrivate: `private`,
                lastPlayed: lastPlayed,
                length: length,
                name: name,
                note: note,
                playCount: playCount,
                releaseYear: releaseYear,
                trackNumber: trackNumber,
                userId: userId,
                songCachedAt: songCachedAt,
                artCachedAt: artCachedAt
            )
        }
    }
    
    struct PlaylistResponse: Codable {
        let id: Int
        let name: String
        let createdAt: Date
        let updatedAt: Date
        
        func asPlaylist(userId: Int) -> Playlist {
            return Playlist(
                id: id,
                createdAt: createdAt,
                updatedAt: updatedAt,
                name: name,
                userId: userId
            )
        }
    }
    
    struct PlaylistTrackResponse: Codable {
        let id: Int
        let track: TrackResponse
        let playlistId: Int
        let createdAt: Date
        let updatedAt: Date
        
        func asPlaylistTrack() -> PlaylistTrack {
            return PlaylistTrack(
                id: id,
                playlistId: playlistId,
                createdAt: createdAt,
                trackId: track.id
            )
        }
    }
    
    struct UserResponse: Codable {
        let id: Int
        let name: String
        let lastLogin: Date
        let createdAt: Date
        let updatedAt: Date
        
        func asUser() -> User {
            return User(
                id: id,
                lastSync: Date(),
                name: name,
                lastLogin: lastLogin,
                createdAt: createdAt
            )
        }
    }
    
    struct EntityChangeResponse<T: Codable>: Codable {
        let content: EntityChangeContent<T>
        let pageable: EntitySyncPagination
    }
    
    struct EntityChangeContent<T: Codable>: Codable {
        let new: Array<T>
        let modified: Array<T>
        let removed: Array<Int>
    }
    
    struct EntitySyncPagination: Codable {
        let offset: Int
        let pageSize: Int
        let pageNumber: Int
        let totalPages: Int
        let totalElements: Int
    }
}
