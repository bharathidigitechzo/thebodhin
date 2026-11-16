package com.bodhin.ink

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.*
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.tasks.await

/**
 * ML Kit Digital Ink for the Bodhin smart board.
 * prepare(lang) downloads the language model once (Wi-Fi not required, ~20 MB); recognise() runs fully on-device.
 * UNTESTED in this repo (needs an EAS development build) — see docs/SMART_BOARD.md.
 */
class BodhinInkModule : Module() {
  private val recognizers = mutableMapOf<String, DigitalInkRecognizer>()
  private val models = RemoteModelManager.getInstance()

  private fun modelFor(lang: String): DigitalInkRecognitionModel? {
    val id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(lang) ?: return null
    return DigitalInkRecognitionModel.builder(id).build()
  }

  override fun definition() = ModuleDefinition {
    Name("BodhinInk")

    AsyncFunction("isAvailable") { true }

    AsyncFunction("prepare") Coroutine { lang: String ->
      val model = modelFor(lang) ?: return@Coroutine false
      if (!models.isModelDownloaded(model).await()) {
        models.download(model, DownloadConditions.Builder().build()).await()
      }
      recognizers.getOrPut(lang) { DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build()) }
      true
    }

    // strokes: [[ [x, y, t], ... ], ...] in pixels / ms
    AsyncFunction("recognise") Coroutine { lang: String, strokes: List<List<List<Double>>>, width: Double, height: Double ->
      val rec = recognizers[lang] ?: return@Coroutine emptyList<String>()
      val ink = Ink.builder()
      for (s in strokes) {
        val sb = Ink.Stroke.builder()
        for (p in s) sb.addPoint(Ink.Point.create(p[0].toFloat(), p[1].toFloat(), p[2].toLong()))
        ink.addStroke(sb.build())
      }
      val ctx = RecognitionContext.builder().setPreContext("").setWritingArea(WritingArea(width.toFloat(), height.toFloat())).build()
      val result = rec.recognize(ink.build(), ctx).await()
      result.candidates.take(5).map { it.text }
    }

    OnDestroy { recognizers.values.forEach { it.close() } }
  }
}
