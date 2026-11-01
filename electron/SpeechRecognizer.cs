using System;
using System.IO;
using System.Speech.Recognition;
using System.Text;

class SpeechRecognizerHelper {
    static void Main(string[] args) {
        Console.OutputEncoding = Encoding.UTF8;
        try {
            MemoryStream ms = null;

            // Check if audio file path is passed as argument
            if (args.Length > 0 && File.Exists(args[0])) {
                byte[] fileBytes = File.ReadAllBytes(args[0]);
                ms = new MemoryStream(fileBytes);
            } else {
                // Read WAV audio stream from standard input
                ms = new MemoryStream();
                using (Stream stdin = Console.OpenStandardInput()) {
                    stdin.CopyTo(ms);
                }
            }

            if (ms == null || ms.Length < 44) {
                Console.WriteLine("{\"success\":false,\"text\":\"\",\"error\":\"Audio stream is empty or too short\"}");
                Console.Out.Flush();
                return;
            }

            ms.Position = 0;

            using (SpeechRecognitionEngine engine = new SpeechRecognitionEngine(new System.Globalization.CultureInfo("en-US"))) {
                engine.LoadGrammar(new DictationGrammar());
                engine.SetInputToWaveStream(ms);

                // Perform recognition
                RecognitionResult result = engine.Recognize();

                if (result != null && !string.IsNullOrWhiteSpace(result.Text)) {
                    string safeText = result.Text.Trim()
                        .Replace("\\", "\\\\")
                        .Replace("\"", "\\\"")
                        .Replace("\r", "")
                        .Replace("\n", " ");

                    Console.WriteLine(string.Format("{{\"success\":true,\"text\":\"{0}\",\"confidence\":{1}}}", safeText, result.Confidence));
                } else {
                    // Clean silence or non-speech: return empty text without error
                    Console.WriteLine("{\"success\":true,\"text\":\"\",\"confidence\":0}");
                }
                Console.Out.Flush();
            }

            if (ms != null) {
                ms.Dispose();
            }
        } catch (Exception ex) {
            string safeErr = ex.Message
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "")
                .Replace("\n", " ");
            Console.WriteLine(string.Format("{{\"success\":false,\"text\":\"\",\"error\":\"{0}\"}}", safeErr));
            Console.Out.Flush();
        }
    }
}
