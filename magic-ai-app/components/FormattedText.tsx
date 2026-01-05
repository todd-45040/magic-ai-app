import React from 'react';

interface FormattedTextProps {
  text: string;
}

const FormattedText: React.FC<FormattedTextProps> = ({ text }) => {
    // This regex splits the string by bold/italic markers, keeping the markers in the resulting array.
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

    return (
        <p className="whitespace-pre-wrap break-words">
            {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={index}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('*') && part.endsWith('*')) {
                    return <em key={index}>{part.slice(1, -1)}</em>;
                }
                return part;
            })}
        </p>
    );
};

export default FormattedText;