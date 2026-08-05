export type TutorialTarget = "cat" | "shell";

export type TutorialStep = {
  id: string;
  target: TutorialTarget;
  domTarget: string | null;
  title: string;
  body: string;
  domTitle?: string;
  domBody?: string;
  reward: number;
};

export type TutorialState = {
  stepIndex: number;
  done: boolean;
  rewarded: string[];
};

export declare const TUTORIAL_KEY: string;
export declare const TUTORIAL_NAMING_REWARD: number;
export declare const TUTORIAL_STEPS: TutorialStep[];
export declare const TUTORIAL_STEP_IDS: string[];

export declare function createTutorialState(): TutorialState;
export declare function parseTutorialState(
  raw: string | null,
): TutorialState;
export declare function currentTutorialStep(
  state: TutorialState | null,
): TutorialStep | null;
export declare function completeTutorialStep(
  state: TutorialState,
  stepId: string,
): { state: TutorialState; reward: number };
export declare function skipTutorial(state: TutorialState): TutorialState;
export declare function readTutorialState(): TutorialState;
export declare function writeTutorialState(state: TutorialState): void;
