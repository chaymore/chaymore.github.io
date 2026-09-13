import Foundation
import RealityKit
@main struct Reconstruct {
 static func main() async throws {
  print("Supported: \(PhotogrammetrySession.isSupported)")
  var config = PhotogrammetrySession.Configuration()
  config.sampleOrdering = .sequential
  config.featureSensitivity = .high
  config.isObjectMaskingEnabled = true
  let session = try PhotogrammetrySession(input: URL(fileURLWithPath: CommandLine.arguments[1]), configuration: config)
  try session.process(requests: [.modelFile(url: URL(fileURLWithPath: CommandLine.arguments[2]), detail: .medium)])
  for try await output in session.outputs {
   print(output)
   if case .processingComplete = output { return }
  }
 }
}
