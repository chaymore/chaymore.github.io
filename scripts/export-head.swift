import Foundation
import ModelIO
let asset = MDLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
print("bounds", asset.boundingBox)
try asset.export(to: URL(fileURLWithPath: CommandLine.arguments[2]))
