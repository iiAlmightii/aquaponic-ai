import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useStore } from '../../store';
import { PretextText } from '../ui/pretext-text';

const PRETEXT_BASE_FONT = '400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_TITLE_FONT = '600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_PROMPT_FONT = '500 1.125rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_HINT_FONT = '400 0.875rem Inter, "Noto Sans", "Segoe UI", sans-serif';

export function AISurvey() {
  const { session, loading, startSession, submitAnswer, goBackQuestion, analysis, resetSession } = useStore((state: any) => ({
    session: state.session,
    loading: state.loading,
    startSession: state.startSession,
    submitAnswer: state.submitAnswer,
    goBackQuestion: state.goBackQuestion,
    analysis: state.analysis,
    resetSession: state.resetSession,
  }));

  const [currentAnswer, setCurrentAnswer] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [parsedValue, setParsedValue] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        // Entering "Start AI Survey" should always begin from question 1.
        resetSession();
        await startSession();
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [resetSession, startSession]);

  const currentQuestion = session?.current_question;
  const progress = session ? (session.progress_answered / session.progress_total) * 100 : 0;
  const isComplete = session?.status === 'completed';

  // Update input text when question changes
  useEffect(() => {
    setCurrentAnswer('');
    setShowConfirmation(false);
  }, [currentQuestion?.id]);

  if (isInitializing || loading && !currentQuestion && !isComplete) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <div className="animate-pulse flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-600 animate-spin" />
          <span className="text-gray-600">Preparing your AI Farm Survey...</span>
        </div>
      </div>
    );
  }

  const handleNext = () => {
    if (!currentAnswer) return;
    setParsedValue(currentAnswer);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    try {
      await submitAnswer(currentQuestion.id, parsedValue, 'text', null, null);
      setShowConfirmation(false);
      setCurrentAnswer('');
      setParsedValue('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = async () => {
    if (showConfirmation) {
      setShowConfirmation(false);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await goBackQuestion();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = async () => {
    resetSession();
    setCurrentAnswer('');
    setShowConfirmation(false);
    setSubmitting(false);
    await startSession();
  };

  if (isComplete && analysis) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <PretextText
              text="Survey Complete!"
              font={PRETEXT_TITLE_FONT}
              lineHeight={40}
              className="text-gray-900 mb-2"
            />
            <PretextText
              text="AI analysis has been generated based on your responses"
              font={PRETEXT_BASE_FONT}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-emerald-50 rounded-lg p-6 text-center">
              <p className="text-sm text-emerald-600 mb-2">Projected Revenue</p>
              <p className="text-emerald-900 font-medium text-lg">₹{analysis.metrics?.annual_revenue?.toLocaleString() || '---'}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 text-center">
              <p className="text-sm text-amber-600 mb-2">Estimated Costs</p>
              <p className="text-amber-900 font-medium text-lg">₹{(analysis.metrics?.capex_total + analysis.metrics?.annual_opex)?.toLocaleString() || '---'}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 text-center">
              <p className="text-sm text-blue-600 mb-2">Net Profit</p>
              <p className="text-blue-900 font-medium text-lg">₹{analysis.metrics?.annual_profit?.toLocaleString() || '---'}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="text-gray-900 mb-4 font-semibold">AI Recommendations</h3>
            <ul className="space-y-3">
              {(analysis.recommendations || []).map((rec: string, index: number) => (
                <li key={index} className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600">{rec}</span>
                </li>
              ))}
              {!analysis.recommendations?.length && (
                <li className="text-gray-500 italic">Analysis generated successfully.</li>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRestart} variant="outline" className="flex-1">
              Start New Survey
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              View Detailed Report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <p className="text-gray-500">Failed to load survey question.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-emerald-600 mb-4">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium">AI-Powered Survey</span>
          </div>
          <PretextText
            text="Aquaponics Planning Survey"
            font={PRETEXT_TITLE_FONT}
            lineHeight={40}
            className="text-gray-900 mb-2"
          />
          <PretextText
            text="Answer a few questions to get personalized farm planning recommendations"
            font={PRETEXT_BASE_FONT}
            lineHeight={24}
            className="text-gray-600"
          />
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              Question {session.progress_answered + 1} of {session.progress_total}
            </span>
            <span className="text-sm font-medium text-emerald-600">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {!showConfirmation ? (
          <div className="mb-8">
            <Label className="text-lg mb-2 block text-gray-900 font-medium">Question</Label>
            <PretextText
              text={currentQuestion.text}
              font={PRETEXT_PROMPT_FONT}
              lineHeight={30}
              className="text-gray-900 mb-2"
            />
            {currentQuestion.hint && (
              <PretextText
                text={currentQuestion.hint}
                font={PRETEXT_HINT_FONT}
                lineHeight={22}
                className="text-sm text-gray-500 mb-4"
              />
            )}

            {(currentQuestion.type === 'text' || currentQuestion.type === 'number') && (
              <div className="flex items-center gap-2">
                {currentQuestion.unit === '₹' && (
                  <span className="text-gray-500">₹</span>
                )}
                <Input
                  type={currentQuestion.type}
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="text-lg py-6"
                  autoFocus
                />
                {currentQuestion.unit && currentQuestion.unit !== '₹' && (
                  <span className="text-gray-500">{currentQuestion.unit}</span>
                )}
              </div>
            )}

            {(currentQuestion.type === 'select' || currentQuestion.type === 'boolean') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.type === 'boolean' ? ['yes', 'no'] : currentQuestion.options || []).map((option: string) => (
                  <button
                    key={option}
                    onClick={() => setCurrentAnswer(option)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      currentAnswer === option
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'multiselect' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.options || []).map((option: string) => {
                  const selectedItems = currentAnswer ? currentAnswer.split(', ') : [];
                  const isSelected = selectedItems.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        let newArr = [...selectedItems];
                        if (isSelected) newArr = newArr.filter(i => i !== option);
                        else newArr.push(option);
                        setCurrentAnswer(newArr.join(', '));
                      }}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900 mb-2">Please confirm</p>
                  <PretextText
                    text={`You answered: ${parsedValue}`}
                    font={PRETEXT_PROMPT_FONT}
                    lineHeight={28}
                    className="text-blue-800"
                    whiteSpace="pre-wrap"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={session.progress_answered === 0 && !showConfirmation || submitting}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {!showConfirmation ? (
            <Button
              onClick={handleNext}
              disabled={!currentAnswer}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {session.progress_answered === session.progress_total - 1 ? 'Complete' : 'Next'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? 'Submitting...' : 'Confirm & Continue'}
              <CheckCircle className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
