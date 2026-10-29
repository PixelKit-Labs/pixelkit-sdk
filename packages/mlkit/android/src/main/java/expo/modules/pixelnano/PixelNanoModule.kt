package expo.modules.pixelnano

import android.content.Context
import android.os.SystemClock
import android.util.Base64
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.common.StreamingCallback
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.prompt.generationConfig
import com.google.mlkit.genai.prompt.modelConfig
import com.google.mlkit.genai.summarization.Summarization
import com.google.mlkit.genai.summarization.SummarizationRequest
import com.google.mlkit.genai.summarization.SummarizerOptions
import com.google.mlkit.genai.proofreading.Proofreading
import com.google.mlkit.genai.proofreading.ProofreadingRequest
import com.google.mlkit.genai.proofreading.ProofreaderOptions
import com.google.mlkit.genai.rewriting.Rewriting
import com.google.mlkit.genai.rewriting.RewritingRequest
import com.google.mlkit.genai.rewriting.RewriterOptions
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.FutureCallback
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.facemesh.FaceMeshDetection
import com.google.mlkit.vision.facemesh.FaceMeshDetectorOptions
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.google.mlkit.vision.digitalink.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.Ink
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.smartreply.SmartReply
import com.google.mlkit.nl.smartreply.TextMessage
import com.google.mlkit.nl.entityextraction.EntityExtraction
import com.google.mlkit.nl.entityextraction.EntityExtractorOptions
import com.google.mlkit.nl.entityextraction.EntityExtractionParams

suspend fun <T> ListenableFuture<T>.await(): T = suspendCancellableCoroutine { cont ->
  Futures.addCallback(this, object : FutureCallback<T> {
    override fun onSuccess(result: T?) {
      if (result != null) cont.resume(result)
      else cont.resumeWithException(NullPointerException("Result was null"))
    }
    override fun onFailure(t: Throwable) {
      cont.resumeWithException(t)
    }
  }, { r -> r.run() })
  cont.invokeOnCancellation { this.cancel(true) }
}

suspend fun <T> com.google.android.gms.tasks.Task<T>.awaitTask(): T = suspendCancellableCoroutine { cont ->
  addOnSuccessListener { result ->
    cont.resume(result)
  }
  addOnFailureListener { exception ->
    cont.resumeWithException(exception)
  }
  addOnCanceledListener {
    cont.cancel()
  }
}

/** Error surfaced to JS as `E_NANO_<code>` where code is a GenAiException.ErrorCode name. */
class NanoException(code: String, message: String, cause: Throwable?) :
  CodedException("E_NANO_$code", message, cause)

/**
 * PixelNano: Gemini Nano on-device inference through the ML Kit GenAI Prompt API (AICore).
 *
 * Every function talks to the real AICore service. Status, model name, token limit and feature
 * flags come from `GenerativeModel`; latency is measured around the actual call. Nothing here
 * fabricates a reply: when the model is unavailable the call throws `E_NANO_NOT_AVAILABLE`.
 *
 * Verified against genai-prompt 1.0.0-beta4: `checkStatus()` returns a `FeatureStatus` int,
 * `generateContentRequest(...)` has fixed-arity overloads (text; system+text; image+text;
 * system+image+text), streaming uses `StreamingCallback.onNewText/onNewThought`.
 */
class PixelNanoModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw NanoException("NO_CONTEXT", "React context lost", null)

  private var model: GenerativeModel? = null
  private var releaseStage: Int = ModelReleaseStage.STABLE
  private var preference: Int = ModelPreference.FULL

  /** AICore enforces a per-app quota and rejects concurrent requests with BUSY; serialise them. */
  private val gate = Mutex()

  private fun client(): GenerativeModel =
    model ?: Generation.getClient(generationConfig {
      modelConfig = modelConfig {
        this.releaseStage = this@PixelNanoModule.releaseStage
        this.preference = this@PixelNanoModule.preference
      }
    }).also { model = it }

  private fun statusName(s: Int): String = when (s) {
    FeatureStatus.AVAILABLE -> "available"
    FeatureStatus.DOWNLOADABLE -> "downloadable"
    FeatureStatus.DOWNLOADING -> "downloading"
    else -> "unavailable"
  }

  private fun finishName(r: Int?): String = when (r) {
    Candidate.FinishReason.STOP -> "STOP"
    Candidate.FinishReason.MAX_TOKENS -> "MAX_TOKENS"
    null -> "UNKNOWN"
    else -> "OTHER"
  }

  private fun codeName(e: GenAiException): String = when (e.errorCode) {
    GenAiException.ErrorCode.NOT_AVAILABLE -> "NOT_AVAILABLE"
    GenAiException.ErrorCode.BUSY -> "BUSY"
    GenAiException.ErrorCode.CANCELLED -> "CANCELLED"
    GenAiException.ErrorCode.REQUEST_TOO_LARGE -> "REQUEST_TOO_LARGE"
    GenAiException.ErrorCode.REQUEST_TOO_SMALL -> "REQUEST_TOO_SMALL"
    GenAiException.ErrorCode.REQUEST_PROCESSING_ERROR -> "REQUEST_PROCESSING_ERROR"
    GenAiException.ErrorCode.RESPONSE_PROCESSING_ERROR -> "RESPONSE_PROCESSING_ERROR"
    GenAiException.ErrorCode.RESPONSE_GENERATION_ERROR -> "RESPONSE_GENERATION_ERROR"
    GenAiException.ErrorCode.NOT_SUPPORTED -> "NOT_SUPPORTED"
    GenAiException.ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED -> "BATTERY_QUOTA_EXCEEDED"
    GenAiException.ErrorCode.BACKGROUND_USE_BLOCKED -> "BACKGROUND_USE_BLOCKED"
    GenAiException.ErrorCode.NOT_ENOUGH_DISK_SPACE -> "NOT_ENOUGH_DISK_SPACE"
    GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE -> "NEEDS_SYSTEM_UPDATE"
    GenAiException.ErrorCode.AICORE_INCOMPATIBLE -> "AICORE_INCOMPATIBLE"
    GenAiException.ErrorCode.INVALID_INPUT_IMAGE -> "INVALID_INPUT_IMAGE"
    else -> "UNKNOWN"
  }

  private inline fun <T> guarded(block: () -> T): T = try {
    block()
  } catch (e: GenAiException) {
    throw NanoException(codeName(e), e.message ?: codeName(e), e)
  }

  private fun num(o: Map<String, Any?>?, key: String): Double? = (o?.get(key) as? Number)?.toDouble()

  /** Builds the request from a prompt plus optional systemInstruction / imageBase64 / sampling options. */
  private fun buildRequest(prompt: String, o: Map<String, Any?>?): GenerateContentRequest {
    val text = TextPart(prompt)
    val system = (o?.get("systemInstruction") as? String)?.takeIf { it.isNotBlank() }?.let { SystemInstruction(it) }
    val image = (o?.get("imageBase64") as? String)?.takeIf { it.isNotBlank() }?.let {
      ImagePart(Base64.decode(it, Base64.DEFAULT))
    }
    val configure: GenerateContentRequest.Builder.() -> Unit = {
      num(o, "temperature")?.let { temperature = it.toFloat() }
      num(o, "topK")?.let { topK = it.toInt() }
      num(o, "candidateCount")?.let { candidateCount = it.toInt() }
      num(o, "maxOutputTokens")?.let { maxOutputTokens = it.toInt() }
      num(o, "seed")?.let { seed = it.toInt() }
      enableThinking = o?.get("thinking") == true
    }
    return when {
      system != null && image != null -> generateContentRequest(system, image, text, configure)
      system != null -> generateContentRequest(system, text, configure)
      image != null -> generateContentRequest(image, text, configure)
      else -> generateContentRequest(text, configure)
    }
  }

  private fun resultMap(res: GenerateContentResponse, latencyMs: Long, firstTokenMs: Long?): Map<String, Any?> {
    val candidate = res.candidates.firstOrNull()
    return mapOf(
      "text" to (candidate?.text ?: ""),
      "finishReason" to finishName(candidate?.finishReason),
      "thoughts" to res.thoughtProcess.map { it.text },
      "latencyMs" to latencyMs,
      "firstTokenMs" to firstTokenMs,
    )
  }

  private suspend fun ensureAvailable() {
    val s = client().checkStatus()
    if (s != FeatureStatus.AVAILABLE) throw NanoException("NOT_AVAILABLE", "Gemini Nano is ${statusName(s)} on this device", null)
  }

  private fun imageFromUriOrBase64(input: String): InputImage {
    val clean = input.trim()
    return if (clean.startsWith("data:") || (!clean.startsWith("file:") && !clean.startsWith("content:") && !clean.startsWith("/"))) {
      val b64 = if (clean.contains(",")) clean.substringAfter(",") else clean
      val bytes = Base64.decode(b64, Base64.DEFAULT)
      val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: throw NanoException("INVALID_IMAGE", "Failed to decode base64 bitmap", null)
      InputImage.fromBitmap(bmp, 0)
    } else {
      val uri = if (clean.startsWith("file:") || clean.startsWith("content:")) Uri.parse(clean) else Uri.fromFile(java.io.File(clean))
      InputImage.fromFilePath(context, uri)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PixelNano")

    Events("onDownloadProgress", "onToken", "onThought")

    // ───────────────────────── Availability & model facts ─────────────────────────
    AsyncFunction("checkStatus") Coroutine { ->
      guarded { statusName(client().checkStatus()) }
    }

    /** Facts reported by AICore for the model it will serve this app. Unknown fields are null. */
    AsyncFunction("getModelInfo") Coroutine { ->
      val c = client()
      val status = guarded { c.checkStatus() }
      mapOf(
        "status" to statusName(status),
        "baseModelName" to runCatching { c.getBaseModelName() }.getOrNull(),
        "tokenLimit" to runCatching { c.getTokenLimit() }.getOrNull(),
        "thinkingModeAvailable" to runCatching { c.isThinkingModeAvailable() }.getOrNull(),
        "systemPromptAvailable" to runCatching { c.isSystemPromptAvailable() }.getOrNull(),
        "structuredOutputAvailable" to runCatching { c.isStructuredOutputFeatureAvailable() }.getOrNull(),
        "cachingAvailable" to runCatching { c.isCachingFeatureAvailable() }.getOrNull(),
        "aicoreVersion" to runCatching { context.packageManager.getPackageInfo("com.google.android.aicore", 0).versionName }.getOrNull(),
        "releaseStage" to (if (releaseStage == ModelReleaseStage.PREVIEW) "preview" else "stable"),
        "preference" to (if (preference == ModelPreference.FAST) "fast" else "full"),
      )
    }

    /** Selects the AICore model track. Recreates the client; takes effect on the next call. */
    Function("setModelConfig") { stage: String, pref: String ->
      releaseStage = if (stage == "preview") ModelReleaseStage.PREVIEW else ModelReleaseStage.STABLE
      preference = if (pref == "fast") ModelPreference.FAST else ModelPreference.FULL
      model?.close()
      model = null
    }

    /** Streams AICore's download progress as events and resolves with the final status. */
    AsyncFunction("download") Coroutine { ->
      guarded {
        client().download().collect { s ->
          when (s) {
            is DownloadStatus.DownloadStarted ->
              sendEvent("onDownloadProgress", mapOf("phase" to "started", "bytes" to 0L))
            is DownloadStatus.DownloadProgress ->
              sendEvent("onDownloadProgress", mapOf("phase" to "progress", "bytes" to s.totalBytesDownloaded))
            is DownloadStatus.DownloadCompleted ->
              sendEvent("onDownloadProgress", mapOf("phase" to "completed"))
            is DownloadStatus.DownloadFailed ->
              throw NanoException(codeName(s.e), s.e.message ?: "download failed", s.e)
          }
        }
        statusName(client().checkStatus())
      }
    }

    /** Loads the model into AICore ahead of the first prompt. Returns the wall time it took. */
    AsyncFunction("warmup") Coroutine { ->
      val t0 = SystemClock.elapsedRealtime()
      guarded { client().warmup() }
      SystemClock.elapsedRealtime() - t0
    }

    /** Token count from the on-device tokenizer for the exact request that would be sent. */
    AsyncFunction("countTokens") Coroutine { prompt: String, options: Map<String, Any?>? ->
      guarded { client().countTokens(buildRequest(prompt, options)).totalTokens }
    }

    // ───────────────────────── Generation ─────────────────────────
    AsyncFunction("generate") Coroutine { prompt: String, options: Map<String, Any?>? ->
      gate.withLock {
        ensureAvailable()
        val req = buildRequest(prompt, options)
        val t0 = SystemClock.elapsedRealtime()
        val res = guarded { client().generateContent(req) }
        resultMap(res, SystemClock.elapsedRealtime() - t0, null)
      }
    }

    /** Streams tokens as `onToken` / `onThought` events tagged with requestId; resolves with the full result. */
    AsyncFunction("stream") Coroutine { requestId: String, prompt: String, options: Map<String, Any?>? ->
      gate.withLock {
        ensureAvailable()
        val req = buildRequest(prompt, options)
        val t0 = SystemClock.elapsedRealtime()
        var firstTokenMs: Long? = null
        val res = guarded {
          client().generateContent(req, object : StreamingCallback {
            override fun onNewText(additionalText: String) {
              if (firstTokenMs == null) firstTokenMs = SystemClock.elapsedRealtime() - t0
              sendEvent("onToken", mapOf("requestId" to requestId, "text" to additionalText))
            }
            override fun onNewThought(additionalThought: String) {
              sendEvent("onThought", mapOf("requestId" to requestId, "text" to additionalThought))
            }
          })
        }
        resultMap(res, SystemClock.elapsedRealtime() - t0, firstTokenMs)
      }
    }

    // ───────────────────────── On-Device GenAI Task Modules ─────────────────────────
    AsyncFunction("summarize") Coroutine { text: String, options: Map<String, Any?>? ->
      gate.withLock {
        val t0 = SystemClock.elapsedRealtime()
        val inputTypeStr = options?.get("inputType") as? String
        val outputTypeStr = options?.get("outputType") as? String
        val inputType = if (inputTypeStr == "conversation") SummarizerOptions.InputType.CONVERSATION else SummarizerOptions.InputType.ARTICLE
        val outputType = when (outputTypeStr) {
          "two_bullets" -> SummarizerOptions.OutputType.TWO_BULLETS
          "three_bullets" -> SummarizerOptions.OutputType.THREE_BULLETS
          else -> SummarizerOptions.OutputType.ONE_BULLET
        }

        try {
          val summarizer = Summarization.getClient(
            SummarizerOptions.builder(context)
              .setInputType(inputType)
              .setOutputType(outputType)
              .build()
          )
          val status = summarizer.checkFeatureStatus().await()
          if (status == FeatureStatus.AVAILABLE) {
            val res = summarizer.runInference(SummarizationRequest.builder(text).build()).await()
            val latency = SystemClock.elapsedRealtime() - t0
            summarizer.close()
            return@withLock mapOf(
              "summary" to res.summary,
              "latencyMs" to latency,
              "engine" to "mlkit-summarization",
              "source" to "hardware"
            )
          }
          summarizer.close()
        } catch (_: Throwable) {}

        // Fallback to Gemini Nano Prompt API
        ensureAvailable()
        val format = when (outputTypeStr) {
          "two_bullets" -> "Return exactly two concise bullet points."
          "three_bullets" -> "Return exactly three concise bullet points."
          else -> "Return a concise one-sentence or one-bullet summary."
        }
        val prompt = "Summarize the following text. $format\n\nText:\n$text"
        val req = buildRequest(prompt, mapOf(
          "systemInstruction" to "You are an expert on-device summarization engine running on Gemini Nano. $format"
        ))
        val res = guarded { client().generateContent(req) }
        val candidate = res.candidates.firstOrNull()?.text ?: ""
        val latency = SystemClock.elapsedRealtime() - t0
        mapOf(
          "summary" to candidate.trim(),
          "latencyMs" to latency,
          "engine" to "gemini-nano-prompt",
          "source" to "hardware"
        )
      }
    }

    AsyncFunction("proofread") Coroutine { text: String, options: Map<String, Any?>? ->
      gate.withLock {
        val t0 = SystemClock.elapsedRealtime()
        try {
          val proofreader = Proofreading.getClient(ProofreaderOptions.builder(context).build())
          val status = proofreader.checkFeatureStatus().await()
          if (status == FeatureStatus.AVAILABLE) {
            val res = proofreader.runInference(ProofreadingRequest.builder(text).build()).await()
            val suggestions = res.results.map { it.text }
            val latency = SystemClock.elapsedRealtime() - t0
            proofreader.close()
            return@withLock mapOf(
              "correctedText" to (suggestions.firstOrNull() ?: text),
              "suggestions" to suggestions,
              "latencyMs" to latency,
              "engine" to "mlkit-proofreading",
              "source" to "hardware"
            )
          }
          proofreader.close()
        } catch (_: Throwable) {}

        // Fallback to Gemini Nano Prompt API
        ensureAvailable()
        val prompt = "Proofread and correct grammar, spelling, and punctuation for the following text. Return only the corrected text without any preamble, explanation or quotes:\n\n$text"
        val req = buildRequest(prompt, mapOf(
          "systemInstruction" to "You are an on-device proofreading assistant running on Gemini Nano. Return only the corrected text."
        ))
        val res = guarded { client().generateContent(req) }
        val corrected = res.candidates.firstOrNull()?.text?.trim() ?: text
        val latency = SystemClock.elapsedRealtime() - t0
        mapOf(
          "correctedText" to corrected,
          "suggestions" to listOf(corrected),
          "latencyMs" to latency,
          "engine" to "gemini-nano-prompt",
          "source" to "hardware"
        )
      }
    }

    AsyncFunction("rewrite") Coroutine { text: String, tone: String? ->
      gate.withLock {
        val t0 = SystemClock.elapsedRealtime()
        val outputType = when (tone?.lowercase()) {
          "elaborate" -> RewriterOptions.OutputType.ELABORATE
          "emojify" -> RewriterOptions.OutputType.EMOJIFY
          "shorten" -> RewriterOptions.OutputType.SHORTEN
          "friendly" -> RewriterOptions.OutputType.FRIENDLY
          "professional" -> RewriterOptions.OutputType.PROFESSIONAL
          else -> RewriterOptions.OutputType.REPHRASE
        }

        try {
          val rewriter = Rewriting.getClient(
            RewriterOptions.builder(context).setOutputType(outputType).build()
          )
          val status = rewriter.checkFeatureStatus().await()
          if (status == FeatureStatus.AVAILABLE) {
            val res = rewriter.runInference(RewritingRequest.builder(text).build()).await()
            val suggestions = res.results.map { it.text }
            val latency = SystemClock.elapsedRealtime() - t0
            rewriter.close()
            return@withLock mapOf(
              "rewrittenText" to (suggestions.firstOrNull() ?: text),
              "suggestions" to suggestions,
              "latencyMs" to latency,
              "engine" to "mlkit-rewriting",
              "source" to "hardware"
            )
          }
          rewriter.close()
        } catch (_: Throwable) {}

        // Fallback to Gemini Nano Prompt API
        ensureAvailable()
        val instruction = when (tone?.lowercase()) {
          "elaborate" -> "Elaborate and expand upon this text with richer details."
          "emojify" -> "Add fitting emojis and lively expressive tone to this text."
          "shorten" -> "Concisely shorten this text while preserving key information."
          "friendly" -> "Rewrite this text in a warm, friendly, conversational tone."
          "professional" -> "Rewrite this text in a formal, polished, professional tone."
          else -> "Rephrase and polish this text."
        }
        val prompt = "$instruction Return only the rewritten text without quotes or explanations:\n\n$text"
        val req = buildRequest(prompt, mapOf(
          "systemInstruction" to "You are an on-device text rewriting engine running on Gemini Nano. $instruction"
        ))
        val res = guarded { client().generateContent(req) }
        val rewritten = res.candidates.firstOrNull()?.text?.trim() ?: text
        val latency = SystemClock.elapsedRealtime() - t0
        mapOf(
          "rewrittenText" to rewritten,
          "suggestions" to listOf(rewritten),
          "latencyMs" to latency,
          "engine" to "gemini-nano-prompt",
          "source" to "hardware"
        )
      }
    }

    // ───────────────────────── Multimodal Image Description ─────────────────────────
    AsyncFunction("describeImage") Coroutine { imageInput: String, style: String? ->
      gate.withLock {
        val t0 = SystemClock.elapsedRealtime()
        ensureAvailable()
        val cleanBase64 = if (imageInput.startsWith("data:") || (!imageInput.startsWith("file:") && !imageInput.startsWith("content:") && !imageInput.startsWith("/"))) {
          if (imageInput.contains(",")) imageInput.substringAfter(",") else imageInput
        } else {
          val uri = if (imageInput.startsWith("file:") || imageInput.startsWith("content:")) Uri.parse(imageInput) else Uri.fromFile(java.io.File(imageInput))
          val stream = context.contentResolver.openInputStream(uri)
          val bytes = stream?.readBytes() ?: throw NanoException("INVALID_IMAGE", "Cannot read image URI", null)
          stream.close()
          Base64.encodeToString(bytes, Base64.NO_WRAP)
        }
        val instruction = when (style?.lowercase()) {
          "detailed" -> "Provide an in-depth, structured description of this image. Detail the subjects, foreground, background, colors, textures, and lighting."
          "caption" -> "Provide a single concise caption sentence describing what is happening in this image."
          "labels" -> "List the top visual tags, entities, and subjects visible in this image separated by commas."
          else -> "Describe this image clearly and concisely in 2-3 sentences."
        }
        val req = buildRequest(instruction, mapOf(
          "imageBase64" to cleanBase64,
          "systemInstruction" to "You are Gemini Nano, Google Pixel's on-device multimodal vision assistant."
        ))
        val res = guarded { client().generateContent(req) }
        val candidate = res.candidates.firstOrNull()
        val latency = SystemClock.elapsedRealtime() - t0
        mapOf(
          "description" to (candidate?.text ?: ""),
          "finishReason" to finishName(candidate?.finishReason),
          "latencyMs" to latency,
          "engine" to "gemini-nano-vision",
          "source" to "hardware"
        )
      }
    }

    // ───────────────────────── ML Kit Vision APIs ─────────────────────────
    AsyncFunction("scanBarcodes") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val scanner = BarcodeScanning.getClient()
      val barcodes = scanner.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "barcodes" to barcodes.map { b ->
          mapOf(
            "rawValue" to b.rawValue,
            "displayValue" to b.displayValue,
            "format" to b.format,
            "valueType" to b.valueType,
            "boundingBox" to b.boundingBox?.let { box ->
              mapOf("left" to box.left, "top" to box.top, "right" to box.right, "bottom" to box.bottom)
            }
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("recognizeText") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val result = recognizer.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "text" to result.text,
        "blocks" to result.textBlocks.map { blk ->
          mapOf(
            "text" to blk.text,
            "lines" to blk.lines.map { it.text },
            "boundingBox" to blk.boundingBox?.let { box ->
              mapOf("left" to box.left, "top" to box.top, "right" to box.right, "bottom" to box.bottom)
            }
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("detectFaces") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .build()
      val detector = FaceDetection.getClient(options)
      val faces = detector.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "faces" to faces.map { f ->
          mapOf(
            "trackingId" to f.trackingId,
            "smilingProbability" to f.smilingProbability,
            "leftEyeOpenProbability" to f.leftEyeOpenProbability,
            "rightEyeOpenProbability" to f.rightEyeOpenProbability,
            "headEulerAngleX" to f.headEulerAngleX,
            "headEulerAngleY" to f.headEulerAngleY,
            "headEulerAngleZ" to f.headEulerAngleZ,
            "boundingBox" to mapOf("left" to f.boundingBox.left, "top" to f.boundingBox.top, "right" to f.boundingBox.right, "bottom" to f.boundingBox.bottom)
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("detectFaceMesh") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val detector = FaceMeshDetection.getClient(
        FaceMeshDetectorOptions.Builder().setUseCase(FaceMeshDetectorOptions.FACE_MESH).build()
      )
      val meshes = detector.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "meshes" to meshes.map { m ->
          mapOf(
            "pointsCount" to m.allPoints.size,
            "boundingBox" to mapOf("left" to m.boundingBox.left, "top" to m.boundingBox.top, "right" to m.boundingBox.right, "bottom" to m.boundingBox.bottom)
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("labelImage") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val labeler = ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS)
      val labels = labeler.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "labels" to labels.map { l ->
          mapOf(
            "text" to l.text,
            "confidence" to l.confidence,
            "index" to l.index
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("detectObjects") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val options = ObjectDetectorOptions.Builder()
        .setDetectorMode(ObjectDetectorOptions.SINGLE_IMAGE_MODE)
        .enableMultipleObjects()
        .enableClassification()
        .build()
      val detector = ObjectDetection.getClient(options)
      val objects = detector.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "objects" to objects.map { obj ->
          mapOf(
            "trackingId" to obj.trackingId,
            "boundingBox" to mapOf("left" to obj.boundingBox.left, "top" to obj.boundingBox.top, "right" to obj.boundingBox.right, "bottom" to obj.boundingBox.bottom),
            "labels" to obj.labels.map { mapOf("text" to it.text, "confidence" to it.confidence) }
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("detectPose") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val options = PoseDetectorOptions.Builder()
        .setDetectorMode(PoseDetectorOptions.SINGLE_IMAGE_MODE)
        .build()
      val detector = PoseDetection.getClient(options)
      val pose = detector.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "landmarks" to pose.allPoseLandmarks.map { lm ->
          mapOf(
            "type" to lm.landmarkType,
            "x" to lm.position.x,
            "y" to lm.position.y,
            "inFrameLikelihood" to lm.inFrameLikelihood
          )
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("segmentSelfie") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val options = SelfieSegmenterOptions.Builder()
        .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
        .build()
      val segmenter = Segmentation.getClient(options)
      val mask = segmenter.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "width" to mask.width,
        "height" to mask.height,
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("segmentSubject") Coroutine { imageInput: String ->
      val t0 = SystemClock.elapsedRealtime()
      val inputImage = imageFromUriOrBase64(imageInput)
      val options = SubjectSegmenterOptions.Builder()
        .enableForegroundConfidenceMask()
        .build()
      val segmenter = SubjectSegmentation.getClient(options)
      val result = segmenter.process(inputImage).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "subjectsCount" to result.subjects.size,
        "foregroundConfidence" to (result.foregroundConfidenceMask != null),
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("recognizeDigitalInk") Coroutine { strokesData: List<List<Map<String, Any?>>>, languageTag: String? ->
      val t0 = SystemClock.elapsedRealtime()
      val inkBuilder = Ink.builder()
      for (strokeList in strokesData) {
        val strokeBuilder = Ink.Stroke.builder()
        for (pt in strokeList) {
          val x = (pt["x"] as? Number)?.toFloat()
            ?: throw NanoException("INVALID_STROKE", "Ink point is missing a numeric x", null)
          val y = (pt["y"] as? Number)?.toFloat()
            ?: throw NanoException("INVALID_STROKE", "Ink point is missing a numeric y", null)
          val t = (pt["t"] as? Number)?.toLong() ?: 0L
          strokeBuilder.addPoint(Ink.Point.create(x, y, t))
        }
        inkBuilder.addStroke(strokeBuilder.build())
      }
      val ink = inkBuilder.build()
      val tag = languageTag ?: "en-US"
      val modelId = DigitalInkRecognitionModelIdentifier.fromLanguageTag(tag)
        ?: throw NanoException("UNSUPPORTED_LANGUAGE", "Unsupported ink language: $tag", null)
      val model = DigitalInkRecognitionModel.builder(modelId).build()
      val recognizer = DigitalInkRecognition.getClient(
        DigitalInkRecognizerOptions.builder(model).build()
      )
      val result = recognizer.recognize(ink).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "candidates" to result.candidates.map { c ->
          mapOf("text" to c.text, "score" to c.score)
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    // ───────────────────────── ML Kit Natural Language APIs ─────────────────────────
    AsyncFunction("identifyLanguage") Coroutine { text: String ->
      val t0 = SystemClock.elapsedRealtime()
      val identifier = LanguageIdentification.getClient()
      val code = identifier.identifyLanguage(text).awaitTask()
      val possibles = identifier.identifyPossibleLanguages(text).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "languageCode" to (if (code == "und") null else code),
        "possibleLanguages" to possibles.map {
          mapOf("languageCode" to it.languageTag, "confidence" to it.confidence)
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("translate") Coroutine { text: String, sourceLang: String, targetLang: String ->
      val t0 = SystemClock.elapsedRealtime()
      // ML Kit Translate supports a fixed language list; a tag outside it is rejected, never swapped for another language.
      val srcCode = TranslateLanguage.fromLanguageTag(sourceLang)
        ?: throw NanoException("UNSUPPORTED_LANGUAGE", "Unsupported translation source language: $sourceLang", null)
      val tgtCode = TranslateLanguage.fromLanguageTag(targetLang)
        ?: throw NanoException("UNSUPPORTED_LANGUAGE", "Unsupported translation target language: $targetLang", null)
      val options = TranslatorOptions.Builder()
        .setSourceLanguage(srcCode)
        .setTargetLanguage(tgtCode)
        .build()
      val translator = Translation.getClient(options)
      try {
        translator.downloadModelIfNeeded().awaitTask()
        val translated = translator.translate(text).awaitTask()
        val latency = SystemClock.elapsedRealtime() - t0
        mapOf(
          "translatedText" to translated,
          "sourceLanguage" to srcCode,
          "targetLanguage" to tgtCode,
          "latencyMs" to latency,
          "source" to "hardware"
        )
      } finally {
        translator.close()
      }
    }

    AsyncFunction("suggestReplies") Coroutine { history: List<Map<String, Any?>> ->
      val t0 = SystemClock.elapsedRealtime()
      val smartReply = SmartReply.getClient()
      val chat = ArrayList<TextMessage>()
      for (m in history) {
        val text = m["text"] as? String ?: continue
        val ts = (m["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis()
        val isLocal = m["isLocalUser"] == true
        val sender = m["sender"] as? String ?: if (isLocal) "local" else "remote"
        if (isLocal) {
          chat.add(TextMessage.createForLocalUser(text, ts))
        } else {
          chat.add(TextMessage.createForRemoteUser(text, ts, sender))
        }
      }
      val result = smartReply.suggestReplies(chat).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "suggestions" to result.suggestions.map { it.text },
        "status" to result.status,
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    AsyncFunction("extractEntities") Coroutine { text: String ->
      val t0 = SystemClock.elapsedRealtime()
      val extractor = EntityExtraction.getClient(
        EntityExtractorOptions.Builder(EntityExtractorOptions.ENGLISH).build()
      )
      extractor.downloadModelIfNeeded().awaitTask()
      val params = EntityExtractionParams.Builder(text).build()
      val annotations = extractor.annotate(params).awaitTask()
      val latency = SystemClock.elapsedRealtime() - t0
      mapOf(
        "entities" to annotations.flatMap { ann ->
          ann.entities.map { entity ->
            mapOf(
              "type" to entity.type,
              "text" to ann.annotatedText,
              "start" to ann.start,
              "end" to ann.end
            )
          }
        },
        "latencyMs" to latency,
        "source" to "hardware"
      )
    }

    // ───────────────────────── Vector Embeddings ─────────────────────────
    Function("isEmbeddingModelAvailable") {
      embeddingStatus()["available"] as Boolean
    }

    Function("getEmbeddingStatus") {
      embeddingStatus()
    }

    AsyncFunction("generateEmbedding") Coroutine { text: String ->
      withContext(Dispatchers.Default) { computeEmbedding(text) }
    }

    Function("close") {
      model?.close()
      model = null
      closeEmbedder()
    }

    OnDestroy {
      model?.close()
      model = null
      closeEmbedder()
    }
  }

  // MediaPipe Tasks TextEmbedder (TFLite, CPU/XNNPACK by default; no delegate is configured).
  // The model file must be a .tflite with TFLite metadata, placed at filesDir/models/text_embedder.tflite.
  private val embedderLock = Any()
  private var embedder: TextEmbedder? = null
  private var embedderDimension: Int? = null
  /** Reason the last initialisation attempt failed, with the file signature it failed for (retried when the file changes). */
  private var embedderFailure: String? = null
  private var embedderFailedSignature: String? = null

  private fun embeddingModelFile(): java.io.File = java.io.File(context.filesDir, "models/text_embedder.tflite")

  private fun closeEmbedder() {
    synchronized(embedderLock) {
      runCatching { embedder?.close() }
      embedder = null
      embedderDimension = null
      embedderFailure = null
      embedderFailedSignature = null
    }
  }

  /**
   * Returns the cached embedder, creating it on first use. Initialisation runs one real inference
   * ("probe") so a model that loads but cannot produce a float vector is reported unavailable and the
   * dimension is the model's actual output length.
   */
  private fun ensureEmbedder(): TextEmbedder = synchronized(embedderLock) {
    embedder?.let { return@synchronized it }
    val file = embeddingModelFile()
    if (!file.isFile) {
      throw NanoException("NOT_AVAILABLE", "Embedding model not found at ${file.absolutePath}", null)
    }
    val signature = "${file.length()}:${file.lastModified()}"
    if (embedderFailure != null && embedderFailedSignature == signature) {
      throw NanoException("MODEL_LOAD_FAILED", embedderFailure!!, null)
    }
    var created: TextEmbedder? = null
    try {
      val options = TextEmbedder.TextEmbedderOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetPath(file.absolutePath).build())
        // L2-normalised float vectors (unit length); no int8 quantisation, so floatEmbedding() is populated.
        .setL2Normalize(true)
        .setQuantize(false)
        .build()
      val fresh: TextEmbedder = TextEmbedder.createFromOptions(context, options)
      created = fresh
      val probe = fresh.embed("a").embeddingResult().embeddings().firstOrNull()?.floatEmbedding()
      if (probe == null || probe.isEmpty()) {
        throw NanoException("EMPTY_EMBEDDING", "Model ${file.name} produced no float embedding for a probe input", null)
      }
      embedder = fresh
      embedderDimension = probe.size
      embedderFailure = null
      embedderFailedSignature = null
      fresh
    } catch (e: Throwable) {
      runCatching { created?.close() }
      val reason = e.message ?: e.javaClass.simpleName
      embedderFailure = reason
      embedderFailedSignature = signature
      if (e is NanoException) throw e
      throw NanoException("MODEL_LOAD_FAILED", reason, e)
    }
  }

  /** `available` is true only when the file exists and the embedder initialised and produced a vector. */
  private fun embeddingStatus(): Map<String, Any?> {
    val file = embeddingModelFile()
    return try {
      ensureEmbedder()
      mapOf("available" to true, "reason" to null, "modelPath" to file.absolutePath, "dimension" to embedderDimension)
    } catch (e: NanoException) {
      mapOf("available" to false, "reason" to e.message, "modelPath" to file.absolutePath, "dimension" to null)
    }
  }

  private suspend fun computeEmbedding(text: String): Map<String, Any?> {
    if (text.isBlank()) {
      throw NanoException("EMPTY_INPUT", "Input text must not be empty", null)
    }
    val t0 = SystemClock.elapsedRealtime()
    val e = ensureEmbedder()
    val vector = try {
      // TextEmbedder.embed is not documented as thread-safe; serialise on the same lock.
      synchronized(embedderLock) {
        e.embed(text).embeddingResult().embeddings().firstOrNull()?.floatEmbedding()
      }
    } catch (ex: Throwable) {
      throw NanoException("INFERENCE_FAILED", ex.message ?: ex.javaClass.simpleName, ex)
    }
    if (vector == null || vector.isEmpty()) {
      throw NanoException("EMPTY_EMBEDDING", "Embedding model returned no float vector", null)
    }
    val latency = SystemClock.elapsedRealtime() - t0
    return mapOf(
      "embedding" to vector.map { it.toDouble() },
      "dimension" to vector.size,
      "latencyMs" to latency,
      "source" to "hardware"
    )
  }
}
