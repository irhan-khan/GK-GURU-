export interface Question {
  id: string;
  question: string;
  options: string[];
  correct_answer: string;
  category: string;
  subcategory: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  exam_source: string;
  year: string;
  probability_score?: number;
  user_answer?: string;
  is_bookmarked?: boolean;
  last_attempted?: number;
  attempt_count?: number;
  correct_count?: number;
  exam_count?: number; // Added for probability logic
}

export interface ExamRecord {
  id: string;
  name: string;
  year: string;
  upload_date: number;
  question_count: number;
}

export interface UserStats {
  xp: number;
  streak: number;
  last_active: number;
  badges: string[];
  total_attempts: number;
  total_correct: number;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  condition: string;
  description: string;
}

export interface MockTestSession {
  questions: Question[];
  currentIndex: number;
  score: number;
  startTime: number;
  timeTaken: number;
  results: { questionId: string; isCorrect: boolean; userAnswer: string }[];
  config: {
    count: number;
    category: string;
    difficulty: string;
  };
}

export interface SimilarQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  user_answer?: string;
}
