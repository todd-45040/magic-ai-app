import { useState } from "react";
import { supabase } from "../supabase";

interface AuthProps {
  onLoginSuccess: () => void;
}

export default function Auth({ onLoginSuccess }: AuthProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submits
    if (isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Successful login — App.tsx auth listener will handle redirect
      onLoginSuccess();
    } catch (err) {
      setError("Unexpected error during login.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-lg"
      >
        <h2 className="mb-6 text-center text-2xl font-bold">
          Magician Login
        </h2>

        {error && (
          <div className="mb-4 rounded bg-red-600 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full rounded-md px-4 py-2 font-semibold transition
            ${
              isLoading
                ? "cursor-not-allowed bg-gray-600 opacity-70"
                : "bg-purple-600 hover:bg-purple-700"
            }
          `}
        >
          {isLoading ? "Unlocking..." : "Login"}
        </button>
      </form>
    </div>
  );
}
