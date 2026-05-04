export const PROMPTS = {
  EXTRACT_QUESTIONS: (examName: string, examYear: string, categories: string[], text: string) => `
    Extract all GK/GS questions from this exam paper text. 
    For each question return a JSON array of objects: 
    { 
      "question": "string", 
      "options": ["string", "string", "string", "string"], 
      "correct_answer": "string", 
      "category": "string", 
      "subcategory": "string", 
      "difficulty": "Easy" | "Medium" | "Hard", 
      "exam_source": "${examName}", 
      "year": "${examYear}" 
    }.
    Categories to use: ${categories.join(', ')}.
    Ensure correct_answer matches one of the options exactly.
    Text: ${text}
  `,
  GET_INSIGHTS: (question: string, correctAnswer: string) => `
    Based on this GK question: "${question}" (Correct Answer: "${correctAnswer}"), provide:
    1. 5 similar practice questions with options and correct answers.
    2. A deep concept explanation (200 words).
    3. A text-based mind map (using bullet points and indentation).
    4. A memory trick or mnemonic to remember the answer.
    
    Return ONLY a JSON object:
    {
      "similar": [
        { "question": "...", "options": ["...", "...", "...", "..."], "correct_answer": "..." }
      ],
      "concept": "...",
      "mindMap": "...",
      "memoryTrick": "..."
    }
  `
};
