
import React, { useState } from 'react';
import {
    WandIcon, LightbulbIcon, MicrophoneIcon, ImageIcon, BookmarkIcon, ChecklistIcon,
    StarIcon, SearchIcon, CrossIcon, CameraIcon, QuestionMarkIcon, UsersCogIcon,
    UsersIcon, BookIcon, ShieldIcon, ClockIcon, MegaphoneIcon, FileTextIcon, StageCurtainsIcon, VideoIcon, DollarSignIcon,
    AnalyticsIcon, BlueprintIcon, TutorIcon, NewspaperIcon, ViewGridIcon, DatabaseIcon, ChevronDownIcon
} from './icons';

interface HelpModalProps {
    onClose: () => void;
}

interface FeatureItem {
    icon: React.FC<any>;
    title: string;
    description: string;
    proTip: string;
}

interface FeatureCategory {
    title: string;
    items: FeatureItem[];
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Creative & Rehearsal"]));

    const toggleCategory = (title: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(title)) {
                newSet.delete(title);
            } else {
                newSet.add(title);
            }
            return newSet;
        });
    };

    const categories: FeatureCategory[] = [
        {
            title: "Creative & Rehearsal",
            items: [
                {
                    icon: WandIcon,
                    title: 'AI Assistant',
                    description: "Your primary creative partner. Chat with an expert AI trained in magic theory, scripting, and performance art.",
                    proTip: "Provide lots of context! The more detail you give about your character, audience, and desired outcome, the better the AI's suggestions will be."
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
                    description: "Breathe new life into classic effects. Describe any magic trick, and the AI will brainstorm three unique and modern presentational concepts for it.",
                    proTip: "This is great for when you know the method to a trick but find the original presentation outdated."
                },
                {
                    icon: ImageIcon,
                    title: 'Visual Brainstorm Studio',
                    description: "Bring your ideas to life. Generate concept art from scratch by describing it, or upload your own image and give the AI instructions to edit it.",
                    proTip: "For editing, be specific: 'Add a top hat to the person' works better than 'Make it look magical'."
                },
                {
                    icon: UsersCogIcon,
                    title: 'Persona Simulator',
                    description: "Test your script against different AI-powered audience personas like a 'Skeptical Heckler' or an 'Enthusiastic Child'.",
                    proTip: "Use this to 'bulletproof' your material against difficult audience members."
                },
                {
                    icon: MicrophoneIcon,
                    title: 'Live Patter Rehearsal',
                    description: "Practice your scripts out loud and get real-time audio feedback. The AI coach listens for your vocal Tone, Confidence, and Clarity.",
                    proTip: "Use this to find the perfect rhythm. A well-timed pause can be as powerful as the words themselves."
                },
                {
                    icon: VideoIcon,
                    title: 'Video Rehearsal Studio',
                    description: "Get AI-driven feedback on your physical performance. Upload a rehearsal video for time-stamped analysis of your body language and staging.",
                    proTip: "Use the 'Analysis Focus' prompt to guide the AI to check specific moves or angles."
                },
                {
                    icon: ClockIcon,
                    title: 'Rehearsal Coaching (Pacing)',
                    description: "Refine your routine's timing. Provide a script and target duration, and the AI will analyze pacing and identify dead spots.",
                    proTip: "Use this for structuring your act before you start practicing your vocal delivery."
                },
                {
                    icon: ShieldIcon,
                    title: 'Angle & Risk Analysis',
                    description: "Bulletproof your routines. Describe an effect and the environment (e.g., Surrounded), and the AI will detail potential angle issues.",
                    proTip: "Be honest about the environment. This tool helps you prepare for the worst-case scenario."
                },
                {
                    icon: BlueprintIcon,
                    title: 'Illusion Blueprint Generator',
                    description: "Describe a grand illusion concept, and the AI will generate a high-level creative and technical blueprint, including principles and staging.",
                    proTip: "Focus on the audience's experience in your description to spark creative staging ideas."
                },
                {
                    icon: CrossIcon,
                    title: 'Gospel Magic Assistant',
                    description: "Develop powerful routines that connect magic effects with biblical stories and messages of faith.",
                    proTip: "Start with a core message or scripture to find the perfect illustration."
                },
                {
                    icon: UsersCogIcon,
                    title: 'Mentalism Assistant',
                    description: "Explore psychological principles and refine your performance theory with an AI trained in the art of mental deception.",
                    proTip: "Focus on the 'why' behind an effect to build a stronger connection with your audience."
                },
                {
                    icon: UsersIcon,
                    title: "Assistant's Studio",
                    description: "Get coaching on collaboration in a routine, or brainstorm unique solo acts tailored to an assistant's skills.",
                    proTip: "Be descriptive about skills (e.g., 'classical ballet', 'comedic timing') for personalized results."
                }
            ]
        },
        {
            title: "Show Management",
            items: [
                {
                    icon: StageCurtainsIcon,
                    title: 'Director Mode',
                    description: "Your personal show architect. Input your show details, and the AI will generate a complete, structured show plan with a narrative arc.",
                    proTip: "Add the generated plan directly to the 'Show Planner' with one click."
                },
                {
                    icon: ChecklistIcon,
                    title: 'Show Planner',
                    description: "Organize prep tasks in list or board view, set priorities, and generate a full Show Script & Cue Sheet from your tasks.",
                    proTip: "Use the 'Notes' section in tasks to flesh out patter; the generated script will include it."
                },
                {
                    icon: DollarSignIcon,
                    title: 'Show Finance Tracker',
                    description: "Track the profitability of each performance. Log fees and expenses within the Show Planner to see your net profit.",
                    proTip: "Regularly update expenses, even small ones, for a true picture of profitability."
                },
                {
                    icon: ChecklistIcon,
                    title: 'Prop Checklist Generator',
                    description: "Describe a routine or show, and the AI will create a comprehensive checklist for setup, performance, and reset.",
                    proTip: "Mentioning specifics like 'my 30-minute corporate act' yields better results."
                },
                {
                    icon: AnalyticsIcon,
                    title: 'Performance Analytics',
                    description: "Review real-time audience feedback from your live shows. See a timeline of reactions (Amazed, Laughing, Confused).",
                    proTip: "Look for 'Confused' spikes to identify moments where your routine might be unclear."
                },
                {
                    icon: StarIcon,
                    title: 'Show Feedback',
                    description: "Analyze feedback submitted by your audience in Audience Mode to see what they loved most.",
                    proTip: "Check 'Most Liked Aspects' to see what's working best."
                }
            ]
        },
        {
            title: "Business & Promotion",
            items: [
                {
                    icon: UsersCogIcon,
                    title: 'Client Management (CRM)',
                    description: "Manage client info and link them to shows. Integrates with the Contract Generator.",
                    proTip: "Keep notes on client preferences to tailor future performances."
                },
                {
                    icon: FileTextIcon,
                    title: 'Contract Generator',
                    description: "Create professional performance agreements. Fill in gig details to generate a contract ready for download.",
                    proTip: "A simple contract adds professionalism and clarity for both parties."
                },
                {
                    icon: MegaphoneIcon,
                    title: 'Marketing Campaign Generator',
                    description: "Generate a marketing toolkit including press releases, social posts, and taglines based on your show details.",
                    proTip: "Be specific about your Target Audience for tailored marketing copy."
                }
            ]
        },
        {
            title: "Knowledge & Resources",
            items: [
                {
                    icon: SearchIcon,
                    title: 'Magic Archives',
                    description: "Your personal magic historian. Ask questions about history, creators, effects, and literature.",
                    proTip: "Cite the origin of an effect in your patter to add depth."
                },
                {
                    icon: TutorIcon,
                    title: 'Magic Theory Tutor',
                    description: "Take interactive courses on foundational magic theory principles like 'Time Misdirection'.",
                    proTip: "Try to apply the concepts directly to a trick you're working on."
                },
                {
                    icon: TutorIcon,
                    title: 'Magic Dictionary',
                    description: "A searchable glossary of professional magic terms and concepts.",
                    proTip: "Use this to deepen your understanding of terms mentioned by the AI."
                },
                {
                    icon: NewspaperIcon,
                    title: 'Magic Wire News Feed',
                    description: "A feed of fictional but inspiring articles about the magic world to spark your creativity.",
                    proTip: "Use the articles as creative prompts for new effects."
                },
                {
                    icon: CameraIcon,
                    title: 'Identify a Trick',
                    description: "Upload a picture of a trick to identify it and find performance examples.",
                    proTip: "A clear photo of the props gives the best results."
                },
                {
                    icon: UsersIcon,
                    title: 'Community Resources',
                    description: "Discover essential publications, clubs, and conventions.",
                    proTip: "Networking is key to a successful professional career."
                }
            ]
        },
        {
            title: "System Tools",
            items: [
                {
                    icon: ViewGridIcon,
                    title: 'Dashboard',
                    description: "Your mission control. Customize the layout to see tasks, feedback, and ideas at a glance.",
                    proTip: "Arrange widgets to match your current workflow focus."
                },
                {
                    icon: SearchIcon,
                    title: 'Global Search',
                    description: "Find shows, tasks, and ideas instantly by keyword or tag.",
                    proTip: "Tag your projects consistently for easy retrieval."
                },
                {
                    icon: BookmarkIcon,
                    title: 'My Saved Ideas',
                    description: "Access all your saved content. You can now refine ideas with AI or print them directly.",
                    proTip: "Use the 'Refine' button to expand on a quick note."
                },
                {
                    icon: DatabaseIcon,
                    title: 'Data Management',
                    description: "Backup your work to a file or restore from a previous backup.",
                    proTip: "Download a backup regularly to keep your work safe."
                },
                {
                    icon: UsersCogIcon,
                    title: 'Member Management',
                    description: "(Admin) Manage user accounts and membership tiers.",
                    proTip: "Grant professional access to specific users."
                }
            ]
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

                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    {categories.map((category) => {
                        const isExpanded = expandedCategories.has(category.title);
                        return (
                            <div key={category.title} className="bg-slate-900/30 rounded-lg border border-slate-700 overflow-hidden">
                                <button
                                    onClick={() => toggleCategory(category.title)}
                                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/50 transition-colors"
                                >
                                    <h3 className="text-xl font-bold text-purple-300 font-cinzel">{category.title}</h3>
                                    <ChevronDownIcon className={`w-6 h-6 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isExpanded && (
                                    <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                                        {category.items.map((feature) => (
                                            <div key={feature.title} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <feature.icon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                                                    <h4 className="font-bold text-slate-200 text-sm">{feature.title}</h4>
                                                </div>
                                                <p className="text-xs text-slate-400 mb-2 leading-relaxed">{feature.description}</p>
                                                <p className="text-xs text-purple-300/80 bg-purple-900/20 p-2 rounded border border-purple-500/20">
                                                    <strong className="font-semibold">Pro Tip:</strong> {feature.proTip}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </main>
            </div>
        </div>
    );
};

export default HelpModal;
