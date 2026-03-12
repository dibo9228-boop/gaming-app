import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import GameLobby from "./pages/GameLobby";
import TomAndJerryGame from "./pages/TomAndJerryGame";
import MultiplayerGame from "./pages/MultiplayerGame";
import MemoryMatchGame from "./pages/MemoryMatchGame";
import MemoryLobby from "./pages/MemoryLobby";
import MemoryMultiplayerGame from "./pages/MemoryMultiplayerGame";
import QuizBattleGame from "./pages/QuizBattleGame";
import QuizBattleLobby from "./pages/QuizBattleLobby";
import QuizBattleMultiplayerGame from "./pages/QuizBattleMultiplayerGame";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/game/tom-and-jerry" element={<TomAndJerryGame />} />
              <Route path="/game/tom-and-jerry/lobby" element={<GameLobby />} />
              <Route path="/game/tom-and-jerry/multi/:roomId" element={<MultiplayerGame />} />
              <Route path="/game/memory-match" element={<MemoryMatchGame />} />
              <Route path="/game/memory-match/lobby" element={<MemoryLobby />} />
              <Route path="/game/memory-match/multi/:roomId" element={<MemoryMultiplayerGame />} />
              <Route path="/game/quiz-battle" element={<QuizBattleGame />} />
              <Route path="/game/quiz-battle/lobby" element={<QuizBattleLobby />} />
              <Route path="/game/quiz-battle/multi/:roomId" element={<QuizBattleMultiplayerGame />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <ThemeToggle />
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
