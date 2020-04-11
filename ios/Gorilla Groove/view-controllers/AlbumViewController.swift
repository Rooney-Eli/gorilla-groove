import UIKit
import Foundation
import AVFoundation
import AVKit

class AlbumViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {
    var albums: Array<Album> = []
    var visibleAlbums: Array<Album> = []
    
    var artist: String? = nil
    
    let albumTableView = UITableView()
    
    var trackState: TrackState? = nil
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        view.addSubview(albumTableView)
        
        albumTableView.translatesAutoresizingMaskIntoConstraints = false
        albumTableView.topAnchor.constraint(equalTo:view.topAnchor).isActive = true
        albumTableView.leftAnchor.constraint(equalTo:view.leftAnchor).isActive = true
        albumTableView.rightAnchor.constraint(equalTo:view.rightAnchor).isActive = true
        albumTableView.bottomAnchor.constraint(equalTo:view.bottomAnchor).isActive = true
        
        albumTableView.dataSource = self
        albumTableView.delegate = self
        albumTableView.register(AlbumViewCell.self, forCellReuseIdentifier: "albumCell")
        
        TableSearchAugmenter.addSearchToNavigation(controller: self, tableView: albumTableView) { input in
            let searchTerm = input.lowercased()
            print(searchTerm)
            if (searchTerm.isEmpty) {
                self.visibleAlbums = self.albums
            } else {
                self.visibleAlbums = self.albums.filter { $0.name.lowercased().contains(searchTerm) }
            }
        }
        
        // Remove extra table rows when we don't have a full screen of songs
        albumTableView.tableFooterView = UIView(frame: .zero)
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return visibleAlbums.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "albumCell", for: indexPath) as! AlbumViewCell
        let album = visibleAlbums[indexPath.row]
        
        cell.tableIndex = indexPath.row
        cell.album = album
        
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(sender:)))
        cell.addGestureRecognizer(tapGesture)
        
        return cell
    }
    
    @objc private func handleTap(sender: UITapGestureRecognizer) {
        let cell = sender.view as! AlbumViewCell
        
        cell.animateSelectionColor()
        
        // If someone picked the special "View All" album at the top, then load everything by nilling this out
        let albumToLoad = cell.album!.viewAllAlbum ? nil : cell.album!.name
        let viewName = cell.album!.viewAllAlbum ? "All " + artist! : albumToLoad!
        
        let tracks = trackState!.getTracks(album: albumToLoad, artist: artist)
        
        let view = SongViewController(viewName, tracks)
        self.navigationController!.pushViewController(view, animated: true)
    }
    
    func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        let albumViewCell = cell as! AlbumViewCell
        
        let album = visibleAlbums[indexPath.row]
        
        if (album.imageLoadFired || album.linkRequestLink.isEmpty) {
            return
        }
        
        album.imageLoadFired = true
                
        DispatchQueue.global().async {
            HttpRequester.get(
                self.visibleAlbums[indexPath.row].linkRequestLink,
                TrackLinkResponse.self
            ) { response, status, err in
                if (status < 200 || status >= 300) {
                    return
                }
                
                let art = UIImage.fromUrl(response!.albumArtLink)
                DispatchQueue.main.async {
                    album.art = art
                    
                    let foundCell = self.albumTableView.visibleCells.first { rawCell in
                        let cell = rawCell as! AlbumViewCell
                        return cell.album?.unfilteredIndex == album.unfilteredIndex
                    }
                    
                    // The album isn't changing, but this forces a reload of the table cell to display the art
                    if foundCell != nil {
                        albumViewCell.album = album
                    }
                }
            }
        }
    }
    
    // It's stupid to pass in trackState. I just need to make it a singleton.
    // When I don't do this, the tracks get garbage collected when you play a song and navigate away from this view
    init(_ title: String, _ albums: Array<Album>, _ artist: String?, _ trackState: TrackState) {
        self.trackState = trackState
        self.artist = artist
        
        var displayedAlbums = albums
        if (artist != nil && displayedAlbums.count > 1) {
            let viewAll = Album(
                name: "View All",
                linkRequestLink: "",
                art: nil,
                imageLoadFired: false,
                viewAllAlbum: true
            )
            
            displayedAlbums.insert(viewAll, at: 0)
        }
        
        // We usually deal with "visibleAlbums", but because of the async nature of album network requests,
        // we look at the non-visible albums for album art as the source of truth. It would be inconvenient
        // to constantly be doing linear searches to find the right album, so store the original index.
        for (index, album) in displayedAlbums.enumerated() { album.unfilteredIndex = index }
        
        self.albums = displayedAlbums
        self.visibleAlbums = displayedAlbums
        
        super.init(nibName: nil, bundle: nil)
        
        self.title = title
    }
    
    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
}

// Needs to be a class and not a struct, because we want a reference type here for easier handling of the
// async album fetching and filtering we do with the search bar
class Album {
    let name: String
    let linkRequestLink: String
    var art: UIImage?
    var imageLoadFired: Bool
    var viewAllAlbum: Bool
    var unfilteredIndex: Int
    
    init(
        name: String,
        linkRequestLink: String,
        art: UIImage? = nil,
        imageLoadFired: Bool = false,
        viewAllAlbum: Bool = false,
        unfilteredIndex: Int = -1
    ) {
        self.name = name
        self.linkRequestLink = linkRequestLink
        self.art = art
        self.imageLoadFired = imageLoadFired
        self.viewAllAlbum = viewAllAlbum
        self.unfilteredIndex = unfilteredIndex
    }
}
