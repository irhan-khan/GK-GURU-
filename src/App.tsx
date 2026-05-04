/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Upload, 
  BarChart3, 
  RotateCcw, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Star, 
  History, 
  Globe, 
  Scale, 
  TrendingUp, 
  FlaskConical, 
  Leaf, 
  Calendar, 
  Trophy, 
  ChevronRight, 
  Search, 
  Flame, 
  Zap, 
  BrainCircuit, 
  Map as MapIcon, 
  Lightbulb, 
  Timer, 
  Bookmark, 
  BookmarkCheck, 
  Settings, 
  LogOut, 
  FileText, 
  ArrowRight, 
  Loader2, 
  Download, 
  Menu, 
  User 
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  Legend 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { PROMPTS } from './prompts';
import { Question, ExamRecord, UserStats, Badge, MockTestSession, SimilarQuestion } from './types';

// --- Constants ---
const CATEGORIES = [
  'History', 'Geography', 'Polity & Constitution', 'Economy & Budget', 
  'Science & Technology', 'Environment & Ecology', 'Current Affairs', 
  'Art, Culture & Heritage', 'Sports & Awards', 'Important Days & Events', 
  'Miscellaneous GK'
];

const BADGES: Badge[] = [
  { id: 'first_step', name: 'First Step', icon: '🎯', condition: 'attempt first question', description: 'Attempted your first question!' },
  { id: 'century', name: 'Century', icon: '💯', condition: 'earn 100 XP', description: 'Reached 100 XP!' },
  { id: 'hot_streak', name: 'Hot Streak', icon: '🔥', condition: 'maintain 7-day streak', description: 'Maintained a 7-day streak!' },
  { id: 'scholar', name: 'Scholar', icon: '📚', condition: 'attempt 50 questions', description: 'Attempted 50 questions!' },
  { id: 'master', name: 'Master', icon: '🏆', condition: 'achieve 80%+ accuracy after 20+ attempts', description: 'Achieved 80%+ accuracy after 20+ attempts!' },
];

const COLORS = ['#FF6B35', '#F7C59F', '#4CC9F0', '#4361EE', '#7209B7', '#F72585', '#3A0CA3', '#4895EF', '#560BAD', '#B5179E', '#7B2CBF'];

// --- PDF Worker ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'practice' | 'upload' | 'stats' | 'revision' | 'settings' | 'mocktest'>('onboarding');
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('GK_GURU_API_KEY') || process.env.GEMINI_API_KEY || '');
  const [questions, setQuestions] = useState<Question[]>(JSON.parse(localStorage.getItem('GK_GURU_QUESTIONS') || '[]'));
  const [exams, setExams] = useState<ExamRecord[]>(JSON.parse(localStorage.getItem('GK_GURU_EXAMS') || '[]'));
  const [stats, setStats] = useState<UserStats>(JSON.parse(localStorage.getItem('GK_GURU_STATS') || '{"xp":0,"streak":0,"last_active":0,"badges":[],"total_attempts":0,"total_correct":0}'));
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [aiContent, setAiContent] = useState<{ similar: SimilarQuestion[], concept: string, mindMap: string, memoryTrick: string } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [mockSession, setMockSession] = useState<MockTestSession | null>(null);
  const [sessionAttempts, setSessionAttempts] = useState(parseInt(sessionStorage.getItem('GK_GURU_SESSION_ATTEMPTS') || '0'));

  useEffect(() => {
    sessionStorage.setItem('GK_GURU_SESSION_ATTEMPTS', sessionAttempts.toString());
  }, [sessionAttempts]);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('GK_GURU_QUESTIONS', JSON.stringify(questions));
  }, [questions]);

  useEffect(() => {
    localStorage.setItem('GK_GURU_EXAMS', JSON.stringify(exams));
  }, [exams]);

  useEffect(() => {
    localStorage.setItem('GK_GURU_STATS', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('GK_GURU_API_KEY', apiKey);
      if (view === 'onboarding') setView('dashboard');
    }
  }, [apiKey]);

  // --- AI Service ---
  const getAI = () => {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  const callGemini = async (prompt: string, isJson = false) => {
    const ai = getAI();
    if (!ai) throw new Error('API Key missing');
    
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ parts: [{ text: prompt + (isJson ? " Respond ONLY with valid JSON, no markdown, no explanation." : "") }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: isJson ? "application/json" : "text/plain"
      }
    });
    
    return response.text;
  };

  const calculateProbabilityScore = (q: Question) => {
    let score = 50;
    score += (q.exam_count || 1) * 10;
    if (q.difficulty === 'Hard') score += 5;
    
    const wasRecent = q.last_attempted && (Date.now() - q.last_attempted < 86400000 * 7);
    if (wasRecent) score += 5;
    
    return Math.min(99, score);
  };

  const updateStreak = (currentStats: UserStats): number => {
    const now = new Date();
    const last = new Date(currentStats.last_active);
    
    // Reset time to midnight for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    
    const diffDays = Math.floor((today - lastDay) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return currentStats.streak + 1;
    if (diffDays === 0) return currentStats.streak;
    return 1;
  };

  const checkBadges = (newStats: UserStats) => {
    const earned: string[] = [...newStats.badges];
    const accuracy = newStats.total_attempts > 0 ? (newStats.total_correct / newStats.total_attempts) : 0;

    if (!earned.includes('first_step') && newStats.total_attempts >= 1) earned.push('first_step');
    if (!earned.includes('century') && newStats.xp >= 100) earned.push('century');
    if (!earned.includes('hot_streak') && newStats.streak >= 7) earned.push('hot_streak');
    if (!earned.includes('scholar') && newStats.total_attempts >= 50) earned.push('scholar');
    if (!earned.includes('master') && newStats.total_attempts >= 20 && accuracy >= 0.8) earned.push('master');

    if (earned.length > newStats.badges.length) {
      const newBadgeId = earned.find(id => !newStats.badges.includes(id));
      const badge = BADGES.find(b => b.id === newBadgeId);
      if (badge) {
        alert(`🎉 Congratulations! You earned the "${badge.name}" badge!\n${badge.description}`);
      }
    }
    return earned;
  };

  // --- PDF Processing ---
  const processPDF = async (file: File, examName: string, examYear: string) => {
    setLoading(true);
    setLoadingMessage('Extracting text from PDF...');
    setUploadError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
        setLoadingMessage(`Reading page ${i} of ${pdf.numPages}...`);
      }

      // PDF Chunking
      const CHUNK_SIZE = 12000;
      const OVERLAP = 500;
      const chunks: string[] = [];
      for (let i = 0; i < fullText.length; i += CHUNK_SIZE - OVERLAP) {
        chunks.push(fullText.substring(i, i + CHUNK_SIZE));
        if (i + CHUNK_SIZE >= fullText.length) break;
      }

      let allExtractedQuestions: Question[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setLoadingMessage(`AI is scanning chunk ${i + 1} of ${chunks.length}...`);
        const prompt = PROMPTS.EXTRACT_QUESTIONS(examName, examYear, CATEGORIES, chunks[i]);
        const responseText = await callGemini(prompt, true);
        const chunkQuestions: Question[] = JSON.parse(responseText).map((q: any) => {
          // Check if question already exists to avoid duplicates from overlap
          const exists = allExtractedQuestions.some(eq => eq.question === q.question);
          if (exists) return null;

          const newQ: Question = {
            ...q,
            id: Math.random().toString(36).substr(2, 9),
            attempt_count: 0,
            correct_count: 0,
            exam_count: 1
          };
          return {
            ...newQ,
            probability_score: calculateProbabilityScore(newQ)
          };
        }).filter(Boolean);
        allExtractedQuestions = [...allExtractedQuestions, ...chunkQuestions];
      }

      // Merge with existing questions, updating exam_count for duplicates
      setQuestions(prev => {
        const merged = [...prev];
        allExtractedQuestions.forEach(newQ => {
          const idx = merged.findIndex(q => q.question === newQ.question);
          if (idx > -1) {
            merged[idx] = {
              ...merged[idx],
              exam_count: (merged[idx].exam_count || 1) + 1,
              probability_score: calculateProbabilityScore({ ...merged[idx], exam_count: (merged[idx].exam_count || 1) + 1 })
            };
          } else {
            merged.push(newQ);
          }
        });
        return merged;
      });

      setExams(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        name: examName,
        year: examYear,
        upload_date: Date.now(),
        question_count: allExtractedQuestions.length
      }]);

      setLoading(false);
      setView('dashboard');
    } catch (err: any) {
      console.error(err);
      let message = 'An unexpected error occurred while processing the PDF.';
      
      if (err.name === 'InvalidPDFException') {
        message = 'The PDF file appears to be corrupted or invalid.';
      } else if (err.name === 'PasswordException') {
        message = 'This PDF is password protected. Please upload an unprotected version.';
      } else if (err.name === 'MissingPDFException') {
        message = 'The PDF file could not be found.';
      } else if (err.name === 'UnexpectedResponseException') {
        message = 'There was an unexpected response from the server while loading the PDF.';
      } else if (err.message?.includes('API Key')) {
        message = 'Invalid Gemini API Key. Please check your settings.';
      } else if (err.message?.includes('JSON')) {
        message = 'The AI failed to parse the questions correctly. Please try again or with a different paper.';
      }
      
      setUploadError(message);
      setLoading(false);
      setView('upload');
    }
  };

  // --- Practice Logic ---
  const startPractice = (filter?: (q: Question) => boolean) => {
    const pool = filter ? questions.filter(filter) : questions;
    if (pool.length === 0) {
      alert('No questions found for this selection.');
      return;
    }
    const randomQ = pool[Math.floor(Math.random() * pool.length)];
    setActiveQuestion(randomQ);
    setShowExplanation(false);
    setAiContent(null);
    setView('practice');
  };

  const handleAnswer = async (answer: string) => {
    if (!activeQuestion) return;
    
    const isCorrect = answer === activeQuestion.correct_answer;
    
    // Update session attempts
    setSessionAttempts(prev => prev + 1);

    // Update stats
    setStats(prev => {
      const newStreak = updateStreak(prev);
      const newStats: UserStats = {
        ...prev,
        xp: prev.xp + (isCorrect ? 10 : 0),
        last_active: Date.now(),
        streak: newStreak,
        total_attempts: prev.total_attempts + 1,
        total_correct: prev.total_correct + (isCorrect ? 1 : 0)
      };
      newStats.badges = checkBadges(newStats);
      return newStats;
    });

    // Update question state
    setQuestions(prev => prev.map(q => q.id === activeQuestion.id ? {
      ...q,
      user_answer: answer,
      attempt_count: (q.attempt_count || 0) + 1,
      correct_count: (q.correct_count || 0) + (isCorrect ? 1 : 0),
      last_attempted: Date.now(),
      probability_score: calculateProbabilityScore({
        ...q,
        attempt_count: (q.attempt_count || 0) + 1,
        last_attempted: Date.now()
      })
    } : q));

    setActiveQuestion(prev => prev ? { ...prev, user_answer: answer } : null);
    setShowExplanation(true);
    
    // Fetch AI Insights
    fetchAiInsights(activeQuestion);
  };

  const fetchAiInsights = async (q: Question) => {
    setIsAiLoading(true);
    try {
      const prompt = PROMPTS.GET_INSIGHTS(q.question, q.correct_answer);
      const responseText = await callGemini(prompt, true);
      const data = JSON.parse(responseText);
      
      setAiContent({
        similar: data.similar,
        concept: data.concept,
        mindMap: data.mindMap,
        memoryTrick: data.memoryTrick
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleBookmark = (id: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, is_bookmarked: !q.is_bookmarked } : q));
    if (activeQuestion?.id === id) {
      setActiveQuestion(prev => prev ? { ...prev, is_bookmarked: !prev.is_bookmarked } : null);
    }
  };

  const startMockTest = (config: { count: number, category: string, difficulty: string }) => {
    let pool = questions;
    if (config.category !== 'All') pool = pool.filter(q => q.category === config.category);
    if (config.difficulty !== 'All') pool = pool.filter(q => q.difficulty === config.difficulty);
    
    if (pool.length < config.count) {
      alert(`Not enough questions in this category. Found only ${pool.length}.`);
      return;
    }

    const selected = [...pool].sort(() => 0.5 - Math.random()).slice(0, config.count);
    setMockSession({
      questions: selected,
      currentIndex: 0,
      score: 0,
      startTime: Date.now(),
      timeTaken: 0,
      results: [],
      config
    });
    setView('mocktest');
  };

  const handleMockAnswer = (answer: string) => {
    if (!mockSession) return;
    const currentQ = mockSession.questions[mockSession.currentIndex];
    const isCorrect = answer === currentQ.correct_answer;
    
    const newResults = [...mockSession.results, { questionId: currentQ.id, isCorrect, userAnswer: answer }];
    const newScore = isCorrect ? mockSession.score + 1 : mockSession.score;
    
    if (mockSession.currentIndex + 1 < mockSession.questions.length) {
      setMockSession({
        ...mockSession,
        currentIndex: mockSession.currentIndex + 1,
        score: newScore,
        results: newResults
      });
    } else {
      setMockSession({
        ...mockSession,
        score: newScore,
        results: newResults,
        timeTaken: Math.floor((Date.now() - mockSession.startTime) / 1000)
      });
    }
  };

  // --- Views ---
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy p-6 text-center">
        <div className="relative mb-8">
          <div className="h-24 w-24 animate-spin rounded-full border-4 border-white/10 border-t-saffron"></div>
          <BrainCircuit className="absolute inset-0 m-auto h-10 w-10 text-saffron animate-pulse" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">{loadingMessage}</h2>
        <p className="text-white/60">Our AI is working hard to prepare your study materials...</p>
      </div>
    );
  }

  if (view === 'onboarding') {
    return <OnboardingView setApiKey={setApiKey} />;
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-64">
      {/* Sidebar (Desktop) */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-white/10 bg-navy p-6 md:flex">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">GK Guru</h1>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          <NavButton active={view === 'dashboard'} icon={LayoutDashboard} label="Dashboard" onClick={() => setView('dashboard')} />
          <NavButton active={view === 'practice'} icon={BookOpen} label="Practice" onClick={() => startPractice()} />
          <NavButton active={view === 'upload'} icon={Upload} label="Upload PDF" onClick={() => setView('upload')} />
          <NavButton active={view === 'stats'} icon={BarChart3} label="Stats" onClick={() => setView('stats')} />
          <NavButton active={view === 'revision'} icon={RotateCcw} label="Revision" onClick={() => setView('revision')} />
        </nav>

        <div className="mt-auto pt-6">
          <button 
            onClick={() => setView('settings')}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-white/60 transition-all hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Bottom Nav (Mobile) */}
      <nav className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-around border-t border-white/10 bg-navy/80 p-4 backdrop-blur-xl md:hidden">
        <MobileNavButton active={view === 'dashboard'} icon={LayoutDashboard} onClick={() => setView('dashboard')} />
        <MobileNavButton active={view === 'practice'} icon={BookOpen} onClick={() => startPractice()} />
        <MobileNavButton active={view === 'upload'} icon={Upload} onClick={() => setView('upload')} />
        <MobileNavButton active={view === 'stats'} icon={BarChart3} onClick={() => setView('stats')} />
        <MobileNavButton active={view === 'revision'} icon={RotateCcw} onClick={() => setView('revision')} />
        <MobileNavButton active={view === 'settings'} icon={Settings} onClick={() => setView('settings')} />
      </nav>

      {/* Main Content Area */}
      <main className="mx-auto max-w-5xl p-6">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <DashboardView 
              questions={questions} 
              exams={exams} 
              stats={stats} 
              onPractice={startPractice} 
              onUpload={() => setView('upload')}
              onMockTest={() => setView('mocktest')}
            />
          )}
          {view === 'practice' && (
            <PracticeView 
              question={activeQuestion} 
              onAnswer={handleAnswer} 
              onNext={() => startPractice()}
              onBookmark={() => activeQuestion && toggleBookmark(activeQuestion.id)}
              aiContent={aiContent}
              isAiLoading={isAiLoading}
              showExplanation={showExplanation}
              sessionAttempts={sessionAttempts}
              onRedirectToUpload={() => setView('upload')}
            />
          )}
          {view === 'upload' && (
            <UploadView 
              onUpload={processPDF} 
              uploadError={uploadError} 
              onClearError={() => setUploadError(null)} 
            />
          )}
          {view === 'mocktest' && (
            <MockTestView 
              session={mockSession} 
              questions={questions}
              onStart={startMockTest}
              onAnswer={handleMockAnswer}
              onFinish={() => {
                setMockSession(null);
                setView('dashboard');
              }}
            />
          )}
          {view === 'stats' && <StatsView questions={questions} stats={stats} />}
          {view === 'revision' && (
            <RevisionView 
              questions={questions} 
              onPractice={startPractice}
              onToggleBookmark={toggleBookmark}
            />
          )}
          {view === 'settings' && (
            <SettingsView 
              apiKey={apiKey} 
              setApiKey={setApiKey} 
              onReset={() => {
                if (confirm('Are you sure? This will delete all your data.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Views ---

function OnboardingView({ setApiKey }: { setApiKey: (key: string) => void }) {
  const [input, setInput] = useState('');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-saffron shadow-2xl shadow-saffron/20">
          <Zap className="h-10 w-10 text-white" />
        </div>
        <h1 className="mb-2 text-4xl font-bold text-white">GK Guru</h1>
        <p className="mb-10 text-lg text-white/60">Crack Any Exam with AI-Powered GK Preparation</p>
        
        <div className="space-y-6 text-left">
          <FeatureItem icon={FileText} title="PDF Scanning" desc="Upload real exam papers and let AI extract questions." />
          <FeatureItem icon={TrendingUp} title="Probability Engine" desc="Know which topics are most likely to appear." />
          <FeatureItem icon={BrainCircuit} title="AI Insights" desc="Get mind maps, memory tricks, and deep concepts." />
        </div>

        <div className="mt-12 space-y-4">
          <div className="relative">
            <input 
              type="password" 
              placeholder="Enter Gemini API Key" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white placeholder:text-white/20 focus:border-saffron focus:outline-none"
            />
          </div>
          <p className="text-xs text-white/40">
            Get a free key from <a href="https://aistudio.google.com" target="_blank" className="text-saffron underline">aistudio.google.com</a>
          </p>
          <button 
            onClick={() => setApiKey(input)}
            className="w-full rounded-2xl saffron-gradient py-4 font-bold text-white shadow-lg shadow-saffron/20 transition-transform active:scale-95"
          >
            Start Your Journey
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DashboardView({ questions, exams, stats, onPractice, onUpload, onMockTest }: any) {
  const categoryData = CATEGORIES.map(cat => {
    const catQs = questions.filter((q: any) => q.category === cat);
    const avgProb = catQs.length > 0 
      ? Math.round(catQs.reduce((acc: number, q: any) => acc + (q.probability_score || 0), 0) / catQs.length)
      : 0;
    return {
      name: cat,
      value: catQs.length,
      avgProb
    };
  }).filter(d => d.value > 0);

  const accuracy = stats.total_attempts > 0
    ? Math.round((stats.total_correct / stats.total_attempts) * 100)
    : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Namaste, Aspirant!</h2>
          <p className="text-white/60">You have {questions.length} questions in your bank.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2">
            <Flame className="h-5 w-5 text-saffron" />
            <span className="font-bold">{stats.streak} Day Streak</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <span className="font-bold">{stats.xp} XP</span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Accuracy" value={`${accuracy}%`} color="text-green-400" />
        <StatCard label="Questions Solved" value={stats.total_attempts} color="text-blue-400" />
        <StatCard label="Exams Scanned" value={exams.length} color="text-saffron" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="mb-6 text-lg font-bold">Category Distribution</h3>
          <div className="h-64">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0D1B2A', border: 'none', borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-white/40">
                Upload a PDF to see analysis
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="mb-6 text-lg font-bold">Hot Topics 🔥</h3>
          <div className="space-y-4">
            {categoryData.sort((a, b) => b.avgProb - a.avgProb).slice(0, 4).map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-white/80">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-saffron">Avg Prob.</span>
                  <span className="text-sm font-bold">{cat.avgProb}%</span>
                </div>
              </div>
            ))}
            {categoryData.length === 0 && <p className="text-center text-white/40">Scan papers to identify hot topics.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold">Quick Practice</h3>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => onPractice()}
            className="rounded-full bg-saffron/20 px-6 py-2 text-sm font-bold text-saffron border border-saffron/30 hover:bg-saffron/30 transition-all"
          >
            All Questions
          </button>
          <button 
            onClick={() => onPractice((q: any) => q.difficulty === 'Hard')}
            className="rounded-full bg-gold/20 px-6 py-2 text-sm font-bold text-gold border border-gold/30 hover:bg-gold/30 transition-all"
          >
            Hard Only
          </button>
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => onPractice((q: any) => q.category === cat)}
              className="rounded-full bg-white/5 px-6 py-2 text-sm font-bold text-white/60 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <button 
          onClick={onMockTest}
          className="flex flex-1 items-center justify-center gap-3 rounded-2xl saffron-gradient py-6 text-xl font-bold shadow-xl shadow-saffron/20 transition-transform active:scale-95"
        >
          <Timer className="h-6 w-6" />
          Mock Test Mode
        </button>
        <button 
          onClick={onUpload}
          className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-white/5 py-6 text-xl font-bold border border-white/10 transition-all hover:bg-white/10 active:scale-95"
        >
          <Upload className="h-6 w-6" />
          Upload New Paper
        </button>
      </div>
    </motion.div>
  );
}

function PracticeView({ question, onAnswer, onNext, onBookmark, aiContent, isAiLoading, showExplanation, sessionAttempts, onRedirectToUpload }: any) {
  const [similarAttempts, setSimilarAttempts] = useState<Record<number, string>>({});

  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 rounded-full bg-white/5 p-6">
          <AlertCircle className="h-12 w-12 text-white/20" />
        </div>
        <h3 className="mb-2 text-xl font-bold">No Questions Found</h3>
        <p className="mb-8 text-white/60">Upload a PDF to start practicing.</p>
        <button 
          onClick={onRedirectToUpload}
          className="rounded-2xl saffron-gradient px-8 py-4 font-bold text-white shadow-lg shadow-saffron/20"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className="rounded-lg bg-saffron/20 px-3 py-1 text-xs font-bold text-saffron">{question.category}</span>
            <span className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-400">{question.difficulty}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold text-white/60">
            <Flame className="h-3 w-3 text-saffron" />
            <span>{sessionAttempts} done today</span>
          </div>
        </div>
        <button onClick={onBookmark} className="text-white/60 hover:text-saffron">
          {question.is_bookmarked ? <BookmarkCheck className="h-6 w-6 text-saffron" /> : <Bookmark className="h-6 w-6" />}
        </button>
      </div>

      <div className="glass-card p-8">
        <div className="mb-8 flex items-center gap-2 text-gold">
          <Star className="h-5 w-5 fill-gold" />
          <span className="text-sm font-bold">{question.probability_score}% Likely in {question.exam_source} 2025</span>
        </div>
        <h3 className="mb-10 text-2xl font-medium leading-relaxed">{question.question}</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          {question.options.map((opt: string, i: number) => {
            const isSelected = question.user_answer === opt;
            const isCorrect = opt === question.correct_answer;
            const showResult = showExplanation;
            
            return (
              <button
                key={i}
                disabled={showResult}
                onClick={() => onAnswer(opt)}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border border-white/10 p-5 text-left transition-all",
                  !showResult && "hover:bg-white/5 active:scale-95",
                  showResult && isCorrect && "border-green-500 bg-green-500/20",
                  showResult && isSelected && !isCorrect && "border-red-500 bg-red-500/20",
                  !showResult && isSelected && "border-saffron bg-saffron/20"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm font-bold",
                  showResult && isCorrect && "border-green-500 bg-green-500 text-white",
                  showResult && isSelected && !isCorrect && "border-red-500 bg-red-500 text-white"
                )}>
                  {String.fromCharCode(65 + i)}
                </div>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showExplanation && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex justify-center">
            <button 
              onClick={onNext}
              className="flex items-center gap-2 rounded-full saffron-gradient px-8 py-4 font-bold shadow-lg shadow-saffron/20"
            >
              Next Question <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <ExpandableSection title="📚 Interactive Similar Questions" icon={BookOpen}>
              {isAiLoading ? <LoadingAi /> : (
                <div className="space-y-6">
                  {aiContent?.similar.map((q: any, i: number) => (
                    <div key={i} className="rounded-xl bg-white/5 p-6 border border-white/5">
                      <p className="mb-4 font-medium">{q.question}</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {q.options.map((o: string, j: number) => {
                          const isSelected = similarAttempts[i] === o;
                          const isCorrect = o === q.correct_answer;
                          const hasAnswered = !!similarAttempts[i];
                          
                          return (
                            <button 
                              key={j}
                              disabled={hasAnswered}
                              onClick={() => setSimilarAttempts(prev => ({ ...prev, [i]: o }))}
                              className={cn(
                                "rounded-xl border border-white/10 p-3 text-left text-xs transition-all",
                                !hasAnswered && "hover:bg-white/10",
                                hasAnswered && isCorrect && "border-green-500 bg-green-500/20",
                                hasAnswered && isSelected && !isCorrect && "border-red-500 bg-red-500/20"
                              )}
                            >
                              {String.fromCharCode(65 + j)}. {o}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ExpandableSection>

            <ExpandableSection title="🔍 EXPLORE: Deep Concept" icon={Search}>
              {isAiLoading ? <LoadingAi /> : (
                <div className="prose prose-invert max-w-none text-white/80">
                  <ReactMarkdown>{aiContent?.concept || ''}</ReactMarkdown>
                </div>
              )}
            </ExpandableSection>

            <ExpandableSection title="🗺️ Mind Map + Memory Trick" icon={MapIcon}>
              {isAiLoading ? <LoadingAi /> : (
                <div className="space-y-6">
                  <div className="rounded-2xl bg-white/5 p-6 border border-white/5">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-gold">
                      <MapIcon className="h-4 w-4" /> Mind Map
                    </h4>
                    <pre className="whitespace-pre-wrap font-mono text-sm text-white/60">
                      {aiContent?.mindMap}
                    </pre>
                  </div>
                  <div className="rounded-2xl bg-saffron/10 p-6 border border-saffron/20">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-saffron">
                      <Lightbulb className="h-4 w-4" /> Memory Trick
                    </h4>
                    <p className="text-lg font-medium italic text-white">
                      "{aiContent?.memoryTrick}"
                    </p>
                  </div>
                </div>
              )}
            </ExpandableSection>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function UploadView({ onUpload, uploadError, onClearError }: { onUpload: (file: File, name: string, year: string) => void, uploadError: string | null, onClearError: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [examName, setExamName] = useState('SSC CGL');
  const [examYear, setExamYear] = useState('2024');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const validateFile = (selectedFile: File | undefined) => {
    setError(null);
    onClearError();
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Only PDF files are allowed.');
      setFile(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File size exceeds the 10MB limit.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    validateFile(droppedFile);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold">Upload Exam Paper</h2>
        <p className="text-white/60">AI will scan and extract GK questions automatically.</p>
      </div>

      {uploadError && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }} 
          className="rounded-2xl bg-red-500/10 p-4 border border-red-500/20"
        >
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{uploadError}</p>
          </div>
        </motion.div>
      )}

      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all hover:bg-white/10",
          error ? "border-red-500 bg-red-500/5" : "border-white/10 bg-white/5"
        )}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf" 
          onChange={(e) => validateFile(e.target.files?.[0])} 
        />
        <div className={cn(
          "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl",
          error ? "bg-red-500/20 text-red-500" : "bg-saffron/20 text-saffron"
        )}>
          {error ? <AlertCircle className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
        </div>
        
        {error ? (
          <div className="text-center">
            <p className="font-bold text-red-500">{error}</p>
            <p className="text-sm text-white/40">Please select a valid PDF file under 10MB.</p>
          </div>
        ) : file ? (
          <div className="text-center">
            <p className="font-bold text-white">{file.name}</p>
            <p className="text-sm text-white/40">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="font-bold text-white">Click or drag PDF here</p>
            <p className="text-sm text-white/40">Maximum file size: 10MB</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-bold text-white/60">Exam Name</label>
          <select 
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white focus:outline-none"
          >
            {['CUET', 'SSC CGL', 'SSC CHSL', 'UPSC', 'TET', 'State PCS', 'Other'].map(ex => (
              <option key={ex} value={ex} className="bg-navy">{ex}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-white/60">Exam Year</label>
          <input 
            type="number" 
            value={examYear}
            onChange={(e) => setExamYear(e.target.value)}
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white focus:outline-none"
          />
        </div>
      </div>

      <button 
        disabled={!file}
        onClick={() => file && onUpload(file, examName, examYear)}
        className="w-full rounded-2xl saffron-gradient py-5 text-xl font-bold text-white shadow-xl shadow-saffron/20 transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
      >
        Start AI Scanning
      </button>
    </motion.div>
  );
}

function MockTestConfig({ questions, onStart }: { questions: Question[], onStart: (config: any) => void }) {
  const [count, setCount] = useState(10);
  const [category, setCategory] = useState('All');
  const [difficulty, setDifficulty] = useState('All');

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold">Mock Test Setup</h2>
        <p className="text-white/60">Simulate a real exam environment with a timer.</p>
      </div>

      <div className="glass-card p-8 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-white/60">Number of Questions</label>
          <div className="flex gap-4">
            {[10, 20, 30, 50].map(c => (
              <button 
                key={c}
                onClick={() => setCount(c)}
                className={cn("flex-1 rounded-xl border py-3 font-bold transition-all", count === c ? "border-saffron bg-saffron/20 text-saffron" : "border-white/10 bg-white/5 text-white/40")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white/60">Category</label>
            <select 
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white focus:outline-none"
            >
              <option value="All" className="bg-navy">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="bg-navy">{cat}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-white/60">Difficulty</label>
            <select 
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white focus:outline-none"
            >
              <option value="All" className="bg-navy">All Difficulties</option>
              <option value="Easy" className="bg-navy">Easy</option>
              <option value="Medium" className="bg-navy">Medium</option>
              <option value="Hard" className="bg-navy">Hard</option>
            </select>
          </div>
        </div>

        <button 
          onClick={() => onStart({ count, category, difficulty })}
          className="w-full rounded-2xl saffron-gradient py-5 text-xl font-bold text-white shadow-xl shadow-saffron/20 transition-transform active:scale-95"
        >
          Start Mock Test
        </button>
      </div>
    </motion.div>
  );
}

function MockTestView({ session, questions, onStart, onAnswer, onFinish }: { session: MockTestSession | null, questions: Question[], onStart: (config: any) => void, onAnswer: (ans: string) => void, onFinish: () => void }) {
  if (!session) {
    return <MockTestConfig questions={questions} onStart={onStart} />;
  }

  const [timeLeft, setTimeLeft] = useState(60);
  const isFinished = session.currentIndex >= session.questions.length || session.results.length === session.questions.length;
  const currentQ = session.questions[session.currentIndex];

  useEffect(() => {
    if (isFinished) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onAnswer('TIMEOUT');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session.currentIndex, isFinished]);

  useEffect(() => {
    setTimeLeft(60);
  }, [session.currentIndex]);

  if (isFinished) {
    const accuracy = Math.round((session.score / session.questions.length) * 100);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-saffron/20 text-saffron">
          <Trophy className="h-12 w-12" />
        </div>
        <div>
          <h2 className="text-4xl font-bold">Test Completed!</h2>
          <p className="text-white/60">Here is how you performed.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass-card p-6">
            <p className="text-sm text-white/40">Score</p>
            <p className="text-3xl font-bold text-saffron">{session.score} / {session.questions.length}</p>
          </div>
          <div className="glass-card p-6">
            <p className="text-sm text-white/40">Accuracy</p>
            <p className="text-3xl font-bold text-green-400">{accuracy}%</p>
          </div>
          <div className="glass-card p-6">
            <p className="text-sm text-white/40">Time Taken</p>
            <p className="text-3xl font-bold text-blue-400">{session.timeTaken}s</p>
          </div>
        </div>

        <div className="space-y-4 text-left">
          <h3 className="text-xl font-bold">Review Answers</h3>
          <div className="space-y-3">
            {session.results.map((res, i) => {
              const q = session.questions.find(sq => sq.id === res.questionId);
              return (
                <div key={i} className={cn("rounded-xl p-4 border", res.isCorrect ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20")}>
                  <p className="mb-2 font-medium">{q?.question}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={res.isCorrect ? "text-green-400" : "text-red-400"}>
                      Your Answer: {res.userAnswer === 'TIMEOUT' ? 'Timed Out' : res.userAnswer}
                    </span>
                    <span className="text-white/40">Correct: {q?.correct_answer}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button 
          onClick={onFinish}
          className="w-full rounded-2xl saffron-gradient py-5 text-xl font-bold shadow-xl shadow-saffron/20 transition-transform active:scale-95"
        >
          Back to Dashboard
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold text-white/40">Question {session.currentIndex + 1} of {session.questions.length}</p>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-white/5">
            <div 
              className="h-full bg-saffron transition-all duration-500" 
              style={{ width: `${((session.currentIndex + 1) / session.questions.length) * 100}%` }}
            />
          </div>
        </div>
        <div className={cn("flex h-16 w-16 items-center justify-center rounded-full border-4 text-2xl font-bold", timeLeft < 10 ? "border-red-500 text-red-500 animate-pulse" : "border-saffron text-saffron")}>
          {timeLeft}
        </div>
      </div>

      <div className="glass-card p-8">
        <h3 className="mb-10 text-2xl font-medium leading-relaxed">{currentQ.question}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {currentQ.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAnswer(opt)}
              className="flex items-center gap-4 rounded-2xl border border-white/10 p-5 text-left transition-all hover:bg-white/5 active:scale-95"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm font-bold">
                {String.fromCharCode(65 + i)}
              </div>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsView({ questions, stats }: { questions: Question[], stats: UserStats }) {
  const categoryStats = CATEGORIES.map(cat => {
    const catQs = questions.filter(q => q.category === cat);
    const correct = catQs.reduce((acc, q) => acc + (q.correct_count || 0), 0);
    const totalAttempts = catQs.reduce((acc, q) => acc + (q.attempt_count || 0), 0);
    
    return {
      name: cat,
      accuracy: totalAttempts > 0 ? Math.round((correct / totalAttempts) * 100) : 0,
      count: catQs.length
    };
  }).filter(s => s.count > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Performance Analytics</h2>
        <div className="flex gap-2">
          {stats.badges.map(badgeId => {
            const badge = BADGES.find(b => b.id === badgeId);
            return (
              <div key={badgeId} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-xl" title={badge?.name}>
                {badge?.icon}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="glass-card p-6">
        <h3 className="mb-8 text-lg font-bold">Accuracy by Category</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryStats} layout="vertical">
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="name" type="category" width={150} tick={{ fill: 'white', fontSize: 12 }} />
              <RechartsTooltip contentStyle={{ backgroundColor: '#0D1B2A', border: 'none', borderRadius: '12px' }} />
              <Bar dataKey="accuracy" fill="#FF6B35" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="mb-4 text-lg font-bold text-red-400">Weak Areas</h3>
          <div className="space-y-3">
            {categoryStats.filter(s => s.accuracy < 50).map(s => (
              <div key={s.name} className="flex items-center justify-between rounded-xl bg-red-500/10 p-4">
                <span className="font-medium">{s.name}</span>
                <span className="font-bold text-red-400">{s.accuracy}%</span>
              </div>
            ))}
            {categoryStats.filter(s => s.accuracy < 50).length === 0 && <p className="text-white/40">Keep practicing to identify weak areas.</p>}
          </div>
        </div>
        <div className="glass-card p-6">
          <h3 className="mb-4 text-lg font-bold text-green-400">Strong Areas</h3>
          <div className="space-y-3">
            {categoryStats.filter(s => s.accuracy >= 70).map(s => (
              <div key={s.name} className="flex items-center justify-between rounded-xl bg-green-500/10 p-4">
                <span className="font-medium">{s.name}</span>
                <span className="font-bold text-green-400">{s.accuracy}%</span>
              </div>
            ))}
            {categoryStats.filter(s => s.accuracy >= 70).length === 0 && <p className="text-white/40">Master a category to see it here.</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RevisionView({ questions, onPractice, onToggleBookmark }: any) {
  const [search, setSearch] = useState('');
  const bookmarked = questions.filter((q: any) => q.is_bookmarked && q.question.toLowerCase().includes(search.toLowerCase()));
  const wrong = questions.filter((q: any) => q.attempt_count > 0 && q.correct_count === 0 && q.question.toLowerCase().includes(search.toLowerCase()));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Smart Revision</h2>
          <p className="text-white/60">Focus on your weak areas and bookmarks.</p>
        </div>
        <button 
          onClick={() => onPractice((q: any) => q.is_bookmarked || (q.attempt_count > 0 && q.correct_count === 0))}
          className="rounded-2xl saffron-gradient px-8 py-4 font-bold shadow-lg shadow-saffron/20 transition-transform active:scale-95"
        >
          Revise All
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/20" />
        <input 
          type="text" 
          placeholder="Search questions..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl bg-white/5 border border-white/10 pl-12 pr-6 py-4 text-white placeholder:text-white/20 focus:border-saffron focus:outline-none"
        />
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gold">
            <Bookmark className="h-5 w-5" /> Bookmarked Questions ({bookmarked.length})
          </h3>
          <div className="grid gap-4">
            {bookmarked.map((q: any) => (
              <RevisionCard key={q.id} question={q} onToggleBookmark={() => onToggleBookmark(q.id)} />
            ))}
            {bookmarked.length === 0 && <p className="text-white/40">No bookmarks yet.</p>}
          </div>
        </section>

        <section>
          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-red-400">
            <AlertCircle className="h-5 w-5" /> Focus Needed ({wrong.length})
          </h3>
          <div className="grid gap-4">
            {wrong.map((q: any) => (
              <RevisionCard key={q.id} question={q} onToggleBookmark={() => onToggleBookmark(q.id)} />
            ))}
            {wrong.length === 0 && <p className="text-white/40">Great job! No weak questions found.</p>}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function SettingsView({ apiKey, setApiKey, onReset }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <h2 className="text-3xl font-bold">Settings</h2>
      
      <div className="glass-card p-8">
        <h3 className="mb-6 text-lg font-bold">Gemini API Configuration</h3>
        <div className="space-y-4">
          <div className="relative">
            <input 
              type="password" 
              placeholder="Gemini API Key" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-white placeholder:text-white/20 focus:border-saffron focus:outline-none"
            />
          </div>
          <p className="text-xs text-white/40">
            Your API key is stored locally on your device.
          </p>
        </div>
      </div>

      <div className="glass-card p-8">
        <h3 className="mb-6 text-lg font-bold text-red-400">Danger Zone</h3>
        <button 
          onClick={onReset}
          className="flex items-center gap-2 rounded-xl border border-red-500/50 px-6 py-3 font-bold text-red-400 transition-all hover:bg-red-500/10"
        >
          <LogOut className="h-5 w-5" />
          Reset All Data
        </button>
      </div>
    </motion.div>
  );
}

// --- Helper Components ---

function NavButton({ active, icon: Icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
        active ? "saffron-gradient text-white shadow-lg shadow-saffron/20" : "text-white/60 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function MobileNavButton({ active, icon: Icon, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-xl transition-all",
        active ? "saffron-gradient text-white" : "text-white/40"
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

function FeatureItem({ icon: Icon, title, desc }: any) {
  return (
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-saffron">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h4 className="font-bold text-white">{title}</h4>
        <p className="text-sm text-white/40">{desc}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <div className="glass-card p-6">
      <p className="mb-1 text-sm font-bold text-white/40">{label}</p>
      <p className={cn("text-3xl font-bold", color)}>{value}</p>
    </div>
  );
}

function ExpandableSection({ title, icon: Icon, children }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="glass-card overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-6 text-left transition-all hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-saffron" />
          <span className="font-bold">{title}</span>
        </div>
        <ChevronRight className={cn("h-5 w-5 text-white/40 transition-transform", isOpen && "rotate-90")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 p-6"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoadingAi() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-saffron" />
      <p className="text-sm text-white/40">AI is generating deep insights for you...</p>
    </div>
  );
}

function RevisionCard({ question, onToggleBookmark }: any) {
  return (
    <div className="glass-card flex items-center justify-between p-5">
      <div className="flex-1">
        <div className="mb-2 flex gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-saffron">{question.category}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{question.exam_source} {question.year}</span>
        </div>
        <p className="font-medium text-white/90">{question.question}</p>
      </div>
      <button onClick={onToggleBookmark} className="ml-4 text-saffron">
        {question.is_bookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5 text-white/20" />}
      </button>
    </div>
  );
}
