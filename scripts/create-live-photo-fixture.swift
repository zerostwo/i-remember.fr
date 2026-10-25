import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
// Generate a synthetic Apple-authored fixture; never access the Photos library.
let root = CommandLine.arguments[1]
let id = "01234567-89AB-CDEF-0123-456789ABCDEF"
let asset = AVURLAsset(url: URL(fileURLWithPath: root + "/source.mov"))
let reader = try AVAssetReader(asset: asset)
let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: root + "/reference.mov"), fileType: .mov)
let cid = AVMutableMetadataItem()
cid.keySpace = .quickTimeMetadata; cid.key = "com.apple.quicktime.content.identifier" as NSString; cid.value = id as NSString; cid.dataType = "com.apple.metadata.datatype.UTF-8"
writer.metadata = [cid]
var pairs: [(AVAssetReaderTrackOutput, AVAssetWriterInput)] = []
for track in asset.tracks where track.mediaType == .video || track.mediaType == .audio {
 let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
 let input = AVAssetWriterInput(mediaType: track.mediaType, outputSettings: nil, sourceFormatHint: track.formatDescriptions.first as! CMFormatDescription?)
 reader.add(output); writer.add(input); pairs.append((output, input))
}
let spec: [String: Any] = [kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/com.apple.quicktime.still-image-time", kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: "com.apple.metadata.datatype.int8"]
var description: CMFormatDescription?
CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: kCFAllocatorDefault, metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &description)
let metaInput = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: description)
writer.add(metaInput)
let adaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metaInput)
writer.startWriting(); reader.startReading(); writer.startSession(atSourceTime: .zero)
let marker = AVMutableMetadataItem(); marker.keySpace = .quickTimeMetadata; marker.key = "com.apple.quicktime.still-image-time" as NSString; marker.value = NSNumber(value: Int8(0)); marker.dataType = "com.apple.metadata.datatype.int8"
adaptor.append(AVTimedMetadataGroup(items: [marker], timeRange: CMTimeRange(start: CMTime(seconds: 0.6, preferredTimescale: 600), duration: CMTime(value: 1, timescale: 30))))
metaInput.markAsFinished()
for (output, input) in pairs {
 while let sample = output.copyNextSampleBuffer() { while !input.isReadyForMoreMediaData { usleep(1000) }; if !input.append(sample) { fatalError("append \(String(describing: writer.error))") } }
 input.markAsFinished()
}
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }; semaphore.wait()
print("status", writer.status.rawValue, String(describing: writer.error))
let imageSource = CGImageSourceCreateWithURL(URL(fileURLWithPath: root + "/source.jpg") as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)!
for (name, type) in [("reference.jpg", UTType.jpeg), ("reference.heic", UTType.heic)] {
let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: root + "/" + name) as CFURL, type.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, image, [kCGImagePropertyMakerAppleDictionary: ["17": id], kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 51.5, kCGImagePropertyGPSLatitudeRef: "N"], kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2020:01:01 01:01:01"]] as CFDictionary)
print("image",CGImageDestinationFinalize(destination))

}
