import React, { createContext, useState, useCallback, useContext, ReactNode, useRef, useEffect } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  message: string;
  action?: ToastAction;
  id: number;
}

interface ToastContextType {
  showToast: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const timeoutRef = useRef<number | null>(null);
    
    const showToast = useCallback((message: string, action?: ToastAction) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        const id = Date.now();
        setToast({ message, action, id });

        timeoutRef.current = window.setTimeout(() => {
            setToast(current => (current?.id === id ? null : current));
            timeoutRef.current = null;
        }, 5000);
    }, []);

    useEffect(() => {
      // Cleanup timeout on component unmount
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleActionClick = () => {
        if (toast?.action) {
            toast.action.onClick();
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setToast(null); // Close toast after action is clicked
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <div className="fixed bottom-6 right-6 w-full max-w-sm bg-slate-700 border border-purple-500 text-white p-4 rounded-lg shadow-lg flex items-center justify-between animate-fade-in z-50">
                    <span>{toast.message}</span>
                    {toast.action && (
                        <button onClick={handleActionClick} className="ml-4 px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-md text-sm font-semibold">
                            {toast.action.label}
                        </button>
                    )}
                </div>
            )}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
