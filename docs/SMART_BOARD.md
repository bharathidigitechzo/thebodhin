# Smart board

On the smart board, a tutor writes by hand in any supported language and the writing becomes neat, typed text in the same place. Hand-drawn boxes, circles, triangles, lines and arrows snap to clean shapes. Learners in a live class see the same board as it is drawn.

## Where to find it

- **Live class (tutor):** Board tab in the host room (`/edu/host/[id]`). Every change goes to learners over the room's data channel.
- **Live class (learner):** when the tutor opens the Board, the learner's stage switches to it automatically. It is read-only.
- **Standalone:** Educator → More → Teaching → Smart board (`/edu/board`). Use it on a classroom TV or projector, a tablet, or to practise before a class.

## How it works

| Step | What happens | Where |
|---|---|---|
| Pen stroke | Smoothed (Chaikin) so shaky lines look like a good pen | `core/ink.ts` `smooth` |
| Neat mode: shape | One stroke that is a line, arrow, box, circle or triangle becomes a perfect shape. Small marks and curly strokes stay handwriting | `recogniseShape` |
| Neat mode: writing | Strokes written close together in time and place form one word. After a 1-second pause the word goes to the recogniser | `joinsGroup`, `SmartBoard` |
| Recognised | The ink is replaced by text at the same spot and size, in a font for that script (Noto Tamil, Devanagari and so on) | `textPlacement`, `scriptOf` |
| Tap the text | Other suggestions, "Back to handwriting", Delete | `SmartBoard` |
| Other tools | Type tool (keyboard, any language), eraser (touch an item), 5 colours, undo/redo, clear, language picker, Neat on/off | |
| Status bar | Always shows the state: Neat on · தமிழ் · engine, "Making it neat…", or what is not available here | |

Languages in the picker: English, Tamil, Hindi, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Arabic and Maths. ML Kit supports 300+ languages, so more can be added to `INK_LANGS`.

## Handwriting engines (`ui/ink/recognizer.ts`)

The board picks the first engine that is available.

1. **On-device, phones and tablets:** Google ML Kit Digital Ink (`modules/bodhin-ink`, Kotlin + Swift). It is free, works offline after a one-time download of about 20 MB per language, and is private because ink never leaves the device. It needs an EAS development or store build; it does not work in Expo Go.
2. **Browser:** Chrome's built-in Handwriting Recognition API, on devices that ship it (mainly ChromeOS).
3. **Server:** set `EXPO_PUBLIC_INK_URL`. It receives a POST of `{lang, width, height, strokes:[[x,y,t]…]}` and must return `{candidates:[…]}`. Use this to give every web browser handwriting by connecting a cloud handwriting service (that service is paid).
4. **None:** shapes still snap and handwriting stays as neat ink. The status says so, and the Type tool works in every language.

## Status, honestly

- **Tested here:** the shape and grouping engine (50 checks, including wobbly versions of each shape and "writing must not become shapes"). Also a browser test with real mouse drawing (23 checks): shapes snap, Tamil typing works, the language picker works, and the board works inside the live class. With the browser engine connected, a handwritten word becomes வணக்கம், suggestions can be picked, and the text can go back to handwriting.
- **Not tested here:** real recognition accuracy. The browser test uses a stand-in recogniser with fixed answers, because this preview environment has no handwriting engine. The ML Kit module is written but has not been compiled. The developer must build it with EAS and try it on a real Android phone and iPhone. The preview link shows shapes and typing; handwriting-to-text appears only where an engine exists.
- **Developer checklist:** (1) `eas build --profile development` for Android and iOS. (2) On the phone, open Smart board, pick தமிழ், and wait for the download. (3) Write வணக்கம் and check the text. (4) Try Hindi and maths. (5) Open a live class on two devices and check that the learner sees the board.
