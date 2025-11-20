import { GoogleGenAI, SchemaType, Type } from "@google/genai";

// Check for API Key
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

/**
 * Generates a cyberpunk avatar for a bot.
 */
export const generateBotAvatar = async (botName: string): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `Cyberpunk portrait of a hacker named ${botName}, pixel art style, neon colors, futuristic background, square ratio`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1', // Control aspect ratio as requested
      },
    });

    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (base64ImageBytes) {
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${botName}`;
  } catch (error) {
    console.error("Error generating avatar:", error);
    return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${botName}`;
  }
};

/**
 * Generates a secret word and category using Search Grounding for freshness.
 */
export const generateSecretWord = async (): Promise<{ word: string; category: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Give me a random noun that is a good subject for a game of 'Spyfall'. Return JSON with 'word' and 'category'.",
      config: {
        tools: [{ googleSearch: {} }], // Using Search Grounding as requested
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            category: { type: Type.STRING }
          },
          required: ["word", "category"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return { word: "Satellite", category: "Technology" };
  } catch (e) {
    console.error("Error generating word", e);
    return { word: "Cyberdeck", category: "Technology" };
  }
};

/**
 * Bot Logic: Generates a clue.
 * Uses 'Thinking' model for Impostors to deduce context.
 */
export const getBotMove = async (
  isImpostor: boolean,
  secretWord: string,
  history: string[],
  botName: string
): Promise<string> => {
  try {
    // Use Gemini 3 Pro with Thinking for complex deception
    if (isImpostor) {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `You are playing a social deduction game called Spyfall.
        You are the IMPOSTOR. You do NOT know the secret word.
        Your goal is to blend in.
        
        Here is what other players have said as clues about the secret word:
        ${history.length > 0 ? history.join("\n") : "No one has spoken yet."}
        
        Based on these clues, infer the context.
        Provide a single word or short phrase (max 3 words) that is vague enough to fit, but specific enough to sound like you know the word.
        Do not reveal that you are guessing.
        Output ONLY the clue.`,
        config: {
          thinkingConfig: { thinkingBudget: 32768 } // High budget for deep reasoning
        }
      });
      return response.text?.trim().replace(/["']/g, "") || "Interesting...";
    } else {
      // Civilians use faster model
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are playing Spyfall. You are a CIVILIAN.
        The secret word is: "${secretWord}".
        
        Provide a single word or short phrase (max 3 words) that hints at this word without revealing it too obviously.
        If you are too obvious, the Impostor will guess it and win.
        If you are too vague, others will think you are the Impostor.
        Output ONLY the clue.`,
      });
      return response.text?.trim().replace(/["']/g, "") || "It's technical.";
    }
  } catch (e) {
    console.error("Bot move error", e);
    return isImpostor ? "I agree." : "It's useful.";
  }
};

/**
 * Validates if the Impostor's guess is correct using Gemini.
 */
export const checkImpostorGuess = async (guess: string, secretWord: string): Promise<boolean> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `The secret word is "${secretWord}". The player guessed "${guess}".
      Is this guess substantially correct (synonym or very close concept)?
      Respond with JSON: { "correct": boolean }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correct: { type: Type.BOOLEAN }
          }
        }
      }
    });
    const result = JSON.parse(response.text || "{}");
    return !!result.correct;
  } catch (e) {
    // Fallback to strict string matching
    return guess.toLowerCase().trim() === secretWord.toLowerCase().trim();
  }
};
