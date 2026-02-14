import React, { useState } from 'react';
import { generateResponse } from '../services/aiService';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { saveIdea } from '../services/ideasService';

const AssistantStudio = ({ onIdeaSaved }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await generateResponse({
        systemInstruction: ASSISTANT_STUDIO_SYSTEM_INSTRUCTION,
        userPrompt: input
      });

      setOutput(response);
    } catch (err) {
      console.error(err);
      setError('Failed to generate response.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!output) return;
    await saveIdea({
      title: 'Assistant Studio Output',
      content: output,
      tags: ['assistant-studio']
    });
    if (onIdeaSaved) onIdeaSaved();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Assistant's Studio</h1>

      <textarea
        className="w-full p-3 border rounded bg-slate-800 text-white"
        rows={6}
        placeholder="Describe what you're working on..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          className="px-4 py-2 bg-purple-600 rounded text-white"
        >
          Generate
        </button>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-green-600 rounded text-white"
        >
          Save
        </button>
      </div>

      {loading && <div className="animate-pulse text-purple-400">Thinking...</div>}

      {error && <div className="text-red-400">{error}</div>}

      {output && (
        <div className="p-4 bg-slate-900 rounded border border-slate-700 whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
};

export default AssistantStudio;
