import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeAudio(base64Audio: string, mimeType: string = "audio/wav") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          },
        },
        {
          text: "Transcribe this audio. If it's a song, provide the lyrics. Provide line-level timestamps (start and end time in seconds) for each line. Format the output as JSON: { \"lines\": [ { \"text\": \"...\", \"startTime\": 0.5, \"endTime\": 2.3 }, ... ] }. Just return the JSON.",
        },
      ],
    });
    
    const text = response.text;
    // Try to extract JSON if Gemini wraps it in markdown blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        if (data.lines) {
          return {
            lyrics: data.lines.map((l: any) => l.text).join('\n'),
            timestamps: data.lines.map((l: any) => ({
              startTime: l.startTime,
              endTime: l.endTime
            }))
          };
        }
      } catch (e) {
        console.error("Failed to parse transcription JSON", e);
      }
    }
    
    // Fallback to plain text
    return { lyrics: text, timestamps: [] };
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

export async function translateText(text: string, targetLanguage: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following lyrics to ${targetLanguage}:\n\n${text}`,
    });
    return response.text;
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string, voiceName: string = "Kore") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio;
    }
    throw new Error("No audio generated");
  } catch (error) {
    console.error("TTS error:", error);
    throw error;
  }
}

export async function suggestMusicStyle(mood: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Based on the mood or genre "${mood}", which of these background track types fits best: "Lofi Chill", "Subway Techno", "Deep Space", or "Midnight Jazz"? Just return the name of the track type.`,
    });
    return response.text.trim();
  } catch (error) {
    console.error("AI Music suggestion error:", error);
    throw error;
  }
}
