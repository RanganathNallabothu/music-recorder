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
          text: "Transcribe this audio. If it's a song, provide the lyrics. Just return the text.",
        },
      ],
    });
    return response.text;
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
