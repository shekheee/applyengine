/**
 * Starter behavioural questions for the story bank. Each points at the
 * competencies it tests, what a strong answer shows, and prompts to help
 * recall a matching story from your own work.
 */
export type BehavioralQuestion = {
  id: string;
  group: "Core" | "Execution" | "People" | "Applied AI & labs";
  question: string;
  competencies: string[];
  amazon: string[];
  testing: string;
  jog: string[];
};

export const BEHAVIORAL_QUESTIONS: BehavioralQuestion[] = [
  {
    id: "q-intro",
    group: "Core",
    question: "Walk me through your background and why this role, now.",
    competencies: ["impact & results", "mission & AI safety"],
    amazon: [],
    testing: "A crisp 90-second narrative with a clear through-line that ends at this role.",
    jog: [
      "Your two or three biggest wins, with numbers.",
      "The thread connecting your jobs (evals, data, shipping ML).",
      "What you want next that your current role cannot give you.",
    ],
  },
  {
    id: "q-proud",
    group: "Core",
    question: "Tell me about the project you are most proud of.",
    competencies: ["impact & results", "technical depth", "ownership"],
    amazon: ["Deliver Results", "Ownership"],
    testing: "Your judgement and personal contribution on something hard that mattered.",
    jog: [
      "Something you would happily explain line by line.",
      "A project where the outcome changed a decision or a product.",
      "Work you pushed through when it could have stalled.",
    ],
  },
  {
    id: "q-ownership",
    group: "Core",
    question: "Tell me about a time you took ownership of something outside your role.",
    competencies: ["ownership", "raising the bar"],
    amazon: ["Ownership"],
    testing: "You act like an owner: you spot the gap, take it on, and see it through.",
    jog: [
      "A broken process or tool nobody owned.",
      "An incident you stayed with until it was fixed properly.",
      "A cross-team problem you volunteered to drive.",
    ],
  },
  {
    id: "q-ambiguity",
    group: "Core",
    question: "Describe a time you had to make progress with an ambiguous goal or missing information.",
    competencies: ["ambiguity", "speed & bias for action"],
    amazon: ["Bias for Action", "Are Right, A Lot"],
    testing: "How you turn a fuzzy ask into a plan: questions, assumptions, small bets.",
    jog: [
      "A vague request from a stakeholder or customer.",
      "A new domain where nobody knew the right metric.",
      "When you shipped a first version to learn what was needed.",
    ],
  },
  {
    id: "q-failure",
    group: "Core",
    question: "Tell me about a time you failed or made a significant mistake.",
    competencies: ["failure & learning"],
    amazon: ["Learn and Be Curious", "Earn Trust"],
    testing: "Honest ownership of a real mistake, what you changed, and that it did not recur.",
    jog: [
      "A bug or bad data you shipped.",
      "An estimate or bet that was badly wrong.",
      "A time you misread what a stakeholder needed.",
    ],
  },
  {
    id: "q-feedback",
    group: "Core",
    question: "Tell me about difficult feedback you received and what you changed.",
    competencies: ["failure & learning", "raising the bar"],
    amazon: ["Learn and Be Curious", "Earn Trust"],
    testing: "Self-awareness: you hear hard feedback without defending, and act on it.",
    jog: [
      "Performance review comments that stung.",
      "A code review or design review that changed how you work.",
      "Feedback about communication or how you came across.",
    ],
  },
  {
    id: "q-deadline",
    group: "Execution",
    question: "Tell me about delivering under a tight deadline. What did you cut, and why?",
    competencies: ["speed & bias for action", "impact & results"],
    amazon: ["Deliver Results", "Bias for Action"],
    testing: "Prioritisation under pressure: protecting what matters, cutting the rest consciously.",
    jog: [
      "A launch, customer demo or audit date that could not move.",
      "Scope you negotiated away and how you explained it.",
      "Corners you refused to cut.",
    ],
  },
  {
    id: "q-tradeoff",
    group: "Execution",
    question: "Describe a technical decision with a real trade-off. How did you decide?",
    competencies: ["technical depth", "ambiguity"],
    amazon: ["Are Right, A Lot", "Dive Deep"],
    testing: "Structured reasoning: the options, the criteria, the evidence, and the call.",
    jog: [
      "Build versus buy, or which model or architecture to use.",
      "Speed versus accuracy, or cost versus quality.",
      "A decision you would make differently now.",
    ],
  },
  {
    id: "q-hard-problem",
    group: "Execution",
    question: "Tell me about the hardest technical problem or bug you have solved.",
    competencies: ["technical depth", "ownership"],
    amazon: ["Dive Deep", "Ownership"],
    testing: "Depth: how you narrowed it down, the dead ends, and the root cause.",
    jog: [
      "A flaky or silent failure that took days to find.",
      "Results that were wrong in a way nobody noticed at first.",
      "A performance or scaling problem you diagnosed.",
    ],
  },
  {
    id: "q-data-decision",
    group: "Execution",
    question: "Tell me about a time data changed your mind or your team's direction.",
    competencies: ["impact & results", "technical depth"],
    amazon: ["Dive Deep", "Are Right, A Lot"],
    testing: "That you check assumptions with evidence and follow it even when inconvenient.",
    jog: [
      "An analysis that killed or rescued a project.",
      "A metric that disagreed with everyone's intuition.",
      "A pilot whose results surprised the team.",
    ],
  },
  {
    id: "q-simplify",
    group: "Execution",
    question: "Tell me about a time you significantly simplified a process or system.",
    competencies: ["raising the bar", "impact & results"],
    amazon: ["Invent and Simplify", "Frugality"],
    testing: "That you remove complexity and cost, not just add features.",
    jog: [
      "A manual process you automated.",
      "A pipeline or codebase you made much smaller or faster.",
      "A meeting, review or handoff you eliminated.",
    ],
  },
  {
    id: "q-priorities",
    group: "Execution",
    question: "Tell me about juggling competing priorities. How did you choose?",
    competencies: ["ambiguity", "speed & bias for action"],
    amazon: ["Deliver Results", "Think Big"],
    testing: "A clear prioritisation method and honest communication about what slips.",
    jog: [
      "Two stakeholders who both needed you this week.",
      "Roadmap work versus urgent fixes.",
      "Something you deliberately said no to.",
    ],
  },
  {
    id: "q-quality",
    group: "Execution",
    question: "Tell me about a time you insisted on quality when others wanted to move faster.",
    competencies: ["raising the bar", "conflict & disagreement"],
    amazon: ["Insist on the Highest Standards"],
    testing: "That your standards are reasoned, not stubborn, and you find a path to both.",
    jog: [
      "Evals, tests or reviews you would not skip.",
      "A launch you delayed for a real risk.",
      "Where you compromised, and how you contained the risk.",
    ],
  },
  {
    id: "q-disagree-senior",
    group: "People",
    question: "Tell me about a time you disagreed with your manager or someone senior.",
    competencies: ["conflict & disagreement"],
    amazon: ["Have Backbone; Disagree and Commit"],
    testing: "You speak up with evidence, stay respectful, and commit once a decision is made.",
    jog: [
      "A plan or estimate you thought was wrong.",
      "A technical choice imposed from above.",
      "A time you lost the argument and still made it work.",
    ],
  },
  {
    id: "q-conflict-peer",
    group: "People",
    question: "Tell me about a conflict with a teammate and how you resolved it.",
    competencies: ["conflict & disagreement", "collaboration"],
    amazon: ["Earn Trust"],
    testing: "Empathy and directness: you understand their side and fix the working relationship.",
    jog: [
      "Disagreement over ownership or credit.",
      "Different working styles or quality bars.",
      "A handoff that went badly.",
    ],
  },
  {
    id: "q-influence",
    group: "People",
    question: "Tell me about a time you convinced others without having authority over them.",
    competencies: ["leadership & influence"],
    amazon: ["Earn Trust", "Think Big"],
    testing: "How you build the case and bring people along: data, prototypes, allies.",
    jog: [
      "Getting another team to adopt your tool or approach.",
      "Changing a team convention or process.",
      "Winning budget or time for something you believed in.",
    ],
  },
  {
    id: "q-mentor",
    group: "People",
    question: "Tell me about a time you helped someone grow or raised your team's bar.",
    competencies: ["leadership & influence", "raising the bar"],
    amazon: ["Hire and Develop the Best", "Insist on the Highest Standards"],
    testing: "That you multiply others: coaching, standards, documentation, hiring.",
    jog: [
      "Someone you onboarded or mentored.",
      "A guide, template or review practice you introduced.",
      "Interviews or hiring you helped with.",
    ],
  },
  {
    id: "q-customer",
    group: "People",
    question: "Tell me about a time you went beyond what was asked to help a customer or user.",
    competencies: ["customer focus"],
    amazon: ["Customer Obsession"],
    testing: "That you start from the customer's real problem, not the ticket.",
    jog: [
      "A user complaint you dug into personally.",
      "A request where the real need was different from the ask.",
      "Feedback you turned into a product change.",
    ],
  },
  {
    id: "q-push-back",
    group: "People",
    question: "Tell me about a time you pushed back on a customer or stakeholder request.",
    competencies: ["customer focus", "conflict & disagreement"],
    amazon: ["Customer Obsession", "Have Backbone; Disagree and Commit"],
    testing: "That you protect customers' long-term interest and say no well.",
    jog: [
      "A feature request that would have caused harm or debt.",
      "An unrealistic timeline you renegotiated.",
      "A request you redirected to a better solution.",
    ],
  },
  {
    id: "q-learn-fast",
    group: "Applied AI & labs",
    question: "Tell me about a time you had to learn a new domain or technology fast to deliver.",
    competencies: ["ambiguity", "speed & bias for action"],
    amazon: ["Learn and Be Curious"],
    testing: "How you learn under pressure, and how quickly you became useful.",
    jog: [
      "Picking up LLMs, a new framework or a new codebase.",
      "A customer domain you had to understand quickly.",
      "What you would tell someone starting the same thing.",
    ],
  },
  {
    id: "q-eval-misleading",
    group: "Applied AI & labs",
    question: "Tell me about a time an evaluation or metric told you the wrong story about a model.",
    competencies: ["technical depth", "raising the bar"],
    amazon: ["Dive Deep", "Insist on the Highest Standards"],
    testing: "Eval literacy: you question numbers, find the flaw, and fix the measurement.",
    jog: [
      "A benchmark score that did not match real behaviour.",
      "An LLM judge that disagreed with humans.",
      "Data leakage, a skewed sample or a broken grader you caught.",
    ],
  },
  {
    id: "q-model-failure",
    group: "Applied AI & labs",
    question: "Describe a time an ML or LLM system failed in production or with a customer. What did you do?",
    competencies: ["customer focus", "ownership", "failure & learning"],
    amazon: ["Customer Obsession", "Ownership"],
    testing: "Calm incident handling, root cause, and what you put in place so it cannot recur.",
    jog: [
      "Hallucinations, regressions after an update, or drift.",
      "A prompt or model change that broke a workflow.",
      "The monitoring or eval you added afterwards.",
    ],
  },
  {
    id: "q-customer-production",
    group: "Applied AI & labs",
    question: "Tell me about helping a customer take an AI system from prototype to production.",
    competencies: ["customer focus", "impact & results"],
    amazon: ["Customer Obsession", "Deliver Results"],
    testing: "Forward-deployed skills: scoping, evals, reliability, and earning customer trust.",
    jog: [
      "A demo that needed real evals before launch.",
      "Latency, cost or reliability problems you solved for them.",
      "How you set expectations about what the model could not do.",
    ],
  },
  {
    id: "q-raise-risk",
    group: "Applied AI & labs",
    question: "Tell me about a time you raised a risk (safety, privacy or misuse) that slowed things down.",
    competencies: ["mission & AI safety", "conflict & disagreement"],
    amazon: ["Success and Scale Bring Broad Responsibility", "Have Backbone; Disagree and Commit"],
    testing: "Judgement and courage: you spot real risks and handle them constructively.",
    jog: [
      "Personal data in prompts, logs or training data.",
      "A model behaviour that could harm or mislead users.",
      "A shortcut you flagged and what you proposed instead.",
    ],
  },
  {
    id: "q-why-lab",
    group: "Applied AI & labs",
    question: "Why this company, and how do you think about the risks of the technology you would build?",
    competencies: ["mission & AI safety"],
    amazon: [],
    testing: "Genuine, specific motivation and a considered (not rehearsed) view on AI risk.",
    jog: [
      "What you have read or used from them that shaped your view.",
      "A concrete risk you worry about and how work like yours reduces it.",
      "Why this company rather than the alternatives.",
    ],
  },
];

export const QUESTION_GROUPS = ["Core", "Execution", "People", "Applied AI & labs"] as const;
