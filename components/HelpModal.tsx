
import React from 'react';
import {
    WandIcon, LightbulbIcon, MicrophoneIcon, ImageIcon, BookmarkIcon, ChecklistIcon,
    StarIcon, SearchIcon, CrossIcon, CameraIcon, QuestionMarkIcon, UsersCogIcon,
    UsersIcon, BookIcon, ShieldIcon, ClockIcon, MegaphoneIcon, FileTextIcon, StageCurtainsIcon, VideoIcon, DollarSignIcon,
    AnalyticsIcon, BlueprintIcon, TutorIcon, NewspaperIcon, ViewGridIcon, DatabaseIcon
} from './icons';

interface HelpModalProps {
    onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {

    const features = [
        {
            icon: WandIcon,
            title: 'AI Assistant',
            description: "Your primary creative partner. Chat with an expert AI trained in magic theory, scripting, and performance art. Use the quick-start buttons for common tasks like scriptwriting or brainstorming.",
            proTip: "Provide lots of context! The more detail you give about your character, audience, and desired outcome, the better the AI's suggestions will be."
        },
        {
            icon: StageCurtainsIcon,
            title: 'Director Mode',
            description: "Your personal show architect. Input your desired show length, audience type, and theme, and the AI will generate a complete, structured show plan with a narrative arc, segment descriptions, and suggested effect types.",
            proTip: "Use this as your starting point for a new show. Once generated, you can add the entire plan to the 'Show Planner' with one click to start fleshing out the individual routines."
        },
        {
            icon: LightbulbIcon,
            title: 'Effect Generator',
            description: "Can't think of a new trick? Enter up to four everyday objects, and the AI will invent unique magic effects you can perform with them.",
            proTip: "Try combining unusual objects. A 'key' and a 'rubber band' might spark more creativity than a 'card' and a 'coin'."
        },
         {
            icon: BookIcon,
            title: 'Patter Engine',
            description: "Transform a simple trick into a performance piece. Describe an effect, select one or more tones (e.g., Comedic, Mysterious), and the AI will write a complete, performance-ready script for each.",
            proTip: "Use this to explore different character voices. See how a simple card trick changes when performed as a dramatic mystery versus a light-hearted comedy."
        },
        {
            icon: LightbulbIcon,
            title: 'Innovation Engine',
            description: "Breathe new life into classic effects. Describe any magic trick, and the AI will brainstorm three unique and modern presentational concepts for it, focusing on theme, story, and spectator experience.",
            proTip: "This is great for when you know the method to a trick but find the original presentation outdated. It helps you make classic magic your own."
        },
        {
            icon: MegaphoneIcon,
            title: 'Marketing Campaign Generator',
            description: "Your personal PR agent. Provide details about your show (title, audience, style), and the AI will generate a complete marketing toolkit, including a press release, social media posts, email copy, and poster taglines.",
            proTip: "The 'Target Audience' is key. A campaign for a 'corporate gala' should be very different from one for a 'family-friendly festival'. Be specific!"
        },
         {
            icon: FileTextIcon,
            title: 'Performance Contract Generator',
            description: "Create professional performance agreements in seconds. Fill in the details of your gig—client info, date, fee, etc.—and the AI will generate a formal contract ready to be downloaded, copied, or saved.",
            proTip: "Even for smaller gigs, a simple contract adds a layer of professionalism and ensures both you and the client are clear on all expectations."
        },
        {
            icon: UsersIcon,
            title: "Assistant's Studio",
            description: "A dedicated space for the magician's partner. Get AI coaching on improving collaboration in a specific routine, or brainstorm unique solo acts tailored to the assistant's skills and style.",
            proTip: "For solo acts, be descriptive about your skills. Mentioning 'experience in classical ballet' or 'good at comedic timing' will produce much more personalized and useful results."
        },
        {
            icon: UsersCogIcon,
            title: 'Client Management (CRM)',
            description: "Your own mini-CRM for managing clients. Add and store client information (name, company, contact details). This integrates with other modules: select a client from a dropdown to auto-populate their details in the Contract Generator or link them to a project in the Show Planner.",
            proTip: "Keep your client notes updated with personal details (e.g., 'CEO loves card tricks,' 'Avoid jokes about their rival company'). This helps you tailor future performances and build stronger relationships."
        },
        {
            icon: ViewGridIcon,
            title: 'Customizable Dashboard',
            description: "Your mission control for all things magic. See your upcoming tasks, latest audience feedback, and recent ideas at a glance. Professional members can customize the layout by dragging, dropping, and hiding widgets.",
            proTip: "Arrange your dashboard to match your workflow. If you're in a creative phase, move 'Recent Ideas' to the top. If you're preparing for a show, prioritize 'Upcoming Tasks'."
        },
        {
            // FIX: Replaced undefined PersonaSimulator icon with UsersCogIcon.
            icon: UsersCogIcon,
            title: 'Persona Simulator',
            description: "A revolutionary rehearsal tool. Test your script against different AI-powered audience personas like a 'Skeptical Heckler' or an 'Enthusiastic Child'. The AI adopts the selected persona in a chat, reacting to your script and asking challenging questions from that point of view.",
            proTip: "Use this to 'bulletproof' your material. Discover which lines fall flat or which moments might confuse a specific type of audience member before you ever perform for a real one."
        },
        {
            icon: MicrophoneIcon,
            title: 'Live Patter Rehearsal',
            description: "Practice your scripts out loud and get real-time audio feedback. The AI coach listens for your vocal Tone, Confidence, and Clarity, offering actionable advice. You can review the full transcript afterwards.",
            proTip: "Use this to find the perfect rhythm. A well-timed pause can be as powerful as the words themselves. Try the same line multiple ways to hear the difference."
        },
        {
            icon: VideoIcon,
            title: 'Video Rehearsal Studio',
            description: "Get AI-driven feedback on your physical performance. Upload a video of a rehearsal, and the AI will provide a time-stamped analysis of your body language, stage positioning, pacing, and object handling.",
            proTip: "Use the optional 'Analysis Focus' prompt to guide the AI. For example, 'Focus on my hand movements during the vanish' or 'Check my stage presence during the reveal' will yield more specific feedback."
        },
        {
            icon: ClockIcon,
            title: 'Rehearsal Coaching (Pacing)',
            description: "Refine your routine's timing and structure. Provide a script or description and a target duration, and the AI will analyze its pacing, identify potential dead spots, and suggest where to add more 'business' or patter to improve the flow.",
            proTip: "This tool is text-based and complements the 'Live Patter Rehearsal'. Use it for structuring your act before you start practicing your vocal delivery."
        },
        {
            icon: ShieldIcon,
            title: 'Angle & Risk Analysis',
            description: "A dedicated tool to bulletproof your routines. Describe an effect and the performance environment (e.g., Close-up, Stage, Surrounded), and the AI will provide a detailed breakdown of potential angle issues, sight-line problems, and other risks.",
            proTip: "Be honest about the environment. 'Surrounded' is a very different challenge from a formal stage. This tool helps you prepare for the worst-case scenario."
        },
        {
            icon: ImageIcon,
            title: 'Visual Brainstorm Studio',
            description: "Bring your ideas to life. Generate concept art from scratch by describing it, or upload your own image (a photo of yourself, a prop, etc.) and give the AI instructions to edit it.",
            proTip: "For editing, be specific: 'Add a top hat to the person' or 'Change the background to a Victorian stage' works better than 'Make it look magical'."
        },
        {
            icon: BookmarkIcon,
            title: 'My Saved Ideas',
            description: "A central place for all your inspiration. Every time you save a text response, an image, a checklist, or an effect idea, it's stored here for easy access.",
            proTip: "Use this as your digital magic journal. Over time, it will become a treasure trove of your own unique ideas and concepts."
        },
        {
            icon: DatabaseIcon,
            title: 'Data Management & Backup',
            description: "Your safety net. Export a full backup of your shows, scripts, ideas, and clients to a secure JSON file on your device. You can restore this backup at any time to recover your work or move it to a new device.",
            proTip: "Get in the habit of downloading a backup after every major update to your show plan. It's the best way to ensure your creative work is never lost."
        },
        {
            icon: ChecklistIcon,
            title: 'Prop Checklist Generator',
            description: "Never forget a prop again. Describe a routine or your entire show, and the AI will create a comprehensive checklist for pre-show setup, performance, and post-show reset.",
            proTip: "Be specific. Mentioning 'my 30-minute corporate act' will yield a more detailed checklist than just 'a card trick'."
        },
        {
            icon: ChecklistIcon,
            title: 'Show Planner',
            description: "Your personal stage manager. Organize all your prep tasks in a list or board view, set priorities and due dates, and add notes or script snippets to each task. You can also generate a full Show Script & Cue Sheet from your active tasks.",
            proTip: "Use the 'Notes' section in a task to flesh out the patter for that specific routine. The generated script will then include it automatically."
        },
        {
            icon: DollarSignIcon,
            title: 'Show Finance Tracker',
            description: "Track the profitability of each performance. Integrated within the Show Planner, each show has a 'Finance' tab where you can log the performance fee, track expenses (props, travel, etc.), and see a clear summary of your net profit for every gig.",
            proTip: "Regularly update your expenses, even small ones like coffee on the way to a gig. It gives you a true picture of your profitability over time."
        },
        {
            icon: StarIcon,
            title: 'Show Feedback',
            description: "See what your audience is saying. This dashboard collects and analyzes all the feedback submitted by your audience members in Audience Mode, giving you valuable insights into what they loved most.",
            proTip: "Pay attention to the 'Most Liked Aspects' to see which parts of your show are having the biggest impact and double down on them."
        },
        {
            icon: SearchIcon,
            title: 'Global Tagging & Search System',
            description: "Organize your entire magic life. Add tags to shows, tasks, and ideas. Then, use the global 'Search' hub to instantly find everything related to a specific project, client, or concept across the entire app.",
            proTip: "Create consistent tags for your big projects (e.g., 'Gala2025', 'FringeFestival'). A single click on that tag will then show you all associated ideas, show plans, and to-do items."
        },
        {
            icon: SearchIcon,
            title: 'Magic Archives',
            description: "Your personal magic historian. Ask complex questions about magic history, legendary creators, specific effects, and seminal literature. The AI will provide detailed, well-researched answers.",
            proTip: "Use this to add depth and historical context to your patter. Citing the origin of an effect can make your performance more engaging."
        },
        {
            icon: CrossIcon,
            title: 'Gospel Magic Assistant',
            description: "A specialized tool for ministry. Develop powerful routines that connect magic effects with biblical stories and messages of faith, hope, and love.",
            proTip: "Start with a core message or scripture. The AI can then help you find the perfect effect and script to illustrate that message effectively."
        },
        {
            icon: UsersCogIcon,
            title: 'Mentalism Assistant',
            description: "A specialized consultant for mentalists. Explore psychological principles, create baffling new effects, and refine your performance theory with an AI trained in the art of mental deception.",
            proTip: "Use this tool to brainstorm ethical ways to present mind-reading effects. Focus on the 'why' behind an effect, not just the 'how', to build a stronger connection with your audience."
        },
        {
            icon: CameraIcon,
            title: 'Identify a Trick',
            description: "Saw a cool trick but don't know its name? Upload a picture, and the AI will analyze the props and setup to identify the effect and find video examples of it being performed.",
            proTip: "A clear photo showing the props and the magician's hands will give the best results."
        },
        {
            icon: UsersIcon,
            title: 'Magic Community Resources',
            description: "Explore the 'Publications', 'Clubs', and 'Conventions' tabs to discover essential reading, connect with fellow magicians in prestigious organizations, and find major industry events to attend.",
            proTip: "Use these resources to network and stay current. Knowing what's happening in the magic world is key to being a successful professional."
        },
        {
            icon: UsersCogIcon,
            title: 'Member Management',
            description: "(Admin Only) This dashboard allows administrators to view all registered users, manage their membership tiers, or remove accounts from the system.",
            proTip: "Use this to grant professional access to specific users or to manage the user base of the application."
        },
        {
            icon: BlueprintIcon,
            title: 'Illusion Blueprint Generator',
            description: "Your personal illusion design consultant. Describe a concept for a grand illusion, and the AI will generate a high-level creative and technical blueprint, including potential principles and a staging diagram, without exposing any secret methods.",
            proTip: "Be conceptual and focus on the audience's experience (e.g., 'I want to walk through a solid steel wall'). The AI will focus on the theatrical staging and principles, not the specific construction, to spark your creativity."
        },
        {
            icon: NewspaperIcon,
            title: 'Magic Wire News Feed',
            description: "Your AI-powered daily magic newspaper. Get a fresh feed of fictional but insightful articles about new releases, creator interviews, community news, and magic history to keep you inspired and informed.",
            proTip: "Use the articles as creative prompts. An article about a fictional 'new release' could inspire you to invent a real effect with a similar theme."
        },
        {
            icon: AnalyticsIcon,
            title: 'Performance Analytics',
            description: "Review real-time audience feedback from your live shows. The analytics dashboard provides a timeline of audience reactions (Amazed, Laughing, Confused), helping you pinpoint which moments have the most impact.",
            proTip: "Look for 'Confused' spikes. These are valuable indicators of moments where your routine might be unclear or a sleight might have been flashed. Cross-reference the timeline with your script to identify and fix these weak spots."
        },
        {
            icon: TutorIcon,
            title: 'Magic Theory Tutor',
            description: "Take a structured, interactive course on the foundational principles of magic theory. An AI tutor will guide you through concepts like 'Time Misdirection' and 'Clarity of Effect', providing examples and asking questions to test your understanding.",
            proTip: "Don't just answer the questions; apply them. When the tutor asks how you would use a concept, think of a trick you're currently working on and try to incorporate the principle directly."
        },
        {
            icon: TutorIcon,
            title: 'Magic Dictionary',
            description: "An interactive, searchable glossary of professional magic terms. Look up concepts, learn insider terminology, and find references to key literature for further study.",
            proTip: "Use the dictionary when the AI Assistant or Magic Archives mentions a term you're unfamiliar with. It's a great way to deepen your theoretical knowledge as you work."
        }
    ];

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl h-[90vh] bg-slate-800 border-2 border-purple-500 rounded-lg shadow-2xl shadow-purple-900/40 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <QuestionMarkIcon className="w-8 h-8 text-purple-400" />
                        <h2 className="font-cinzel text-2xl font-bold text-white">Help Center</h2>
                    </div>
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300">
                        Close
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {features.sort((a,b) => a.title.localeCompare(b.title)).map(({ icon: Icon, title, description, proTip }) => (
                            <div key={title} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                                <div className="flex items-center gap-3 mb-2">
                                    <Icon className="w-6 h-6 text-purple-400" />
                                    <h3 className="text-lg font-bold text-slate-200">{title}</h3>
                                </div>
                                <p className="text-sm text-slate-400 mb-3">{description}</p>
                                <p className="text-xs text-purple-300/80 bg-purple-900/30 p-2 rounded-md"><strong className="font-semibold">Pro Tip:</strong> {proTip}</p>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default HelpModal;
