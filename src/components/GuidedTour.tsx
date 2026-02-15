import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TOUR_STORAGE_KEY = 'dp-tour-completed';

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    description: 'Switch between Home, Work, Sync, Insights, and Settings from here.',
    position: 'right',
  },
  {
    target: '[data-tour="focus-mode"]',
    title: 'Focus Mode',
    description: 'Filter your dashboard to Tactical, Strategic, or Minimal views to reduce noise.',
    position: 'bottom',
  },
  {
    target: '[data-tour="panel-area"]',
    title: 'Your Command Center',
    description: 'Drag and reorder panels to customize your dashboard. Use the edit button to rearrange.',
    position: 'top',
  },
];

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    const onboarded = localStorage.getItem('dp-focus-mode'); // set after onboarding
    if (!completed && onboarded) {
      // Delay to let UI render
      const timer = setTimeout(() => setActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  if (!active) return null;

  const currentStep = TOUR_STEPS[step];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]" onClick={dismiss} />
      
      {/* Tooltip */}
      <div className="fixed z-[61] bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm mx-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-xl animate-fade-in">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                Step {step + 1} of {TOUR_STEPS.length}
              </p>
              <h3 className="text-sm font-bold">{currentStep.title}</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1" onClick={dismiss}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{currentStep.description}</p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-xs text-muted-foreground">
              Skip tour
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={prev} className="text-xs">
                  <ChevronLeft className="h-3 w-3 mr-1" /> Back
                </Button>
              )}
              <Button size="sm" onClick={next} className="text-xs">
                {step < TOUR_STEPS.length - 1 ? (
                  <>Next <ChevronRight className="h-3 w-3 ml-1" /></>
                ) : 'Finish'}
              </Button>
            </div>
          </div>
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
