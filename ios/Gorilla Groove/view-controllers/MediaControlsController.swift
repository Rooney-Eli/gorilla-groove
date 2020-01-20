import UIKit
import SwiftUI
import Foundation
import CoreMedia

class MediaControlsController: UIViewController {
    var sliderGrabbed = false
    
    var repeatIcon: UIImageView { return createIcon("repeat", weight: .bold) }
    var backIcon: UIImageView { return createIcon("backward.end.fill") }
    
    lazy var playIcon: UIImageView = {
        let icon = createIcon("play.fill", scale: .large)
        icon.addGestureRecognizer(UITapGestureRecognizer(
            target: self,
            action: #selector(playMusic(tapGestureRecognizer:))
        ))
        return icon
    }()
    
    lazy var pauseIcon: UIImageView = {
        let icon = createIcon("pause.fill", scale: .large)
        icon.isHidden = true
        icon.addGestureRecognizer(UITapGestureRecognizer(
            target: self,
            action: #selector(pauseMusic(tapGestureRecognizer:))
        ))
        return icon
    }()
    
    var forwardIcon: UIImageView { return createIcon("forward.end.fill") }
    var shuffleIcon: UIImageView { return createIcon("shuffle", weight: .bold) }
    
    var songText: UILabel = {
        let label = UILabel()
        
        label.text = " " // Empty space just to take up vertical height
        label.textColor = .white
        label.font = label.font.withSize(12)
        
        return label
    }()
    
    var currentTime: UILabel = {
        let label = UILabel()
        
        label.textColor = .white
        label.text = "0:00"
        label.font = label.font.withSize(12)
        label.sizeToFit()
        
        return label
    }()
    
    var totalTime: UILabel = {
        let label = UILabel()
        
        label.textColor = .white
        label.text = "0:00"
        label.font = label.font.withSize(12)
        label.sizeToFit()
        
        return label
    }()
    
    lazy var slider: UISlider = {
        let slider = UISlider()
        slider.maximumValue = 1
        slider.minimumValue = 0
        slider.setValue(0, animated: false)
    
        slider.minimumTrackTintColor = Colors.lightBlue
        slider.maximumTrackTintColor = Colors.nearBlack
        slider.thumbTintColor = Colors.lightBlue

        let config = UIImage.SymbolConfiguration(scale: .small)
        let newImage = UIImage(systemName: "circle.fill", withConfiguration: config)?.tinted(color: Colors.lightBlue)

        slider.setThumbImage(newImage, for: .normal)
        slider.setThumbImage(newImage, for: .highlighted)

        slider.addTarget(self, action: #selector(self.handleSliderGrab), for: .touchDown)
        slider.addTarget(self, action: #selector(self.handleSliderRelease), for: .touchUpInside)
        slider.addTarget(self, action: #selector(self.handleSliderRelease), for: .touchUpOutside)
        slider.addTarget(self, action: #selector(self.handleSeek), for: .valueChanged)
        
        return slider
    }()
    
    override func viewDidLoad() {
        let content = UIStackView()
        content.translatesAutoresizingMaskIntoConstraints = false
        content.axis = .vertical
        content.alignment = .center
        
        let topButtons = createTopButtons()
        let songTextView = createSongText()
        let bottomElements = createBottomElements()

        content.addArrangedSubview(topButtons)
        content.addArrangedSubview(songTextView)
        content.addArrangedSubview(bottomElements)
        
        content.setCustomSpacing(8.0, after: topButtons)
        content.setCustomSpacing(8.0, after: songTextView)
        
        self.view.addSubview(content)
        self.view.backgroundColor = Colors.darkBlue
        self.view.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            self.view.heightAnchor.constraint(equalToConstant: 90.0),
            
            content.topAnchor.constraint(equalTo: self.view.topAnchor, constant: 10),
            content.leftAnchor.constraint(equalTo: self.view.leftAnchor),
            content.rightAnchor.constraint(equalTo: self.view.rightAnchor),
            
            topButtons.leftAnchor.constraint(equalTo: content.leftAnchor, constant: 10),
            topButtons.rightAnchor.constraint(equalTo: content.rightAnchor, constant: -10),
            
            bottomElements.leftAnchor.constraint(equalTo: content.leftAnchor, constant: 10),
            bottomElements.rightAnchor.constraint(equalTo: content.rightAnchor, constant: -10)
        ])

        AudioPlayer.addTimeObserver { time in
            self.currentTime.text = self.formatTimeFromSeconds(Int(time))
            self.currentTime.sizeToFit()
            if (!self.sliderGrabbed) {
                self.slider.setValue(Float(time) / Float(NowPlayingTracks.currentTrack!.length), animated: true)
            }
        }
        
        NowPlayingTracks.addTrackChangeObserver { nillableTrack in
            DispatchQueue.main.async {
                guard let track = nillableTrack else {
                    self.currentTime.text = self.formatTimeFromSeconds(0)
                    self.totalTime.text = self.formatTimeFromSeconds(0)
                    self.songText.text = ""
                    
                    return
                }
                
                self.currentTime.text = self.formatTimeFromSeconds(0)
                self.totalTime.text = self.formatTimeFromSeconds(Int(track.length))
                self.songText.text = track.name + " - " + track.artist
                self.pauseIcon.isHidden = false
                self.playIcon.isHidden = true
                
                self.slider.setValue(0, animated: true)
            }
        }
    }
    
    private func formatTimeFromSeconds(_ totalSeconds: Int) -> String {
        let seconds = totalSeconds % 60
        let minutes = totalSeconds / 60
        
        let zeroPaddedSeconds = seconds < 10 ? "0" + String(seconds) : String(seconds)
        
        return String(minutes) + ":" + zeroPaddedSeconds
    }
    
    private func createTopButtons() -> UIStackView {
        let buttons = UIStackView()
        buttons.translatesAutoresizingMaskIntoConstraints = false
        buttons.axis = .horizontal
        buttons.distribution  = .equalSpacing
        
        let topMiddle = UIStackView()
        topMiddle.translatesAutoresizingMaskIntoConstraints = false
        topMiddle.axis = .horizontal
        topMiddle.distribution  = .equalSpacing

        topMiddle.addArrangedSubview(backIcon)
        topMiddle.addArrangedSubview(playIcon)
        topMiddle.addArrangedSubview(pauseIcon)
        topMiddle.addArrangedSubview(forwardIcon)
                
        buttons.addArrangedSubview(repeatIcon)
        buttons.addArrangedSubview(topMiddle)
        buttons.addArrangedSubview(shuffleIcon)
        
        topMiddle.widthAnchor.constraint(equalToConstant: 145).isActive = true

        return buttons
    }
    
    private func createSongText() -> UIView {
        let view = UIStackView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.addArrangedSubview(songText)
        
        return view
    }
    
    private func createBottomElements() -> UIStackView {
        let elements = UIStackView()
        elements.translatesAutoresizingMaskIntoConstraints = false
        elements.axis = .horizontal
        elements.distribution  = .fill

        elements.addArrangedSubview(currentTime)
        elements.addArrangedSubview(slider)
        elements.addArrangedSubview(totalTime)

        elements.setCustomSpacing(15.0, after: currentTime)
        elements.setCustomSpacing(15.0, after: slider)

        return elements
    }
    
    private func createIcon(
        _ name: String,
        pointSize: Double = 1.5,
        weight: UIImage.SymbolWeight = .ultraLight,
        scale: UIImage.SymbolScale = .small
    ) -> UIImageView {
        let config = UIImage.SymbolConfiguration(pointSize: UIFont.systemFontSize * 1.5, weight: weight, scale: scale)

        let icon = UIImageView(image: UIImage(systemName: name, withConfiguration: config)!)
        icon.isUserInteractionEnabled = true
        icon.tintColor = .white
        
        return icon
    }
    
    @objc func pauseMusic(tapGestureRecognizer: UITapGestureRecognizer) {
        AudioPlayer.player.pause()
        self.pauseIcon.isHidden = true
        self.playIcon.isHidden = false
    }
    
    @objc func playMusic(tapGestureRecognizer: UITapGestureRecognizer) {
        if (NowPlayingTracks.currentTrack == nil) {
            return
        }
        
        AudioPlayer.player.play()
        self.pauseIcon.isHidden = false
        self.playIcon.isHidden = true
    }
    
    @objc func handleSeek(tapGestureRecognizer: UITapGestureRecognizer) {
        if (NowPlayingTracks.currentTrack == nil) {
            return
        }
        
        let seconds = slider.value * Float(NowPlayingTracks.currentTrack!.length)
        AudioPlayer.player.seek(to: CMTimeMake(value: Int64(Int(seconds)), timescale: 1))
    }
    
    @objc func handleSliderGrab(tapGestureRecognizer: UITapGestureRecognizer) {
        print("Grabbed")
        sliderGrabbed = true
    }
    
    @objc func handleSliderRelease(tapGestureRecognizer: UITapGestureRecognizer) {
        print("Released")
        sliderGrabbed = false
    }
}

extension UIImage {
    // I stole this and converted it from Objective-C
    // https://coffeeshopped.com/2010/09/iphone-how-to-dynamically-color-a-uiimage
    func tinted(color: UIColor) -> UIImage {
        UIGraphicsBeginImageContext(size)

        let context = UIGraphicsGetCurrentContext()!

        context.setFillColor(color.cgColor)
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1.0, y: -1.0);

        context.setBlendMode(CGBlendMode.normal)
        let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
        context.draw(self.cgImage!, in: rect)

        context.clip(to: rect, mask: self.cgImage!);
        context.addRect(rect);
        context.drawPath(using: CGPathDrawingMode.fill)

        let coloredImg = UIGraphicsGetImageFromCurrentImageContext();
        UIGraphicsEndImageContext();

        return coloredImg!
    }
}