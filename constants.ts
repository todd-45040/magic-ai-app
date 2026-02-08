
import { PredefinedPrompt, Persona, MagicTheoryModule, MagicTerm, User } from './types';
import { Type } from '@google/genai';
import { 
    BookIcon,
    LightbulbIcon,
    ListIcon,
    ClockIcon,
    MicrophoneIcon,
    ShieldIcon,
    ImageIcon,
    ShuffleIcon,
    SearchIcon,
    BookmarkIcon,
    CalendarIcon,
    ChecklistIcon,
    CrossIcon,
    UsersIcon,
    WandIcon,
    UsersCogIcon,
    QuestionMarkIcon,
    StarIcon,
    StageCurtainsIcon,
    MegaphoneIcon,
    FileTextIcon,
    ThumbUpIcon,
    VideoIcon,
    BlueprintIcon,
    TutorIcon
} from './components/icons';

export const ADMIN_EMAIL = 'admin@magician.com';
export const APP_VERSION = 'v0.8 Beta';

// Add GUEST_USER for Audience Mode services
export const GUEST_USER: User = {
    email: 'guest@magician.com',
    membership: 'free',
    generationCount: 0,
    lastResetDate: new Date().toISOString()
};

export const AUDIENCE_SYSTEM_INSTRUCTION = `You are an AI assistant for a magic show audience. Your goal is to be entertaining, engaging, and build excitement for the show. You must NEVER reveal the secret or method to any magic trick. If asked how a trick is done, politely decline and redirect the conversation to the wonder and artistry of magic. You can generate magic trivia, show programs, fun banter, and merchandise descriptions.`;

export const MAGICIAN_SYSTEM_INSTRUCTION = `You are an expert AI assistant and creative partner for professional magicians. You have a deep understanding of magic theory, performance art, and psychology. Provide detailed, practical, and creative advice on scripting, patter, timing, and rehearsal techniques. You are an insider, so speak the language of a magician. You also have access to tools to help manage the user's projects. You can create tasks in their Show Planner by using the 'createTask' function. If a user asks to add a task, note, or to-do item for a specific show, use this function. If the show name is ambiguous, ask for clarification.`;

export const MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION = `You are a world-class magic and performance coach. The user is a magician rehearsing their script live. Your task is to listen to their performance and provide real-time, constructive audio feedback on Tone, Confidence, and Clarity. You also have access to tools to assist the rehearsal.
- The user can ask you to start a timer by saying "start a timer" or "time this section." Use the 'startTimer' function for this.
- The user can ask you to stop the timer by saying "stop the timer." Use the 'stopTimer' function and report the duration back to them.
Be encouraging but direct. Keep your responses conversational and brief.`;

export const EFFECT_GENERATOR_SYSTEM_INSTRUCTION = `You are a world-class magic inventor and creative consultant for professional magicians. The user will provide you with up to four everyday objects. Your task is to brainstorm and generate several unique, engaging magic effects that could be performed using a combination of these items.

For each effect idea, you MUST provide:
1.  **Effect Name:** A catchy, theatrical, or intriguing title.
2.  **The Experience:** A brief description of what the audience sees and feels, written from their perspective. Focus on the emotional impact and the impossibility of the moment.
3.  **The Secret Hint:** A very subtle, high-level hint about the principle at play, using magician's insider terminology (e.g., "relies on a clever gimmick," "utilizes a classic sleight," "leverages a psychological subtlety"). DO NOT EXPOSE THE ACTUAL METHOD.

Your tone should be inspiring, creative, and professional. Format the response clearly using Markdown for headings.`;

export const PATTER_ENGINE_SYSTEM_INSTRUCTION = `You are a world-class scriptwriter and creative consultant for professional magicians. You specialize in crafting compelling patter that enhances a magic effect. The user will provide you with a description of a magic effect and select one or more performance tones.

Your task is to write a complete, performance-ready patter script for EACH selected tone.

For each script, you MUST:
1.  **Clearly label the tone** as a main heading (e.g., "### Comedic Patter").
2.  **Write the full script** including spoken lines and key actions (in parentheses).
3.  **Incorporate the chosen tone** effectively. A comedic script should have jokes, a mysterious one should build suspense, etc.
4.  **Structure the script** logically from beginning to end.

Your writing should be vivid, practical, and ready to be performed.`;

export const IN_TASK_PATTER_SYSTEM_INSTRUCTION = `You are a world-class scriptwriter for magicians. The user will provide a magic effect's title. Write a short, engaging, performance-ready patter script for it. The script should be concise and include brief action cues in parentheses where appropriate. Do not include any introductory or concluding text outside of the script itself.`;

export const AI_TASK_SUGGESTER_SYSTEM_INSTRUCTION = `You are an expert stage manager and producer for professional magicians. Based on the provided show title and description, generate a list of common, actionable preparation tasks. The tasks should cover different stages of preparation like 'Scripting', 'Rehearsal', 'Prop Management', and 'Technical Setup'. Return ONLY a single, complete JSON object with a key 'tasks' which is an array of strings. Do not include markdown.`;

export const ASK_MAGICIAN_SYSTEM_INSTRUCTION = `You are the AI assistant to a world-famous magician, tasked with answering questions from the public on their behalf. You are mysterious, witty, and charming. Your primary directive is to **never, ever reveal the secret to a magic trick.** If asked how a trick is done, you must artfully dodge the question, perhaps by turning it into a philosophical musing on the nature of mystery, or by complimenting the questioner on their astute observation. Your answers should be engaging but generally brief. You can answer questions about the magician's life, career, or general thoughts on magic, but always maintain an aura of wonder.`;

export const MAGICAL_STORY_SYSTEM_INSTRUCTION = `You are a master storyteller, a weaver of wondrous tales. The user will give you a few keywords. Your task is to write a short, enchanting, and magical story (around 3-5 paragraphs) that incorporates these keywords. The story should be suitable for all ages, filled with a sense of wonder, and have a clear beginning, middle, and end. The tone should be whimsical and captivating.`;

export const MAGIC_RESEARCH_SYSTEM_INSTRUCTION = `You are a world-renowned magic historian and theorist, an AI with access to the most comprehensive library of magical knowledge in existence. The user is a serious student of magic. When they ask a question, provide a detailed, accurate, and well-structured response. Cite specific books, creators, and historical context where appropriate. Do not expose the secret methods of tricks, but you can and should discuss the principles, theory, and evolution behind them. Your tone is academic, insightful, and authoritative. Use formatting like headings and lists to make complex information easy to digest.`;

export const MAGIC_NEWS_SYSTEM_INSTRUCTION = `You are an AI journalist for 'Magic Wire,' a premier news source for magicians. You write engaging, insightful, and professional articles about the magic community. Your tone is that of an industry insider. When asked to generate an article, you must return a single, complete JSON object matching the provided schema. Do not include any markdown formatting like \`\`\`json in your response.`;

export const GOSPEL_MAGIC_SYSTEM_INSTRUCTION = `You are a creative assistant specializing in Gospel Magic. Your purpose is to help performers create engaging magic routines that clearly and effectively illustrate a biblical message. When a user provides a theme, a Bible passage, or a specific magic effect, your task is to develop a complete routine. This includes:
1.  **The Message:** Clearly state the biblical lesson or principle being taught.
2.  **The Effect:** Briefly describe the magic effect used.
3.  **The Patter:** Provide a full script that seamlessly integrates the message with the actions of the trick.
4.  **The Connection:** Explain *why* the effect is a good illustration for the message.
Your tone should be respectful, inspiring, and focused on creating a meaningful experience for the audience.`;

export const MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION = `You are an expert consultant in the art of mentalism, with a deep understanding of its psychological principles, performance techniques, and ethical considerations. The user is a mentalist seeking to refine their craft. Provide insightful, detailed, and practical advice. Do not expose specific, secret methods, but focus on the underlying theory, scripting, and showmanship. When asked to create an effect, describe the audience's experience and the psychological principles at play. When asked about theory, cite influential figures like Annemann, Corinda, or Derren Brown. Your tone is that of a seasoned, professional mentor.`;

export const MARKETING_ASSISTANT_SYSTEM_INSTRUCTION = `You are an expert marketing and PR consultant specializing in the entertainment industry, with a focus on magicians and live performers. The user will provide you with details about their magic show. Your task is to generate a comprehensive marketing toolkit based on their input.

You MUST generate content for the following five categories, using clear Markdown headings for each:
1.  **Press Release:** A professional, concise press release (approx. 150-200 words) ready to be sent to local media. It should have a catchy headline, a summary of the show, and a call to action.
2.  **Social Media Posts:** Three distinct posts suitable for platforms like Instagram or Facebook. Each post should be engaging, use relevant hashtags (e.g., #MagicShow, #LiveEntertainment, #[City]Events), and have a clear call to action.
3.  **Email Newsletter Snippet:** A short, exciting blurb to be included in an email to a fan mailing list.
4.  **Poster & Flyer Copy:** Punchy, captivating text that can be used on promotional posters and flyers. Include a headline, a brief description, and contact/ticket information placeholders.
5.  **Show Taglines:** A list of 5-7 catchy taglines or slogans for the show.

Your tone should be professional, exciting, and tailored to the show's described style. The goal is to create practical, ready-to-use marketing materials to help the magician promote their show effectively.`;

export const CONTRACT_GENERATOR_SYSTEM_INSTRUCTION = `You are an AI assistant specializing in creating clear, professional performance agreements for magicians. The user will provide you with specific details for a gig. Your task is to take these details and embed them into a standard, well-structured performance contract.

The contract MUST include the following sections, clearly labeled with headings:
1.  **Parties:** Clearly state the names of the "Performer" (the magician) and the "Client".
2.  **Event Details:** List the event type, date, time, and location address.
3.  **Performance Details:** Specify the duration of the performance.
4.  **Payment Terms:** Clearly state the total performance fee, the required deposit amount, the deposit due date, and the final balance due date.
5.  **Performer Requirements:** Detail any technical or hospitality riders provided by the user (e.g., sound system, changing room). If none are provided, state "None specified."
6.  **Cancellation Policy:** Include the user-provided cancellation terms. If none are provided, insert a standard, fair cancellation clause (e.g., deposit is non-refundable if the Client cancels within 30 days of the event).
7.  **Agreement Clause:** Conclude with a standard section for signatures and dates for both the Performer and the Client.

Your tone must be formal, professional, and legally-styled, but easy to understand. Do not add any conversational text or disclaimers outside of the contract itself. The output should be the contract, ready to be copied or downloaded.`;

export const ASSISTANT_STUDIO_SYSTEM_INSTRUCTION = `You are a world-class director, choreographer, and creative consultant for magician's assistants. You understand the vital role an assistant plays in a magic act, from misdirection and timing to stage presence and audience management. You are also an expert in developing solo performance material.

When the user asks for help improving collaboration on a specific routine, provide actionable advice on:
1.  **Timing & Cues:** How to anticipate the magician's actions and hit cues perfectly.
2.  **Stage Presence:** How to complement the magician without stealing focus, using body language and expression.
3.  **Misdirection:** Specific actions the assistant can take to direct the audience's attention at critical moments.

When the user asks for a solo act idea, generate a complete concept including:
1.  **Effect Name:** A catchy title for their solo spot.
2.  **The Premise:** A brief, engaging story or concept for the routine.
3.  **Core Actions:** A step-by-step description of the performance from the audience's perspective.
4.  **Showcase:** Explain how the routine highlights the assistant's specific skills (e.g., dexterity, dance, comedy).

Your tone should be encouraging, professional, and full of insider knowledge.`;


export const ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION = `You are an expert magic performance safety coach focused on angles, sightlines, reset risk, and handling tells. 
IMPORTANT ETHICS / NO EXPOSURE:
- Do NOT reveal secret methods, sleights, gimmicks, stacks, loads, or mechanical workings.
- Provide high-level, performance-safe guidance only (blocking, timing, posture, gaze, audience management).
- If the user requests exposure, refuse and offer safe alternatives.

OUTPUT REQUIREMENTS:
- Be specific and actionable.
- Use clear headings: Overview, Risks, Mitigations, Reset & Practicality, Quick Checklist.
- Call out risks by audience position (front-left, front-right, sides, elevated, 360) when applicable.
- If information is missing, list 3–6 clarifying questions at the end under “Questions to refine this analysis”.
`;
export const DIRECTOR_MODE_SYSTEM_INSTRUCTION = `You are a world-class magic show director and creative consultant. The user will provide you with the high-level details of a show they want to create. Your task is to act as a director and architect a complete, structured show plan.

You MUST return a single, complete JSON object that strictly adheres to the provided schema. Do not include any markdown formatting like \`\`\`json in your response.

The show plan must have a clear narrative arc with three main parts: an opener, a middle section, and a closer. The middle section can be one or two segments.

For each segment, you must provide:
1.  **A Title:** (e.g., "The Opener: A Flash of the Impossible")
2.  **A Description:** Explain the purpose of this segment in the show's overall narrative and emotional arc.
3.  **Suggested Effects:** Provide 1-2 specific *types* of effects that would fit this segment. For each effect, provide a rationale explaining *why* it fits the narrative purpose of the segment.

Your tone should be that of a professional, insightful, and inspiring show director.`;

export const PERSONA_SIMULATOR_SYSTEM_INSTRUCTION = (personaDescription: string) => `You are an AI actor. Your task is to fully embody and role-play as a specific audience member at a magic show. You must strictly adhere to the persona described below. Do not break character. Do not reveal that you are an AI.

Your current persona is:
---
${personaDescription}
---

The user is a magician who will present their script or routine to you. You must react, comment, and ask questions *exactly as this persona would*. Be interactive. If the persona is skeptical, challenge them. If they are enthusiastic, be amazed. If they are distracted, ask irrelevant questions. Your goal is to provide a realistic simulation to help the magician test their material.`;

export const VIDEO_REHEARSAL_SYSTEM_INSTRUCTION = `You are a world-class performance director and magic consultant with an expert eye for visual detail. You are analyzing a video of a magician's rehearsal. Your task is to provide a detailed, time-stamped critique focusing on the physical aspects of the performance.

Your analysis MUST cover:
1.  **Body Language & Posture:** Is the performer's stance confident? Are their movements natural or stiff? Do their gestures match their words?
2.  **Staging & Blocking:** How does the performer use the stage? Is their positioning strong? Do they create clear sightlines for the audience?
3.  **Pacing & Rhythm:** Is the physical pacing of the routine effective? Are there moments that feel rushed or dragged?
4.  **Object Handling:** How does the performer handle their props? Are their actions clean, deliberate, and magical, or are they clumsy and unnatural?
5.  **Misdirection & Gaze:** Where is the performer looking at key moments? Are they effectively directing the audience's attention?

Provide specific, actionable feedback with timestamps. For example:
- **(Good) At 0:25:** "Your posture here is excellent. You stand tall as you address the audience, which commands attention."
- **(Needs Improvement) At 1:12:** "Your left hand looks unnatural while your right hand performs the action. Try relaxing it or giving it a specific job, like gesturing towards the audience."

Your tone should be that of a professional, constructive, and encouraging director.`;

export const ILLUSION_BLUEPRINT_SYSTEM_INSTRUCTION = `You are a world-class illusion designer and consultant, in the vein of Jim Steinmeyer or Paul Osborne. The user will describe a concept for a grand illusion. Your task is to provide a high-level creative and technical blueprint.

IMPORTANT: You must NEVER expose the secret or method of any illusion. Your descriptions should be from a theatrical and design perspective, using professional terminology but avoiding any details that would betray the workings to a layperson.

You MUST return a single, complete JSON object that strictly adheres to the provided schema. Do not include any markdown formatting like \`\`\`json in your response.

Your response should contain:
1.  **potential_principles:** A list of 2-3 high-level magical principles that could achieve the desired effect. For each principle, provide a name and a brief, professional description of its theatrical application without revealing the secret.
2.  **blueprint_description:** A detailed text description of a potential staging diagram. This should describe the placement of the illusion apparatus on stage, key sightline considerations for the audience, and a numbered list of the key visual moments of the performance from the audience's perspective.`;

export const MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION = (conceptName: string, conceptDescription: string) => `
You are an expert magic theory tutor, in the style of a patient and insightful university professor. You are guiding a student through a structured course. Your current topic is '${conceptName}'.

Your task is to follow a three-step process:
1.  **Explain the Concept:** Clearly and concisely explain the concept of '${conceptName}'. Use the following description as your guide: "${conceptDescription}". You may elaborate slightly but stick to the core idea.
2.  **Provide an Example:** Give a clear, practical example of the concept in action using a generic magic effect (e.g., a card trick, a coin vanish). DO NOT expose any real-world methods.
3.  **Ask a Question:** Conclude your response by asking the student an open-ended question that prompts them to think critically about how they could apply this concept to their own magic.

After the student responds, your role is to provide brief, encouraging, and constructive feedback on their answer, and then guide them to the next concept.
`;

export const MAGIC_THEORY_CURRICULUM: MagicTheoryModule[] = [
    {
        name: "Module 1: The Audience's Mind",
        lessons: [
            {
                name: "Clarity of Effect",
                concepts: [
                    {
                        name: "The Basic Effect",
                        description: "The core magical moment as perceived by the audience. A good trick should be describable in a single, simple sentence (e.g., 'A signed card vanished from the deck and appeared in my wallet.'). This is the foundation upon which everything else is built."
                    },
                    {
                        name: "Convincers vs. Confusion",
                        description: "Actions or statements designed to reinforce the impossibility of the effect (convincers) versus those that add unnecessary complexity and weaken the impact (confusion). Every step should strengthen the basic effect, not muddle it."
                    }
                ]
            },
            {
                name: "The Element of Surprise",
                concepts: [
                    {
                        name: "Anticipation and Inevitability",
                        description: "Building audience expectation towards a specific outcome, only to subvert it at the last moment. The surprise is strongest when the audience believes they know exactly what's going to happen."
                    },
                    {
                        name: "The Kicker Ending",
                        description: "A secondary, often more impossible, climax that occurs after the audience believes the trick is over. It provides a powerful final punch that leaves a lasting impression."
                    }
                ]
            }
        ]
    },
    {
        name: "Module 2: Structuring an Effect",
        lessons: [
            {
                name: "Pacing and Timing",
                concepts: [
                    {
                        name: "Time Misdirection",
                        description: "The psychological gap created between a secret action and its eventual magical revelation. The longer and more engaging the interval, the less likely the audience is to connect the method with the effect."
                    },
                    {
                        name: "Rhythmic Pacing",
                        description: "Varying the speed of your actions and speech to build tension, create moments of focus, and prevent the performance from becoming monotonous. A routine should have a natural rhythm, much like a piece of music."
                    }
                ]
            },
            {
                name: "The Theatrical Arc",
                concepts: [
                    {
                        name: "Hook, Build, Climax",
                        description: "The fundamental structure of a performance piece. The 'Hook' grabs attention, the 'Build' develops the premise and raises the stakes, and the 'Climax' delivers the final, impossible moment."
                    },
                    {
                        name: "False Solutions",
                        description: "Subtly leading the audience down a wrong path of explanation. When you later prove their 'solution' to be impossible, the effect becomes much stronger because you've actively eliminated the ways they might explain it."
                    }
                ]
            }
        ]
    }
];

export const PERSONAS: Persona[] = [
    {
        name: "Skeptical Heckler",
        description: "You are a classic skeptic. You've seen it all and you're not easily impressed. You believe every trick has a simple explanation. You're not mean, but you are vocal. You'll interrupt with questions like 'Is that your hand?' or 'I think I saw that.' You might loudly whisper to the person next to you. Your goal is to catch the magician out.",
        icon: QuestionMarkIcon,
    },
    {
        name: "Enthusiastic Child",
        description: "You are an 8-year-old child seeing a magic show for the first time. Everything is amazing and real to you. You gasp, you cheer, and you ask simple, direct questions like 'How did you do that?!' or 'Can you make a dragon appear?'. You believe in real magic and get very excited by everything you see.",
        icon: StarIcon,
    },
    {
        name: "Distracted Corporate Guest",
        description: "You are a guest at a corporate event. The magic is just background entertainment. You're more interested in your phone, the open bar, or talking to your colleague. You'll half-listen and then ask a question that shows you weren't paying attention, like 'Wait, which card was it again?' or 'Sorry, I was just checking an email, what did I miss?'.",
        icon: ClockIcon,
    },
    {
        name: "Supportive Partner",
        description: "You are the magician's supportive partner or friend sitting in the front row. You want them to do well. You'll laugh at the jokes (even the bad ones), applaud loudly, and help manage other audience members if they get unruly. You might offer overly enthusiastic encouragement.",
        icon: ThumbUpIcon,
    },
];

export const AMATEUR_FEATURES = [
    'Effect Generator',
    'Patter Engine',
    'Magic Archives',
    'Global Search',
    'Show Planner',
];

// Define missing SEMI_PRO_FEATURES
export const SEMI_PRO_FEATURES = [
    'Marketing Campaign',
    'Contract Generator',
    'Prop Checklist Generator',
    'Client Management',
    'Show Feedback',
    'Innovation Engine'
];

export const PROFESSIONAL_FEATURES = [
    'Live Patter Rehearsal',
    'Visual Brainstorm Studio',
    'Director Mode',
    'Persona Simulator',
    'Video Rehearsal Studio',
    'Assistant\'s Studio',
    'Illusion Blueprint Generator',
    'Magic Theory Tutor',
    'Mentalism Assistant',
    'Gospel Magic Assistant',
    'Magic Dictionary',
];

export const AUDIENCE_PROMPTS: PredefinedPrompt[] = [
  {
    title: 'Magic Trivia',
    prompt: 'Give me a fun piece of magic trivia.',
    icon: LightbulbIcon,
  },
  {
    title: 'Show Program',
    prompt: 'Generate a creative, one-page show program for an elegant evening of magic.',
    icon: ListIcon,
  },
  {
    title: 'Fun Banter',
    prompt: "Generate a witty, one-liner response to someone saying 'It's all smoke and mirrors!'",
    icon: ShuffleIcon,
  },
  {
    title: 'Learn a Trick',
    prompt: 'Can you teach me a simple magic trick I can do with items I have right now?',
    icon: WandIcon,
  },
];

export const MAGICIAN_PROMPTS: PredefinedPrompt[] = [
  {
    title: 'Patter Engine',
    prompt: 'I need to write a script. Can you help?',
    icon: BookIcon,
  },
  {
    title: 'Innovation Engine',
    prompt: "I have a classic effect but I need a new, modern presentation for it.",
    icon: LightbulbIcon,
  },
  {
    title: 'Angle/Risk Analysis',
    prompt: 'Help me identify the weak spots in my routine for a specific audience type.',
    icon: ShieldIcon,
  },
  {
    title: 'Rehearsal Coaching',
    prompt: 'Help me refine the pacing and timing of my routine. I will provide a script and target duration.',
    icon: ClockIcon,
  },
  {
    title: 'Live Patter Rehearsal',
    prompt: 'Start a live rehearsal session to get real-time audio feedback on my performance.',
    icon: MicrophoneIcon,
  },
  {
    title: 'Video Rehearsal Studio',
    prompt: 'Upload a video of my rehearsal for AI analysis on body language and staging.',
    icon: VideoIcon,
  },
  {
    title: 'Director Mode',
    prompt: 'Help me structure an entire show from start to finish.',
    icon: StageCurtainsIcon,
  },
  {
    title: 'Illusion Blueprint Generator',
    prompt: 'Generate concept art and a technical blueprint for a grand illusion.',
    icon: BlueprintIcon,
  },
  {
    title: 'Magic Theory Tutor',
    prompt: 'Start a structured course on foundational magic theory.',
    icon: TutorIcon,
  },
  {
    title: 'Magic Dictionary',
    prompt: 'Open the Magic Dictionary to look up professional terms.',
    icon: TutorIcon,
  },
  {
    title: 'Persona Simulator',
    prompt: 'Test my script against a simulated audience member.',
    icon: UsersCogIcon,
  },
  {
    title: 'Visual Brainstorm Studio',
    prompt: 'I need to generate some concept art for a new prop or poster.',
    icon: ImageIcon,
  },
  {
    title: 'Prop Checklist Generator',
    prompt: "Generate a detailed prop and setup checklist for my show.",
    icon: ChecklistIcon
  },
  {
    title: 'Marketing Campaign',
    prompt: 'Help me create marketing materials for my new show.',
    icon: MegaphoneIcon,
  },
  {
    title: 'Contract Generator',
    prompt: 'Help me create a performance contract for a gig.',
    icon: FileTextIcon,
  },
  {
    title: "Assistant's Studio",
    prompt: 'Help me improve my performance as an assistant or develop a solo act.',
    icon: UsersIcon,
  },
   {
    title: 'Client Management',
    prompt: 'Manage my client list and link them to shows and contracts.',
    icon: UsersCogIcon,
  },
  {
    title: 'Magic Archives',
    prompt: "I want to research the history of an effect or a famous magician.",
    icon: SearchIcon,
  },
  {
    title: 'Global Search',
    prompt: 'Open the global search to find anything by tag or keyword.',
    icon: SearchIcon,
  },
  {
    title: 'My Saved Ideas',
    prompt: 'Show me all the ideas, images, and rehearsals I have saved.',
    icon: BookmarkIcon,
  },
  {
    title: 'Gospel Magic Assistant',
    prompt: 'Help me develop a magic routine with a spiritual message.',
    icon: CrossIcon,
  },
  {
    title: 'Mentalism Assistant',
    prompt: 'Help me explore the psychology and showmanship of mentalism.',
    icon: UsersCogIcon
  },
  {
    title: 'Show Feedback',
    prompt: 'View and analyze feedback submitted by my audience.',
    icon: StarIcon
  },
  {
    title: 'Member Management',
    prompt: 'Manage user accounts and membership tiers.',
    icon: UsersCogIcon
  }
];

// --- Function Calling Declarations ---

export const LIVE_REHEARSAL_TOOLS = [{
    functionDeclarations: [
        {
            name: 'startTimer',
            description: 'Starts a timer to measure the duration of a performance segment.',
            parameters: { type: Type.OBJECT, properties: {} },
        },
        {
            name: 'stopTimer',
            description: 'Stops the currently running timer and reports the elapsed time.',
            parameters: { type: Type.OBJECT, properties: {} },
        },
    ],
}];

export const MAGICIAN_CHAT_TOOLS = [{
    functionDeclarations: [
        {
            name: 'createTask',
            description: "Creates a new task in a specified show within the user's Show Planner.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    showName: {
                        type: Type.STRING,
                        description: "The name of the show to add the task to. e.g., 'Corporate Holiday Gala'",
                    },
                    taskTitle: {
                        type: Type.STRING,
                        description: "The title of the task to be created. e.g., 'Rehearse opening patter'",
                    },
                    priority: {
                        type: Type.STRING,
                        description: "The priority of the task. Can be 'High', 'Medium', or 'Low'. Defaults to 'Medium'.",
                        enum: ['High', 'Medium', 'Low'],
                    },
                },
                required: ['showName', 'taskTitle'],
            },
        },
    ],
}];


export const publications = [
  {
    name: 'Genii Magazine',
    description: 'The leading print publication for magicians, published monthly since 1936, covering the art, history, and news of magic.',
    type: 'Print/Digital',
    url: 'https://geniimagazine.com/'
  },
  {
    name: 'The Linking Ring',
    description: 'The official monthly publication of the International Brotherhood of Magicians (I.B.M.).',
    type: 'Print/Digital',
    url: 'https://www.magician.org/the-linking-ring/'
  },
  {
    name: 'M-U-M Magazine',
    description: 'The official monthly publication of the Society of American Magicians (S.A.M.).',
    type: 'Print/Digital',
    url: 'https://www.magicsam.com/page/MUMMagazine'
  },
  {
    name: 'Magicseen',
    description: 'A modern magazine covering magic news, reviews, and interviews.',
    type: 'Print/Digital',
    url: 'https://www.magicseen.com/'
  },
  {
    name: 'VANISH Magazine',
    description: 'Digital magazine featuring articles, interviews, and community news.',
    type: 'Digital',
    url: 'https://www.vanishmagic.com/'
  },
  {
    name: 'Reel Magic Magazine',
    description: 'Video-based magazine featuring interviews, performances, and tutorials from top creators.',
    type: 'Video',
    url: 'https://www.reelmagicmagazine.com/'
  },
  {
    name: 'Gibecière',
    description: 'Scholarly journal from the Conjuring Arts Research Center focused on magic history and research.',
    type: 'Research',
    url: 'https://www.conjuringarts.org/gibeciere'
  },
  {
    name: 'MAGIC Magazine',
    description: 'A legendary, now-archived monthly magazine known for its high-quality production and in-depth features on magicians.',
    type: 'Archive',
    url: 'https://www.magicmagazine.com/'
  }
];

export const clubs = [
  {
    name: 'The Magic Circle (London)',
    description: 'One of the most famous and prestigious magic societies in the world, founded in London in 1905.',
    url: 'https://themagiccircle.co.uk/'
  },
  {
    name: 'Society of American Magicians (S.A.M.)',
    description: 'The oldest magical society, founded in 1902 in New York City, with assemblies worldwide.',
    url: 'https://www.magicsam.com/'
  },
  {
    name: 'International Brotherhood of Magicians (I.B.M.)',
    description: 'The largest magical organization in the world, with members and local chapters (Rings) across the globe.',
    url: 'https://www.magician.org/'
  },
  {
    name: 'The Academy of Magical Arts (The Magic Castle)',
    description: 'A world-famous private club for magicians and magic enthusiasts in Hollywood, California.',
    url: 'https://www.magiccastle.com/'
  }
];

export const conventions = [
  {
    name: 'Magi-Fest',
    date: 'Annually in January',
    description: 'A long-running, popular magic convention held annually in Columbus, Ohio, known for its friendly atmosphere and top-tier talent.',
    url: 'https://www.vanishingincmagic.com/magic-conventions/magifest/'
  },
  {
    name: 'Blackpool Magic Convention',
    date: 'Annually in February',
    description: 'The largest magic convention in the world, held annually in Blackpool, England, with thousands of attendees.',
    url: 'https://www.blackpoolmagicconvention.com/'
  },
  {
    name: 'Another Darn Magic Convention',
    date: 'Annually in April',
    description: 'An annual magic convention focused on fun, fellowship, and fantastic magic.',
    url: 'https://www.admcmagic.com/'
  },
  {
    name: 'The S.A.M. National Convention',
    date: 'Annually in July',
    description: 'The annual convention for the Society of American Magicians, held in a different North American city each year.',
    url: 'https://www.magicsam.com/page/annual_convention'
  },
  {
    name: 'International Brotherhood of Magicians (I.B.M.) Convention',
    date: 'Annually in July',
    description: "The annual gathering for members of the world's largest magical organization, featuring contests, lectures, and shows.",
    url: 'https://www.magician.org/convention'
  },
  {
    name: 'MAGIC Live!',
    date: 'Annually in August',
    description: 'An annual convention in Las Vegas known for its star-studded lineup of performers, lecturers, and innovative formats.',
    url: 'https://magicconvention.com/'
  },
  {
    name: "Abbott's Magic Get-Together",
    date: 'Annually in August',
    description: "One of the oldest magic conventions, held annually in Colon, Michigan, the 'Magic Capital of the World'.",
    url: 'https://www.magicgettogether.com/'
  },
];

export const MAGIC_DICTIONARY_TERMS = [
  {
    term: 'Misdirection',
    category: 'Theory',
    skillLevel: 'Beginner',
    definition:
      'Guiding an audience’s attention and thoughts so they focus on what matters and overlook what doesn’t.',
    whyItMatters:
      'Magic lives and dies by attention. Strong misdirection makes effects feel effortless and fair. Weak misdirection makes audiences burn the hands, rewind moments, and feel suspicious.',
    beginnerMistakes: [
      'Treating misdirection as “look over there” instead of purposeful focus.',
      'Overusing movement or big gestures that actually draw attention.',
      'Forgetting that words and timing misdirect as much as hands.',
      'Rushing the critical moment instead of controlling the beat.',
    ],
    relatedTerms: ['Time Misdirection', 'Beat', 'Framing', 'Conviction'],
    usedInWizard: [
      { feature: 'Patter Engine', note: 'Builds lines that naturally steer attention and meaning.' },
      { feature: 'Live Rehearsal', note: 'Helps you spot rushed beats or emphasis that highlights the wrong moment.' },
      { feature: 'Director Mode', note: 'Structures routines so attention flows cleanly from moment to moment.' },
    ],
    references: [],
  },
  {
    term: 'Time Misdirection',
    category: 'Theory',
    skillLevel: 'Pro',
    definition:
      'Creating a time gap between an important moment and the audience’s suspicion of it.',
    whyItMatters:
      'Time misdirection lowers “heat.” Actions feel like they happened long ago, reducing suspicion and making the final reveal feel more impossible in hindsight.',
    beginnerMistakes: [
      'Placing the important moment immediately before the reveal.',
      'Not giving the audience a natural reason to relax after a key beat.',
      'Telegraphing that something “must have happened” at a specific instant.',
    ],
    relatedTerms: ['Misdirection', 'Offbeat', 'Beat', 'Conditioning'],
    usedInWizard: [
      { feature: 'Show Planner', note: 'Helps you space beats and transitions.' },
      { feature: 'Director Mode', note: 'Encourages pacing that protects critical moments.' },
      { feature: 'Patter Engine', note: 'Creates meaningful “time-fill” lines that still entertain.' },
    ],
    references: [],
  },
  {
    term: 'Beat',
    category: 'Performance',
    skillLevel: 'Beginner',
    definition: 'A small unit of action or meaning in a routine—one clear moment the audience can follow.',
    whyItMatters:
      'Clean beats create clarity. When beats blur together, routines feel rushed or confusing, and audiences become suspicious because they can’t track what changed.',
    beginnerMistakes: [
      'Stacking actions without pauses for comprehension.',
      'Over-explaining instead of letting a moment land visually.',
      'Failing to clearly mark the “moment of magic.”',
    ],
    relatedTerms: ['Pacing', 'Offbeat', 'Clarity', 'Time Misdirection'],
    usedInWizard: [
      { feature: 'Live Rehearsal', note: 'Helps you identify rushed delivery and unclear transitions.' },
      { feature: 'Patter Engine', note: 'Formats scripts into crisp beat-by-beat structure.' },
      { feature: 'Show Planner', note: 'Supports building routines with clear phases and transitions.' },
    ],
    references: [],
  },
  {
    term: 'Offbeat',
    category: 'Performance',
    skillLevel: 'Pro',
    definition:
      'A relaxed moment when attention naturally drops—often right after a laugh, applause, or completed action.',
    whyItMatters:
      'The offbeat is a natural “low attention” moment. It’s useful for resetting focus, changing gears, and transitioning without feeling sneaky.',
    beginnerMistakes: [
      'Trying to force an offbeat instead of earning it with entertainment.',
      'Using the offbeat while still under heat (audience still tracking).',
      'Moving too quickly out of the offbeat instead of letting it breathe.',
    ],
    relatedTerms: ['Beat', 'Time Misdirection', 'Applause Cue', 'Pacing'],
    usedInWizard: [
      { feature: 'Live Rehearsal', note: 'Helps you build natural pauses and cadence.' },
      { feature: 'Director Mode', note: 'Supports reaction-friendly show flow and pacing.' },
    ],
    references: [],
  },
  {
    term: 'Angle Sensitivity',
    category: 'Stagecraft',
    skillLevel: 'Beginner',
    definition:
      'How dependent an effect is on audience viewpoint (sightlines) to look clean and fair.',
    whyItMatters:
      'Angle issues are one of the fastest ways to lose trust. If spectators see something “off” from the side, the mystery collapses—even if the front view looks perfect.',
    beginnerMistakes: [
      'Practicing only from the performer’s viewpoint.',
      'Ignoring side seating or standing spectators.',
      'Assuming lighting doesn’t affect what angles reveal.',
      'Not adjusting staging when the room layout changes.',
    ],
    relatedTerms: ['Sightlines', 'Blocking', 'Risk Management', 'Lighting'],
    usedInWizard: [
      { feature: 'Video Rehearsal Studio', note: 'Review routines from different viewpoints and camera angles.' },
      { feature: 'Director Mode', note: 'Plan staging and audience layout for clean sightlines.' },
    ],
    references: [],
  },
  {
    term: 'Reset Time',
    category: 'Business',
    skillLevel: 'Beginner',
    definition:
      'How long it takes to get an effect ready to perform again after it’s done.',
    whyItMatters:
      'Reset time determines what’s practical for real gigs—especially walk-around, table-hopping, and repeat sets. Low-reset material makes shows smoother and more bookable.',
    beginnerMistakes: [
      'Choosing slow-reset effects for walk-around work.',
      'Forgetting to rehearse the reset as part of the routine.',
      'Not having a pocket/case layout plan for quick reset.',
    ],
    relatedTerms: ['Set List', 'Packing', 'Walk-around', 'Practicality'],
    usedInWizard: [
      { feature: 'Show Planner', note: 'Plan set order based on reset needs and transitions.' },
      { feature: 'Saved Ideas', note: 'Store reset notes and checklists with each routine.' },
    ],
    references: [],
  },
  {
    term: 'Out',
    category: 'Performance',
    skillLevel: 'Pro',
    definition:
      'A planned recovery option that keeps the routine entertaining and credible if something doesn’t go as expected.',
    whyItMatters:
      'Outs protect confidence and audience trust. A strong out keeps momentum moving and prevents a minor issue from becoming a show-stopper.',
    beginnerMistakes: [
      'Freezing because no backup plan exists.',
      'Over-apologizing or admitting failure too directly.',
      'Using an out that feels unrelated or confusing.',
      'Not rehearsing the out so it looks natural.',
    ],
    relatedTerms: ['Risk Management', 'Contingency', 'Pacing', 'Framing'],
    usedInWizard: [
      { feature: 'Patter Engine', note: 'Generates alternate lines and recovery transitions.' },
      { feature: 'Live Rehearsal', note: 'Practice recovery lines so they sound confident.' },
      { feature: 'Show Planner', note: 'Track outs in routine notes for consistency under pressure.' },
    ],
    references: [],
  },
  {
    term: 'Framing',
    category: 'Psychology',
    skillLevel: 'Beginner',
    definition:
      'How you present an action or moment so the audience interprets it the way you intend.',
    whyItMatters:
      'Framing shapes meaning. The same action can feel suspicious or natural depending on the story, motivation, and persona behind it.',
    beginnerMistakes: [
      'Doing actions with no motivation or context.',
      'Over-explaining and making the audience focus too hard.',
      'Using frames that don’t match your character or venue.',
      'Switching frames mid-routine and confusing the audience.',
    ],
    relatedTerms: ['Motivation', 'Conviction', 'Misdirection', 'Clarity'],
    usedInWizard: [
      { feature: 'Patter Engine', note: 'Build motivations and stories that justify actions.' },
      { feature: 'Director Mode', note: 'Align routine framing with show theme and persona.' },
    ],
    references: [],
  },
  {
    term: 'Dual Reality',
    category: 'Mentalism',
    skillLevel: 'Pro',
    definition:
      'A performance approach where different audience members experience different versions of the same moment.',
    whyItMatters:
      'Dual reality can create massive impact by leveraging perspective and interpretation. It must be handled ethically so audiences feel amazed—not confused or excluded.',
    beginnerMistakes: [
      'Creating confusion instead of clarity.',
      'Not managing the volunteer experience respectfully.',
      'Letting the crowd feel left out rather than included.',
      'Using it without understanding audience dynamics.',
    ],
    relatedTerms: ['Framing', 'Volunteer Selection', 'Audience Management', 'Clarity'],
    usedInWizard: [
      { feature: 'Director Mode', note: 'Plan audience perspective and volunteer handling.' },
      { feature: 'Persona Simulator', note: 'Test how different audiences interpret the same moment.' },
    ],
    references: [],
  },
  {
    term: 'Volunteer Selection',
    category: 'Audience Management',
    skillLevel: 'Beginner',
    definition:
      'Choosing the right spectator to participate so the routine stays safe, clear, and entertaining.',
    whyItMatters:
      'The right volunteer keeps pacing strong and protects the audience vibe. The wrong volunteer can derail clarity, timing, and confidence.',
    beginnerMistakes: [
      'Picking the first raised hand without reading the room.',
      'Choosing someone who is combative, intoxicated, or distracted.',
      'Giving unclear instructions that create awkwardness.',
      'Forgetting to make the volunteer look good.',
    ],
    relatedTerms: ['Heckler Management', 'Clarity', 'Pacing', 'Framing'],
    usedInWizard: [
      { feature: 'Persona Simulator', note: 'Practice handling different volunteer types.' },
      { feature: 'Live Rehearsal', note: 'Refine instruction clarity and confident tone.' },
    ],
    references: [],
  },
,
  // --- Expanded Dictionary Terms (Batch 2) ---
  {
    term: 'Conviction',
    category: 'Performance',
    skillLevel: 'Beginner',
    definition: 'The performer’s ability to make every action look justified, natural, and confident.',
    whyItMatters:
      'When you look convinced, the audience relaxes. When you look unsure, they become detectives. Conviction often determines whether an effect feels like magic or a puzzle.',
    beginnerMistakes: [
      'Hesitating during key moments',
      'Over-explaining to prove fairness',
      'Telegraphing that an action is important when it shouldn’t be',
    ],
    relatedTerms: ['Framing', 'Clarity', 'Misdirection'],
    usedInWizard: [
      { feature: 'Live Rehearsal', note: 'Practice confident delivery and eliminate verbal tells.' },
      { feature: 'Patter Engine', note: 'Add motivations that make actions feel natural.' },
    ],
    references: [],
  },
  {
    term: 'Clarity',
    category: 'Performance',
    skillLevel: 'Beginner',
    definition: 'How easily the audience can follow what is happening and what the effect is supposed to be.',
    whyItMatters:
      'If the audience is confused, they can’t be amazed. Clear structure and clear language create stronger reactions and cleaner memories of the impossible moment.',
    beginnerMistakes: [
      'Overcomplicating the premise',
      'Introducing too many conditions at once',
      'Failing to clearly signal the moment of impossibility',
    ],
    relatedTerms: ['Beat', 'Framing', 'Effect'],
    usedInWizard: [
      { feature: 'Patter Engine', note: 'Simplifies wording and strengthens the premise.' },
      { feature: 'Live Rehearsal', note: 'Helps you hear confusing phrasing or rushed steps.' },
    ],
    references: [],
  },
  {
    term: 'Pacing',
    category: 'Performance',
    skillLevel: 'Beginner',
    definition: 'The speed and rhythm of your routine—how quickly moments happen and how long you let them land.',
    whyItMatters:
      'Good pacing keeps attention locked. Poor pacing either drags (people drift) or rushes (people suspect or miss key moments).',
    beginnerMistakes: [
      'Rushing through the important beat',
      'Not pausing for laughter or applause',
      'Talking over moments that should be visual',
    ],
    relatedTerms: ['Beat', 'Offbeat', 'Applause Cue'],
    usedInWizard: [
      { feature: 'Live Rehearsal', note: 'Spot tempo problems and rushed cadence.' },
      { feature: 'Director Mode', note: 'Encourage clean show flow and spacing.' },
    ],
    references: [],
  },
  {
    term: 'Applause Cue',
    category: 'Performance',
    skillLevel: 'Pro',
    definition: 'A subtle signal that tells the audience “this is the moment” and invites a reaction.',
    whyItMatters:
      'Audiences often need permission to react. A clean cue increases applause and makes the ending feel stronger without begging for it.',
    beginnerMistakes: [
      'Moving immediately to the next line before the reaction can happen',
      'Undercutting the moment with extra explanation',
      'Not giving the audience a clear button at the end',
    ],
    relatedTerms: ['Button', 'Pacing', 'Beat'],
    usedInWizard: [
      { feature: 'Patter Engine', note: 'Adds strong “button” lines for endings.' },
      { feature: 'Live Rehearsal', note: 'Practice holding space after a climax.' },
    ],
    references: [],
  },
  {
    term: 'Button',
    category: 'Performance',
    skillLevel: 'Beginner',
    definition: 'A final punchline or closing line that cleanly ends a moment or routine.',
    whyItMatters:
      'A button makes the audience feel the routine is complete. It prevents awkward trailing off and strengthens reactions.',
    beginnerMistakes: [
      'Adding extra lines after the best moment',
      'Ending with a weak or unclear final line',
      'Not practicing the ending as deliberately as the middle',
    ],
    relatedTerms: ['Applause Cue', 'Clarity', 'Closer'],
    usedInWizard: [{ feature: 'Patter Engine', note: 'Generates tag lines and clean closers.' }],
    references: [],
  },
  {
    term: 'Show Flow',
    category: 'Stagecraft',
    skillLevel: 'Beginner',
    definition: 'The overall order and energy arc of a performance from opener to closer.',
    whyItMatters:
      'A great show feels like a journey. Strong flow prevents dead spots, balances energy, and helps the audience remember the best moments.',
    beginnerMistakes: [
      'Starting too slow',
      'Placing similar effects back-to-back',
      'Not planning transitions or reset needs between routines',
    ],
    relatedTerms: ['Opener', 'Closer', 'Transition'],
    usedInWizard: [
      { feature: 'Director Mode', note: 'Helps structure a strong arc for the audience.' },
      { feature: 'Show Planner', note: 'Organizes set order with transitions and reset time in mind.' },
    ],
    references: [],
  },
  {
    term: 'Blocking',
    category: 'Stagecraft',
    skillLevel: 'Beginner',
    definition: 'Where you stand, move, and position props/people so the audience sees what you want them to see.',
    whyItMatters:
      'Good blocking increases clarity and reduces angle issues. It also makes you look more confident and professional.',
    beginnerMistakes: [
      'Turning away from the audience at key moments',
      'Moving without purpose',
      'Ignoring sightlines for side seating',
    ],
    relatedTerms: ['Sightlines', 'Angle Sensitivity', 'Stage Picture'],
    usedInWizard: [
      { feature: 'Video Rehearsal Studio', note: 'Review body positions and movement choices.' },
      { feature: 'Director Mode', note: 'Plan staging for visibility and clarity.' },
    ],
    references: [],
  },
  {
    term: 'Sightlines',
    category: 'Stagecraft',
    skillLevel: 'Beginner',
    definition: 'The angles from which the audience can see you, your hands, and the action.',
    whyItMatters:
      'Even perfect technique can fail if someone has the wrong view. Planning sightlines protects the illusion and audience trust.',
    beginnerMistakes: [
      'Not checking side and front-row angles',
      'Ignoring lighting and shadows',
      'Assuming every venue matches your practice space',
    ],
    relatedTerms: ['Angle Sensitivity', 'Blocking', 'Lighting'],
    usedInWizard: [
      { feature: 'Director Mode', note: 'Encourages venue-aware staging decisions.' },
      { feature: 'Video Rehearsal Studio', note: 'Test routines from alternate viewpoints.' },
    ],
    references: [],
  },
  {
    term: 'Reset Time',
    category: 'Business',
    skillLevel: 'Beginner',
    definition: 'How long it takes to get an effect ready to perform again after it’s done.',
    whyItMatters:
      'Reset determines what’s practical for walk-around, repeat shows, and encores. Lower reset time usually means smoother shows and higher booking value.',
    beginnerMistakes: [
      'Choosing slow-reset material for table-hopping',
      'Forgetting to rehearse the reset as part of the routine',
      'Not having a reset plan (pockets, case layout, checklist)',
    ],
    relatedTerms: ['Set List', 'Transition', 'Practicality'],
    usedInWizard: [
      { feature: 'Show Planner', note: 'Plan set order based on reset needs.' },
      { feature: 'Saved Ideas', note: 'Attach reset checklists to routines.' },
    ],
    references: [],
  },
  {
    term: 'Heckler Management',
    category: 'Audience Management',
    skillLevel: 'Pro',
    definition: 'Responding to interruptions in a way that maintains control and keeps the room on your side.',
    whyItMatters:
      'The goal is control, not confrontation. A calm redirect protects momentum and makes you look professional.',
    beginnerMistakes: [
      'Escalating and making it personal',
      'Over-roasting and making the room uncomfortable',
      'Ignoring it when the room needs direction',
    ],
    relatedTerms: ['Authority', 'Audience Management', 'Framing'],
    usedInWizard: [
      { feature: 'Persona Simulator', note: 'Practice handling skeptical or combative audience types.' },
      { feature: 'Patter Engine', note: 'Generate polite, confident redirect lines.' },
    ],
    references: [],
  },
] as any[];

