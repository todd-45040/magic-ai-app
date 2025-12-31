import { PredefinedPrompt, Persona, MagicTheoryModule, MagicTerm } from './types';
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
    { name: 'Genii Magazine', description: 'The leading print publication for magicians, published monthly since 1936, covering the art, history, and news of magic.' },
    { name: 'MAGIC Magazine', description: 'A legendary, now-archived monthly magazine known for its high-quality production and in-depth features on magicians.' },
    { name: 'The Linking Ring', description: 'The official monthly publication of the International Brotherhood of Magicians (I.B.M.).' },
    { name: 'M-U-M Magazine', description: 'The official monthly publication of the Society of American Magicians (S.A.M.).' }
];

export const clubs = [
    { name: 'The Magic Circle (London)', description: 'One of the most famous and prestigious magic societies in the world, founded in London in 1905.' },
    { name: 'Society of American Magicians (S.A.M.)', description: 'The oldest magical society, founded in 1902 in New York City, with assemblies worldwide.' },
    { name: 'International Brotherhood of Magicians (I.B.M.)', description: 'The largest magical organization in the world, with members and local chapters (Rings) across the globe.' },
    { name: 'The Academy of Magical Arts (The Magic Castle)', description: 'A world-famous private club for magicians and magic enthusiasts in Hollywood, California.' }
];

export const conventions = [
    { name: 'Magi-Fest', date: 'Annually in January', description: 'A long-running, popular magic convention held annually in Columbus, Ohio, known for its friendly atmosphere and top-tier talent.' },
    { name: 'Blackpool Magic Convention', date: 'Annually in February', description: 'The largest magic convention in the world, held annually in Blackpool, England, with thousands of attendees.' },
    { name: 'Another Darn Magic Convention', date: 'Annually in April', description: 'An annual magic convention focused on fun, fellowship, and fantastic magic. Visit at www.admcmagic.com.' },
    { name: 'The S.A.M. National Convention', date: 'Annually in July', description: 'The annual convention for the Society of American Magicians, held in a different North American city each year.' },
    { name: 'International Brotherhood of Magicians (I.B.M.) Convention', date: 'Annually in July', description: "The annual gathering for members of the world's largest magical organization, featuring contests, lectures, and shows." },
    { name: 'MAGIC Live!', date: 'Annually in August', description: 'An annual convention in Las Vegas known for its star-studded lineup of performers, lecturers, and innovative formats.' },
    { name: 'Abbotts Magic Get-Together', date: 'Annually in August', description: "One of the oldest magic conventions, held annually in Colon, Michigan, the 'Magic Capital of the World'." },
    { name: 'FISM World Championship of Magic', date: 'Every 3 Years', description: 'The "Olympics of Magic," held every three years in a different host country, featuring competitions and performances.' },
];

export const MAGIC_DICTIONARY_TERMS: MagicTerm[] = [
    { term: 'Angles', definition: 'The lines of sight from the audience to the performer. An effect is said to have "bad angles" if its secret can be seen from certain viewpoints.', references: [{ title: 'Strong Magic by Darwin Ortiz', url: 'https://www.vanishingincmagic.com/magic-books/strong-magic/' }] },
    { term: 'Cold Deck', definition: 'A pre-arranged deck of cards secretly switched into play, replacing the one the audience believes is in use.', references: [{ title: 'The Expert at the Card Table by S.W. Erdnase', url: 'https://www.vanishingincmagic.com/magic-books/expert-at-the-card-table/' }] },
    { term: 'Crimp', definition: 'A secret bend or indentation placed in a playing card (or corner of a deck) to locate it later by touch.', references: [{ title: 'Card Control by Arthur H. Buckley', url: 'https://www.lybrary.com/card-control-p-137.html' }] },
    { term: 'Double Lift', definition: 'A foundational sleight-of-hand technique where two cards are handled as if they were a single card.', references: [{ title: 'The Royal Road to Card Magic by Hugard & Braue', url: 'https://www.vanishingincmagic.com/magic-books/royal-road-to-card-magic/' }] },
    { term: 'Flash', definition: 'The unintentional exposure of a secret gimmick, move, or hidden object to the audience.', references: [{ title: 'The Books of Wonder by Tommy Wonder', url: 'https://www.vanishingincmagic.com/magic-books/the-books-of-wonder/' }] },
    { term: 'Force', definition: 'A technique used by a magician to make a spectator select a predetermined card, number, or object, while maintaining the illusion of a free choice.', references: [{ title: '202 Methods of Forcing by Theodore Annemann', url: 'https://www.vanishingincmagic.com/magic-books/202-methods-of-forcing/' }] },
    { term: 'Gimmick', definition: 'A secret device or object used to accomplish a magical effect.', references: [{ title: 'The Tarbell Course in Magic', url: 'https://www.vanishingincmagic.com/magic-books/tarbell-course-in-magic/' }] },
    { term: 'Lapping', definition: 'A technique for secretly disposing of an object by dropping it into the performer\'s lap while seated at a table.', references: [{ title: 'The Complete Course in Magic by Mark Wilson', url: 'https://www.amazon.com/Mark-Wilsons-Complete-Course-Magic/dp/0762414553' }] },
    { term: 'Misdirection', definition: 'The art of diverting the audience\'s attention from a secret action. It is a core psychological principle of magic.', references: [{ title: 'Leading with Your Head by Gary Kurtz', url: 'https://www.vanishingincmagic.com/magic-downloads/ebooks/leading-with-your-head/' }] },
    { term: 'Palm', definition: 'A sleight-of-hand technique for secretly holding an object, such as a coin or card, in the hand so that it is not visible to the audience.', references: [{ title: 'Expert Coin Magic by David Roth', url: 'https://www.vanishingincmagic.com/magic-books/expert-coin-magic/' }] },
    { term: 'Patter', definition: 'The spoken script or narration used by a magician during a performance to engage the audience, provide misdirection, and create a theatrical context for the effect.', references: [{ title: 'Scripting Magic by Pete McCabe', url: 'https://www.vanishingincmagic.com/magic-books/scripting-magic-volume-1/' }] },
    { term: 'Sleight of Hand', definition: 'The use of dexterity and manual skill to perform secret manipulations, typically with objects like cards or coins.', references: [{ title: 'The Expert at the Card Table by S.W. Erdnase', url: 'https://www.vanishingincmagic.com/magic-books/expert-at-the-card-table/' }] },
    { term: 'Stooge / Plant', definition: 'A member of the audience who appears to be a random spectator but is secretly assisting the magician.', references: [{ title: '13 Steps to Mentalism by Tony Corinda', url: 'https://www.vanishingincmagic.com/magic-books/13-steps-to-mentalism/' }] },
    { term: 'Topit', definition: 'A large, hidden pocket inside a magician\'s jacket, designed to secretly vanish or retrieve large objects.', references: [{ title: 'Topit Book by Michael Ammar', url: 'https://www.penguinmagic.com/p/1063' }] },
];