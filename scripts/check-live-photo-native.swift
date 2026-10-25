// Read-only Apple Photos validation. Does not import into or modify a library.
import Foundation
import Photos
import AppKit
let folder = CommandLine.arguments[1]
var done = false
PHLivePhoto.request(withResourceFileURLs: [URL(fileURLWithPath: folder + "/Memory.JPG"), URL(fileURLWithPath: folder + "/Memory.MOV")], placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { photo, info in
 print("Live Photo:", photo != nil, "Info:", info)
 if !(info[PHLivePhotoInfoIsDegradedKey] as? Bool ?? false) { done = true; exit(photo == nil ? 1 : 0) }
}
let deadline = Date().addingTimeInterval(30)
while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
exit(2)
