import ExpoModulesCore
import MLKitDigitalInkRecognition
import MLKitCommon

/// ML Kit Digital Ink for the Bodhin smart board. UNTESTED in this repo (needs an EAS development build).
public class BodhinInkModule: Module {
  private var recognizers: [String: DigitalInkRecognizer] = [:]

  public func definition() -> ModuleDefinition {
    Name("BodhinInk")

    AsyncFunction("isAvailable") { () -> Bool in true }

    AsyncFunction("prepare") { (lang: String, promise: Promise) in
      guard let id = DigitalInkRecognitionModelIdentifier(forLanguageTag: lang) else { promise.resolve(false); return }
      let model = DigitalInkRecognitionModel(modelIdentifier: id)
      let manager = ModelManager.modelManager()
      let ready = { [weak self] in
        if self?.recognizers[lang] == nil {
          self?.recognizers[lang] = DigitalInkRecognizer.digitalInkRecognizer(options: DigitalInkRecognizerOptions(model: model))
        }
        promise.resolve(true)
      }
      if manager.isModelDownloaded(model) { ready(); return }
      var observer: NSObjectProtocol?
      observer = NotificationCenter.default.addObserver(forName: .mlkitModelDownloadDidSucceed, object: nil, queue: .main) { _ in
        if let o = observer { NotificationCenter.default.removeObserver(o) }
        ready()
      }
      _ = manager.download(model, conditions: ModelDownloadConditions(allowsCellularAccess: true, allowsBackgroundDownloading: true))
    }

    AsyncFunction("recognise") { (lang: String, strokes: [[[Double]]], width: Double, height: Double, promise: Promise) in
      guard let rec = self.recognizers[lang] else { promise.resolve([String]()); return }
      let ink = Ink(strokes: strokes.map { s in
        Stroke(points: s.map { p in StrokePoint(x: Float(p[0]), y: Float(p[1]), t: Int(p[2])) })
      })
      let ctx = DigitalInkRecognitionContext(preContext: "", writingArea: WritingArea(width: Float(width), height: Float(height)))
      rec.recognize(ink: ink, context: ctx) { result, error in
        if error != nil { promise.resolve([String]()); return }
        promise.resolve((result?.candidates ?? []).prefix(5).map { $0.text })
      }
    }
  }
}
